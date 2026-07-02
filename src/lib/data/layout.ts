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
export const LAYOUT_VERSION = 4;
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

/** Amenities distributed around the cubicle grid (multiple meeting rooms). */
const AMENITIES: AmenitySpec[] = [
  { kind: "meeting", w: 240, h: 152 },
  { kind: "meeting", w: 216, h: 140 },
  { kind: "meeting", w: 228, h: 148 },
  { kind: "pingpong", w: 152, h: 96 },
  { kind: "lounge", w: 196, h: 128 },
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

/**
 * Generate a grid-aligned office floor: subreddit cubicles on a square grid
 * (3x3 for the default 9), with amenities distributed around the perimeter on
 * each side - a real floor plan rather than one clump. The seed shuffles both the
 * subreddit order and which amenity sits on which side (a preview of
 * drag-to-reorder; ADR-0007). Persisted, so it runs once per office unless reset.
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

  // Cubicle-grid footprint, used to anchor amenities on each side.
  const gW = (cols - 1) * CELL_W + CUBICLE_W;
  const gH = (rows - 1) * CELL_H + CUBICLE_H;
  const cx = gW / 2;
  const cy = gH / 2;
  const M = GAP_X; // perimeter margin between grid and amenities

  // perimeter anchors: four sides + four corners, so amenities spread out.
  // ax/ay: -1 = before the grid, 0 = centered on it, 1 = after it.
  const anchors: Array<{ ax: number; ay: number }> = [
    { ax: 1, ay: 0 }, // right
    { ax: 0, ay: 1 }, // bottom
    { ax: -1, ay: 0 }, // left
    { ax: 0, ay: -1 }, // top
    { ax: 1, ay: -1 }, // top-right
    { ax: 1, ay: 1 }, // bottom-right
    { ax: -1, ay: 1 }, // bottom-left
    { ax: -1, ay: -1 }, // top-left
  ];
  const place = (a: AmenitySpec, an: { ax: number; ay: number }): Vec2 => ({
    x: an.ax === 1 ? gW + M : an.ax === -1 ? -M - a.w : cx - a.w / 2,
    y: an.ay === 1 ? gH + M : an.ay === -1 ? -M - a.h : cy - a.h / 2,
  });
  const placed = shuffled(anchors, rng);
  const amenities: AmenityPlacement[] = shuffled(AMENITIES, rng).map((spec, i) => ({
    kind: spec.kind,
    position: place(spec, placed[i % placed.length]),
    size: { w: spec.w, h: spec.h },
  }));

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
