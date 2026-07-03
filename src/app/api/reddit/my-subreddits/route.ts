import { NextResponse } from "next/server";
import { redditGet } from "@/lib/reddit/client";
import { getValidUserToken } from "@/lib/reddit/session";
import { mapSubscribedSubreddits } from "@/lib/reddit/map";
import type { MySubredditsPayload, SubscribedSubredditDTO } from "@/lib/reddit/dto";

export const dynamic = "force-dynamic";

/** Page size Reddit allows for listing endpoints. */
const PAGE_LIMIT = 100;
/** Cap total pages so a user with thousands of subs can't stall onboarding. */
const MAX_PAGES = 5;

interface ListingCursor {
  data?: { after?: string | null };
}

/**
 * The logged-in user's subscribed subreddits (onboarding picker source). Walks
 * Reddit's cursor-paginated `/subreddits/mine/subscriber` up to {@link MAX_PAGES}
 * pages, maps each page server-side (the client never sees raw Reddit JSON), and
 * returns them ordered most-subscribed first. Returns an unconfigured payload
 * (never a hard error) when there is no session, so the client falls back to demo.
 */
export async function GET(): Promise<NextResponse<MySubredditsPayload>> {
  const token = await getValidUserToken();
  if (!token) {
    return NextResponse.json({ configured: false, subreddits: [], reason: "unauthorized" });
  }

  try {
    const all: SubscribedSubredditDTO[] = [];
    const seen = new Set<string>();
    let after: string | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      const q: string = `?limit=${PAGE_LIMIT}${after ? `&after=${encodeURIComponent(after)}` : ""}`;
      const json: unknown = await redditGet<unknown>(`/subreddits/mine/subscriber${q}`, {
        token,
        // Personal and quick to change (subscribe/unsubscribe); always fresh.
        revalidate: undefined,
      });
      for (const sub of mapSubscribedSubreddits(json)) {
        if (seen.has(sub.id)) continue;
        seen.add(sub.id);
        all.push(sub);
      }
      after = (json as ListingCursor).data?.after ?? null;
      if (!after) break;
    }

    all.sort((a, b) => b.subscribers - a.subscribers);
    return NextResponse.json({ configured: true, subreddits: all });
  } catch (err) {
    return NextResponse.json({
      configured: false,
      subreddits: [],
      reason: err instanceof Error ? err.message : "Failed to load your subreddits.",
    });
  }
}
