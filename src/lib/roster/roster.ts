/**
 * Roster selection + seat assignment (pure).
 *
 * Given the candidate posts for a subreddit, decide which ones occupy the
 * cubicle's bounded Roster, honoring the Office Policy sourcing rule and a
 * new-post grace period (ADR-0005). Seat assignment keeps existing workers
 * put so the office doesn't reshuffle every tick.
 */
import type { SourcingRule } from "@/lib/domain/types";

export interface RosterCandidate {
  id: string;
  createdAt: number;
  momentum: number;
}

export interface RosterConfig {
  maxSize: number;
  graceMs: number;
  minMomentum: number;
}

function inGrace(c: RosterCandidate, now: number, graceMs: number): boolean {
  return now - c.createdAt < graceMs;
}

function byNewest(a: RosterCandidate, b: RosterCandidate): number {
  return b.createdAt - a.createdAt;
}

function byMomentum(a: RosterCandidate, b: RosterCandidate): number {
  return b.momentum - a.momentum;
}

/** Blend: reserve alternating slots between momentum and recency, deduped. */
function blendRank<T extends RosterCandidate>(items: T[]): T[] {
  const byMom = [...items].sort(byMomentum);
  const byNew = [...items].sort(byNewest);
  const out: T[] = [];
  const seen = new Set<string>();
  let i = 0;
  let j = 0;
  let takeMomentum = true;
  while (out.length < items.length) {
    if (takeMomentum) {
      while (i < byMom.length && seen.has(byMom[i].id)) i++;
      if (i < byMom.length) {
        out.push(byMom[i]);
        seen.add(byMom[i].id);
        i++;
      }
    } else {
      while (j < byNew.length && seen.has(byNew[j].id)) j++;
      if (j < byNew.length) {
        out.push(byNew[j]);
        seen.add(byNew[j].id);
        j++;
      }
    }
    takeMomentum = !takeMomentum;
    if (i >= byMom.length && j >= byNew.length) break;
  }
  return out;
}

function rankBySourcing<T extends RosterCandidate>(items: T[], sourcing: SourcingRule): T[] {
  switch (sourcing) {
    case "new":
      return [...items].sort(byNewest);
    case "momentum":
      return [...items].sort(byMomentum);
    case "blend":
      return blendRank(items);
  }
}

/**
 * Choose up to `maxSize` workers. Posts within the grace window are guaranteed
 * a slot (newest first) so fresh posts can prove traction; the rest are filled
 * by the sourcing rule from candidates that clear `minMomentum`.
 * Returns the selected candidates in display order.
 */
export function selectRoster<T extends RosterCandidate>(
  candidates: T[],
  sourcing: SourcingRule,
  cfg: RosterConfig,
  now: number,
): T[] {
  const grace = candidates
    .filter((c) => inGrace(c, now, cfg.graceMs))
    .sort(byNewest)
    .slice(0, cfg.maxSize);

  const graceIds = new Set(grace.map((c) => c.id));
  const remaining = cfg.maxSize - grace.length;

  const eligibleRest = candidates.filter(
    (c) => !graceIds.has(c.id) && c.momentum >= cfg.minMomentum,
  );
  const rest = rankBySourcing(eligibleRest, sourcing).slice(0, remaining);

  return [...grace, ...rest];
}

/**
 * Assign each selected worker id a stable seat index in [0, maxSeats).
 * Workers already seated keep their seat; newcomers take the lowest free seat.
 */
export function assignSeats(
  ids: string[],
  prev: Record<string, number>,
  maxSeats: number,
): Record<string, number> {
  const next: Record<string, number> = {};
  const used = new Set<number>();

  for (const id of ids) {
    const seat = prev[id];
    if (seat !== undefined && seat < maxSeats && !used.has(seat)) {
      next[id] = seat;
      used.add(seat);
    }
  }

  let free = 0;
  for (const id of ids) {
    if (next[id] !== undefined) continue;
    while (used.has(free)) free++;
    if (free >= maxSeats) break;
    next[id] = free;
    used.add(free);
    free++;
  }

  return next;
}
