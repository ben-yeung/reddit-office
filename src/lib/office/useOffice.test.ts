import { describe, expect, it } from "vitest";
import { layoutMatchesSubreddits } from "./useOffice";
import { CURATED_SUBREDDITS } from "@/lib/data/curatedSubreddits";
import { generateLayout, LAYOUT_VERSION } from "@/lib/data/layout";
import type { Layout } from "@/lib/domain/types";

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
