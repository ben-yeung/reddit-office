/**
 * Momentum: a weighted composite of a post's rates of change, normalized
 * per-subreddit so small and large subreddits are comparable (ADR-0005).
 *
 * These are pure functions - the brain of the app - shared by the mock
 * simulation now and the real Reddit data layer later.
 */
import type { StatSample } from "@/lib/domain/types";
import { SURGE_MOMENTUM } from "@/lib/domain/constants";

const EPS = 1e-6;

/** A subreddit's rolling "normal" pace, in units per minute. */
export interface Baseline {
  scoreVel: number;
  commentVel: number;
}

export interface Velocity {
  scoreVel: number;
  commentVel: number;
}

export interface MomentumWeights {
  score: number;
  comments: number;
}

export const DEFAULT_WEIGHTS: MomentumWeights = { score: 0.7, comments: 0.3 };

/** A sensible starting baseline before any history exists. */
export function initBaseline(scoreVel = 1, commentVel = 1): Baseline {
  return { scoreVel, commentVel };
}

/** Rate of change between two samples, expressed per minute. */
export function velocity(prev: StatSample, curr: StatSample): Velocity {
  const dtMin = Math.max((curr.t - prev.t) / 60_000, EPS);
  return {
    scoreVel: (curr.score - prev.score) / dtMin,
    commentVel: (curr.comments - prev.comments) / dtMin,
  };
}

/**
 * Per-subreddit-normalized momentum. A post moving at its subreddit's average
 * pace scores ~1.0 regardless of whether that sub is tiny or huge; faster posts
 * score higher. Negative velocities (a decaying/removed post) pull it below 0.
 */
export function computeMomentum(
  vel: Velocity,
  baseline: Baseline,
  weights: MomentumWeights = DEFAULT_WEIGHTS,
): number {
  const scoreTerm = vel.scoreVel / (baseline.scoreVel + EPS);
  const commentTerm = vel.commentVel / (baseline.commentVel + EPS);
  return weights.score * scoreTerm + weights.comments * commentTerm;
}

/**
 * Exponential-moving-average update of a subreddit's baseline from an observed
 * velocity. Only non-negative rates feed the baseline so removals/decay don't
 * drag the "normal pace" toward zero.
 */
export function updateBaseline(baseline: Baseline, vel: Velocity, alpha = 0.1): Baseline {
  const s = Math.max(vel.scoreVel, 0);
  const c = Math.max(vel.commentVel, 0);
  return {
    scoreVel: baseline.scoreVel * (1 - alpha) + s * alpha,
    commentVel: baseline.commentVel * (1 - alpha) + c * alpha,
  };
}

/** Whether a momentum reading is high enough to read as an upvote surge. */
export function isSurge(momentum: number, threshold = SURGE_MOMENTUM): boolean {
  return momentum >= threshold;
}
