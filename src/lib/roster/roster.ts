/**
 * Roster selection + seat assignment (pure).
 *
 * Given the candidate posts for a subreddit, decide which ones occupy the
 * cubicle's bounded Roster under the Office Policy sourcing rule, then place them
 * in seats. Each sourcing rule is self-contained (ADR-0005, revised):
 *
 * - "new":      the newest posts, newest first (in-window first, then backfilled).
 * - "momentum": the highest-Momentum posts (desc), up to `maxSize`.
 * - "blend":    a few top-Momentum leaders + the rest new-and-surging, deduped
 *               and backfilled from Momentum so the cubicle stays full.
 *
 * Momentum is a per-subreddit-*relative* score (ADR-0005), so its absolute scale
 * shifts with a sub's activity. `minMomentum` therefore only decides which posts
 * are strong enough to be called Momentum *leaders*; it never leaves a physical
 * seat empty. A cubicle always surfaces its most-alive posts up to `maxSize`
 * whenever candidates exist - pruning "makes room" (a lower post is replaced),
 * it does not empty the office. This keeps busy subs full instead of collapsing
 * as a few viral posts inflate the baseline and sink every typical post below the
 * floor.
 *
 * Seats encode ranking (seat 0 = top of the returned order). A returning worker
 * keeps its seat while its rank stays close to it (hysteresis), so the office
 * only reshuffles - and workers only walk - on meaningful rank changes.
 */
import type { SourcingRule } from "@/lib/domain/types";

export interface RosterCandidate {
  id: string;
  createdAt: number;
  momentum: number;
}

export interface RosterConfig {
  /** Max workers a cubicle can seat. */
  maxSize: number;
  /** A post counts as "New" while younger than this (ms). */
  newWindowMs: number;
  /** Momentum floor for the Momentum rule and Blended's momentum leaders. */
  minMomentum: number;
  /** Momentum at/above which a fresh post counts as "surging" for Blended. */
  risingMomentum: number;
  /** How many Blended seats are reserved for new-and-surging posts. */
  freshSeats: number;
}

function byNewest(a: RosterCandidate, b: RosterCandidate): number {
  return b.createdAt - a.createdAt;
}

function byMomentum(a: RosterCandidate, b: RosterCandidate): number {
  return b.momentum - a.momentum;
}

function isFresh(c: RosterCandidate, now: number, windowMs: number): boolean {
  return now - c.createdAt <= windowMs;
}

/**
 * Blended: momentum leaders (those clearing `minMomentum`) take the front seats,
 * new-and-surging posts fill the fresh half (newest first), and any leftover seats
 * are backfilled from the best remaining live posts - regardless of the floor - so
 * the cubicle always stays full when candidates exist.
 */
function blendRoster<T extends RosterCandidate>(
  candidates: T[],
  cfg: RosterConfig,
  now: number,
): T[] {
  const ranked = candidates.slice().sort(byMomentum);
  const leaderPool = ranked.filter((c) => c.momentum >= cfg.minMomentum);
  const freshPool = candidates
    .filter((c) => isFresh(c, now, cfg.newWindowMs) && c.momentum >= cfg.risingMomentum)
    .sort(byNewest);

  const momentumSeats = Math.max(0, cfg.maxSize - cfg.freshSeats);
  const picked: T[] = [];
  const seen = new Set<string>();
  const take = (c: T): boolean => {
    if (seen.has(c.id) || picked.length >= cfg.maxSize) return false;
    seen.add(c.id);
    picked.push(c);
    return true;
  };

  let leaders = 0;
  for (const c of leaderPool) {
    if (leaders >= momentumSeats) break;
    if (take(c)) leaders++;
  }

  let fresh = 0;
  for (const c of freshPool) {
    if (fresh >= cfg.freshSeats) break;
    if (take(c)) fresh++;
  }

  // Backfill remaining seats from *all* live candidates (best Momentum first), not
  // just the above-floor leaders, so the cubicle stays full whenever posts exist -
  // an eviction is always a replacement, never a net-empty seat (ADR-0005).
  for (const c of ranked) {
    if (picked.length >= cfg.maxSize) break;
    take(c);
  }

  return picked;
}

/**
 * Choose up to `maxSize` workers for a cubicle under the sourcing rule, returned
 * in rank order (best first) so seat assignment can encode ranking.
 */
export function selectRoster<T extends RosterCandidate>(
  candidates: T[],
  sourcing: SourcingRule,
  cfg: RosterConfig,
  now: number,
): T[] {
  switch (sourcing) {
    case "new":
      // The newest posts, best-first, filled to maxSize. The New window still
      // marks what counts as genuinely "fresh" (Blended's fresh-and-surging pool,
      // new-post events), but it no longer gates occupancy here: sorting by recency
      // puts in-window posts first and then backfills with the next-newest, so a
      // sub whose posts have aged past the window keeps a full cubicle instead of
      // draining over a session. Only a sub with fewer than maxSize live posts
      // shows fewer.
      return candidates.slice().sort(byNewest).slice(0, cfg.maxSize);
    case "momentum":
      // The most-alive posts, best first. No absolute floor: a quiet sub still
      // shows its liveliest posts rather than emptying (ADR-0005 - "niche
      // favorites never look permanently dead"). Ordering already puts the
      // strongest first, so any pruning of weak posts happens only when there are
      // more than `maxSize` candidates.
      return candidates.slice().sort(byMomentum).slice(0, cfg.maxSize);
    case "blend":
      return blendRoster(candidates, cfg, now);
  }
}

/** The free seat closest to `target`, preferring lower indices on a tie. */
function nearestFreeSeat(used: Set<number>, target: number, maxSeats: number): number {
  for (let d = 1; d < maxSeats; d++) {
    const lo = target - d;
    if (lo >= 0 && !used.has(lo)) return lo;
    const hi = target + d;
    if (hi < maxSeats && !used.has(hi)) return hi;
  }
  for (let s = 0; s < maxSeats; s++) if (!used.has(s)) return s;
  return 0;
}

/**
 * Assign each ranked worker a seat in [0, maxSeats). Seats encode ranking: the
 * worker at rank r targets seat r, so the cubicle reads best-first.
 *
 * Processed in rank order (best first) in a single pass so a big riser claims a
 * front seat before lower ranks can hold theirs. Each worker keeps its current
 * seat when that seat is still free and within `hysteresis` positions of its new
 * rank - so a small reorder (or a pure adjacent swap) doesn't send anyone walking;
 * otherwise it takes the free seat nearest its rank and walks there. `rankedIds`
 * must be in rank order.
 */
export function assignSeats(
  rankedIds: string[],
  prev: Record<string, number>,
  maxSeats: number,
  hysteresis = 1,
): Record<string, number> {
  const ranked = rankedIds.slice(0, maxSeats);
  const next: Record<string, number> = {};
  const used = new Set<number>();

  ranked.forEach((id, rank) => {
    const old = prev[id];
    // Keep the current seat when it's still free and close to the new rank.
    if (
      old !== undefined &&
      old < maxSeats &&
      !used.has(old) &&
      Math.abs(rank - old) < hysteresis
    ) {
      next[id] = old;
      used.add(old);
      return;
    }
    // Otherwise take the free seat nearest this rank (its own seat when free).
    const seat = used.has(rank) ? nearestFreeSeat(used, rank, maxSeats) : rank;
    next[id] = seat;
    used.add(seat);
  });

  return next;
}
