import { describe, it, expect } from "vitest";
import type { Cubicle, Vec2 } from "@/lib/domain/types";
import { CELL_W, CELL_H, type Bounds } from "@/lib/data/layout";
import { walkIn, walkOut } from "./walkout";

// A cubicle at grid cell (1, 1), so it has aisles on every side.
const CUBICLE: Cubicle = {
  subredditId: "r/test",
  position: { x: CELL_W, y: CELL_H },
  size: { w: 320, h: 240 },
};

// A world whose perimeter is comfortably outside the cubicle on every side.
const BOUNDS: Bounds = {
  minX: -400,
  minY: -400,
  maxX: 2000,
  maxY: 1600,
  width: 2400,
  height: 2000,
};

const SEAT: Vec2 = { x: 100, y: 90 }; // cubicle-local

/** Final keyframe converted back to world space. */
function endWorld(w: ReturnType<typeof walkOut>): Vec2 {
  return {
    x: w.x[w.x.length - 1] + CUBICLE.position.x,
    y: w.y[w.y.length - 1] + CUBICLE.position.y,
  };
}

describe("walkOut", () => {
  it("starts exactly at the seat", () => {
    const w = walkOut("t3_abc", SEAT, CUBICLE, BOUNDS);
    expect(w.x[0]).toBe(SEAT.x);
    expect(w.y[0]).toBe(SEAT.y);
  });

  it("steps out below the cubicle before leaving (through the open bottom)", () => {
    const w = walkOut("t3_abc", SEAT, CUBICLE, BOUNDS);
    expect(w.x[1]).toBe(SEAT.x); // straight down: same x
    expect(w.y[1]).toBeGreaterThan(CUBICLE.size.h); // past the bottom wall
  });

  it("routes Manhattan along the aisles - every leg is axis-aligned", () => {
    // Each segment moves along a single axis (a hallway center-line), so the
    // walk never cuts diagonally across a neighbouring cubicle.
    for (const id of ["t3_a", "t3_b", "t3_c", "t3_d", "t3_e", "t3_f", "t3_g", "t3_h"]) {
      const w = walkOut(id, SEAT, CUBICLE, BOUNDS);
      for (let i = 1; i < w.x.length; i++) {
        const dx = Math.abs(w.x[i] - w.x[i - 1]);
        const dy = Math.abs(w.y[i] - w.y[i - 1]);
        expect(Math.min(dx, dy)).toBeLessThan(1e-6); // horizontal or vertical only
      }
    }
  });

  it("ends on a world edge and fully faded", () => {
    const w = walkOut("t3_abc", SEAT, CUBICLE, BOUNDS);
    const end = endWorld(w);
    const onEdge =
      Math.abs(end.x - BOUNDS.minX) < 1e-6 ||
      Math.abs(end.x - BOUNDS.maxX) < 1e-6 ||
      Math.abs(end.y - BOUNDS.minY) < 1e-6 ||
      Math.abs(end.y - BOUNDS.maxY) < 1e-6;
    expect(onEdge).toBe(true);
    expect(w.opacity[w.opacity.length - 1]).toBe(0);
    expect(w.opacity[0]).toBe(1);
  });

  it("keeps aligned keyframe tracks and a sane clamped duration", () => {
    const w = walkOut("t3_abc", SEAT, CUBICLE, BOUNDS);
    // position tracks share the distance-proportional `times` grid
    expect(w.x).toHaveLength(w.times.length);
    expect(w.y).toHaveLength(w.times.length);
    expect(w.times[0]).toBe(0);
    expect(w.times[w.times.length - 1]).toBeCloseTo(1, 6);
    // times strictly increasing (framer requires it)
    for (let i = 1; i < w.times.length; i++) expect(w.times[i]).toBeGreaterThan(w.times[i - 1]);
    expect(w.duration).toBeGreaterThanOrEqual(1.8);
    expect(w.duration).toBeLessThanOrEqual(4.5);
  });

  it("fades on its own continuous track: held full, then a single smooth fade", () => {
    const w = walkOut("t3_abc", SEAT, CUBICLE, BOUNDS);
    // opacity has its own times, decoupled from the path waypoints
    expect(w.opacity).toHaveLength(w.opacityTimes.length);
    expect(w.opacity).toEqual([1, 1, 0]); // full, still full, gone - one fade
    expect(w.opacityTimes[0]).toBe(0);
    expect(w.opacityTimes[w.opacityTimes.length - 1]).toBe(1);
    for (let i = 1; i < w.opacityTimes.length; i++)
      expect(w.opacityTimes[i]).toBeGreaterThan(w.opacityTimes[i - 1]);
    // holds most of the walk before the fade begins
    expect(w.opacityTimes[1]).toBeGreaterThan(0.5);
  });

  it("is deterministic per post id", () => {
    const a = walkOut("t3_same", SEAT, CUBICLE, BOUNDS);
    const b = walkOut("t3_same", SEAT, CUBICLE, BOUNDS);
    expect(b).toEqual(a);
  });

  it("routes different posts to different exits", () => {
    const ends = ["t3_a", "t3_b", "t3_c", "t3_d", "t3_e", "t3_f"].map((id) => {
      const e = endWorld(walkOut(id, SEAT, CUBICLE, BOUNDS));
      return `${Math.round(e.x)},${Math.round(e.y)}`;
    });
    expect(new Set(ends).size).toBeGreaterThan(1);
  });
});

/** First keyframe converted back to world space. */
function startWorld(w: ReturnType<typeof walkIn>): Vec2 {
  return {
    x: w.x[0] + CUBICLE.position.x,
    y: w.y[0] + CUBICLE.position.y,
  };
}

describe("walkIn", () => {
  it("ends exactly at the seat", () => {
    const w = walkIn("t3_abc", SEAT, CUBICLE, BOUNDS);
    expect(w.x[w.x.length - 1]).toBe(SEAT.x);
    expect(w.y[w.y.length - 1]).toBe(SEAT.y);
  });

  it("steps in from directly below the cubicle (through the open bottom)", () => {
    const w = walkIn("t3_abc", SEAT, CUBICLE, BOUNDS);
    const n = w.x.length;
    expect(w.x[n - 2]).toBe(SEAT.x); // straight up into the seat: same x
    expect(w.y[n - 2]).toBeGreaterThan(CUBICLE.size.h); // enters from past the bottom wall
  });

  it("starts on a world edge, fading in from invisible", () => {
    const w = walkIn("t3_abc", SEAT, CUBICLE, BOUNDS);
    const start = startWorld(w);
    const onEdge =
      Math.abs(start.x - BOUNDS.minX) < 1e-6 ||
      Math.abs(start.x - BOUNDS.maxX) < 1e-6 ||
      Math.abs(start.y - BOUNDS.minY) < 1e-6 ||
      Math.abs(start.y - BOUNDS.maxY) < 1e-6;
    expect(onEdge).toBe(true);
    expect(w.opacity[0]).toBe(0);
    expect(w.opacity[w.opacity.length - 1]).toBe(1);
  });

  it("routes Manhattan along the aisles - every leg is axis-aligned", () => {
    for (const id of ["t3_a", "t3_b", "t3_c", "t3_d", "t3_e", "t3_f", "t3_g", "t3_h"]) {
      const w = walkIn(id, SEAT, CUBICLE, BOUNDS);
      for (let i = 1; i < w.x.length; i++) {
        const dx = Math.abs(w.x[i] - w.x[i - 1]);
        const dy = Math.abs(w.y[i] - w.y[i - 1]);
        expect(Math.min(dx, dy)).toBeLessThan(1e-6);
      }
    }
  });

  it("fades in on its own continuous track: one smooth fade, then held full", () => {
    const w = walkIn("t3_abc", SEAT, CUBICLE, BOUNDS);
    expect(w.opacity).toHaveLength(w.opacityTimes.length);
    expect(w.opacity).toEqual([0, 1, 1]); // gone, full, still full - one fade in
    expect(w.opacityTimes[0]).toBe(0);
    expect(w.opacityTimes[w.opacityTimes.length - 1]).toBe(1);
    for (let i = 1; i < w.opacityTimes.length; i++)
      expect(w.opacityTimes[i]).toBeGreaterThan(w.opacityTimes[i - 1]);
    // fades in over just the opening stretch, then holds full the rest of the way
    expect(w.opacityTimes[1]).toBeLessThan(0.5);
  });

  it("is the reverse of the same worker's walk-out", () => {
    const out = walkOut("t3_mirror", SEAT, CUBICLE, BOUNDS);
    const back = walkIn("t3_mirror", SEAT, CUBICLE, BOUNDS);
    // Same deterministic route, reversed: walk-in waypoints are walk-out's flipped.
    expect(back.x).toEqual([...out.x].reverse());
    expect(back.y).toEqual([...out.y].reverse());
    expect(back.duration).toBeCloseTo(out.duration, 6);
  });

  it("is deterministic per post id", () => {
    const a = walkIn("t3_same", SEAT, CUBICLE, BOUNDS);
    const b = walkIn("t3_same", SEAT, CUBICLE, BOUNDS);
    expect(b).toEqual(a);
  });
});
