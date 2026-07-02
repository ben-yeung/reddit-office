import type { Layout, OfficePolicy } from "@/lib/domain/types";

/**
 * Client-side persistence of the office (ADR-0003): the generated Layout and
 * the Office Policy. Kept behind this tiny module so a future per-user store
 * (iteration 2, multi-device) can swap in without touching callers.
 */
const KEY = "reddit-office:v1";

export interface Persisted {
  layout: Layout;
  policy: OfficePolicy;
}

export function loadPersisted(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Persisted>;
    if (!data.layout || !data.policy) return null;
    return data as Persisted;
  } catch {
    return null;
  }
}

export function savePersisted(p: Persisted): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export function clearPersisted(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
