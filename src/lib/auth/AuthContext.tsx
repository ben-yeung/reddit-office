"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AUTH_MESSAGE_SOURCE, type AuthMePayload, type AuthMessage } from "@/lib/reddit/dto";

type Status = "loading" | "demo" | "authenticated";

export interface AuthState {
  status: Status;
  user: AuthMePayload["user"];
  /** Whether login is even possible (server has credentials + session secret). */
  authConfigured: boolean;
  /** Non-null after a failed login attempt, for a subtle inline message. */
  error: string | null;
  /** Begin login: popup + postMessage, with a redirect fallback. */
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const POPUP_FEATURES = "width=520,height=720,menubar=no,toolbar=no,location=yes";

/** Prefer the redirect flow on small/touch devices where popups behave poorly. */
function prefersRedirect(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 640px)").matches || "ontouchstart" in window;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthMePayload["user"]>(null);
  const [authConfigured, setAuthConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = (await res.json()) as AuthMePayload;
      setAuthConfigured(data.authConfigured);
      setUser(data.user);
      setStatus(data.user ? "authenticated" : "demo");
    } catch {
      setStatus("demo");
    }
  }, []);

  // Initial auth state + handle the redirect-flow return (?login=success|error).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const login = params.get("login");
    if (login) {
      // One-time hydration of error state from the redirect-return URL.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (login === "error") setError("Reddit sign-in did not complete.");
      params.delete("login");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash,
      );
    }
    void refresh();
  }, [refresh]);

  const login = useCallback(() => {
    if (!authConfigured) return;
    setError(null);

    if (prefersRedirect()) {
      window.location.href = "/api/auth/login?mode=redirect";
      return;
    }

    const popup = window.open("/api/auth/login?mode=popup", "reddit-oauth", POPUP_FEATURES);
    if (!popup) {
      // Popup blocked - fall back to a full-page redirect.
      window.location.href = "/api/auth/login?mode=redirect";
      return;
    }
    popupRef.current = popup;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as AuthMessage | undefined;
      if (!data || data.source !== AUTH_MESSAGE_SOURCE) return;
      window.removeEventListener("message", onMessage);
      popupRef.current = null;
      if (data.ok) {
        void refresh();
      } else {
        setError(data.reason || "Reddit sign-in failed.");
      }
    };
    window.addEventListener("message", onMessage);
  }, [authConfigured, refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setStatus("demo");
  }, []);

  const value = useMemo<AuthState>(
    () => ({ status, user, authConfigured, error, login, logout }),
    [status, user, authConfigured, error, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
