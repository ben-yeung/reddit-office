/**
 * Encrypted session cookie management (ADR-0008).
 *
 * The Reddit tokens live only inside an httpOnly, Secure, SameSite=Lax,
 * encrypted cookie - never in the browser's JS-reachable storage. The client
 * only ever calls our proxy, which reads the cookie server-side.
 */
import { cookies } from "next/headers";
import { COOKIE, getCredentials } from "./config";
import { seal, unseal } from "./crypto";
import { refreshUserToken, type UserTokens } from "./tokens";

/** Minimal identity we surface to the UI (from the `identity` scope). */
export interface SessionUser {
  name: string;
  iconUrl: string | null;
}

export interface Session {
  user: SessionUser;
  tokens: UserTokens;
}

/** Cookie lifetime. Long-lived: the refresh token keeps the session usable. */
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

/** Seal a session into the cookie value (for setting on a response directly). */
export async function sealSession(session: Session): Promise<string> {
  return seal(session);
}

/** Read and decrypt the current session, or `null` if absent/invalid. */
export async function readSession(): Promise<Session | null> {
  const raw = (await cookies()).get(COOKIE.session)?.value;
  return unseal<Session>(raw);
}

/** Encrypt and set the session cookie (login / token refresh). */
export async function writeSession(session: Session): Promise<void> {
  const value = await seal(session);
  (await cookies()).set(COOKIE.session, value, sessionCookieOptions());
}

/** Clear the session cookie (logout). */
export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE.session);
}

/**
 * Return a valid user access token, transparently refreshing (and re-persisting
 * the session cookie) when the current token is within 60s of expiry. Returns
 * `null` when there is no session. Throws only if a refresh actively fails.
 */
export async function getValidUserToken(): Promise<string | null> {
  const session = await readSession();
  if (!session) return null;

  if (session.tokens.expiresAt - 60_000 > Date.now()) {
    return session.tokens.accessToken;
  }
  const creds = getCredentials();
  if (!creds) return null;

  const refreshed = await refreshUserToken(creds, session.tokens.refreshToken);
  await writeSession({ ...session, tokens: refreshed });
  return refreshed.accessToken;
}
