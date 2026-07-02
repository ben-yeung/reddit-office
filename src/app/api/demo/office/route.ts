import { NextResponse } from "next/server";
import { getDemoOffice } from "@/lib/reddit/demo";
import type { DemoOfficePayload } from "@/lib/reddit/dto";

// Run per request; freshness is governed by the shared Data Cache in demo.ts
// (revalidates ~every 45s), not by prerendering this route.
export const dynamic = "force-dynamic";

/** Demo-mode office data: curated subreddits' hot posts, shared-cached (ADR-0009). */
export async function GET(): Promise<NextResponse<DemoOfficePayload>> {
  return NextResponse.json(await getDemoOffice());
}
