import { NextResponse } from "next/server";
import { isAuthConfigured } from "@/lib/reddit/config";
import { readSession, isSessionLive } from "@/lib/reddit/session";
import type { AuthMePayload } from "@/lib/reddit/dto";

/**
 * Current auth state for the client (ADR-0008). Drives demo-vs-authenticated
 * mode and whether the "Log in with Reddit" affordance is enabled. Reports a
 * user only while their token is still live, so an expired temporary session
 * (no refresh token) cleanly reads as demo mode.
 */
export async function GET(): Promise<NextResponse<AuthMePayload>> {
  const session = await readSession();
  return NextResponse.json({
    authConfigured: isAuthConfigured(),
    user: session && isSessionLive(session) ? session.user : null,
  });
}
