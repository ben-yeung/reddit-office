/**
 * The onboarding selection: which subreddits become cubicles in a user's office,
 * plus the client-side pieces that support it - the cubicle cap (tied to the tuned
 * demo grid), a deterministic accent palette, and per-user persistence of the pick.
 *
 * Client-safe: no server-only imports. The office route imports only the cap.
 */
import type { Subreddit } from "@/lib/domain/types";
import type { SubscribedSubredditDTO } from "@/lib/reddit/dto";
import { CURATED_SUBREDDITS } from "./curatedSubreddits";

/**
 * Max cubicles an office can hold. Derived from the curated demo office so the
 * picker cap and the grid the layout is tuned for never drift apart: the floor
 * plan is a roughly-square grid wrapped by a fixed amenity ring, tuned for this
 * many cubicles.
 */
export const MAX_OFFICE_CUBICLES = CURATED_SUBREDDITS.length;

/**
 * Accent palette tuned to stay legible against the dark office floor. A subreddit
 * is assigned a color deterministically by name, so it keeps the same accent
 * across sessions and re-picks (rather than Reddit's often-muddy key_color).
 */
const PALETTE = [
  "#5aa9e6",
  "#a06bff",
  "#4ac26b",
  "#ff6f61",
  "#ff9ec4",
  "#42c8c0",
  "#e0b23c",
  "#ef6ea8",
  "#7c86ff",
  "#ff8a3c",
  "#8da0ff",
  "#69c9d0",
  "#ffb14a",
  "#f5d442",
  "#5fd08a",
  "#c08457",
];

/** FNV-1a string hash - small, fast, and stable across runs. */
function hashName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic, legible accent color for a subreddit name. */
export function colorForSubreddit(name: string): string {
  return PALETTE[hashName(name.toLowerCase()) % PALETTE.length];
}

/** Promote a picked subscription to an office Subreddit (assigns the accent color). */
export function toSubreddit(sub: SubscribedSubredditDTO): Subreddit {
  return {
    id: sub.id,
    name: sub.name,
    displayName: sub.displayName,
    color: colorForSubreddit(sub.name),
    iconUrl: sub.iconUrl,
  };
}

function isSubreddit(v: unknown): v is Subreddit {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.name === "string" &&
    typeof s.displayName === "string" &&
    typeof s.color === "string"
  );
}

const SELECTION_KEY_PREFIX = "reddit-office:subs:";

/** localStorage key for one user's saved office selection. */
function selectionKey(username: string): string {
  return `${SELECTION_KEY_PREFIX}${username.toLowerCase()}`;
}

/** localStorage key namespacing the office layout/policy for a given identity. */
export function officeStorageKey(identity: string): string {
  return `reddit-office:${identity}:v2`;
}

/** The user's saved office selection, or null if they haven't picked yet. */
export function loadSelection(username: string): Subreddit[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(selectionKey(username));
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return null;
    const subs = data.filter(isSubreddit).slice(0, MAX_OFFICE_CUBICLES);
    return subs.length > 0 ? subs : null;
  } catch {
    return null;
  }
}

/** Persist the user's office selection. */
export function saveSelection(username: string, subs: Subreddit[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      selectionKey(username),
      JSON.stringify(subs.slice(0, MAX_OFFICE_CUBICLES)),
    );
  } catch {
    // ignore quota / privacy-mode errors
  }
}

/** Forget the user's office selection (sends them back to the picker). */
export function clearSelection(username: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(selectionKey(username));
  } catch {
    // ignore
  }
}
