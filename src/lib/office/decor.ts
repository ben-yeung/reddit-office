import type { Layout } from "@/lib/domain/types";
import { CELL_W, CELL_H, GAP_X, GAP_Y, gridCols, type Bounds } from "@/lib/data/layout";
import { CUBICLE_W, CUBICLE_H } from "@/lib/domain/constants";

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function tileRects(layout: Layout, pad = 0): Rect[] {
  const cub = layout.cubicles.map((c) => ({
    x0: c.position.x - pad,
    y0: c.position.y - pad,
    x1: c.position.x + c.size.w + pad,
    y1: c.position.y + c.size.h + pad,
  }));
  const am = layout.amenities.map((a) => ({
    x0: a.position.x - pad,
    y0: a.position.y - pad,
    x1: a.position.x + a.size.w + pad,
    y1: a.position.y + a.size.h + pad,
  }));
  return [...cub, ...am];
}

function tileBounds(layout: Layout): Bounds {
  const rects = tileRects(layout, 0);
  if (rects.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x0);
    minY = Math.min(minY, r.y0);
    maxX = Math.max(maxX, r.x1);
    maxY = Math.max(maxY, r.y1);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Full office extent (cubicles + amenities) for camera-fit and the floor. */
export function officeExtent(layout: Layout, margin = 150): Bounds {
  const b = tileBounds(layout);
  const minX = b.minX - margin;
  const minY = b.minY - margin;
  const maxX = b.maxX + margin;
  const maxY = b.maxY + margin;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export interface WalkerPath {
  seed: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  dur: number;
}

function cubicleBounds(layout: Layout): Bounds {
  const cs = layout.cubicles;
  if (cs.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of cs) {
    minX = Math.min(minX, c.position.x);
    minY = Math.min(minY, c.position.y);
    maxX = Math.max(maxX, c.position.x + c.size.w);
    maxY = Math.max(maxY, c.position.y + c.size.h);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Ambient staff commuting the cubicle aisles: a walker per interior column gap
 * (up/down the columns) and per interior row gap (across the rows).
 */
export function decorWalkers(layout: Layout): WalkerPath[] {
  const count = layout.cubicles.length;
  const cols = gridCols(count);
  const rows = Math.ceil(count / cols);
  const b = cubicleBounds(layout);
  const paths: WalkerPath[] = [];

  for (let c = 0; c < cols - 1; c++) {
    const x = c * CELL_W + CUBICLE_W + GAP_X / 2;
    const down = c % 2 === 0;
    paths.push({
      seed: `vw${c}`,
      x0: x,
      y0: down ? b.minY : b.maxY,
      x1: x,
      y1: down ? b.maxY : b.minY,
      dur: 15 + (c % 3) * 4,
    });
  }
  for (let r = 0; r < rows - 1; r++) {
    const y = r * CELL_H + CUBICLE_H + GAP_Y / 2;
    const right = r % 2 === 0;
    paths.push({
      seed: `hw${r}`,
      x0: right ? b.minX : b.maxX,
      y0: y,
      x1: right ? b.maxX : b.minX,
      y1: y,
      dur: 17 + (r % 3) * 4,
    });
  }
  return paths;
}
