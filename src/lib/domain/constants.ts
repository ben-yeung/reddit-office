import type { OfficePolicy } from "./types";

/** Max workers visible per cubicle (Roster size). Provisional per ADR-0004. */
export const ROSTER_MAX = 6;

/**
 * A post counts as "New" (for the New sourcing rule) while it is younger than
 * this. The mock also uses it to stagger seeded posts into the past.
 */
export const NEW_WINDOW_MS = 12 * 60 * 60_000; // 12 hours

/** Below this normalized Momentum a worker is eligible for pruning. */
export const MIN_MOMENTUM = 0.35;

/**
 * Momentum above this reads as "rising" - moving faster than the subreddit's
 * average pace. Used to pick the fresh-and-surging half of the Blended roster.
 */
export const RISING_MOMENTUM = 1.0;

/** Of a Blended roster's seats, how many are reserved for new-and-surging posts. */
export const BLEND_FRESH = 4;

/**
 * Seat reassignment hysteresis: a seated worker only walks to a new desk when its
 * rank has moved at least this many positions from its current seat, so minor
 * momentum wiggles between polls don't cause constant tiny shuffles.
 */
export const SEAT_HYSTERESIS = 2;

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
