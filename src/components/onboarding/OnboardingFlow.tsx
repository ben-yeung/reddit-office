"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { OfficeApp } from "@/components/office/OfficeApp";
import { BackgroundMotionProvider } from "@/components/office/BackgroundMotion";
import { SubredditPicker } from "./SubredditPicker";
import { loadSelection, saveSelection, officeStorageKey } from "@/lib/data/officeSelection";
import type { Subreddit } from "@/lib/domain/types";
import type { DemoOfficePayload } from "@/lib/reddit/dto";

/**
 * The authenticated experience (ADR-0008): pick the subreddits that become your
 * office, then live in it. On return visits the saved pick skips the picker and
 * drops you straight into your office; the Office Policy panel's "Reselect
 * subreddits" button (wired here via `onEditSubreddits`) reopens the picker.
 *
 * The office is keyed by the selection signature so a re-pick cleanly remounts
 * the office pipeline on the new subreddit set.
 */
export function OnboardingFlow() {
  const { user, logout } = useAuth();
  const username = user?.name ?? "";

  // Resolve the saved pick once (per user). null => first run, show the picker.
  const [selection, setSelection] = useState<Subreddit[] | null>(() =>
    username ? loadSelection(username) : null,
  );
  // Explicitly reopened the picker from within the office (a re-pick).
  const [repicking, setRepicking] = useState(false);

  const handleConfirm = useCallback(
    (subs: Subreddit[]) => {
      saveSelection(username, subs);
      setSelection(subs);
      setRepicking(false);
    },
    [username],
  );

  // POST the current selection to the authenticated office endpoint. Stable per
  // selection; the office remounts (keyed below) when the selection changes.
  const fetchPayload = useCallback((): Promise<DemoOfficePayload> => {
    return fetch("/api/reddit/office", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subreddits: selection ?? [] }),
      cache: "no-store",
    }).then((res) => res.json() as Promise<DemoOfficePayload>);
  }, [selection]);

  if (repicking || !selection) {
    return (
      <SubredditPicker
        username={username}
        initial={selection ?? []}
        onConfirm={handleConfirm}
        onCancel={selection ? () => setRepicking(false) : undefined}
        onLogout={() => void logout()}
      />
    );
  }

  const officeKey = selection.map((s) => s.id).join(",");
  return (
    <BackgroundMotionProvider>
      <OfficeApp
        key={officeKey}
        subreddits={selection}
        fetchPayload={fetchPayload}
        storageKey={officeStorageKey(`user:${username.toLowerCase()}`)}
        brandSub="your office"
        onEditSubreddits={() => setRepicking(true)}
      />
    </BackgroundMotionProvider>
  );
}
