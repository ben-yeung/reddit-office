import { describe, it, expect } from "vitest";
import { advanceMomentum, scorePrior } from "./demoMomentum";
import { initBaseline } from "./momentum";
import type { StatSample } from "@/lib/domain/types";

const s = (t: number, score: number, comments: number): StatSample => ({ t, score, comments });

describe("scorePrior", () => {
  it("scales within a subreddit and stays comparable across subs", () => {
    expect(scorePrior(0, 100)).toBeCloseTo(0.4);
    expect(scorePrior(100, 100)).toBeCloseTo(2.2);
    // A guard against divide-by-zero when the sub has no scored posts yet.
    expect(scorePrior(5, 0)).toBeCloseTo(0.4 + 1.8 * 5);
  });
});

describe("advanceMomentum", () => {
  it("seeds first-sight Momentum from the score prior", () => {
    const r = advanceMomentum(null, s(1000, 500, 40), null, 1.7);
    expect(r.momentum).toBe(1.7);
    expect(r.sample).toEqual(s(1000, 500, 40));
  });

  it("normalizes a typical mover to ~1.0 once the baseline seeds", () => {
    const prev = { sample: s(0, 100, 10), momentum: 1 };
    // First measured velocity seeds the sub baseline, so this reads ~average pace.
    const r = advanceMomentum(prev, s(60_000, 200, 20), null, 1.2);
    expect(r.momentum).toBeCloseTo(1, 5);
    expect(r.sample).toEqual(s(60_000, 200, 20));
  });

  it("holds the reading steady on a duplicate poll (no decay to zero)", () => {
    const baseline = initBaseline(100, 10);
    const prev = { sample: s(0, 200, 20), momentum: 1.5 };
    const r = advanceMomentum(prev, s(30_000, 200, 20), baseline, 0.9);
    expect(r.momentum).toBe(1.5); // unchanged
    expect(r.sample).toEqual(prev.sample); // keeps the last real sample + its time
    expect(r.baseline).toBe(baseline);
  });

  it("decays a stale post whose score barely moves against an established baseline", () => {
    const baseline = initBaseline(100, 10); // sub's normal pace
    // A post that was hot (momentum 2) but is now barely gaining: +10 score / +1
    // comment per minute, far below the sub's ~100/min pace. Over successive polls
    // its Momentum should trend down toward the pruning floor.
    const r1 = advanceMomentum({ sample: s(0, 500, 50), momentum: 2 }, s(60_000, 510, 51), baseline, 0.9);
    expect(r1.momentum).toBeLessThan(2);
    const r2 = advanceMomentum(
      { sample: r1.sample, momentum: r1.momentum },
      s(120_000, 520, 52),
      r1.baseline,
      0.9,
    );
    expect(r2.momentum).toBeLessThan(r1.momentum);
    expect(r2.momentum).toBeLessThan(0.6); // headed below MIN_MOMENTUM -> evictable
  });

  it("rewards a fast riser above the baseline", () => {
    const baseline = initBaseline(100, 10);
    const prev = { sample: s(0, 500, 50), momentum: 1 };
    // +400 score in a minute: ~4x the sub's pace.
    const r = advanceMomentum(prev, s(60_000, 900, 90), baseline, 0.9);
    expect(r.momentum).toBeGreaterThan(1.5);
  });
});
