"use client";

import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth/AuthContext";
import { RedditGlyph } from "./RedditGlyph";
import styles from "./auth.module.css";

interface Props {
  onClose: () => void;
}

/**
 * Lock-style login modal ("Auth0 conventions", ADR-0008): a Reddit sign-in
 * button plus an explicit "continue without logging in" escape. Purely a visual
 * convention - the auth underneath is our own direct Reddit OAuth.
 */
export function LoginModal({ onClose }: Props) {
  const { login, error, authConfigured } = useAuth();

  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label="Log in to Reddit Office"
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
      >
        <button className={styles.close} onClick={onClose} aria-label="Close">
          ✕
        </button>

        <p className={`pixel-font ${styles.title}`}>REDDIT OFFICE</p>
        <p className={styles.subtitle}>
          Log in with Reddit to build an office from your own subscriptions, updating in real
          time.
        </p>

        <button
          className={styles.redditBtn}
          onClick={login}
          disabled={!authConfigured}
          title={authConfigured ? undefined : "Reddit credentials are not configured"}
        >
          <RedditGlyph size={20} />
          Log in with Reddit
        </button>

        <button className={styles.skip} onClick={onClose}>
          Continue without logging in
        </button>

        {error && <p className={styles.error}>{error}</p>}

        {!authConfigured && (
          <p className={styles.note}>
            Live Reddit sign-in is disabled because the server has no credentials. Set{" "}
            <code>REDDIT_CLIENT_ID</code>, <code>REDDIT_CLIENT_SECRET</code>, and{" "}
            <code>SESSION_SECRET</code> to enable it. Demo mode works either way.
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
