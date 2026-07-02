import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, getCredentials, getRedirectUri, isAuthConfigured } from "@/lib/reddit/config";
import { buildAuthorizeUrl } from "@/lib/reddit/tokens";
import { randomToken } from "@/lib/reddit/crypto";

/**
 * Start the Reddit OAuth flow (ADR-0008). Generates a CSRF `state`, stores it
 * (with the return mode) in a short-lived cookie, and redirects to Reddit's
 * consent page. `?mode=popup` (default) vs `?mode=redirect` tells the callback
 * how to hand control back.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const origin = new URL(req.url).origin;

  if (!isAuthConfigured()) {
    return NextResponse.redirect(`${origin}/?auth=unconfigured`);
  }

  const creds = getCredentials()!;
  const mode = new URL(req.url).searchParams.get("mode") === "redirect" ? "redirect" : "popup";
  const state = randomToken();
  const authorizeUrl = buildAuthorizeUrl({
    clientId: creds.clientId,
    state,
    redirectUri: getRedirectUri(origin),
  });

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(COOKIE.state, `${mode}.${state}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes to complete consent
  });
  return res;
}
