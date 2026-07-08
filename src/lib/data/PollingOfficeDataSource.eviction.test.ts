/**
 * Regression test for the "polling office empties out" bug.
 *
 * A live hot listing is heavy-tailed: a few viral posts, most crawling. The old
 * momentum pipeline normalized against a *mean* baseline that those viral posts
 * inflated, so every typical post sank below the absolute Momentum floor and got
 * evicted with nothing above the floor to replace it - the busiest subs emptied
 * first. This drives the real PollingOfficeDataSource through many polls of such
 * data and asserts the cubicle stays full.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PollingOfficeDataSource } from "./PollingOfficeDataSource";
import { ROSTER_MAX } from "@/lib/domain/constants";
import type {
  Layout,
  OfficePolicy,
  OfficeSnapshot,
  SourcingRule,
  Subreddit,
} from "@/lib/domain/types";
import type { DemoOfficePayload, RedditPostDTO } from "@/lib/reddit/dto";

const POLL_MS = 30_000;

const SUB: Subreddit = { id: "t5_x", name: "x", displayName: "r/x", color: "#f70" };
const LAYOUT: Layout = {
  version: 1,
  seed: 1,
  cubicles: [{ subredditId: SUB.id, position: { x: 0, y: 0 }, size: { w: 320, h: 240 } }],
  amenities: [],
};

function policy(sourcing: SourcingRule): OfficePolicy {
  return {
    sourcing,
    events: { "new-post": true, trending: true, surge: true, removed: true },
    theme: "dark",
    ambient: true,
    pauseOnModal: false,
    renderer: "2d",
  };
}

/** Deterministic RNG so the scenario is stable. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface HotPost extends RedditPostDTO {
  scoreRate: number; // score/min while hot (heavy-tailed)
}

function post(id: string, createdAt: number, score: number, scoreRate: number): HotPost {
  return {
    id,
    subredditId: SUB.id,
    title: id,
    author: "u/a",
    body: "",
    kind: "text",
    permalink: `/${id}`,
    createdAt,
    score,
    comments: Math.round(score * 0.15),
    scoreRate,
  };
}

/** A realistic hot listing: ~25 posts, a few fast movers, the rest crawling. */
function seedListing(rng: () => number, now: number): HotPost[] {
  const posts: HotPost[] = [];
  for (let i = 0; i < 25; i++) {
    const fast = rng() < 0.15;
    const rate = fast ? 200 + rng() * 800 : 2 + rng() * 30;
    const ageH = rng() * 20;
    const score = Math.max(1, Math.round(rate * ageH * 60 * (0.3 + rng())));
    posts.push(post(`t3_${i}`, now - ageH * 3_600_000, score, rate));
  }
  return posts;
}

function advanceListing(posts: HotPost[], rng: () => number): void {
  const dtMin = POLL_MS / 60_000;
  for (const p of posts) {
    const gain = Math.max(0, Math.round(p.scoreRate * dtMin * (0.6 + rng() * 0.8)));
    p.score += gain;
    p.comments += Math.max(0, Math.round(gain * 0.15));
  }
}

describe("PollingOfficeDataSource - stays full on heavy-tailed live data", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each(["blend", "momentum"] as const)(
    "keeps the cubicle full across many polls (%s sourcing)",
    async (sourcing) => {
      const rng = mulberry32(42);
      const posts = seedListing(rng, Date.now());

      const fetchPayload = vi.fn(async (): Promise<DemoOfficePayload> => {
        advanceListing(posts, rng);
        return {
          configured: true,
          subreddits: [SUB],
          postsBySub: { [SUB.id]: posts.map((p) => ({ ...p })) },
        };
      });

      const occupancy: number[] = [];
      const src = new PollingOfficeDataSource([SUB], LAYOUT, policy(sourcing), fetchPayload);
      src.start({
        onSnapshot: (snap: OfficeSnapshot) => {
          occupancy.push(snap.workersByCubicle[SUB.id]?.length ?? 0);
        },
        onEvent: () => {},
      });

      // Drive ~20 polls.
      for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(POLL_MS);
      src.stop();

      // First snapshot fills from the score prior; every later snapshot must stay
      // full too - no slow drain as momenta normalize.
      expect(occupancy.length).toBeGreaterThan(15);
      expect(occupancy.every((n) => n === ROSTER_MAX)).toBe(true);
    },
  );
});
