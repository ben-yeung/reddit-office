import type { DataSource, DataSourceHandlers } from "./DataSource";
import type {
  Layout,
  OfficePolicy,
  Subreddit,
  Worker,
  WorkerEvent,
  WorkersByCubicle,
} from "@/lib/domain/types";
import { ROSTER_MAX, GRACE_MS, MIN_MOMENTUM } from "@/lib/domain/constants";
import { selectRoster, assignSeats, type RosterCandidate } from "@/lib/roster/roster";
import { MockDataSource } from "./MockDataSource";
import type { DemoOfficePayload, RedditPostDTO } from "@/lib/reddit/dto";

/** How often the client re-reads the (server-shared-cached) demo endpoint. */
const POLL_MS = 30_000;

/**
 * Demo-mode DataSource (ADR-0009). Reads the curated office from
 * `/api/demo/office` and renders real Reddit hot posts as Workers, reusing the
 * same roster/seat logic as the mock. New-post and trending Events are derived
 * by diffing successive snapshots.
 *
 * If the endpoint reports Reddit is not configured, it transparently delegates
 * to {@link MockDataSource} so the office is always alive (graceful degradation).
 * The full two-speed polling event engine (surge/removed, ADR-0002) lands with
 * the authenticated data layer; demo intentionally keeps to the cheap, reliable
 * events.
 */
export class RedditDemoDataSource implements DataSource {
  private readonly subreddits: Subreddit[];
  private readonly layout: Layout;
  private policy: OfficePolicy;

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

  constructor(subreddits: Subreddit[], layout: Layout, policy: OfficePolicy) {
    this.subreddits = subreddits;
    this.layout = layout;
    this.policy = policy;
  }

  listSubreddits(): Subreddit[] {
    return this.subreddits;
  }

  getLayout(): Layout {
    return this.layout;
  }

  setPolicy(policy: OfficePolicy): void {
    this.policy = policy;
    this.fallback?.setPolicy(policy);
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
      const res = await fetch("/api/demo/office", { cache: "no-store" });
      const payload = (await res.json()) as DemoOfficePayload;
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

  /** Build a snapshot from the latest posts and emit derived events. */
  private emit(): void {
    if (!this.handlers) return;
    const now = Date.now();
    const workersByCubicle: WorkersByCubicle = {};
    const events: WorkerEvent[] = [];

    for (const sub of this.subreddits) {
      const posts = this.postsBySub[sub.id] ?? [];
      const maxScore = Math.max(1, ...posts.map((p) => p.score));

      // Pseudo-Momentum from score, normalized within the sub so every cubicle
      // shows variety immediately and small/large subs are comparable.
      const momentumById = new Map<string, number>();
      const candidates: RosterCandidate[] = posts.map((p) => {
        const momentum = 0.4 + 1.8 * (p.score / maxScore);
        momentumById.set(p.id, momentum);
        return { id: p.id, createdAt: p.createdAt, momentum };
      });

      const selectedIds = selectRoster(
        candidates,
        this.policy.sourcing,
        { maxSize: ROSTER_MAX, graceMs: GRACE_MS, minMomentum: MIN_MOMENTUM },
        now,
      ).map((c) => c.id);

      const prevSeats = this.seats.get(sub.id) ?? {};
      const seats = assignSeats(selectedIds, prevSeats, ROSTER_MAX);
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
      // matching the mock).
      const prevSel = this.prevSelection.get(sub.id);
      if (prevSel) {
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
