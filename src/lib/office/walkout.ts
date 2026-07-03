import { CELL_W, CELL_H, GAP_X, GAP_Y, type Bounds } from "@/lib/data/layout";
import type { Cubicle, Vec2 } from "@/lib/domain/types";
import { hashString, mulberry32, pick, range } from "@/lib/util/rng";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * A departing worker's exit walk, as framer-motion keyframes in the cubicle's
 * local space (the worker group is translated to `cubicle.position`).
 *
 * `x`/`y`/`opacity` are aligned keyframe tracks sampled at `times`; the worker
 * holds full opacity until a short tail at the end, so it fades only once it has
 * reached the office edge.
 */
export interface WalkOut {
  x: number[];
  y: number[];
  opacity: number[];
  times: number[];
  duration: number;
}

/**
 * The path a replaced worker takes when they leave: get up from the desk, step
 * out through the cubicle's open bottom into the aisle, then follow the hallway
 * grid to a random edge of the office and fade out.
 *
 * Routing is Manhattan along the aisle center-lines (the `GAP`-wide gaps between
 * cubicles), so the walk never cuts across another cubicle's footprint. Cubicles
 * sit on a grid at `col*CELL_W, row*CELL_H`, walled on three sides with an open
 * bottom, so the doorway is always the horizontal aisle just below the cubicle;
 * from there the worker either strolls along that aisle to the left/right edge,
 * or hops to a neighbouring vertical aisle and follows it to the top/bottom edge.
 *
 * Deterministic per post id, so a given worker always leaves the same way and
 * the path stays stable across the re-renders AnimatePresence drives during the
 * exit.
 */
export function walkOut(id: string, seat: Vec2, cubicle: Cubicle, bounds: Bounds): WalkOut {
  const rng = mulberry32(hashString(id) ^ 0x9e3779b9);
  const { position: pos } = cubicle;

  // This cubicle's grid cell, and the aisle center-lines that border it.
  const col = Math.round(pos.x / CELL_W);
  const row = Math.round(pos.y / CELL_H);
  const leftAisleX = col * CELL_W - GAP_X / 2;
  const rightAisleX = (col + 1) * CELL_W - GAP_X / 2;
  const bottomAisleY = (row + 1) * CELL_H - GAP_Y / 2;

  // Wander within an aisle without leaving it (gaps are GAP wide, keep well inside).
  const wanderX = () => range(rng, -GAP_X * 0.22, GAP_X * 0.22);
  const wanderY = () => range(rng, -GAP_Y * 0.22, GAP_Y * 0.22);

  // A single y for the whole horizontal leg and a single x for the whole vertical
  // leg keep every segment axis-aligned, i.e. dead-centre in an aisle.
  const corridorY = bottomAisleY + wanderY();
  const vertAisleX = (rng() < 0.5 ? leftAisleX : rightAisleX) + wanderX();

  const seatWorld = { x: pos.x + seat.x, y: pos.y + seat.y };

  // Step straight down out of the open bottom into the horizontal aisle.
  const pts: Vec2[] = [seatWorld, { x: seatWorld.x, y: corridorY }];

  // ...then follow the hallway grid off a random edge.
  const edge = pick(rng, ["left", "right", "top", "bottom"] as const);
  if (edge === "left") {
    pts.push({ x: bounds.minX, y: corridorY });
  } else if (edge === "right") {
    pts.push({ x: bounds.maxX, y: corridorY });
  } else {
    // Hop along the aisle to a neighbouring vertical hallway, then follow it out.
    pts.push({ x: vertAisleX, y: corridorY });
    pts.push({ x: vertAisleX, y: edge === "top" ? bounds.minY : bounds.maxY });
  }

  // Split the final leg so the fade is a short, consistent tail rather than
  // spanning a whole long corridor.
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  pts.splice(pts.length - 1, 0, {
    x: prev.x + (last.x - prev.x) * 0.8,
    y: prev.y + (last.y - prev.y) * 0.8,
  });

  // To cubicle-local space, with times proportional to distance (steady pace).
  const x = pts.map((p) => p.x - pos.x);
  const y = pts.map((p) => p.y - pos.y);
  const cumulative = [0];
  for (let i = 1; i < pts.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = cumulative[cumulative.length - 1] || 1;
  const times = cumulative.map((d) => d / total);
  const opacity = pts.map((_, i) => (i === pts.length - 1 ? 0 : 1));

  return { x, y, opacity, times, duration: clamp(total / 220, 1.8, 4.5) };
}
