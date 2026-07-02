"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import { OfficeApp } from "@/components/office/OfficeApp";
import { OnboardingPlaceholder } from "@/components/auth/OnboardingPlaceholder";

/**
 * Chooses the experience from auth state (ADR-0008): demo-first by default, and
 * a swap to Onboarding once authenticated. `loading` renders the demo office so
 * the first paint is never blank.
 */
export function AppRoot() {
  const { status } = useAuth();
  return status === "authenticated" ? <OnboardingPlaceholder /> : <OfficeApp />;
}
