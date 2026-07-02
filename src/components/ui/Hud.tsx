"use client";

import styles from "./controls.module.css";

interface Props {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

/** Bottom-right camera controls. */
export function Hud({ onZoomIn, onZoomOut, onFit }: Props) {
  return (
    <div className={styles.hud}>
      <button className={styles.hudBtn} onClick={onZoomIn} aria-label="Zoom in">
        +
      </button>
      <button className={styles.hudBtn} onClick={onZoomOut} aria-label="Zoom out">
        –
      </button>
      <button
        className={`${styles.hudBtn} ${styles.hudFit}`}
        onClick={onFit}
        aria-label="Fit office to view"
      >
        ⤢
      </button>
    </div>
  );
}
