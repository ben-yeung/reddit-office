"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DEFAULT_WEIGHTS } from "@/lib/momentum/momentum";
import { SURGE_MOMENTUM } from "@/lib/domain/constants";
import styles from "./MomentumTag.module.css";

/**
 * How the momentum gauge is laid out. The track runs 0..GAUGE_MAX; a post at its
 * subreddit's normal pace sits at NORMAL (1.0) and a surge begins at
 * {@link SURGE_MOMENTUM}. GAUGE_MAX sits a little above the surge line so even a
 * strong surge leaves a sliver of headroom instead of pegging the end.
 */
const NORMAL = 1;
const GAUGE_MAX = 3;

/** A momentum reading bucketed into a labelled, colour-coded band. */
interface Tier {
  label: string;
  /** A theme-aware CSS colour used to tint the tag + gauge marker. */
  color: string;
}

/**
 * Bucket a momentum value into a tier. Boundaries are anchored to the domain's
 * own thresholds where they carry meaning: 1.0 is the subreddit's normal pace
 * and {@link SURGE_MOMENTUM} is the surge line. The mid boundaries (0.7 / 1.4)
 * are display-only bands tuned to read cleanly around "normal".
 */
function tierFor(momentum: number): Tier {
  if (momentum < 0.7) return { label: "Cooling", color: "var(--ink-dim)" };
  if (momentum < 1.4) return { label: "Steady", color: "#4a90d9" };
  if (momentum < SURGE_MOMENTUM) return { label: "Rising", color: "#e8a53c" };
  return { label: "Surging", color: "var(--accent)" };
}

/** Percentage offset along the gauge track for a momentum value. */
function gaugePct(momentum: number): number {
  const clamped = Math.min(Math.max(momentum, 0), GAUGE_MAX);
  return (clamped / GAUGE_MAX) * 100;
}

function BoltIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={styles.bolt}
    >
      <path d="M11 2.5 4.5 11h4l-1 6.5L15 9h-4z" />
    </svg>
  );
}

interface Props {
  momentum: number;
  /** Display name of the post's subreddit, e.g. "r/programming". */
  subredditName: string;
}

/**
 * The momentum multiplier rendered as an interactive tag. It shows the value as
 * a colour-coded pill; hovering, clicking, or focusing it opens a small popover
 * that explains what momentum measures and where this post sits on the scale.
 *
 * Momentum itself is a per-subreddit-normalized pace (see momentum.ts): the app
 * only carries the final multiplier, so the popover explains the weighting and
 * the post's standing rather than inventing a per-post velocity breakdown.
 */
export function MomentumTag({ momentum, subredditName }: Props) {
  const tier = tierFor(momentum);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hoverOpen || pinned;
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  const scorePct = Math.round(DEFAULT_WEIGHTS.score * 100);
  const commentPct = Math.round(DEFAULT_WEIGHTS.comments * 100);

  // While pinned open (clicked/tapped), close on Escape or an outside click.
  // Escape is captured so it dismisses the popover without also closing the
  // post modal behind it.
  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setPinned(false);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setPinned(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown, true);
    };
  }, [pinned]);

  return (
    <span
      ref={wrapRef}
      className={styles.wrap}
      style={{ ["--tier" as string]: tier.color }}
      onMouseEnter={() => setHoverOpen(true)}
      onMouseLeave={() => setHoverOpen(false)}
    >
      <button
        type="button"
        className={styles.tag}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setPinned((v) => !v)}
      >
        <BoltIcon />
        <span className={styles.value}>{momentum.toFixed(2)}×</span>
        <span className={styles.tagLabel}>momentum</span>
        <svg
          className={styles.chevron}
          data-open={open}
          width="11"
          height="11"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 8l5 5 5-5" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            role="tooltip"
            className={styles.pop}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.1 } }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
          >
            <div className={styles.popHead}>
              <span className={styles.popTitle}>
                <BoltIcon size={14} />
                Momentum
              </span>
              <span className={styles.tierPill}>{tier.label}</span>
            </div>

            <div className={styles.readout}>
              <span className={styles.bigValue}>{momentum.toFixed(2)}×</span>
            </div>

            {/* Where this post sits between "normal pace" (1×) and the surge
                line, on a 0..3× track. */}
            <div className={styles.gauge}>
              <div className={styles.track}>
                <span
                  className={styles.tick}
                  style={{ left: `${gaugePct(NORMAL)}%` }}
                  data-label="1× normal"
                />
                <span
                  className={styles.tick}
                  style={{ left: `${gaugePct(SURGE_MOMENTUM)}%` }}
                  data-label={`${SURGE_MOMENTUM}× surge`}
                />
                <span
                  className={styles.fill}
                  style={{ width: `${gaugePct(momentum)}%` }}
                />
                <span
                  className={styles.marker}
                  style={{ left: `${gaugePct(momentum)}%` }}
                />
              </div>
              <div className={styles.scaleRow}>
                <span>0</span>
                <span>{GAUGE_MAX}×</span>
              </div>
            </div>

            <p className={styles.explain}>
              Momentum compares how fast this post is gaining upvotes and comments
              against {subredditName}&apos;s usual pace.
            </p>

            <div className={styles.weights}>
              <span className={styles.weightLabel}>Weighted from</span>
              <span className={styles.weightChip}>
                <span className={styles.weightPct}>{scorePct}%</span> upvote pace
              </span>
              <span className={styles.weightPlus}>+</span>
              <span className={styles.weightChip}>
                <span className={styles.weightPct}>{commentPct}%</span> comment pace
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
