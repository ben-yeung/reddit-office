import { describe, it, expect } from "vitest";
import { advanceMomentum, scorePrior, updateBaselineRobust } from "./demoMomentum";
import { initBaseline, type Velocity } from "./momentum";
import type { StatSample } from "@/lib/domain/types";

const s = (t: number, score: number, comments: number): StatSample => ({ t, score, comments });
const v = (scoreVel: number, commentVel: number): Velocity => ({ scoreVel, commentVel });

describe("scorePrior", () => {
  it("scales within a subreddit and stays comparable across subs", () => {
    expect(scorePrior(0, 100)).toBeCloseTo(0.4);
    expect(scorePrior(100, 100)).toBeCloseTo(2.2);
    // A guard against divide-by-zero when the sub has no scored posts yet.
    expect(scorePrior(5, 0)).toBeCloseTo(0.4 + 1.8 * 5);
  });
});

describe("advanceMomentum", () => {
  it("seeds first-sight Momentum from the score prior and reports no velocity", () => {
    const r = advanceMomentum(null, s(1000, 500, 40), null, 1.7);
    expect(r.momentum).toBe(1.7);
    expect(r.sample).toEqual(s(1000, 500, 40));
    expect(r.velocity).toBeNull();
  });

  it("normalizes a typical mover to ~1.0 and reports its velocity", () => {
    const prev = { sample: s(0, 100, 10), momentum: 1 };
    // Falls back to normalizing against its own velocity while the baseline is null.
    const r = advanceMomentum(prev, s(60_000, 200, 20), null, 1.2);
    expect(r.momentum).toBeCloseTo(1, 5);
    expect(r.sample).toEqual(s(60_000, 200, 20));
    expect(r.velocity).toEqual(v(100, 10));
  });

  it("holds the reading steady on a duplicate poll (no decay, no velocity)", () => {
    const baseline = initBaseline(100, 10);
    const prev = { sample: s(0, 200, 20), momentum: 1.5 };
    const r = advanceMomentum(prev, s(30_000, 200, 20), baseline, 0.9);
    expect(r.momentum).toBe(1.5); // unchanged
    expect(r.sample).toEqual(prev.sample); // keeps the last real sample + its time
    expect(r.velocity).toBeNull();
  });

  it("decays a stale post whose score barely moves against an established baseline", () => {
    const baseline = initBaseline(100, 10); // sub's normal pace (read-only here)
    // A post that was hot (momentum 2) but is now barely gaining: +10 score / +1
    // comment per minute, far below the sub's ~100/min pace. Over successive polls
    // its Momentum should trend down toward the pruning floor.
    const r1 = advanceMomentum(
      { sample: s(0, 500, 50), momentum: 2 },
      s(60_000, 510, 51),
      baseline,
      0.9,
    );
    expect(r1.momentum).toBeLessThan(2);
    const r2 = advanceMomentum(
      { sample: r1.sample, momentum: r1.momentum },
      s(120_000, 520, 52),
      baseline,
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

describe("updateBaselineRobust", () => {
  it("seeds a null baseline from the median velocity", () => {
    const b = updateBaselineRobust(null, [v(10, 1), v(20, 2), v(1000, 100)]);
    // Median of [10,20,1000] = 20, not the outlier-inflated mean (~343).
    expect(b?.scoreVel).toBe(20);
    expect(b?.commentVel).toBe(2);
  });

  it("resists a few viral outliers that would inflate a mean baseline", () => {
    const base = initBaseline(20, 2);
    // Most posts crawl (~20/min); two are viral (2000/min). A mean update would
    // yank the baseline up; the median keeps it near the typical pace.
    const vels = [v(20, 2), v(20, 2), v(20, 2), v(2000, 300), v(2500, 400)];
    const b = updateBaselineRobust(base, vels, 0.1)!;
    expect(b.scoreVel).toBeCloseTo(20, 5); // 20*0.9 + median(20)*0.1
  });

  it("ignores negative rates so decay can't drag normal pace toward zero", () => {
    const base = initBaseline(50, 5);
    const b = updateBaselineRobust(base, [v(-100, -10), v(-100, -10), v(-100, -10)], 0.5)!;
    // All clamped to 0, median 0 -> baseline eases down but never negative.
    expect(b.scoreVel).toBe(25);
    expect(b.scoreVel).toBeGreaterThanOrEqual(0);
  });

  it("returns the baseline unchanged when the poll produced no velocities", () => {
    const base = initBaseline(50, 5);
    expect(updateBaselineRobust(base, [])).toBe(base);
    expect(updateBaselineRobust(null, [])).toBeNull();
  });
});
