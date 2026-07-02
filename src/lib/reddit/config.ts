/**
 * Central Reddit/OAuth configuration and environment access (server-only).
 *
 * ADR-0003: the client secret and all token exchange stay server-side.
 * ADR-0006: minimal read-only scopes.
 * ADR-0008/0009: one "web app" credential serves both the user
 * `authorization_code` flow and the app-only `client_credentials` demo flow.
 *
 * Server-only: imported exclusively by API route handlers. Do not import from
 * client components (it reads `process.env` secrets).
 */

/** Read-only scopes (ADR-0006). Space-delimited per the OAuth spec. */
export const SCOPES = ["identity", "mysubreddits", "read"] as const;
export const SCOPE_STRING = SCOPES.join(" ");

/** Reddit OAuth + API endpoints. */
export const REDDIT = {
  authorize: "https://www.reddit.com/api/v1/authorize",
  accessToken: "https://www.reddit.com/api/v1/access_token",
  api: "https://oauth.reddit.com",
} as const;

/** Cookie names. */
export const COOKIE = {
  /** Encrypted session holding the user's Reddit tokens (ADR-0008). */
  session: "ro_session",
  /** Short-lived CSRF `state` for an in-flight authorize attempt. */
  state: "ro_oauth_state",
} as const;

export interface RedditCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * Reddit app credentials, or `null` when unconfigured. Unconfigured is a
 * first-class state: demo mode falls back to mock data and login is disabled,
 * so the app runs locally with zero secrets (ADR-0009 graceful degradation).
 */
export function getCredentials(): RedditCredentials | null {
  const clientId = process.env.REDDIT_CLIENT_ID?.trim();
  const clientSecret = process.env.REDDIT_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Whether user login is possible: needs credentials AND a session secret. */
export function isAuthConfigured(): boolean {
  return getCredentials() !== null && Boolean(process.env.SESSION_SECRET?.trim());
}

/**
 * Descriptive User-Agent. Reddit throttles/blocks generic or missing agents,
 * so this is set on every server request (ADR-0009).
 */
export function getUserAgent(): string {
  return process.env.REDDIT_USER_AGENT?.trim() || "web:reddit-office:v0.1 (by /u/reddit-office)";
}

/**
 * The OAuth redirect URI. Prefers an explicit env value (production), otherwise
 * derives it from the incoming request origin so it tracks whatever host/port
 * the dev or preview server runs on. Must exactly match a URI registered on the
 * Reddit app.
 */
export function getRedirectUri(requestOrigin: string): string {
  const explicit = process.env.REDDIT_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  return `${requestOrigin}/api/auth/callback`;
}

/** HTTP Basic auth header value for the confidential client (ADR-0003). */
export function basicAuthHeader({ clientId, clientSecret }: RedditCredentials): string {
  const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  return `Basic ${encoded}`;
}
