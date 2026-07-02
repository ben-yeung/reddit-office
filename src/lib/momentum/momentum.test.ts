import { describe, it, expect } from "vitest";
import {
  velocity,
  computeMomentum,
  updateBaseline,
  isSurge,
  initBaseline,
} from "./momentum";

describe("velocity", () => {
  it("computes per-minute rates from two samples", () => {
    const v = velocity(
      { t: 0, score: 10, comments: 2 },
      { t: 60_000, score: 40, comments: 8 },
    );
    expect(v.scoreVel).toBeCloseTo(30);
    expect(v.commentVel).toBeCloseTo(6);
  });

  it("does not divide by zero when timestamps are equal", () => {
    const v = velocity({ t: 5, score: 1, comments: 1 }, { t: 5, score: 9, comments: 9 });
    expect(Number.isFinite(v.scoreVel)).toBe(true);
    expect(Number.isFinite(v.commentVel)).toBe(true);
  });

  it("reports negative velocity for a decaying post", () => {
    const v = velocity(
      { t: 0, score: 100, comments: 50 },
      { t: 60_000, score: 60, comments: 50 },
    );
    expect(v.scoreVel).toBeCloseTo(-40);
  });
});

describe("computeMomentum (per-subreddit normalization)", () => {
  it("scores ~1.0 for a post moving at its subreddit's average pace", () => {
    const baseline = initBaseline(50, 20);
    const m = computeMomentum({ scoreVel: 50, commentVel: 20 }, baseline);
    expect(m).toBeCloseTo(1.0);
  });

  it("makes a tiny sub and a huge sub comparable at equal relative pace", () => {
    // Both posts move at 3x their sub's baseline pace -> equal momentum.
    const tiny = computeMomentum({ scoreVel: 6, commentVel: 3 }, initBaseline(2, 1));
    const huge = computeMomentum({ scoreVel: 600, commentVel: 300 }, initBaseline(200, 100));
    expect(tiny).toBeCloseTo(3.0);
    expect(huge).toBeCloseTo(3.0);
    expect(tiny).toBeCloseTo(huge);
  });

  it("respects weighting between score and comments", () => {
    const baseline = initBaseline(10, 10);
    // Fast score, flat comments: weighted toward score.
    const m = computeMomentum({ scoreVel: 100, commentVel: 0 }, baseline, {
      score: 0.7,
      comments: 0.3,
    });
    expect(m).toBeCloseTo(0.7 * 10);
  });
});

describe("updateBaseline", () => {
  it("moves the baseline toward observed velocity via EMA", () => {
    const b0 = initBaseline(10, 10);
    const b1 = updateBaseline(b0, { scoreVel: 20, commentVel: 20 }, 0.5);
    expect(b1.scoreVel).toBeCloseTo(15);
    expect(b1.commentVel).toBeCloseTo(15);
  });

  it("ignores negative velocities so decay does not drag the baseline down", () => {
    const b0 = initBaseline(10, 10);
    const b1 = updateBaseline(b0, { scoreVel: -100, commentVel: -100 }, 0.5);
    expect(b1.scoreVel).toBeCloseTo(5); // toward 0, not toward -100
  });
});

describe("isSurge", () => {
  it("flags momentum above the threshold", () => {
    expect(isSurge(3, 2.2)).toBe(true);
    expect(isSurge(1.5, 2.2)).toBe(false);
  });
});
