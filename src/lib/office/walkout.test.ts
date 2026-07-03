import { describe, it, expect } from "vitest";
import type { Cubicle, Vec2 } from "@/lib/domain/types";
import type { Bounds } from "@/lib/data/layout";
import { walkOut } from "./walkout";

const CUBICLE: Cubicle = {
  subredditId: "r/test",
  position: { x: 400, y: 300 },
  size: { w: 320, h: 240 },
};

// A world whose perimeter is comfortably outside the cubicle on every side.
const BOUNDS: Bounds = {
  minX: -200,
  minY: -200,
  maxX: 1400,
  maxY: 1000,
  width: 1600,
  height: 1200,
};

const SEAT: Vec2 = { x: 100, y: 90 }; // cubicle-local

function onPerimeterWorld(local: number[], axis: "x" | "y"): number {
  // Convert the final local keyframe back to world space.
  return local[local.length - 1] + (axis === "x" ? CUBICLE.position.x : CUBICLE.position.y);
}

describe("walkOut", () => {
  it("starts exactly at the seat", () => {
    const w = walkOut("t3_abc", SEAT, CUBICLE, BOUNDS);
    expect(w.x[0]).toBe(SEAT.x);
    expect(w.y[0]).toBe(SEAT.y);
  });

  it("steps out below the cubicle before leaving (through the open bottom)", () => {
    const w = walkOut("t3_abc", SEAT, CUBICLE, BOUNDS);
    // Second keyframe is the doorway: past the bottom wall (local y = size.h).
    expect(w.y[1]).toBeGreaterThan(CUBICLE.size.h);
  });

  it("ends on a world edge and fully faded", () => {
    const w = walkOut("t3_abc", SEAT, CUBICLE, BOUNDS);
    const wx = onPerimeterWorld(w.x, "x");
    const wy = onPerimeterWorld(w.y, "y");
    const onEdge =
      Math.abs(wx - BOUNDS.minX) < 1e-6 ||
      Math.abs(wx - BOUNDS.maxX) < 1e-6 ||
      Math.abs(wy - BOUNDS.minY) < 1e-6 ||
      Math.abs(wy - BOUNDS.maxY) < 1e-6;
    expect(onEdge).toBe(true);
    expect(w.opacity[w.opacity.length - 1]).toBe(0);
    expect(w.opacity[0]).toBe(1);
  });

  it("keeps aligned keyframe tracks and a sane clamped duration", () => {
    const w = walkOut("t3_abc", SEAT, CUBICLE, BOUNDS);
    expect(w.x).toHaveLength(w.times.length);
    expect(w.y).toHaveLength(w.times.length);
    expect(w.opacity).toHaveLength(w.times.length);
    expect(w.times[0]).toBe(0);
    expect(w.times[w.times.length - 1]).toBe(1);
    expect(w.duration).toBeGreaterThanOrEqual(1.6);
    expect(w.duration).toBeLessThanOrEqual(3.4);
  });

  it("is deterministic per post id", () => {
    const a = walkOut("t3_same", SEAT, CUBICLE, BOUNDS);
    const b = walkOut("t3_same", SEAT, CUBICLE, BOUNDS);
    expect(b).toEqual(a);
  });

  it("routes different posts to different edges", () => {
    const paths = ["t3_a", "t3_b", "t3_c", "t3_d", "t3_e", "t3_f"].map(
      (id) => walkOut(id, SEAT, CUBICLE, BOUNDS).x[3],
    );
    // Not every worker should head to the same x - the routing varies by id.
    expect(new Set(paths).size).toBeGreaterThan(1);
  });
});
