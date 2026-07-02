import { describe, it, expect } from "vitest";
import { selectRoster, assignSeats, type RosterCandidate, type RosterConfig } from "./roster";

const CFG: RosterConfig = { maxSize: 3, graceMs: 20_000, minMomentum: 0.35 };
const NOW = 1_000_000;
const OLD = NOW - 60_000; // outside the grace window

function c(id: string, momentum: number, createdAt = OLD): RosterCandidate {
  return { id, momentum, createdAt };
}

describe("selectRoster - momentum sourcing", () => {
  it("takes the highest-momentum candidates up to maxSize", () => {
    const picked = selectRoster(
      [c("a", 5), c("b", 1), c("c", 9), c("d", 3), c("e", 0.2)],
      "momentum",
      CFG,
      NOW,
    );
    expect(picked.map((p) => p.id)).toEqual(["c", "a", "d"]);
  });

  it("prunes candidates below minMomentum", () => {
    const picked = selectRoster([c("a", 5), c("b", 0.1), c("c", 0.2)], "momentum", CFG, NOW);
    expect(picked.map((p) => p.id)).toEqual(["a"]);
  });
});

describe("selectRoster - new sourcing", () => {
  it("takes the newest candidates", () => {
    const picked = selectRoster(
      [
        c("old", 9, NOW - 50_000),
        c("mid", 9, NOW - 40_000),
        c("recent", 0.5, NOW - 30_000),
      ],
      "new",
      CFG,
      NOW,
    );
    expect(picked.map((p) => p.id)).toEqual(["recent", "mid", "old"]);
  });
});

describe("selectRoster - grace period", () => {
  it("guarantees a slot to brand-new posts even with low momentum", () => {
    const picked = selectRoster(
      [c("hot1", 9), c("hot2", 8), c("hot3", 7), c("fresh", 0.01, NOW - 1_000)],
      "momentum",
      CFG,
      NOW,
    );
    // fresh is in grace -> guaranteed; only 2 remaining slots for the hot ones.
    expect(picked.map((p) => p.id)).toContain("fresh");
    expect(picked).toHaveLength(3);
    expect(picked.map((p) => p.id)).toEqual(expect.arrayContaining(["fresh", "hot1", "hot2"]));
    expect(picked.map((p) => p.id)).not.toContain("hot3");
  });
});

describe("selectRoster - blend sourcing", () => {
  it("mixes high-momentum and newest candidates", () => {
    const picked = selectRoster(
      [
        c("momKing", 100, OLD),
        c("momMid", 50, OLD),
        c("newest", 0.4, NOW - 25_000),
        c("newish", 0.4, NOW - 26_000),
      ],
      "blend",
      { ...CFG, maxSize: 2 },
      NOW,
    );
    // one from momentum, one from recency
    expect(picked.map((p) => p.id)).toEqual(expect.arrayContaining(["momKing", "newest"]));
  });
});

describe("assignSeats", () => {
  it("keeps existing workers in their seats and seats newcomers in free slots", () => {
    const prev = { a: 0, b: 2 };
    const next = assignSeats(["a", "b", "c"], prev, 6);
    expect(next.a).toBe(0);
    expect(next.b).toBe(2);
    expect(next.c).toBe(1); // lowest free seat
  });

  it("reuses a freed seat when a worker leaves", () => {
    const prev = { a: 0, b: 1, c: 2 };
    const next = assignSeats(["a", "c", "d"], prev, 6); // b left, freeing seat 1
    expect(next.a).toBe(0);
    expect(next.c).toBe(2);
    expect(next.d).toBe(1);
  });

  it("never exceeds maxSeats", () => {
    const next = assignSeats(["a", "b", "c"], {}, 2);
    const seats = Object.values(next);
    expect(seats.every((s) => s < 2)).toBe(true);
  });
});
