import type { Layout } from "@/lib/domain/types";
import { worldBounds, type Bounds } from "@/lib/data/layout";

/**
 * The shared "commons" is a decorative amenity area (glass meeting room,
 * ping-pong, lounge, coffee bar, greenery + ambient staff) placed in the negative
 * space below the cubicle grid, so it never overlaps subreddit content.
 */
export const COMMONS_W = 760;
export const COMMONS_H = 300;
const COMMONS_GAP = 90;

/** Top-left of the commons: centered under the cubicle grid. */
export function commonsOrigin(layout: Layout): { x: number; y: number } {
  const grid = worldBounds(layout, 0);
  return {
    x: grid.minX + (grid.width - COMMONS_W) / 2,
    y: grid.maxY + COMMONS_GAP,
  };
}

/** Full office extent (cubicle grid + commons) for camera-fit and the floor. */
export function officeExtent(layout: Layout, margin = 150): Bounds {
  const grid = worldBounds(layout, 0);
  const o = commonsOrigin(layout);
  const minX = Math.min(grid.minX, o.x) - margin;
  const minY = Math.min(grid.minY, o.y) - margin;
  const maxX = Math.max(grid.maxX, o.x + COMMONS_W) + margin;
  const maxY = Math.max(grid.maxY, o.y + COMMONS_H) + margin;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
