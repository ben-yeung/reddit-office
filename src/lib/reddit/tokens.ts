/**
 * Reddit OAuth token operations (ADR-0008/0009). All token exchange is
 * server-side and uses HTTP Basic auth with the confidential client secret.
 */
import {
  REDDIT,
  SCOPE_STRING,
  basicAuthHeader,
  getCredentials,
  getUserAgent,
  type RedditCredentials,
} from "./config";

/** Reddit's token endpoint response (the fields we use). */
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
}

export interface UserTokens {
  accessToken: string;
  refreshToken: string;
  /** ms epoch when `accessToken` expires. */
  expiresAt: number;
  scope: string;
}

/** Build the reddit.com authorize URL for the user consent step. */
export function buildAuthorizeUrl(params: {
  clientId: string;
  state: string;
  redirectUri: string;
}): string {
  const url = new URL(REDDIT.authorize);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", params.state);
  url.searchParams.set("redirect_uri", params.redirectUri);
  // `permanent` yields a refresh token so a long-open tab can silently refresh.
  url.searchParams.set("duration", "permanent");
  url.searchParams.set("scope", SCOPE_STRING);
  return url.toString();
}

async function postToken(
  creds: RedditCredentials,
  body: Record<string, string>,
): Promise<TokenResponse> {
  const res = await fetch(REDDIT.accessToken, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(creds),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": getUserAgent(),
    },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Reddit token request failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Exchange an authorization code for user tokens (login callback). */
export async function exchangeCode(
  creds: RedditCredentials,
  code: string,
  redirectUri: string,
): Promise<UserTokens> {
  const data = await postToken(creds, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  if (!data.refresh_token) {
    throw new Error("Reddit did not return a refresh token (expected duration=permanent)");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}

/** Refresh an expired/expiring user access token. */
export async function refreshUserToken(
  creds: RedditCredentials,
  refreshToken: string,
): Promise<UserTokens> {
  const data = await postToken(creds, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return {
    accessToken: data.access_token,
    // Reddit does not rotate the refresh token on refresh; keep the original.
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}

/**
 * The app-only token for demo mode (`client_credentials`, ADR-0009). Cached in
 * module scope until shortly before expiry. On serverless this cache is
 * per-instance, which is fine: the demo *office* is itself cached (see demo.ts),
 * so app-token fetches happen at most about once per cache-revalidation window.
 */
let appToken: { value: string; expiresAt: number } | null = null;

export async function getAppToken(): Promise<string> {
  const creds = getCredentials();
  if (!creds) throw new Error("Reddit credentials are not configured");

  // 60s safety margin so a token near expiry is refreshed before use.
  if (appToken && appToken.expiresAt - 60_000 > Date.now()) {
    return appToken.value;
  }
  const data = await postToken(creds, { grant_type: "client_credentials" });
  appToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return appToken.value;
}
