import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_OFFICE_CUBICLES,
  clearSelection,
  colorForSubreddit,
  loadSelection,
  officeStorageKey,
  saveSelection,
  toSubreddit,
} from "./officeSelection";
import { CURATED_SUBREDDITS } from "./curatedSubreddits";
import type { Subreddit } from "@/lib/domain/types";
import type { SubscribedSubredditDTO } from "@/lib/reddit/dto";

/**
 * A minimal localStorage backed by a Map. Stubbed onto `globalThis.window` so the
 * persistence helpers run in the default `node` environment - jsdom pulls in a CSS
 * color parser with an ESM/CJS interop bug we don't want in the suite.
 */
class FakeLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const win = globalThis as unknown as { window?: { localStorage: FakeLocalStorage } };
beforeAll(() => {
  win.window = { localStorage: new FakeLocalStorage() };
});
afterAll(() => {
  delete win.window;
});

function makeSubs(n: number): Subreddit[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t5_${i}`,
    name: `sub${i}`,
    displayName: `r/sub${i}`,
    color: "#ffffff",
  }));
}

describe("MAX_OFFICE_CUBICLES", () => {
  it("tracks the tuned demo grid size so the cap and the grid never drift", () => {
    expect(MAX_OFFICE_CUBICLES).toBe(CURATED_SUBREDDITS.length);
  });
});

describe("colorForSubreddit", () => {
  it("is deterministic and case-insensitive", () => {
    expect(colorForSubreddit("Programming")).toBe(colorForSubreddit("programming"));
  });

  it("returns a hex color from the palette", () => {
    expect(colorForSubreddit("aww")).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("toSubreddit", () => {
  it("assigns the deterministic accent color and carries the icon", () => {
    const dto: SubscribedSubredditDTO = {
      id: "t5_2fwo",
      name: "programming",
      displayName: "r/programming",
      iconUrl: "https://example.com/icon.png",
      subscribers: 100,
      over18: false,
    };
    expect(toSubreddit(dto)).toEqual({
      id: "t5_2fwo",
      name: "programming",
      displayName: "r/programming",
      color: colorForSubreddit("programming"),
      iconUrl: "https://example.com/icon.png",
    });
  });
});

describe("selection persistence", () => {
  beforeEach(() => win.window?.localStorage.clear());

  it("round-trips a saved selection", () => {
    const subs = makeSubs(3);
    saveSelection("Alice", subs);
    expect(loadSelection("Alice")).toEqual(subs);
  });

  it("keys per user, case-insensitively", () => {
    saveSelection("Alice", makeSubs(2));
    expect(loadSelection("alice")).toHaveLength(2);
    expect(loadSelection("bob")).toBeNull();
  });

  it("caps a saved selection at the cubicle limit", () => {
    saveSelection("Alice", makeSubs(MAX_OFFICE_CUBICLES + 5));
    expect(loadSelection("Alice")).toHaveLength(MAX_OFFICE_CUBICLES);
  });

  it("returns null when nothing is saved", () => {
    expect(loadSelection("Nobody")).toBeNull();
  });

  it("returns null for a corrupt entry rather than throwing", () => {
    win.window?.localStorage.setItem("reddit-office:subs:alice", "not json");
    expect(loadSelection("Alice")).toBeNull();
  });

  it("clears a saved selection", () => {
    saveSelection("Alice", makeSubs(2));
    clearSelection("Alice");
    expect(loadSelection("Alice")).toBeNull();
  });
});

describe("officeStorageKey", () => {
  it("namespaces distinct offices", () => {
    expect(officeStorageKey("demo")).not.toBe(officeStorageKey("user:alice"));
    expect(officeStorageKey("demo")).toMatch(/^reddit-office:demo:/);
  });
});
