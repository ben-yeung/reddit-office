import type { OfficePolicy } from "./types";

/** Max workers visible per cubicle (Roster size). Provisional per ADR-0004. */
export const ROSTER_MAX = 6;

/** New posts are protected from pruning for this long so they can prove traction. */
export const GRACE_MS = 20_000;

/** Below this normalized Momentum a worker is eligible for pruning (unless in grace). */
export const MIN_MOMENTUM = 0.35;

/** Momentum above this (relative to the sub's baseline) reads as a surge. */
export const SURGE_MOMENTUM = 2.2;

/** Simulation tick cadence for the mock data source (ms). */
export const TICK_MS = 1500;

/** World-space cubicle footprint. */
export const CUBICLE_W = 320;
export const CUBICLE_H = 240;

/** Seat grid inside a cubicle. */
export const SEAT_COLS = 3;
export const SEAT_ROWS = 2;

export const DEFAULT_POLICY: OfficePolicy = {
  sourcing: "blend",
  events: {
    "new-post": true,
    trending: true,
    surge: true,
    removed: true,
  },
  theme: "dark",
  ambient: true,
  pauseOnModal: false,
  renderer: "2d",
};
