"use client";

import type { CSSProperties, ReactNode } from "react";
import { motion } from "framer-motion";
import styles from "./ModalScrim.module.css";

interface Props {
  /** Invoked when the scrim itself (not the card inside it) is clicked. */
  onClose?: () => void;
  /** Dark tint painted over the page behind the card. */
  tint?: string;
  /** Backdrop blur radius, e.g. "4px". Rendered on a static, non-animated layer. */
  blur?: string;
  /** Padding around the centered content, keeping the card off the edges. */
  padding?: string;
  zIndex?: number;
  children: ReactNode;
}

/**
 * Shared modal scrim. Splits the classic "one blurred, fading backdrop" into
 * separate layers so entrance/exit stay smooth even when the browser has no GPU
 * acceleration:
 *
 *  - a *static* backdrop-filter layer that mounts and unmounts with no opacity
 *    transition. Animating opacity over a full-viewport blur forces the CPU
 *    compositor to re-rasterize the blur every frame - the main source of modal
 *    jank with hardware acceleration off. Snapping a subtle blur in/out is
 *    imperceptible and is masked by the fading tint.
 *  - a plain-color tint that carries the fade. A solid-color opacity tween is
 *    cheap on the CPU.
 *  - the centered content (the dialog card), supplied as children and animated
 *    by the caller.
 *
 * Blur and tint are pointer-transparent, so a click anywhere on the backdrop
 * falls through to the root and triggers `onClose`; clicks on the card do not.
 */
export function ModalScrim({
  onClose,
  tint = "rgba(6, 7, 10, 0.66)",
  blur = "3px",
  padding = "4vh 4vw",
  zIndex = 50,
  children,
}: Props) {
  const rootStyle: CSSProperties = { zIndex, padding };
  const blurStyle: CSSProperties = {
    backdropFilter: `blur(${blur})`,
    WebkitBackdropFilter: `blur(${blur})`,
  };
  return (
    <div
      className={styles.root}
      style={rootStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      {/* Blur appears instantly (initial opacity 1, no entrance fade) so it never
          re-blurs an as-yet-unfrozen background on the way in. On exit it fades
          out quickly - the background is frozen the whole time, so this short
          fade re-blurs only a static frame, and keeps the blur from lingering. */}
      <motion.div
        className={styles.blur}
        style={blurStyle}
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.14, ease: "easeIn" } }}
        aria-hidden
      />
      <motion.div
        className={styles.tint}
        style={{ background: tint }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.18, ease: "easeOut" } }}
        exit={{ opacity: 0, transition: { duration: 0.14, ease: "easeIn" } }}
        aria-hidden
      />
      {children}
    </div>
  );
}
