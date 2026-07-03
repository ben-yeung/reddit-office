import { CELL_W, CELL_H, GAP_X, GAP_Y, type Bounds } from "@/lib/data/layout";
import type { Cubicle, Vec2 } from "@/lib/domain/types";
import { hashString, mulberry32, pick, range } from "@/lib/util/rng";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Walk-out pace bounds (seconds). A far edge takes longer, but never crawls or
 *  blinks away. WALKOUT_MAX_S also sizes the roster departure lock in useOffice
 *  so an in-flight walk can't be cancelled by a jittery re-selection. */
export const WALKOUT_MIN_S = 1.8;
export const WALKOUT_MAX_S = 4.5;

/** Migration pace bounds (seconds) for the shuffle relayout, where a worker walks
 *  the aisles from its old desk all the way to its new one. Paths are longer than
 *  a walk-out, so a slightly higher ceiling keeps the pace like walking without
 *  the longest cross-floor treks dragging on. */
export const MIGRATE_MIN_S = 2;
export const MIGRATE_MAX_S = 4.5;

/** Fraction of the walk after which the worker starts fading out (fades over the
 *  final stretch as it reaches the edge, like the ambient hallway NPCs). */
const FADE_START = 0.82;

/** Even walking pace: world px per second of walk. Divides a path's length to a
 *  duration (then clamped), so every leg moves at roughly the same speed. */
const WALK_PX_PER_S = 220;
const MIGRATE_PX_PER_S = 320;

/**
 * A worker's aisle walk, as framer-motion keyframes. `x`/`y` are position
 * keyframes sampled at `times` (distance-proportional, so a constant/linear pace
 * gives even speed through every corridor). `opacity` is a separate track on
 * `opacityTimes` - so a fade is continuous rather than stepping at each waypoint.
 */
export interface WalkOut {
  x: number[];
  y: number[];
  times: number[];
  opacity: number[];
  opacityTimes: number[];
  duration: number;
}

/**
 * A worker's cross-floor migration walk (shuffle relayout): position keyframes
 * from its old desk to its new one, as offsets relative to the new seat (so the
 * final keyframe is (0,0) - dead on the new seat). No fade: the worker stays fully
 * visible the whole way. `null` when the cubicle didn't move (nothing to animate).
 */
export interface WalkMove {
  x: number[];
  y: number[];
  times: number[];
  duration: number;
}

/** Distance-proportional `times` (0..1) for a polyline, plus its total length. */
function cumulativeTimes(pts: Vec2[]): { times: number[]; total: number } {
  const cumulative = [0];
  for (let i = 1; i < pts.length; i++) {
    cumulative.push(
      cumulative[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y),
    );
  }
  const total = cumulative[cumulative.length - 1] || 1;
  return { times: cumulative.map((d) => d / total), total };
}

/**
 * The path a replaced worker takes when they leave: get up from the desk, step
 * out through the cubicle's open bottom into the aisle, then follow the hallway
 * grid to a random edge of the cubicle grid and fade out there - the same
 * perimeter the ambient hallway NPCs expire at, so departing workers stop at the
 * grid rather than overlapping the decorative structures around it. `bounds` is
 * the cubicle-grid extent (`worldBounds(layout, 0)`).
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

  // ...then follow the hallway grid off a random edge. Only edges that lie
  // outward from the aisle we stepped into are eligible, so the walk never
  // backtracks (e.g. a last-row worker has already crossed the bottom edge).
  const edges: Array<"left" | "right" | "top" | "bottom"> = ["left", "right"];
  if (bounds.minY < corridorY) edges.push("top");
  if (bounds.maxY > corridorY) edges.push("bottom");
  const edge = pick(rng, edges);
  if (edge === "left") {
    pts.push({ x: bounds.minX, y: corridorY });
  } else if (edge === "right") {
    pts.push({ x: bounds.maxX, y: corridorY });
  } else {
    // Hop along the aisle to a neighbouring vertical hallway, then follow it out.
    pts.push({ x: vertAisleX, y: corridorY });
    pts.push({ x: vertAisleX, y: edge === "top" ? bounds.minY : bounds.maxY });
  }

  // To cubicle-local space (the worker group is translated to `cubicle.position`),
  // with times proportional to distance so a linear ease yields an even walking
  // pace through every segment. Opacity is a separate track - full, then one
  // smooth fade at the end.
  const x = pts.map((p) => p.x - pos.x);
  const y = pts.map((p) => p.y - pos.y);
  const { times, total } = cumulativeTimes(pts);

  return {
    x,
    y,
    times,
    opacity: [1, 1, 0],
    opacityTimes: [0, FADE_START, 1],
    duration: clamp(total / WALK_PX_PER_S, WALKOUT_MIN_S, WALKOUT_MAX_S),
  };
}

/**
 * The path a worker walks when the office is reshuffled: from its old desk to its
 * new one, both in the same subreddit's cubicle but at different grid cells. The
 * worker steps out of the old cubicle's open bottom into the aisle, follows the
 * hallway grid (one horizontal aisle -> one vertical aisle -> one horizontal
 * aisle) to below the new cubicle, then steps up into the new seat. Every leg is
 * axis-aligned along an aisle center-line, so the walk never cuts across a
 * cubicle. Returned as offsets relative to the new seat (final keyframe (0,0)),
 * ready to drive an inner group nested at the new seat. `null` if the cubicle
 * didn't move.
 *
 * Deterministic per post id (a small per-worker lane offset within the aisles),
 * so the path is stable across the re-renders driven while the walk plays and
 * roster-mates don't all tread the exact same line.
 */
export function walkBetween(id: string, seat: Vec2, fromPos: Vec2, toPos: Vec2): WalkMove | null {
  if (fromPos.x === toPos.x && fromPos.y === toPos.y) return null;

  const rng = mulberry32(hashString(id) ^ 0x85ebca6b);
  // Per-worker lane within the aisle so roster-mates fan out instead of overlapping.
  // One offset each for the horizontal and vertical legs, applied to every leg of
  // that orientation so segments stay collinear (and a same-row hop still collapses).
  const laneY = range(rng, -GAP_Y * 0.22, GAP_Y * 0.22);
  const laneX = range(rng, -GAP_X * 0.22, GAP_X * 0.22);

  const oldRow = Math.round(fromPos.y / CELL_H);
  const newRow = Math.round(toPos.y / CELL_H);
  const oldCol = Math.round(fromPos.x / CELL_W);
  const newCol = Math.round(toPos.x / CELL_W);

  // Horizontal aisle just below each cubicle (its open-bottom doorway).
  const oldCorridorY = (oldRow + 1) * CELL_H - GAP_Y / 2 + laneY;
  const newCorridorY = (newRow + 1) * CELL_H - GAP_Y / 2 + laneY;
  // Vertical aisle to travel between the two corridors: the gap on the right of
  // the leftmost of the two columns (an interior hallway between them when the
  // columns differ; the adjacent side aisle when they're the same). Full-height,
  // so travelling it never crosses a cubicle.
  const vertAisleX = (Math.min(oldCol, newCol) + 1) * CELL_W - GAP_X / 2 + laneX;

  const oldSeat = { x: fromPos.x + seat.x, y: fromPos.y + seat.y };
  const newSeat = { x: toPos.x + seat.x, y: toPos.y + seat.y };

  // Old seat -> down into old corridor -> across to the vertical aisle -> along it
  // to the new corridor -> across to below the new seat -> up into the new seat.
  const raw: Vec2[] = [
    oldSeat,
    { x: oldSeat.x, y: oldCorridorY },
    { x: vertAisleX, y: oldCorridorY },
    { x: vertAisleX, y: newCorridorY },
    { x: newSeat.x, y: newCorridorY },
    newSeat,
  ];
  // Drop any zero-length leg (e.g. same row collapses the vertical hop) so `times`
  // stays strictly increasing, as framer requires.
  const pts = raw.filter((p, i) => i === 0 || p.x !== raw[i - 1].x || p.y !== raw[i - 1].y);
  if (pts.length < 2) return null;

  const { times, total } = cumulativeTimes(pts);
  return {
    x: pts.map((p) => p.x - newSeat.x),
    y: pts.map((p) => p.y - newSeat.y),
    times,
    duration: clamp(total / MIGRATE_PX_PER_S, MIGRATE_MIN_S, MIGRATE_MAX_S),
  };
}
