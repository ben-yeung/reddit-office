import { describe, it, expect } from "vitest";
import type { Cubicle, Vec2 } from "@/lib/domain/types";
import { CELL_W, CELL_H, type Bounds } from "@/lib/data/layout";
import { walkBetween, walkIn, walkOut } from "./walkout";

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

/** A walk-in keyframe converted back to world space (offsets are seat-relative). */
function inWorld(w: ReturnType<typeof walkIn>, i: number): Vec2 {
  const seatWorld = { x: CUBICLE.position.x + SEAT.x, y: CUBICLE.position.y + SEAT.y };
  return { x: w.x[i] + seatWorld.x, y: w.y[i] + seatWorld.y };
}

describe("walkIn", () => {
  it("ends exactly on the seat", () => {
    const w = walkIn("t3_abc", SEAT, CUBICLE, BOUNDS);
    expect(w.x[w.x.length - 1]).toBe(0); // seat-relative offset (0,0)
    expect(w.y[w.y.length - 1]).toBe(0);
  });

  it("enters from a grid-perimeter hallway edge, about two cubicles away", () => {
    for (const id of ["t3_a", "t3_b", "t3_c", "t3_d", "t3_e", "t3_f", "t3_g", "t3_h"]) {
      const start = inWorld(walkIn(id, SEAT, CUBICLE, BOUNDS), 0);
      // Spawns on the grid perimeter (an aisle end), not under the desk.
      const onEdge =
        Math.abs(start.x - BOUNDS.minX) < 1e-6 ||
        Math.abs(start.x - BOUNDS.maxX) < 1e-6 ||
        Math.abs(start.y - BOUNDS.minY) < 1e-6 ||
        Math.abs(start.y - BOUNDS.maxY) < 1e-6;
      expect(onEdge).toBe(true);
      // ...but a nearby one: roughly one to three cubicles of travel, never a
      // full cross-grid trek.
      const seatWorld = { x: CUBICLE.position.x + SEAT.x, y: CUBICLE.position.y + SEAT.y };
      const dist = Math.hypot(start.x - seatWorld.x, start.y - seatWorld.y);
      expect(dist).toBeGreaterThan(CELL_H); // more than one cubicle - real travel
      expect(dist).toBeLessThan(3 * CELL_W); // but not across the whole floor
    }
  });

  it("steps up into the seat from directly below (through the open bottom)", () => {
    const w = walkIn("t3_abc", SEAT, CUBICLE, BOUNDS);
    const n = w.x.length;
    expect(w.x[n - 2]).toBe(0); // straight up: same x as the seat
    expect(w.y[n - 2]).toBeGreaterThan(0); // arrives from the aisle below
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

  it("fans roster-mates across more than one entrance", () => {
    const entrances = ["t3_a", "t3_b", "t3_c", "t3_d", "t3_e", "t3_f"].map((id) => {
      const s = inWorld(walkIn(id, SEAT, CUBICLE, BOUNDS), 0);
      return `${Math.round(s.x)},${Math.round(s.y)}`;
    });
    expect(new Set(entrances).size).toBeGreaterThan(1);
  });

  it("stays within the walk-in pace bounds", () => {
    const w = walkIn("t3_abc", SEAT, CUBICLE, BOUNDS);
    expect(w.duration).toBeGreaterThanOrEqual(1.6);
    expect(w.duration).toBeLessThanOrEqual(4);
  });

  it("is deterministic per post id", () => {
    expect(walkIn("t3_same", SEAT, CUBICLE, BOUNDS)).toEqual(
      walkIn("t3_same", SEAT, CUBICLE, BOUNDS),
    );
  });
});

// Cubicle grid cells (positions) for migration: from (1,1) to a far cell (3,2).
const FROM = { x: CELL_W, y: CELL_H };
const TO = { x: 3 * CELL_W, y: 2 * CELL_H };

/** A migration keyframe converted back to world space. */
function moveWorld(w: NonNullable<ReturnType<typeof walkBetween>>, i: number): Vec2 {
  // Offsets are relative to the new seat (final keyframe), so add it back.
  const newSeat = { x: TO.x + SEAT.x, y: TO.y + SEAT.y };
  return { x: w.x[i] + newSeat.x, y: w.y[i] + newSeat.y };
}

describe("walkBetween", () => {
  it("starts at the old desk and ends exactly on the new one", () => {
    const w = walkBetween("t3_abc", SEAT, FROM, TO)!;
    const start = moveWorld(w, 0);
    expect(start.x).toBe(FROM.x + SEAT.x);
    expect(start.y).toBe(FROM.y + SEAT.y);
    // Final keyframe is (0,0) offset - dead on the new seat.
    expect(w.x[w.x.length - 1]).toBe(0);
    expect(w.y[w.y.length - 1]).toBe(0);
  });

  it("steps out below the old cubicle before crossing (through the open bottom)", () => {
    const w = walkBetween("t3_abc", SEAT, FROM, TO)!;
    const p0 = moveWorld(w, 0);
    const p1 = moveWorld(w, 1);
    expect(p1.x).toBeCloseTo(p0.x, 6); // straight down: same x
    expect(p1.y).toBeGreaterThan(p0.y); // into the aisle below the old cubicle
  });

  it("arrives from directly below the new cubicle (into the open bottom)", () => {
    const w = walkBetween("t3_abc", SEAT, FROM, TO)!;
    const n = w.x.length;
    expect(w.x[n - 2]).toBeCloseTo(0, 6); // same x as the new seat: straight up
    expect(w.y[n - 2]).toBeGreaterThan(0); // approaches from below (aisle under it)
  });

  it("routes Manhattan along the aisles - every leg is axis-aligned", () => {
    for (const id of ["t3_a", "t3_b", "t3_c", "t3_d", "t3_e", "t3_f", "t3_g", "t3_h"]) {
      const w = walkBetween(id, SEAT, FROM, TO)!;
      for (let i = 1; i < w.x.length; i++) {
        const dx = Math.abs(w.x[i] - w.x[i - 1]);
        const dy = Math.abs(w.y[i] - w.y[i - 1]);
        expect(Math.min(dx, dy)).toBeLessThan(1e-6);
      }
    }
  });

  it("keeps aligned keyframe tracks and a sane clamped duration", () => {
    const w = walkBetween("t3_abc", SEAT, FROM, TO)!;
    expect(w.x).toHaveLength(w.times.length);
    expect(w.y).toHaveLength(w.times.length);
    expect(w.times[0]).toBe(0);
    expect(w.times[w.times.length - 1]).toBeCloseTo(1, 6);
    for (let i = 1; i < w.times.length; i++) expect(w.times[i]).toBeGreaterThan(w.times[i - 1]);
    expect(w.duration).toBeGreaterThanOrEqual(2);
    expect(w.duration).toBeLessThanOrEqual(4.5);
  });

  it("returns null when the cubicle didn't move", () => {
    expect(walkBetween("t3_abc", SEAT, FROM, FROM)).toBeNull();
  });

  it("collapses the vertical hop when old and new share a row", () => {
    // Same row -> the two corridor legs are one line, so the mid vertical hop
    // dedupes away: 6 raw waypoints become 5.
    const sameRow = walkBetween("t3_abc", SEAT, FROM, { x: 3 * CELL_W, y: CELL_H })!;
    expect(sameRow.x).toHaveLength(5);
    for (let i = 1; i < sameRow.x.length; i++) {
      const dx = Math.abs(sameRow.x[i] - sameRow.x[i - 1]);
      const dy = Math.abs(sameRow.y[i] - sameRow.y[i - 1]);
      expect(Math.min(dx, dy)).toBeLessThan(1e-6);
    }
  });

  it("gives different posts different lanes", () => {
    const lanes = ["t3_a", "t3_b", "t3_c", "t3_d", "t3_e", "t3_f"].map((id) => {
      const w = walkBetween(id, SEAT, FROM, TO)!;
      // The shared mid-hop x (a lane within the vertical aisle) varies per worker.
      return Math.round(moveWorld(w, 2).x);
    });
    expect(new Set(lanes).size).toBeGreaterThan(1);
  });

  it("is deterministic per post id", () => {
    const a = walkBetween("t3_same", SEAT, FROM, TO);
    const b = walkBetween("t3_same", SEAT, FROM, TO);
    expect(b).toEqual(a);
  });
});
