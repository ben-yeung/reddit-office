import type { Bounds } from "@/lib/data/layout";
import type { Cubicle, Vec2 } from "@/lib/domain/types";
import { hashString, mulberry32, range, type Rng } from "@/lib/util/rng";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * A departing worker's exit walk, as framer-motion keyframes in the cubicle's
 * local space (the worker group is translated to `cubicle.position`).
 *
 * `x`/`y`/`opacity` are aligned keyframe tracks sampled at `times`; the worker
 * holds full opacity until the final leg, so it fades only once it reaches the
 * office edge.
 */
export interface WalkOut {
  x: number[];
  y: number[];
  opacity: number[];
  times: number[];
  duration: number;
}

/** A random point on the office perimeter (a world edge) to head for. */
function edgePoint(rng: Rng, bounds: Bounds): Vec2 {
  const side = Math.floor(rng() * 4);
  switch (side) {
    case 0:
      return { x: range(rng, bounds.minX, bounds.maxX), y: bounds.minY }; // top
    case 1:
      return { x: range(rng, bounds.minX, bounds.maxX), y: bounds.maxY }; // bottom
    case 2:
      return { x: bounds.minX, y: range(rng, bounds.minY, bounds.maxY) }; // left
    default:
      return { x: bounds.maxX, y: range(rng, bounds.minY, bounds.maxY) }; // right
  }
}

/**
 * The path a replaced worker takes when they leave: get up from the desk, step
 * out through the cubicle's open bottom into the aisle, then stroll to a random
 * edge of the office and fade out. Cubicles are walled on three sides (top/left/
 * right) with an open bottom, so the doorway is always the bottom edge.
 *
 * Deterministic per post id, so a given worker always leaves the same way and
 * the path stays stable across the re-renders AnimatePresence drives during the
 * exit.
 */
export function walkOut(id: string, seat: Vec2, cubicle: Cubicle, bounds: Bounds): WalkOut {
  const rng = mulberry32(hashString(id) ^ 0x9e3779b9);
  const { position: pos, size } = cubicle;

  // Doorway: step down and out through the cubicle's open bottom edge, with a
  // little horizontal wander so a whole roster doesn't file out single-file.
  const doorX = seat.x + range(rng, -22, 22);
  const doorY = size.h + range(rng, 14, 40);

  // World edge target, converted to this cubicle's local space.
  const target = edgePoint(rng, bounds);
  const edgeX = target.x - pos.x;
  const edgeY = target.y - pos.y;

  // A mid waypoint biased toward the target with a small perpendicular kink, so
  // the stroll bends instead of tracking a dead-straight line.
  const midX = (doorX + edgeX) / 2 + range(rng, -70, 70);
  const midY = (doorY + edgeY) / 2 + range(rng, -50, 50);

  // Distance-scaled duration keeps a steady walking pace: a far edge takes
  // longer, clamped so it never crawls or blinks away.
  const dist = Math.hypot(edgeX - seat.x, edgeY - seat.y);
  const duration = clamp(dist / 260, 1.6, 3.4);

  return {
    x: [seat.x, doorX, midX, edgeX],
    y: [seat.y, doorY, midY, edgeY],
    opacity: [1, 1, 1, 0],
    times: [0, 0.18, 0.66, 1],
    duration,
  };
}
