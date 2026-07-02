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

/**
 * Cookie lifetime. With duration=temporary (ADR-0008) the access token lives
 * ~1 hour and cannot be refreshed, so the cookie expires with it - after which
 * the user is cleanly back in demo mode and logs in again.
 */
const SESSION_MAX_AGE = 60 * 60; // 1 hour

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

/** Whether a session's token is currently usable (valid, or refreshable). */
export function isSessionLive(session: Session): boolean {
  return session.tokens.expiresAt > Date.now() || Boolean(session.tokens.refreshToken);
}

/**
 * Return a valid user access token. If the token is within 60s of expiry and a
 * refresh token exists (duration=permanent), it is refreshed and re-persisted;
 * with duration=temporary there is no refresh token, so an expired token yields
 * `null` (the user must log in again). Returns `null` when there is no session.
 */
export async function getValidUserToken(): Promise<string | null> {
  const session = await readSession();
  if (!session) return null;

  if (session.tokens.expiresAt - 60_000 > Date.now()) {
    return session.tokens.accessToken;
  }
  const creds = getCredentials();
  if (!creds || !session.tokens.refreshToken) return null;

  const refreshed = await refreshUserToken(creds, session.tokens.refreshToken);
  await writeSession({ ...session, tokens: refreshed });
  return refreshed.accessToken;
}
