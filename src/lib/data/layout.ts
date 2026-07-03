import type {
  AmenityKind,
  AmenityPlacement,
  Cubicle,
  Layout,
  Subreddit,
  Vec2,
} from "@/lib/domain/types";
import { CUBICLE_W, CUBICLE_H, SEAT_COLS, SEAT_ROWS } from "@/lib/domain/constants";
import { mulberry32, type Rng } from "@/lib/util/rng";

/** Bump when the layout scheme changes so stale persisted layouts regenerate. */
export const LAYOUT_VERSION = 11;
export const GAP_X = 90;
export const GAP_Y = 90;
/** Grid cell pitch (a cubicle footprint plus its gap). */
export const CELL_W = CUBICLE_W + GAP_X;
export const CELL_H = CUBICLE_H + GAP_Y;
/** Cubicle inner padding (walls + a header strip for the subreddit name). */
const PAD_X = 26;
const PAD_TOP = 52;
const PAD_BOTTOM = 26;

interface AmenitySpec {
  kind: AmenityKind;
  w: number;
  h: number;
}

/** Uniform meeting-room footprint (used for every meeting room on the floor). */
const MEETING: AmenitySpec = { kind: "meeting", w: 228, h: 148 };

/**
 * The three social structures that line the top of the floor, left to right.
 * Different footprints; they hang off the top edge bottom-aligned.
 */
const TOP_STRUCTURES: AmenitySpec[] = [
  { kind: "lounge", w: 196, h: 128 },
  { kind: "pingpong", w: 152, h: 96 },
  { kind: "coffee", w: 200, h: 96 },
];

function shuffled<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Number of grid columns for `count` cubicles (a roughly-square grid). */
export function gridCols(count: number): number {
  return Math.ceil(Math.sqrt(count));
}

/** World-space x-center of each interior aisle (vertical hallway) between columns. */
function colGapCenters(cols: number): number[] {
  return Array.from({ length: Math.max(cols - 1, 0) }, (_, c) => c * CELL_W + CUBICLE_W + GAP_X / 2);
}

/** World-space y-center of each interior aisle (horizontal hallway) between rows. */
function rowGapCenters(rows: number): number[] {
  return Array.from({ length: Math.max(rows - 1, 0) }, (_, r) => r * CELL_H + CUBICLE_H + GAP_Y / 2);
}

/**
 * Generate a grid-aligned office floor: subreddit cubicles on a roughly-square
 * grid (4x3 for the default 12), wrapped by a fixed ring of amenities aligned to
 * the grid's hallways - a real floor plan rather than one clump. The top edge
 * carries the three social structures (lounge, ping-pong, coffee), each on a
 * vertical hallway; the other three sides are lined with meeting rooms (2 left,
 * 2 right, 3 along the bottom), on the hallways too. The seed still shuffles the
 * subreddit order (a preview of drag-to-reorder; ADR-0007). Persisted, so it
 * runs once per office unless reset.
 */
export function generateLayout(subreddits: Subreddit[], seed: number): Layout {
  const rng = mulberry32(seed);
  const order = shuffled(subreddits, rng);
  const cols = gridCols(order.length);
  const rows = Math.ceil(order.length / cols);

  const cubicles: Cubicle[] = order.map((sub, i) => ({
    subredditId: sub.id,
    position: { x: (i % cols) * CELL_W, y: Math.floor(i / cols) * CELL_H },
    size: { w: CUBICLE_W, h: CUBICLE_H },
  }));

  // Cubicle-grid footprint, used to anchor the amenity ring on each side.
  const gW = (cols - 1) * CELL_W + CUBICLE_W;
  const gH = (rows - 1) * CELL_H + CUBICLE_H;
  const M = GAP_X; // margin between the grid and the surrounding amenities

  const amenities: AmenityPlacement[] = [];
  const add = (spec: AmenitySpec, x: number, y: number) =>
    amenities.push({ kind: spec.kind, position: { x, y }, size: { w: spec.w, h: spec.h } });

  // Anchor the amenity ring to the grid's hallways (the aisles between cubicles):
  // top/bottom line up with the vertical hallways, left/right with the horizontal
  // ones. For the default 4x3 grid that's 3 vertical + 2 horizontal aisles.
  const cxAisle = colGapCenters(cols); // 4 columns -> 3 vertical hallways
  const cyAisle = rowGapCenters(rows); // 3 rows -> 2 horizontal hallways

  // Top: one structure centered on each vertical hallway, above the grid. All
  // three share a vertical center line (rather than a common bottom) so the
  // taller lounge sits level with the ping-pong table and coffee bar instead of
  // riding higher.
  const topMinH = Math.min(...TOP_STRUCTURES.map((s) => s.h));
  const topCenterY = -M - topMinH / 2;
  TOP_STRUCTURES.forEach((s, i) => {
    const cx = cxAisle[Math.min(i, cxAisle.length - 1)];
    add(s, cx - s.w / 2, topCenterY - s.h / 2);
  });
  // Bottom: one meeting room centered on each vertical hallway, below the grid.
  cxAisle.forEach((cx) => {
    add(MEETING, cx - MEETING.w / 2, gH + M);
  });
  // Left / right: one meeting room centered on each horizontal hallway.
  cyAisle.forEach((cy) => {
    add(MEETING, -M - MEETING.w, cy - MEETING.h / 2); // left
    add(MEETING, gW + M, cy - MEETING.h / 2); // right
  });

  return { version: LAYOUT_VERSION, seed, cubicles, amenities };
}

/** World-space center of a given seat slot inside a cubicle. */
export function seatPosition(cubicle: Cubicle, seatIndex: number): Vec2 {
  const col = seatIndex % SEAT_COLS;
  const row = Math.floor(seatIndex / SEAT_COLS) % SEAT_ROWS;
  const innerW = cubicle.size.w - PAD_X * 2;
  const innerH = cubicle.size.h - PAD_TOP - PAD_BOTTOM;
  const cellW = innerW / SEAT_COLS;
  const cellH = innerH / SEAT_ROWS;
  return {
    x: cubicle.position.x + PAD_X + col * cellW + cellW / 2,
    y: cubicle.position.y + PAD_TOP + row * cellH + cellH / 2,
  };
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/** Axis-aligned bounding box of the whole office (for camera fit-to-world). */
export function worldBounds(layout: Layout, margin = 120): Bounds {
  if (layout.cubicles.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of layout.cubicles) {
    minX = Math.min(minX, c.position.x);
    minY = Math.min(minY, c.position.y);
    maxX = Math.max(maxX, c.position.x + c.size.w);
    maxY = Math.max(maxY, c.position.y + c.size.h);
  }
  minX -= margin;
  minY -= margin;
  maxX += margin;
  maxY += margin;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
