import { describe, expect, it } from "vitest";
import { commitDepartures, layoutMatchesSubreddits } from "./useOffice";
import { CURATED_SUBREDDITS } from "@/lib/data/curatedSubreddits";
import { generateLayout, LAYOUT_VERSION } from "@/lib/data/layout";
import type { Layout, Worker, WorkersByCubicle } from "@/lib/domain/types";

/**
 * Regression guard for the "changed subreddits go missing" bug: a persisted
 * layout must only be reused when its cubicles cover exactly the current
 * subreddit set. Cubicles are keyed by subreddit id, so a stale layout (saved
 * before the curated list changed) would otherwise leave the new subs without
 * cubicles and render dead ones for the removed subs.
 */
describe("layoutMatchesSubreddits", () => {
  it("accepts a layout generated from the current subreddit set", () => {
    const layout = generateLayout(CURATED_SUBREDDITS, 1);
    expect(layoutMatchesSubreddits(layout, CURATED_SUBREDDITS)).toBe(true);
  });

  it("rejects a stale layout whose cubicles reference the previous subreddit set", () => {
    // A layout persisted before the curated list changed - same scheme version,
    // but cubicles keyed to the old ids (e.g. askreddit/science/worldnews).
    const staleLayout: Layout = {
      version: LAYOUT_VERSION,
      seed: 1,
      cubicles: ["askreddit", "science", "worldnews", "movies"].map((name, i) => ({
        subredditId: `demo_${name}`,
        position: { x: i, y: 0 },
        size: { w: 320, h: 240 },
      })),
      amenities: [],
    };
    expect(layoutMatchesSubreddits(staleLayout, CURATED_SUBREDDITS)).toBe(false);
  });

  it("rejects a layout with the wrong cubicle count even if all ids are valid", () => {
    const layout = generateLayout(CURATED_SUBREDDITS, 1);
    const short: Layout = { ...layout, cubicles: layout.cubicles.slice(0, -1) };
    expect(layoutMatchesSubreddits(short, CURATED_SUBREDDITS)).toBe(false);
  });
});

/** commitDepartures only reads worker ids; a stub is enough. */
function snap(ids: string[]): WorkersByCubicle {
  return { c1: ids.map((id) => ({ id }) as Worker) };
}
const idsOf = (s: WorkersByCubicle) => (s.c1 ?? []).map((w) => w.id);
const LOCK = 5000;

describe("commitDepartures", () => {
  it("passes a steady roster through unchanged", () => {
    const departing = new Map<string, number>();
    const shown = new Set<string>();
    expect(idsOf(commitDepartures(snap(["a", "b"]), departing, shown, 0, LOCK))).toEqual([
      "a",
      "b",
    ]);
    expect(idsOf(commitDepartures(snap(["a", "b"]), departing, shown, 1000, LOCK))).toEqual([
      "a",
      "b",
    ]);
  });

  it("keeps a re-added worker out until its walk finishes, then lets it back", () => {
    const departing = new Map<string, number>();
    const shown = new Set<string>();
    // a and b are on screen.
    commitDepartures(snap(["a", "b"]), departing, shown, 0, LOCK);
    // b drops out - it has begun walking out.
    expect(idsOf(commitDepartures(snap(["a"]), departing, shown, 1000, LOCK))).toEqual(["a"]);
    // b is re-selected mid-walk: it must stay out so the exit isn't cancelled.
    expect(idsOf(commitDepartures(snap(["a", "b"]), departing, shown, 2000, LOCK))).toEqual(["a"]);
    // After the lock elapses, b may return as a fresh arrival.
    expect(
      idsOf(commitDepartures(snap(["a", "b"]), departing, shown, 1000 + LOCK + 1, LOCK)),
    ).toEqual(["a", "b"]);
  });

  it("does not lock a worker that is replaced by a different one (seat filled)", () => {
    const departing = new Map<string, number>();
    const shown = new Set<string>();
    commitDepartures(snap(["a", "b"]), departing, shown, 0, LOCK);
    // b leaves, c takes the slot - c is shown immediately, b is locked out.
    expect(idsOf(commitDepartures(snap(["a", "c"]), departing, shown, 1000, LOCK))).toEqual([
      "a",
      "c",
    ]);
    expect(departing.has("b")).toBe(true);
    expect(departing.has("c")).toBe(false);
  });
});
