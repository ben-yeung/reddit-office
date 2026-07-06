/**
 * Roster selection + seat assignment (pure).
 *
 * Given the candidate posts for a subreddit, decide which ones occupy the
 * cubicle's bounded Roster under the Office Policy sourcing rule, then place them
 * in seats. Each sourcing rule is self-contained (ADR-0005, revised):
 *
 * - "new":      only posts created within `newWindowMs`, newest first.
 * - "momentum": strictly by measured Momentum (desc), floored at `minMomentum`.
 * - "blend":    a few top-Momentum leaders + the rest new-and-surging, deduped
 *               and backfilled from Momentum so the cubicle stays full.
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
 * Blended: momentum leaders take the front seats, new-and-surging posts fill the
 * fresh half (newest first), and any leftover seats are backfilled from the
 * momentum pool so a lively sub still shows a full cubicle.
 */
function blendRoster<T extends RosterCandidate>(candidates: T[], cfg: RosterConfig, now: number): T[] {
  const momentumPool = candidates.filter((c) => c.momentum >= cfg.minMomentum).sort(byMomentum);
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
  for (const c of momentumPool) {
    if (leaders >= momentumSeats) break;
    if (take(c)) leaders++;
  }

  let fresh = 0;
  for (const c of freshPool) {
    if (fresh >= cfg.freshSeats) break;
    if (take(c)) fresh++;
  }

  // Backfill any seats the fresh half couldn't fill, so the cubicle stays full
  // when enough candidates exist.
  for (const c of momentumPool) {
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
      return candidates
        .filter((c) => isFresh(c, now, cfg.newWindowMs))
        .sort(byNewest)
        .slice(0, cfg.maxSize);
    case "momentum":
      return candidates
        .filter((c) => c.momentum >= cfg.minMomentum)
        .sort(byMomentum)
        .slice(0, cfg.maxSize);
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
    if (old !== undefined && old < maxSeats && !used.has(old) && Math.abs(rank - old) < hysteresis) {
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
