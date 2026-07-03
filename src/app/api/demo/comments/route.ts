import { NextResponse, type NextRequest } from "next/server";
import { getDemoComments } from "@/lib/reddit/demo";
import type { DemoCommentsPayload } from "@/lib/reddit/dto";

// Run per request; freshness is governed by the shared Data Cache in demo.ts.
export const dynamic = "force-dynamic";

/** Demo-mode comments: a post's top-upvoted top-level comments (ADR-0009). */
export async function GET(req: NextRequest): Promise<NextResponse<DemoCommentsPayload>> {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { configured: false, comments: [], reason: "Missing post id." },
      { status: 400 },
    );
  }
  return NextResponse.json(await getDemoComments(id));
}
