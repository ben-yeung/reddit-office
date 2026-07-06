import type { DataSource, DataSourceHandlers } from "./DataSource";
import type {
  Layout,
  OfficePolicy,
  OfficeSnapshot,
  PostKind,
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
  TICK_MS,
} from "@/lib/domain/constants";
import {
  type Baseline,
  initBaseline,
  velocity,
  computeMomentum,
  updateBaseline,
  isSurge,
} from "@/lib/momentum/momentum";
import { selectRoster, assignSeats, type RosterCandidate } from "@/lib/roster/roster";
import { mulberry32, type Rng, range, intRange, pick, chance } from "@/lib/util/rng";

/** How long a removed post lingers (marked removed) before exiting the snapshot. */
const REMOVAL_LINGER = TICK_MS * 1.6;

interface SimPost {
  id: string;
  subredditId: string;
  title: string;
  author: string;
  body: string;
  kind: PostKind;
  image?: string;
  linkDomain?: string;
  flair?: string;
  permalink: string;
  createdAt: number;
  score: number;
  comments: number;
  prevSample: StatSample;
  heat: number;
  momentum: number;
  trending: boolean;
  removed: boolean;
  removedAt: number;
  surging: boolean;
}

interface SimSub {
  sub: Subreddit;
  scale: number; // per-sub absolute pace (demonstrates per-sub normalization)
  posts: Map<string, SimPost>;
  baseline: Baseline;
  seats: Record<string, number>;
  postCounter: number;
  prevRosterIds: Set<string>;
  trendingId: string | null;
}

const TITLE_TEMPLATES = [
  "TIL about {n}",
  "My first attempt at {n}",
  "Why does {n} happen?",
  "[OC] {n}, finally finished",
  "Breaking: {n}",
  "Anyone else obsessed with {n}?",
  "This completely changed how I think about {n}",
  "{n} - am I doing this right?",
  "Underrated: {n}",
  "Hot take on {n}",
];

const NOUNS = [
  "the new update",
  "tiny keyboards",
  "deep-sea creatures",
  "retro pixel art",
  "late-night snacks",
  "orbital mechanics",
  "a very good dog",
  "obscure history",
  "weekend projects",
  "the season finale",
  "home-made pasta",
  "an old paperback",
  "a perfect sunset",
  "a wild plot twist",
];

const AUTHOR_WORDS = ["pixel", "snoo", "byte", "quantum", "midnight", "coffee", "neon", "lofi"];

/** Self-text bodies for text posts (image/link posts carry no prose body). */
const SELF_TEXTS = [
  "Been chasing this for a while and finally cracked it. Happy to answer questions below.",
  "Not sure this is the right place to ask, but it's been bugging me all week.",
  "Sharing in case it saves someone else the afternoon I just lost to it.",
  "Long-time lurker, first real post. Be gentle.",
  "Quick write-up of how I got here, in case it helps anyone.",
];

/** Domains link posts point at (mirrors the reference's themirror.com bar). */
const LINK_DOMAINS = [
  "themirror.com",
  "nytimes.com",
  "bbc.co.uk",
  "youtube.com",
  "medium.com",
  "arstechnica.com",
];

/** Post flairs shown as a pill under the title. */
const FLAIRS = ["article", "discussion", "OC", "media", "news", "meta"];

/** Occasional captions on image posts - some carry markdown to exercise rendering. */
const IMAGE_CAPTIONS = [
  "",
  "",
  "Shot this on a **35mm** lens - full set in the comments.",
  "First attempt at this style. Feedback *very* welcome!",
  "See the [original source](https://www.reddit.com) for context.",
];

function makeAuthor(rng: Rng): string {
  return `u/${pick(rng, AUTHOR_WORDS)}_${intRange(rng, 100, 999)}`;
}

function makeTitle(rng: Rng): string {
  return pick(rng, TITLE_TEMPLATES).replace("{n}", pick(rng, NOUNS));
}

// --- offline placeholder imagery -----------------------------------------
// Real Reddit posts carry real image URLs; mock posts get a self-contained SVG
// gradient (no network) tinted by the subreddit's accent color.

function clamp8(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.replace(/(.)/g, "$1$1");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => clamp8(c).toString(16).padStart(2, "0")).join("")}`;
}

/** Blend a color toward a target by ratio t (0..1). */
function mixColor(hex: string, target: [number, number, number], t: number): string {
  const [r, g, b] = parseHex(hex);
  return toHex([r + (target[0] - r) * t, g + (target[1] - g) * t, b + (target[2] - b) * t]);
}

/** A deterministic, network-free gradient image as a data URI, tinted by color. */
function gradientImage(rng: Rng, color: string): string {
  const light = mixColor(color, [255, 255, 255], 0.35);
  const dark = mixColor(color, [10, 12, 18], 0.72);
  const bx = intRange(rng, 15, 70);
  const by = intRange(rng, 12, 55);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800' viewBox='0 0 1200 800'>` +
    `<defs>` +
    `<linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='${color}'/><stop offset='1' stop-color='${dark}'/>` +
    `</linearGradient>` +
    `<radialGradient id='r' cx='${bx}%' cy='${by}%' r='65%'>` +
    `<stop offset='0' stop-color='${light}' stop-opacity='0.55'/>` +
    `<stop offset='1' stop-color='${light}' stop-opacity='0'/>` +
    `</radialGradient>` +
    `</defs>` +
    `<rect width='1200' height='800' fill='url(#g)'/>` +
    `<rect width='1200' height='800' fill='url(#r)'/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Decide a mock post's presentation: ~40% image, ~20% link, ~40% text - so the
 * office reads like an image-heavy feed. Image/link posts get a deterministic,
 * offline gradient preview seeded off the current rng draw.
 */
function makeContent(
  rng: Rng,
  title: string,
  color: string,
): Pick<SimPost, "kind" | "body" | "image" | "flair" | "linkDomain"> {
  const flair = chance(rng, 0.55) ? pick(rng, FLAIRS) : undefined;
  const roll = rng();
  if (roll < 0.4) {
    // Image post: the image is the content, with an occasional caption.
    return { kind: "image", body: pick(rng, IMAGE_CAPTIONS), image: gradientImage(rng, color), flair };
  }
  if (roll < 0.6) {
    // Link post: a preview image + domain bar; no prose body.
    const linkDomain = pick(rng, LINK_DOMAINS);
    return { kind: "link", body: "", image: gradientImage(rng, color), linkDomain, flair };
  }
  return { kind: "text", body: pick(rng, SELF_TEXTS), flair };
}

/**
 * A self-contained simulation of Reddit activity across a set of subreddits.
 * It produces the same OfficeSnapshot + WorkerEvent stream the real data layer
 * will, so every UI concern (rendering, animation, policy) can be built against
 * it before any OAuth exists (ADR: mock-first, PRD 8).
 */
export class MockDataSource implements DataSource {
  private readonly subreddits: Subreddit[];
  private readonly layout: Layout;
  private readonly rng: Rng;
  private readonly subs = new Map<string, SimSub>();
  private policy: OfficePolicy;
  private handlers: DataSourceHandlers | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(subreddits: Subreddit[], layout: Layout, policy: OfficePolicy, seed = 1337) {
    this.subreddits = subreddits;
    this.layout = layout;
    this.policy = policy;
    this.rng = mulberry32(seed);
    this.seed(Date.now());
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
    // Repopulate the cubicles under the new sourcing rule immediately (no events),
    // so switching "Workers are…" takes effect without waiting for the next tick.
    if (sourcingChanged && this.handlers) {
      this.handlers.onSnapshot(this.buildSnapshot(Date.now()).snapshot);
    }
  }

  start(handlers: DataSourceHandlers): void {
    this.handlers = handlers;
    // Populate the office immediately (assigns seats), no events on first paint.
    this.handlers.onSnapshot(this.buildSnapshot(Date.now()).snapshot);
    this.timer = setInterval(() => this.tick(Date.now()), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.handlers = null;
  }

  // --- simulation ---------------------------------------------------------

  private seed(now: number): void {
    for (const sub of this.subreddits) {
      const scale = range(this.rng, 2, 14); // absolute pace varies wildly per sub
      const sim: SimSub = {
        sub,
        scale,
        posts: new Map(),
        // Baseline is per-minute; posts gain ~scale*heat per 1.5s tick, so the
        // expected per-minute pace is ~scale*0.65*(60000/TICK). Seed near that
        // so a typical post normalizes to momentum ~1 and only real spikes surge.
        baseline: initBaseline(scale * 26, scale * 5),
        seats: {},
        postCounter: 0,
        prevRosterIds: new Set(),
        trendingId: null,
      };
      const initial = intRange(this.rng, 5, 9);
      for (let i = 0; i < initial; i++) {
        // Stagger creation across the past so the seeded office has a mix of posts
        // inside and outside the New window (some fresh, some older).
        const age = intRange(this.rng, 30_000, 18 * 60 * 60_000);
        this.spawnPost(sim, now - age, false);
      }
      this.subs.set(sub.id, sim);
    }
  }

  private spawnPost(sim: SimSub, createdAt: number, fresh: boolean): SimPost {
    sim.postCounter += 1;
    const id = `t3_${sim.sub.id.slice(3)}_${sim.postCounter}`;
    const heat = fresh ? range(this.rng, 0.8, 1.4) : range(this.rng, 0.3, 1.3);
    const baseScore = fresh ? intRange(this.rng, 1, 8) : intRange(this.rng, 5, 400);
    const baseComments = Math.round(baseScore * range(this.rng, 0.05, 0.3));
    const title = makeTitle(this.rng);
    const content = makeContent(this.rng, title, sim.sub.color);
    const post: SimPost = {
      id,
      subredditId: sim.sub.id,
      title,
      author: makeAuthor(this.rng),
      body: content.body,
      kind: content.kind,
      image: content.image,
      linkDomain: content.linkDomain,
      flair: content.flair,
      permalink: `https://www.reddit.com/${sim.sub.displayName}/comments/${id}/`,
      createdAt,
      score: baseScore,
      comments: baseComments,
      prevSample: { t: createdAt, score: baseScore, comments: baseComments },
      heat,
      momentum: fresh ? 0.2 : range(this.rng, 0.3, 2),
      trending: false,
      removed: false,
      removedAt: 0,
      surging: false,
    };
    sim.posts.set(id, post);
    return post;
  }

  private tick(now: number): void {
    if (!this.handlers) return;
    const events: WorkerEvent[] = [];
    const spawnedBySub = new Map<string, string[]>();

    for (const sim of this.subs.values()) {
      const spawnedIds: string[] = [];

      // Spawn a new post now and then.
      if (sim.posts.size < 12 && chance(this.rng, 0.28)) {
        spawnedIds.push(this.spawnPost(sim, now, true).id);
      }

      // Evolve every live post; detect surges.
      for (const post of sim.posts.values()) {
        if (post.removed) continue;
        // Skip a post spawned this very tick (no real time has elapsed yet, so
        // its velocity would be a meaningless spike); it evolves next tick.
        if (post.prevSample.t >= now) continue;

        if (chance(this.rng, 0.05)) {
          post.heat += range(this.rng, 2.5, 4.5); // an upvote surge
        }

        post.score += Math.max(0, Math.round(sim.scale * post.heat * range(this.rng, 0.5, 1.5)));
        post.comments += Math.max(
          0,
          Math.round(sim.scale * post.heat * range(this.rng, 0.05, 0.35)),
        );

        const sample: StatSample = { t: now, score: post.score, comments: post.comments };
        const vel = velocity(post.prevSample, sample);
        const rawMomentum = computeMomentum(vel, sim.baseline);
        sim.baseline = updateBaseline(sim.baseline, vel);
        // Smooth to damp single-tick noise so surges reflect sustained spikes.
        const momentum = post.momentum * 0.6 + rawMomentum * 0.4;

        const nowSurging = isSurge(momentum);
        if (nowSurging && !post.surging && this.policy.events.surge) {
          events.push({ type: "surge", workerId: post.id, subredditId: sim.sub.id, at: now });
        }
        post.surging = nowSurging;
        post.momentum = momentum;
        post.prevSample = sample;
        post.heat = post.heat * 0.82 + 0.6 * 0.18; // relax toward calm
      }

      // Occasionally remove a post (generic "post removed", ADR-0002).
      const live = [...sim.posts.values()].filter((p) => !p.removed);
      if (live.length > 4 && chance(this.rng, 0.06)) {
        const victim = pick(this.rng, live);
        victim.removed = true;
        victim.removedAt = now;
        if (this.policy.events.removed && sim.prevRosterIds.has(victim.id)) {
          events.push({ type: "removed", workerId: victim.id, subredditId: sim.sub.id, at: now });
        }
      }

      // Trending = current highest-momentum live post.
      let topId: string | null = null;
      let topMomentum = -Infinity;
      for (const p of sim.posts.values()) {
        p.trending = false;
        if (!p.removed && p.momentum > topMomentum) {
          topMomentum = p.momentum;
          topId = p.id;
        }
      }
      if (topId) {
        sim.posts.get(topId)!.trending = true;
        if (topId !== sim.trendingId && this.policy.events.trending) {
          events.push({ type: "trending", workerId: topId, subredditId: sim.sub.id, at: now });
        }
        sim.trendingId = topId;
      }

      spawnedBySub.set(sim.sub.id, spawnedIds);
    }

    // Single source of truth for who is on the roster + where they sit.
    const { snapshot, selection } = this.buildSnapshot(now);

    for (const sim of this.subs.values()) {
      const selected = selection.get(sim.sub.id) ?? new Set<string>();

      // New-post events fire only for fresh posts that actually landed a seat.
      for (const id of spawnedBySub.get(sim.sub.id) ?? []) {
        if (this.policy.events["new-post"] && selected.has(id)) {
          events.push({ type: "new-post", workerId: id, subredditId: sim.sub.id, at: now });
        }
      }
      sim.prevRosterIds = selected;

      // Purge removed posts once their linger beat is over.
      for (const p of [...sim.posts.values()]) {
        if (p.removed && now - p.removedAt > REMOVAL_LINGER) {
          sim.posts.delete(p.id);
          delete sim.seats[p.id];
        }
      }
    }

    this.handlers.onSnapshot(snapshot);
    for (const e of events) this.handlers.onEvent(e);
  }

  /**
   * Build the roster snapshot: select each cubicle's workers, assign stable
   * seats, and include recently-removed workers for one lingering beat so their
   * removal reads before they exit. Returns the per-cubicle selection so the
   * caller can gate new-post events and track roster membership.
   */
  private buildSnapshot(now: number): {
    snapshot: OfficeSnapshot;
    selection: Map<string, Set<string>>;
  } {
    const workersByCubicle: WorkersByCubicle = {};
    const selection = new Map<string, Set<string>>();

    for (const sim of this.subs.values()) {
      const live = [...sim.posts.values()].filter((p) => !p.removed);
      const candidates: RosterCandidate[] = live.map((p) => ({
        id: p.id,
        createdAt: p.createdAt,
        momentum: p.momentum,
      }));
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

      const prevSeats = sim.seats;
      sim.seats = assignSeats(selectedIds, prevSeats, ROSTER_MAX, SEAT_HYSTERESIS);

      const workers: Worker[] = selectedIds.map((id) =>
        this.toWorker(sim.posts.get(id)!, sim.seats[id]),
      );

      // Pinned recently-removed workers keep their last seat for the exit beat.
      for (const p of sim.posts.values()) {
        if (p.removed && now - p.removedAt <= REMOVAL_LINGER && sim.prevRosterIds.has(p.id)) {
          workers.push(this.toWorker(p, prevSeats[p.id] ?? 0));
        }
      }

      workersByCubicle[sim.sub.id] = workers;
      selection.set(sim.sub.id, new Set(selectedIds));
    }

    return { snapshot: { workersByCubicle }, selection };
  }

  private toWorker(p: SimPost, seatIndex: number): Worker {
    return {
      id: p.id,
      subredditId: p.subredditId,
      title: p.title,
      author: p.author,
      body: p.body,
      kind: p.kind,
      image: p.image,
      linkDomain: p.linkDomain,
      flair: p.flair,
      permalink: p.permalink,
      createdAt: p.createdAt,
      score: p.score,
      comments: p.comments,
      momentum: p.momentum,
      trending: p.trending,
      removed: p.removed,
      seatIndex,
    };
  }
}
