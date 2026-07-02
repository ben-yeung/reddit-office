import { NextResponse, type NextRequest } from "next/server";
import { redditGet } from "@/lib/reddit/client";
import { getValidUserToken } from "@/lib/reddit/session";

export const dynamic = "force-dynamic";

/**
 * Authenticated Reddit proxy (ADR-0003): forwards a GET under `oauth.reddit.com`
 * using the logged-in user's token (transparently refreshed). The `read` scope
 * (ADR-0006) already confines this to read-only endpoints. Returns 401 when
 * there is no session.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const token = await getValidUserToken();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { path } = await ctx.params;
  const search = new URL(req.url).search;
  const target = `/${path.join("/")}${search}`;

  try {
    const data = await redditGet<unknown>(target, { token });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Reddit request failed" },
      { status: 502 },
    );
  }
}
