import type { Layout, OfficePolicy } from "@/lib/domain/types";

/**
 * Client-side persistence of the office (ADR-0003): the generated Layout and the
 * Office Policy. Kept behind this tiny module so a future per-user store can swap
 * in without touching callers.
 *
 * The storage key is supplied by the caller so distinct offices don't clobber each
 * other: the demo office and each authenticated user's office persist under their
 * own key (see `officeStorageKey`). The `:v2` suffix on those keys marks the
 * subreddit-id scheme; a mismatched subreddit set is additionally self-healed by
 * `layoutMatchesSubreddits` at load time.
 */
export interface Persisted {
  layout: Layout;
  policy: OfficePolicy;
}

export function loadPersisted(key: string): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Persisted>;
    if (!data.layout || !data.policy) return null;
    return data as Persisted;
  } catch {
    return null;
  }
}

export function savePersisted(key: string, p: Persisted): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(p));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export function clearPersisted(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
