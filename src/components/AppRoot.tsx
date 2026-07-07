"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import { OfficeApp } from "@/components/office/OfficeApp";
import { BackgroundMotionProvider } from "@/components/office/overlays/BackgroundMotion";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { CURATED_SUBREDDITS } from "@/lib/data/curatedSubreddits";
import { officeStorageKey } from "@/lib/data/officeSelection";
import type { DemoOfficePayload } from "@/lib/reddit/dto";

/** The demo office reads the shared-cached curated endpoint (ADR-0009). Module-level
    so its identity is stable across renders (the office pipeline keys on it). */
function fetchDemoOffice(): Promise<DemoOfficePayload> {
  return fetch("/api/demo/office", { cache: "no-store" }).then(
    (res) => res.json() as Promise<DemoOfficePayload>,
  );
}

/**
 * Chooses the experience from auth state (ADR-0008): demo-first by default, and a
 * swap to the authenticated onboarding flow (subreddit picker -> your office) once
 * signed in. `loading` renders the demo office so the first paint is never blank.
 *
 * The BackgroundMotionProvider wraps the demo office so a modal can freeze it behind
 * its blurred backdrop - both the sprite motion and the data pipeline that feeds it -
 * keeping the modal's own animation smooth without GPU compositing. (The
 * authenticated office wraps itself in OnboardingFlow.)
 */
export function AppRoot() {
  const { status } = useAuth();
  if (status === "authenticated") return <OnboardingFlow />;
  return (
    <BackgroundMotionProvider>
      <OfficeApp
        subreddits={CURATED_SUBREDDITS}
        fetchPayload={fetchDemoOffice}
        storageKey={officeStorageKey("demo")}
        brandSub="demo · top subreddits"
      />
    </BackgroundMotionProvider>
  );
}
