"use client";

import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth/AuthContext";
import { useDialog } from "@/lib/util/useDialog";
import { ModalScrim } from "@/components/ui/ModalScrim";
import { usePauseBackgroundMotion } from "@/components/office/overlays/BackgroundMotion";
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
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  // Freeze the office behind the blurred backdrop for the modal's whole life.
  usePauseBackgroundMotion();

  if (typeof document === "undefined") return null;

  return createPortal(
    <ModalScrim onClose={onClose} tint="rgba(6, 7, 11, 0.62)" blur="4px" padding="20px" zIndex={50}>
      <motion.div
        ref={dialogRef}
        tabIndex={-1}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label="Log in to Reddit Office"
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        // Snappy tween exit: a spring's long settling tail keeps the whole modal
        // (and its blur) mounted well after it looks gone.
        exit={{ opacity: 0, y: 8, scale: 0.97, transition: { duration: 0.14, ease: "easeIn" } }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
      >
        <button className={styles.close} onClick={onClose} aria-label="Close">
          ✕
        </button>

        <p className={`pixel-font ${styles.title}`}>REDDIT OFFICE</p>
        <p className={styles.subtitle}>
          Log in with Reddit to build an office from your own subscriptions, updating in real time.
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
    </ModalScrim>,
    document.body,
  );
}
