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
import { type Baseline, type Velocity, initBaseline, velocity, computeMomentum } from "./momentum";

/** Floor for a lazily-seeded baseline so the first reading can't divide by ~0. */
const BASELINE_FLOOR = 1;

/** Weight of the newest raw reading when smoothing against the last Momentum. */
const SMOOTHING = 0.5;

/** EMA weight for the per-poll robust baseline update. */
const BASELINE_ALPHA = 0.1;

export interface MomentumReading {
  /** The sample this reading is measured from (unchanged on a duplicate poll). */
  sample: StatSample;
  /** The post's Momentum after this poll. */
  momentum: number;
  /**
   * The velocity measured this poll, or `null` on a first-sight or duplicate poll
   * that produced none. The caller collects these across a sub's posts and folds
   * their *median* into the sub baseline (see {@link updateBaselineRobust}) - a
   * robust central tendency that a few viral outliers can't inflate.
   */
  velocity: Velocity | null;
}

/**
 * Advance one post's Momentum from a new stats sample.
 *
 * - **First sight** (`prev` is null): seed Momentum from `scorePrior` so the
 *   office is populated and varied on first paint; measured velocity washes the
 *   prior out over the next polls. No velocity is reported.
 * - **Stats changed**: measure velocity over the real elapsed time, normalize it
 *   against the baseline, smooth against the previous reading, and report the
 *   velocity so the caller can fold it into a robust baseline.
 * - **Stats unchanged** (a duplicate read of the shared server cache): hold the
 *   reading steady instead of decaying Momentum to zero; report no velocity.
 *
 * `baseline` is per-subreddit and read-only here: every post in a poll is judged
 * against the *same* start-of-poll baseline (so ordering can't skew results), and
 * the caller advances the baseline once per poll from the median velocity. Until
 * the baseline seeds, a post falls back to normalizing against its own velocity so
 * a typical mover still reads ~1.0.
 */
export function advanceMomentum(
  prev: { sample: StatSample; momentum: number } | null,
  curr: StatSample,
  baseline: Baseline | null,
  scorePrior: number,
): MomentumReading {
  if (!prev) {
    // First sight: seed from the score prior; no measured velocity yet.
    return { sample: curr, momentum: scorePrior, velocity: null };
  }

  const changed = curr.score !== prev.sample.score || curr.comments !== prev.sample.comments;
  if (!changed) {
    // Duplicate read of the shared server cache: hold the reading, no velocity.
    return { sample: prev.sample, momentum: prev.momentum, velocity: null };
  }

  const vel = velocity(prev.sample, curr);
  const base =
    baseline ??
    initBaseline(Math.max(vel.scoreVel, BASELINE_FLOOR), Math.max(vel.commentVel, BASELINE_FLOOR));
  const raw = computeMomentum(vel, base);
  const momentum = prev.momentum * (1 - SMOOTHING) + raw * SMOOTHING;

  return { sample: curr, momentum, velocity: vel };
}

/** Median of a numeric list (0 for empty). Robust to heavy-tailed outliers. */
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Advance a subreddit's rolling baseline from a poll's worth of velocities, using
 * their **median** rather than their mean.
 *
 * Real hot listings are heavy-tailed - a few viral posts move orders of magnitude
 * faster than the rest. A mean baseline is dragged up by those outliers, so the
 * *typical* post normalizes far below 1.0 and falls under the Momentum floor,
 * emptying the cubicle. The median tracks the pace of a normal post, so a normal
 * post reads ~1.0 and only genuinely fast posts surge. Only non-negative rates
 * feed the baseline (decay/removal shouldn't drag "normal pace" toward zero).
 *
 * Returns the baseline unchanged when the poll produced no velocities (all
 * first-sight or duplicate reads), and seeds a null baseline from the first
 * median it sees.
 */
export function updateBaselineRobust(
  baseline: Baseline | null,
  velocities: Velocity[],
  alpha = BASELINE_ALPHA,
): Baseline | null {
  if (velocities.length === 0) return baseline;
  const s = median(velocities.map((v) => Math.max(v.scoreVel, 0)));
  const c = median(velocities.map((v) => Math.max(v.commentVel, 0)));
  if (!baseline) {
    return initBaseline(Math.max(s, BASELINE_FLOOR), Math.max(c, BASELINE_FLOOR));
  }
  return {
    scoreVel: baseline.scoreVel * (1 - alpha) + s * alpha,
    commentVel: baseline.commentVel * (1 - alpha) + c * alpha,
  };
}

/**
 * A first-paint Momentum prior derived from a post's current score, normalized
 * within its subreddit so every cubicle shows variety immediately and small and
 * large subs stay comparable. Real velocity replaces this within a few polls.
 */
export function scorePrior(score: number, maxScore: number): number {
  return 0.4 + 1.8 * (score / Math.max(1, maxScore));
}
