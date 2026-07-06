import type { DataSource, DataSourceHandlers } from "./DataSource";
import type {
  Layout,
  OfficePolicy,
  StatSample,
  Subreddit,
  Worker,
  WorkerEvent,
  WorkersByCubicle,
} from "@/lib/domain/types";
import {
  ROSTER_MAX,
  NEW_WINDOW_MS,
  MIN_MOMENTUM,
  RISING_MOMENTUM,
  BLEND_FRESH,
  SEAT_HYSTERESIS,
} from "@/lib/domain/constants";
import { selectRoster, assignSeats, type RosterCandidate } from "@/lib/roster/roster";
import { advanceMomentum, scorePrior } from "@/lib/momentum/demoMomentum";
import type { Baseline } from "@/lib/momentum/momentum";
import { MockDataSource } from "./MockDataSource";
import type { DemoOfficePayload, RedditPostDTO } from "@/lib/reddit/dto";

/** How often the client re-reads the (server-shared-cached) office endpoint. */
const POLL_MS = 30_000;

/** Per-post Momentum state carried across polls (previous sample + last reading). */
interface PostMomentum {
  sample: StatSample;
  momentum: number;
}

/** Fetches an office payload from the server; different modes point at different endpoints. */
export type OfficePayloadFetcher = () => Promise<DemoOfficePayload>;

/**
 * The live-Reddit DataSource. Polls a server office endpoint for real hot posts
 * and renders them as Workers, reusing the same roster/seat logic as the mock.
 *
 * Momentum is measured, not faked: each post's stats are sampled every poll and
 * run through the shared velocity/baseline maths (see {@link advanceMomentum}), so
 * a stale-but-upvoted post (flat score) decays and is evicted while a post gaining
 * upvotes fast climbs and takes a seat. New-post and trending Events are derived by
 * diffing successive snapshots.
 *
 * The endpoint is injected as a `fetchPayload` callback, so one implementation
 * drives both modes: demo reads the shared-cached `/api/demo/office`, and the
 * authenticated office POSTs the user's picked subs to `/api/reddit/office`. Both
 * return the same payload shape.
 *
 * If the endpoint reports Reddit is not configured, it transparently delegates to
 * {@link MockDataSource} so the office is always alive (graceful degradation). The
 * full two-speed polling event engine (surge/removed, ADR-0002) lands later; this
 * keeps to the cheap, reliable events.
 */
export class PollingOfficeDataSource implements DataSource {
  private readonly subreddits: Subreddit[];
  private readonly layout: Layout;
  private policy: OfficePolicy;
  private readonly fetchPayload: OfficePayloadFetcher;

  private handlers: DataSourceHandlers | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private fallback: MockDataSource | null = null;

  private postsBySub: Record<string, RedditPostDTO[]> = {};
  /** Emit the server's enriched subreddits (with icons) once; they don't change. */
  private emittedSubreddits = false;
  private readonly seats = new Map<string, Record<string, number>>();
  private readonly prevSelection = new Map<string, Set<string>>();
  private readonly prevTop = new Map<string, string>();
  /** Per-post Momentum state (previous sample + last reading), keyed by post id. */
  private readonly momentumState = new Map<string, PostMomentum>();
  /** Per-subreddit rolling velocity baseline, seeded lazily on first velocity. */
  private readonly baselines = new Map<string, Baseline>();

  constructor(
    subreddits: Subreddit[],
    layout: Layout,
    policy: OfficePolicy,
    fetchPayload: OfficePayloadFetcher,
  ) {
    this.subreddits = subreddits;
    this.layout = layout;
    this.policy = policy;
    this.fetchPayload = fetchPayload;
  }

  listSubreddits(): Subreddit[] {
    return this.subreddits;
  }

  getLayout(): Layout {
    return this.layout;
  }

  setPolicy(policy: OfficePolicy): void {
    const sourcingChanged = policy.sourcing !== this.policy.sourcing;
    this.policy = policy;
    this.fallback?.setPolicy(policy);
    // Repopulate the cubicles under the new sourcing rule immediately, from the
    // posts we already have - no refetch, no waiting for the next poll. Silent so
    // switching a rule doesn't fire a burst of new-post/trending pulses.
    if (sourcingChanged && this.handlers && !this.fallback && this.hasPosts()) {
      this.emit(true);
    }
  }

  private hasPosts(): boolean {
    for (const posts of Object.values(this.postsBySub)) if (posts.length > 0) return true;
    return false;
  }

  start(handlers: DataSourceHandlers): void {
    this.handlers = handlers;
    void this.poll();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.fallback?.stop();
    this.handlers = null;
  }

  private useFallback(): void {
    if (this.fallback || !this.handlers) return;
    this.fallback = new MockDataSource(this.subreddits, this.layout, this.policy);
    this.fallback.start(this.handlers);
  }

  private async poll(): Promise<void> {
    try {
      const payload = await this.fetchPayload();
      if (this.stopped || !this.handlers) return;

      if (!payload.configured) {
        this.useFallback();
        return; // stop polling; the mock drives from here.
      }

      // Surface server-side subreddit metadata (community icons) once. Ids match
      // the constructor list, so the layout - keyed by id - is unaffected.
      if (!this.emittedSubreddits && payload.subreddits.length > 0) {
        this.emittedSubreddits = true;
        this.handlers.onSubreddits?.(payload.subreddits);
      }

      this.postsBySub = payload.postsBySub;
      this.emit();
      this.timer = setTimeout(() => void this.poll(), POLL_MS);
    } catch {
      // Network/parse failure: fall back so the office is never blank.
      if (!this.stopped) this.useFallback();
    }
  }

  /**
   * Build a snapshot from the latest posts and emit derived events. When `silent`
   * (a policy-driven repopulation rather than a fresh poll), the snapshot is
   * emitted but per-event pulses are suppressed.
   */
  private emit(silent = false): void {
    if (!this.handlers) return;
    const now = Date.now();
    const workersByCubicle: WorkersByCubicle = {};
    const events: WorkerEvent[] = [];
    const liveIds = new Set<string>();

    for (const sub of this.subreddits) {
      const posts = this.postsBySub[sub.id] ?? [];
      const maxScore = Math.max(1, ...posts.map((p) => p.score));

      // Measure each post's Momentum from its change since the last poll, threading
      // the sub's baseline through them (seeded lazily on first velocity). A
      // first-sight post falls back to a score prior so the office is populated
      // immediately; a stale post whose score isn't moving decays toward zero.
      let baseline: Baseline | null = this.baselines.get(sub.id) ?? null;
      const momentumById = new Map<string, number>();
      const candidates: RosterCandidate[] = posts.map((p) => {
        liveIds.add(p.id);
        const prev = this.momentumState.get(p.id) ?? null;
        const curr: StatSample = { t: now, score: p.score, comments: p.comments };
        const reading = advanceMomentum(prev, curr, baseline, scorePrior(p.score, maxScore));
        baseline = reading.baseline;
        this.momentumState.set(p.id, { sample: reading.sample, momentum: reading.momentum });
        momentumById.set(p.id, reading.momentum);
        return { id: p.id, createdAt: p.createdAt, momentum: reading.momentum };
      });
      if (baseline) this.baselines.set(sub.id, baseline);

      const selectedIds = selectRoster(
        candidates,
        this.policy.sourcing,
        {
          maxSize: ROSTER_MAX,
          newWindowMs: NEW_WINDOW_MS,
          minMomentum: MIN_MOMENTUM,
          risingMomentum: RISING_MOMENTUM,
          freshSeats: BLEND_FRESH,
        },
        now,
      ).map((c) => c.id);

      const prevSeats = this.seats.get(sub.id) ?? {};
      const seats = assignSeats(selectedIds, prevSeats, ROSTER_MAX, SEAT_HYSTERESIS);
      this.seats.set(sub.id, seats);

      const byId = new Map(posts.map((p) => [p.id, p] as const));
      let topId: string | null = null;
      let topMomentum = -Infinity;
      for (const id of selectedIds) {
        const m = momentumById.get(id) ?? 0;
        if (m > topMomentum) {
          topMomentum = m;
          topId = id;
        }
      }

      workersByCubicle[sub.id] = selectedIds.map((id) =>
        toWorker(byId.get(id)!, momentumById.get(id) ?? 0, id === topId, seats[id]),
      );

      // Events fire only from the second snapshot on (first paint is silent,
      // matching the mock), and never on a policy-driven repopulation.
      const prevSel = this.prevSelection.get(sub.id);
      if (!silent && prevSel) {
        if (this.policy.events["new-post"]) {
          for (const id of selectedIds) {
            if (!prevSel.has(id)) {
              events.push({ type: "new-post", workerId: id, subredditId: sub.id, at: now });
            }
          }
        }
        if (topId && this.policy.events.trending && topId !== this.prevTop.get(sub.id)) {
          events.push({ type: "trending", workerId: topId, subredditId: sub.id, at: now });
        }
      }

      this.prevSelection.set(sub.id, new Set(selectedIds));
      if (topId) this.prevTop.set(sub.id, topId);
    }

    // Drop Momentum state for posts that have aged out of every hot listing so the
    // maps can't grow unbounded over a long session.
    for (const id of this.momentumState.keys()) {
      if (!liveIds.has(id)) this.momentumState.delete(id);
    }

    this.handlers.onSnapshot({ workersByCubicle });
    for (const e of events) this.handlers.onEvent(e);
  }
}

function toWorker(
  post: RedditPostDTO,
  momentum: number,
  trending: boolean,
  seatIndex: number,
): Worker {
  return { ...post, momentum, trending, removed: false, seatIndex };
}
