import { NextResponse } from "next/server";
import { isAuthConfigured } from "@/lib/reddit/config";
import { readSession } from "@/lib/reddit/session";
import type { AuthMePayload } from "@/lib/reddit/dto";

/**
 * Current auth state for the client (ADR-0008). Drives demo-vs-authenticated
 * mode and whether the "Log in with Reddit" affordance is enabled.
 */
export async function GET(): Promise<NextResponse<AuthMePayload>> {
  const session = await readSession();
  return NextResponse.json({
    authConfigured: isAuthConfigured(),
    user: session?.user ?? null,
  });
}
