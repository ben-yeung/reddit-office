import { describe, it, expect } from "vitest";
import { selectRoster, assignSeats, type RosterCandidate, type RosterConfig } from "./roster";

const NOW = 10_000_000;
const HOUR = 3_600_000;

const CFG: RosterConfig = {
  maxSize: 6,
  newWindowMs: 3 * HOUR,
  minMomentum: 0.35,
  risingMomentum: 1.0,
  freshSeats: 4,
};

/** A candidate `ageMs` old (default: outside the New window). */
function c(id: string, momentum: number, ageMs = 6 * HOUR): RosterCandidate {
  return { id, momentum, createdAt: NOW - ageMs };
}

describe("selectRoster - new sourcing", () => {
  it("keeps only posts within the window, newest first", () => {
    const picked = selectRoster(
      [
        c("old", 9, 4 * HOUR), // outside the window
        c("older", 9, 5 * HOUR), // outside the window
        c("recent", 0.1, 10 * 60_000),
        c("mid", 0.1, 90 * 60_000),
      ],
      "new",
      CFG,
      NOW,
    );
    // Momentum is irrelevant to New; only recency inside the window matters.
    expect(picked.map((p) => p.id)).toEqual(["recent", "mid"]);
  });

  it("shows fewer when little is fresh, rather than backfilling old posts", () => {
    const picked = selectRoster([c("a", 9, 5 * HOUR), c("b", 8, 4 * HOUR)], "new", CFG, NOW);
    expect(picked).toHaveLength(0);
  });
});

describe("selectRoster - momentum sourcing", () => {
  it("takes the highest-momentum candidates up to maxSize, strictly", () => {
    const picked = selectRoster(
      [c("a", 5), c("b", 1), c("c", 9), c("d", 3), c("fresh", 0.2, 60_000)],
      "momentum",
      { ...CFG, maxSize: 3 },
      NOW,
    );
    // A brand-new post with low momentum earns no grace here - strictly momentum.
    expect(picked.map((p) => p.id)).toEqual(["c", "a", "d"]);
  });

  it("prunes candidates below minMomentum", () => {
    const picked = selectRoster([c("a", 5), c("b", 0.1), c("c", 0.2)], "momentum", CFG, NOW);
    expect(picked.map((p) => p.id)).toEqual(["a"]);
  });
});

describe("selectRoster - blended sourcing", () => {
  it("seats momentum leaders first, then new-and-surging posts", () => {
    const picked = selectRoster(
      [
        c("m1", 9), // old, high momentum -> leader
        c("m2", 8),
        c("m3", 7),
        c("f1", 2, 10 * 60_000), // fresh + rising
        c("f2", 1.5, 20 * 60_000),
        c("f3", 1.2, 30 * 60_000),
        c("f4", 1.1, 40 * 60_000),
        c("f5", 1.05, 50 * 60_000),
      ],
      "blend",
      CFG, // maxSize 6, freshSeats 4 -> 2 leaders + 4 fresh
      NOW,
    );
    expect(picked.map((p) => p.id)).toEqual(["m1", "m2", "f1", "f2", "f3", "f4"]);
  });

  it("backfills from momentum when few posts are fresh-and-surging", () => {
    const picked = selectRoster(
      [c("m1", 9), c("m2", 8), c("m3", 7), c("m4", 6), c("m5", 5), c("f1", 2, 10 * 60_000)],
      "blend",
      CFG,
      NOW,
    );
    // 2 leaders + 1 fresh, then backfilled to 6 from the momentum pool.
    expect(picked).toHaveLength(6);
    expect(picked.map((p) => p.id)).toEqual(expect.arrayContaining(["m3", "m4", "m5"]));
    expect(picked.slice(0, 3).map((p) => p.id)).toEqual(["m1", "m2", "f1"]);
  });

  it("excludes fresh posts that are not rising from the fresh half", () => {
    const picked = selectRoster(
      [c("m1", 9), c("m2", 8), c("calm", 0.5, 10 * 60_000)],
      "blend",
      CFG,
      NOW,
    );
    // "calm" is fresh but below risingMomentum, so it isn't a surging pick; it also
    // clears minMomentum, so it can still backfill after the leaders.
    expect(picked.map((p) => p.id)).toEqual(["m1", "m2", "calm"]);
  });
});

describe("assignSeats - rank-ordered with hysteresis", () => {
  const HYST = 2;

  it("seats newcomers by rank order", () => {
    const next = assignSeats(["a", "b", "c"], {}, 6, HYST);
    expect(next).toEqual({ a: 0, b: 1, c: 2 });
  });

  it("keeps seats stable on a small rank change (no twitch)", () => {
    // a and b swap rank, but each moves only one position - within hysteresis.
    const next = assignSeats(["b", "a", "c"], { a: 0, b: 1, c: 2 }, 6, HYST);
    expect(next).toEqual({ a: 0, b: 1, c: 2 });
  });

  it("walks a worker to a new seat on a large rank jump", () => {
    // e vaults from rank 4 to rank 0; it can't keep seat 4, so it takes a front seat.
    const next = assignSeats(["e", "a", "b", "c", "d"], { a: 0, b: 1, c: 2, d: 3, e: 4 }, 6, HYST);
    expect(next.e).toBeLessThan(4);
    // No two workers share a seat.
    expect(new Set(Object.values(next)).size).toBe(5);
  });

  it("reuses a freed seat when a worker leaves", () => {
    const next = assignSeats(["a", "c", "d"], { a: 0, b: 1, c: 2 }, 6, HYST); // b left
    expect(next.a).toBe(0);
    expect(next.c).toBe(2);
    expect(next.d).toBe(1); // the seat b vacated
  });

  it("never exceeds maxSeats and assigns each a distinct seat", () => {
    const next = assignSeats(["a", "b", "c"], {}, 2, HYST);
    const seats = Object.values(next);
    expect(seats.every((s) => s < 2)).toBe(true);
    expect(new Set(seats).size).toBe(seats.length);
  });
});
