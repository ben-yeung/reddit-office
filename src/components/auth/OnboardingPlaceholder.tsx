"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthContext";
import styles from "./auth.module.css";

interface SubListing {
  data?: { children?: unknown[] };
}

/**
 * The landing spot after login (ADR-0004, ADR-0008): the demo office is swapped
 * for the authenticated experience, which begins with Onboarding. This is the
 * auth-swap point - the full sub-picker UI is the next iteration. Fetching the
 * user's real subscriptions here proves the whole OAuth -> session -> proxy
 * chain end to end.
 */
export function OnboardingPlaceholder() {
  const { user, logout } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["mysubreddits"],
    queryFn: async () => {
      const res = await fetch("/api/reddit/subreddits/mine/subscriber?limit=100", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`proxy ${res.status}`);
      return (await res.json()) as SubListing;
    },
  });

  const count = data?.data?.children?.length ?? 0;

  return (
    <div className={styles.onboard}>
      <div className={styles.onboardCard}>
        <p className={`pixel-font ${styles.onboardTitle}`}>
          WELCOME{user ? `, u/${user.name}` : ""}
        </p>
        <p className={styles.onboardText}>
          {isLoading && "Reading your subscriptions from Reddit…"}
          {isError && "Signed in, but your subscriptions could not be loaded just now."}
          {!isLoading && !isError && (
            <>
              You subscribe to <span className={styles.onboardStat}>{count}</span>
              {count === 100 ? "+" : ""} subreddits. Next, you&apos;ll pick which ones become
              cubicles in your office.
            </>
          )}
        </p>
        <p className={styles.onboardText} style={{ fontSize: "0.8rem", opacity: 0.8 }}>
          The subreddit picker is coming in the next iteration.
        </p>
        <button className={styles.logout} onClick={() => void logout()}>
          Log out
        </button>
      </div>
    </div>
  );
}
