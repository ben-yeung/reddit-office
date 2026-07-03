"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import { OfficeApp } from "@/components/office/OfficeApp";
import { BackgroundMotionProvider } from "@/components/office/BackgroundMotion";
import { OnboardingPlaceholder } from "@/components/auth/OnboardingPlaceholder";

/**
 * Chooses the experience from auth state (ADR-0008): demo-first by default, and
 * a swap to Onboarding once authenticated. `loading` renders the demo office so
 * the first paint is never blank.
 *
 * The BackgroundMotionProvider wraps the office so a modal can freeze the office
 * behind its blurred backdrop - both the sprite motion and the data pipeline that
 * feeds it - which keeps the modal's own animation smooth without GPU compositing.
 */
export function AppRoot() {
  const { status } = useAuth();
  if (status === "authenticated") return <OnboardingPlaceholder />;
  return (
    <BackgroundMotionProvider>
      <OfficeApp />
    </BackgroundMotionProvider>
  );
}
