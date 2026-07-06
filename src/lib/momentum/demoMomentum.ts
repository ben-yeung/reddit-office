/**
 * Live-path Momentum advancement (pure).
 *
 * The demo/live office reads the curated subreddits' hot listings on a poll and
 * has no server-provided velocity, so it must derive Momentum itself the way the
 * mock simulation does: measure each post's rate of change across polls, normalize
 * it against the subreddit's rolling baseline, and smooth it. This is the single
 * pure step that {@link RedditDemoDataSource} threads per post; keeping it here
 * makes it unit-testable and shares the maths in {@link ./momentum}.
 */
import type { StatSample } from "@/lib/domain/types";
import { type Baseline, initBaseline, velocity, computeMomentum, updateBaseline } from "./momentum";

/** Floor for a lazily-seeded baseline so the first reading can't divide by ~0. */
const BASELINE_FLOOR = 1;

/** Weight of the newest raw reading when smoothing against the last Momentum. */
const SMOOTHING = 0.5;

export interface MomentumReading {
  /** The sample this reading is measured from (unchanged on a duplicate poll). */
  sample: StatSample;
  /** The post's Momentum after this poll. */
  momentum: number;
  /**
   * The subreddit baseline after this poll, threaded back by the caller. Stays
   * `null` until the first measured velocity seeds it, so seeding isn't defeated
   * by first-sight or duplicate polls that never produce a velocity.
   */
  baseline: Baseline | null;
}

/**
 * Advance one post's Momentum from a new stats sample.
 *
 * - **First sight** (`prev` is null): seed Momentum from `scorePrior` so the
 *   office is populated and varied on first paint; measured velocity washes the
 *   prior out over the next polls. The baseline is returned unchanged.
 * - **Stats changed**: measure velocity over the real elapsed time, normalize it
 *   against the (lazily seeded) baseline, update the baseline, and smooth against
 *   the previous reading.
 * - **Stats unchanged** (a duplicate read of the shared server cache): hold the
 *   reading and baseline steady instead of decaying Momentum to zero.
 *
 * `baseline` is per-subreddit and threaded by the caller across the sub's posts.
 * Pass `null` until it has been seeded; this function seeds it from the first
 * observed velocity so a typical post normalizes to ~1.0.
 */
export function advanceMomentum(
  prev: { sample: StatSample; momentum: number } | null,
  curr: StatSample,
  baseline: Baseline | null,
  scorePrior: number,
): MomentumReading {
  if (!prev) {
    // First sight: seed from the score prior and leave the baseline untouched (it
    // seeds only from a real velocity, below).
    return { sample: curr, momentum: scorePrior, baseline };
  }

  const changed = curr.score !== prev.sample.score || curr.comments !== prev.sample.comments;
  if (!changed) {
    // Duplicate read of the shared server cache: hold the reading and baseline.
    return { sample: prev.sample, momentum: prev.momentum, baseline };
  }

  const vel = velocity(prev.sample, curr);
  const base =
    baseline ??
    initBaseline(Math.max(vel.scoreVel, BASELINE_FLOOR), Math.max(vel.commentVel, BASELINE_FLOOR));
  const raw = computeMomentum(vel, base);
  const nextBaseline = updateBaseline(base, vel);
  const momentum = prev.momentum * (1 - SMOOTHING) + raw * SMOOTHING;

  return { sample: curr, momentum, baseline: nextBaseline };
}

/**
 * A first-paint Momentum prior derived from a post's current score, normalized
 * within its subreddit so every cubicle shows variety immediately and small and
 * large subs stay comparable. Real velocity replaces this within a few polls.
 */
export function scorePrior(score: number, maxScore: number): number {
  return 0.4 + 1.8 * (score / Math.max(1, maxScore));
}
