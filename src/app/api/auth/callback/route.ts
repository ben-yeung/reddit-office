import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, getCredentials, getRedirectUri } from "@/lib/reddit/config";
import { exchangeCode } from "@/lib/reddit/tokens";
import { redditGet } from "@/lib/reddit/client";
import { meIconUrl, type RedditMe } from "@/lib/reddit/map";
import { sealSession, sessionCookieOptions } from "@/lib/reddit/session";
import { AUTH_MESSAGE_SOURCE } from "@/lib/reddit/dto";

type Mode = "popup" | "redirect";

/**
 * Reddit OAuth callback (ADR-0008). Verifies the CSRF `state`, exchanges the
 * code for tokens, loads the user's identity, and establishes the encrypted
 * session cookie. Hands control back per the mode captured at login:
 *   - popup: an HTML page that `postMessage`s the opener and closes.
 *   - redirect: a full-page redirect back to the office.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const origin = new URL(req.url).origin;
  const params = new URL(req.url).searchParams;

  const stateCookie = req.cookies.get(COOKIE.state)?.value ?? "";
  const sepIndex = stateCookie.indexOf(".");
  const mode: Mode = stateCookie.startsWith("redirect.") ? "redirect" : "popup";
  const expectedState = sepIndex >= 0 ? stateCookie.slice(sepIndex + 1) : "";

  const finish = (ok: boolean, reason?: string, sessionCookie?: string): NextResponse => {
    const res =
      mode === "redirect"
        ? NextResponse.redirect(`${origin}/?login=${ok ? "success" : "error"}`)
        : new NextResponse(popupHtml(origin, ok, reason), {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
    res.cookies.delete(COOKIE.state);
    if (ok && sessionCookie) {
      res.cookies.set(COOKIE.session, sessionCookie, sessionCookieOptions());
    }
    return res;
  };

  const error = params.get("error");
  const code = params.get("code");
  const returnedState = params.get("state");

  if (error) return finish(false, `Reddit denied the request: ${error}`);
  if (!code || !returnedState) return finish(false, "Missing authorization code.");
  if (!expectedState || returnedState !== expectedState) {
    return finish(false, "State mismatch - possible CSRF, please try again.");
  }

  const creds = getCredentials();
  if (!creds) return finish(false, "Reddit credentials are not configured.");

  try {
    const tokens = await exchangeCode(creds, code, getRedirectUri(origin));
    const me = await redditGet<RedditMe>("/api/v1/me", { token: tokens.accessToken });
    const sessionCookie = await sealSession({
      user: { name: me.name, iconUrl: meIconUrl(me) },
      tokens,
    });
    return finish(true, undefined, sessionCookie);
  } catch (err) {
    return finish(false, err instanceof Error ? err.message : "Login failed.");
  }
}

/** Minimal self-closing popup page that reports the result to the opener. */
function popupHtml(targetOrigin: string, ok: boolean, reason?: string): string {
  const message = JSON.stringify({
    source: AUTH_MESSAGE_SOURCE,
    ok,
    reason: reason ?? null,
  });
  const fallbackText = ok
    ? "Signed in. You can close this window."
    : `Sign-in failed. ${reason ?? ""} You can close this window.`;
  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Reddit Office</title></head>
  <body style="font:14px system-ui;background:#12131a;color:#e8e8ef;display:grid;place-items:center;height:100vh;margin:0">
    <p>${fallbackText}</p>
    <script>
      (function () {
        try {
          if (window.opener) {
            window.opener.postMessage(${message}, ${JSON.stringify(targetOrigin)});
          }
        } catch (e) {}
        window.close();
      })();
    </script>
  </body>
</html>`;
}
