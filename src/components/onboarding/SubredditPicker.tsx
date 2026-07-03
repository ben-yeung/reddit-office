"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MAX_OFFICE_CUBICLES,
  colorForSubreddit,
  toSubreddit,
} from "@/lib/data/officeSelection";
import type { Subreddit } from "@/lib/domain/types";
import type { MySubredditsPayload, SubscribedSubredditDTO } from "@/lib/reddit/dto";
import styles from "./onboarding.module.css";

interface Props {
  username: string;
  /** Pre-checked selection when reopening the picker (empty on first run). */
  initial: Subreddit[];
  onConfirm: (subs: Subreddit[]) => void;
  /** Present only on a re-pick (a prior selection exists); returns to the office. */
  onCancel?: () => void;
  onLogout: () => void;
}

/** Compact subscriber count, e.g. 12300 -> "12.3k", 4200000 -> "4.2m". */
function formatSubscribers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

/**
 * The onboarding subreddit picker: choose which of your subscriptions become
 * cubicles. Capped at {@link MAX_OFFICE_CUBICLES} to keep the office floor
 * readable - at the cap, unselected subs are disabled until you free a slot.
 */
export function SubredditPicker({ username, initial, onConfirm, onCancel, onLogout }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initial.map((s) => s.id)),
  );
  const [query, setQuery] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-subreddits"],
    queryFn: async () => {
      const res = await fetch("/api/reddit/my-subreddits", { cache: "no-store" });
      if (!res.ok) throw new Error(`request failed: ${res.status}`);
      return (await res.json()) as MySubredditsPayload;
    },
  });

  const subs = useMemo(() => data?.subreddits ?? [], [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subs;
    return subs.filter(
      (s) => s.name.toLowerCase().includes(q) || s.displayName.toLowerCase().includes(q),
    );
  }, [subs, query]);

  const count = selectedIds.size;
  const atCap = count >= MAX_OFFICE_CUBICLES;

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_OFFICE_CUBICLES) next.add(id);
      return next;
    });
  }

  function fillTop() {
    // Fill remaining slots from the most-subscribed subs not already picked
    // (the list arrives ordered most-subscribed first).
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const s of subs) {
        if (next.size >= MAX_OFFICE_CUBICLES) break;
        next.add(s.id);
      }
      return next;
    });
  }

  function confirm() {
    // Preserve the listing order (most-subscribed first) for the picked subs.
    const picked = subs.filter((s) => selectedIds.has(s.id));
    // Include any pre-checked subs that aren't in the current list (defensive).
    const known = new Set(picked.map((s) => s.id));
    const carried = initial.filter((s) => selectedIds.has(s.id) && !known.has(s.id));
    onConfirm([...picked.map(toSubreddit), ...carried]);
  }

  const notConfigured = data && !data.configured;

  return (
    <div className={styles.wrap}>
      <div className={styles.panel}>
        <header className={styles.head}>
          <p className={`pixel-font ${styles.title}`}>
            {onCancel ? "RESELECT YOUR OFFICE" : `WELCOME, u/${username}`}
          </p>
          <p className={styles.subtitle}>
            Pick the subreddits that become cubicles in your office. Up to{" "}
            <strong>{MAX_OFFICE_CUBICLES}</strong> - choose the communities you want to watch.
          </p>
        </header>

        <div className={styles.controls}>
          <input
            className={styles.search}
            type="search"
            placeholder="Search your subreddits…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search your subreddits"
          />
          <div className={styles.controlActions}>
            <button
              className={styles.ghostBtn}
              onClick={fillTop}
              disabled={isLoading || atCap || subs.length === 0}
            >
              Fill top {MAX_OFFICE_CUBICLES}
            </button>
            <button
              className={styles.ghostBtn}
              onClick={() => setSelectedIds(new Set())}
              disabled={count === 0}
            >
              Clear
            </button>
          </div>
        </div>

        <div className={styles.grid} role="listbox" aria-label="Your subreddits" aria-multiselectable>
          {isLoading && <p className={styles.state}>Reading your subscriptions from Reddit…</p>}
          {isError && (
            <p className={styles.state}>
              Couldn&apos;t load your subreddits. Your session may have expired - try logging in
              again.
            </p>
          )}
          {notConfigured && (
            <p className={styles.state}>
              You&apos;re signed in, but your subscriptions couldn&apos;t be read
              {data?.reason ? ` (${data.reason})` : ""}.
            </p>
          )}
          {!isLoading && !isError && data?.configured && subs.length === 0 && (
            <p className={styles.state}>
              You don&apos;t seem to subscribe to any subreddits yet. Subscribe on Reddit, then
              come back.
            </p>
          )}
          {!isLoading &&
            data?.configured &&
            filtered.length === 0 &&
            subs.length > 0 && <p className={styles.state}>No subreddits match “{query}”.</p>}

          {filtered.map((sub) => (
            <SubredditCard
              key={sub.id}
              sub={sub}
              selected={selectedIds.has(sub.id)}
              disabled={atCap && !selectedIds.has(sub.id)}
              onToggle={() => toggle(sub.id)}
            />
          ))}
        </div>

        <footer className={styles.foot}>
          <span className={`${styles.count} ${atCap ? styles.countCap : ""}`}>
            {count} / {MAX_OFFICE_CUBICLES} selected
            {atCap ? " · uncheck one to swap" : ""}
          </span>
          <div className={styles.footActions}>
            {onCancel ? (
              <button className={styles.ghostBtn} onClick={onCancel}>
                Cancel
              </button>
            ) : (
              <button className={styles.ghostBtn} onClick={onLogout}>
                Log out
              </button>
            )}
            <button className={styles.confirmBtn} onClick={confirm} disabled={count === 0}>
              {onCancel ? "Update office" : "Enter office"} →
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function SubredditCard({
  sub,
  selected,
  disabled,
  onToggle,
}: {
  sub: SubscribedSubredditDTO;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const [iconFailed, setIconFailed] = useState(false);
  const color = colorForSubreddit(sub.name);
  const showIcon = sub.iconUrl && !iconFailed;

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={`${styles.card} ${selected ? styles.cardOn : ""}`}
      onClick={onToggle}
      disabled={disabled}
      title={disabled ? "Office is full - uncheck one to add another" : sub.displayName}
    >
      <span className={styles.checkbox} aria-hidden>
        {selected ? "✓" : ""}
      </span>
      {showIcon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.icon}
          src={sub.iconUrl}
          alt=""
          loading="lazy"
          onError={() => setIconFailed(true)}
        />
      ) : (
        <span className={styles.iconLetter} style={{ background: color }} aria-hidden>
          {sub.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className={styles.cardText}>
        <span className={styles.cardName}>{sub.displayName}</span>
        <span className={styles.cardMeta}>
          {formatSubscribers(sub.subscribers)} members
          {sub.over18 ? " · NSFW" : ""}
        </span>
      </span>
    </button>
  );
}
