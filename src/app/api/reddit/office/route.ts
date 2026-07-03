import { NextResponse, type NextRequest } from "next/server";
import { getValidUserToken } from "@/lib/reddit/session";
import { fetchOfficeForSubs } from "@/lib/reddit/office";
import { MAX_OFFICE_CUBICLES } from "@/lib/data/officeSelection";
import type { DemoOfficePayload } from "@/lib/reddit/dto";
import type { Subreddit } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/**
 * Max cubicles an authenticated office may hold. Tied to the tuned demo grid size
 * so the floor plan and amenity ring stay readable; the onboarding picker enforces
 * the same cap client-side.
 */
const MAX_SUBS = MAX_OFFICE_CUBICLES;
/**
 * Seconds each sub's hot listing is shared-cached. A public sub's hot listing is
 * identical for everyone, so authenticated offices still share it - the token only
 * gates access, it doesn't personalize the listing.
 */
const OFFICE_REVALIDATE = 30;

/** Reddit subreddit names: letters, digits, underscores; 21 chars max in practice. */
const SUB_NAME = /^[A-Za-z0-9_]{1,50}$/;
/** A default color for a sub that somehow arrives without one (defensive). */
const FALLBACK_COLOR = "#8a8f98";

interface OfficeRequest {
  subreddits?: unknown;
}

/**
 * Validate and normalize the client's requested subs. Names are interpolated into
 * Reddit URL paths, so anything not matching {@link SUB_NAME} is dropped outright.
 * Ids and colors come from the client (stable across sessions via persistence);
 * missing ones are backfilled so a malformed entry can't break the office.
 */
function sanitizeSubs(input: unknown): Subreddit[] {
  if (!Array.isArray(input)) return [];
  const out: Subreddit[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const key = name.toLowerCase();
    if (!SUB_NAME.test(name) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: typeof r.id === "string" && r.id ? r.id : `t5_${name}`,
      name,
      displayName: typeof r.displayName === "string" && r.displayName ? r.displayName : `r/${name}`,
      color: typeof r.color === "string" && r.color ? r.color : FALLBACK_COLOR,
    });
    if (out.length >= MAX_SUBS) break;
  }
  return out;
}

function fail(status: number, reason: string): NextResponse<DemoOfficePayload> {
  return NextResponse.json({ configured: false, subreddits: [], postsBySub: {}, reason }, { status });
}

/**
 * The authenticated office: the current hot posts for the subreddits the user
 * picked during onboarding, fetched with the user's token. Returns the same
 * `DemoOfficePayload` shape as `/api/demo/office`, so one client data source
 * drives both modes.
 */
export async function POST(req: NextRequest): Promise<NextResponse<DemoOfficePayload>> {
  const token = await getValidUserToken();
  if (!token) return fail(401, "unauthorized");

  let body: OfficeRequest;
  try {
    body = (await req.json()) as OfficeRequest;
  } catch {
    return fail(400, "Invalid request body.");
  }

  const subreddits = sanitizeSubs(body.subreddits);
  if (subreddits.length === 0) return fail(400, "No subreddits selected.");

  try {
    const payload = await fetchOfficeForSubs(subreddits, token, {
      postsRevalidate: OFFICE_REVALIDATE,
    });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      {
        configured: false,
        subreddits,
        postsBySub: {},
        reason: err instanceof Error ? err.message : "Failed to load your office.",
      },
      { status: 502 },
    );
  }
}
