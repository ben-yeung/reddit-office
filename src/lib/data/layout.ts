import type { Cubicle, Layout, Subreddit, Vec2 } from "@/lib/domain/types";
import {
  CUBICLE_W,
  CUBICLE_H,
  SEAT_COLS,
  SEAT_ROWS,
} from "@/lib/domain/constants";
import { mulberry32, type Rng } from "@/lib/util/rng";

/** Bump when the layout scheme changes so stale persisted layouts regenerate. */
export const LAYOUT_VERSION = 2;
const GAP_X = 90;
const GAP_Y = 90;
/** Cubicle inner padding (walls + a header strip for the subreddit name). */
const PAD_X = 26;
const PAD_TOP = 52;
const PAD_BOTTOM = 26;

function shuffled<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Generate a clean, grid-aligned office floor. The seed shuffles which subreddit
 * lands in which grid cell (a preview of the planned drag-to-reorder; ADR-0007),
 * while positions stay snapped to the grid. Persisted, so it runs once per office
 * unless reset.
 */
export function generateLayout(subreddits: Subreddit[], seed: number): Layout {
  const order = shuffled(subreddits, mulberry32(seed));
  const cols = Math.ceil(Math.sqrt(order.length));

  const cubicles: Cubicle[] = order.map((sub, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      subredditId: sub.id,
      position: { x: col * (CUBICLE_W + GAP_X), y: row * (CUBICLE_H + GAP_Y) },
      size: { w: CUBICLE_W, h: CUBICLE_H },
    };
  });

  return { version: LAYOUT_VERSION, seed, cubicles };
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
