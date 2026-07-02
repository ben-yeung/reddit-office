"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth/AuthContext";
import { RedditGlyph } from "./RedditGlyph";
import { LoginModal } from "./LoginModal";
import styles from "./auth.module.css";

/**
 * Top-center auth affordance (ADR-0008, demo-first). In demo mode it is a
 * persistent "Log in with Reddit" pill that opens the login modal; when
 * authenticated it shows the user chip with a logout control.
 */
export function AuthControl() {
  const { status, user, logout } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className={styles.control}>
        {status === "authenticated" && user ? (
          <div className={styles.userChip}>
            {user.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.avatar} src={user.iconUrl} alt="" />
            ) : (
              <span className={styles.avatar} />
            )}
            <span>u/{user.name}</span>
            <button className={styles.logout} onClick={() => void logout()}>
              Log out
            </button>
          </div>
        ) : (
          <button className={styles.loginBtn} onClick={() => setModalOpen(true)}>
            <RedditGlyph size={18} />
            Log in with Reddit
          </button>
        )}
      </div>

      <AnimatePresence>
        {modalOpen && <LoginModal onClose={() => setModalOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
