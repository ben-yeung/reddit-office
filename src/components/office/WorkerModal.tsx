"use client";

import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import type { Subreddit, Worker } from "@/lib/domain/types";
import { useDialog } from "@/lib/util/useDialog";
import styles from "./WorkerModal.module.css";

interface Props {
  worker: Worker;
  subreddit: Subreddit;
  /** Wall-clock time captured when the modal opened (read off the render path). */
  now: number;
  onClose: () => void;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const COMMENT_BODIES = [
  "This is exactly what I needed today, thanks for sharing.",
  "Source? I've seen conflicting info on this.",
  "Underrated post. Take my upvote.",
  "Can confirm, tried this last week and it worked.",
  "Hot take but I actually disagree - here's why...",
  "Saving this for later, incredible work.",
  "The lighting in the last one is unreal.",
  "OP delivered. Rare these days.",
];

/** Deterministic mock comments so a given post always reads the same. */
function mockComments(worker: Worker): Array<{ author: string; body: string; score: number }> {
  const seed = hash(worker.id);
  const count = 3 + (seed % 3);
  return Array.from({ length: count }, (_, i) => {
    const h = hash(`${worker.id}:${i}`);
    return {
      author: `u/${["reader", "lurker", "poster", "mod_ish", "night_owl"][h % 5]}_${h % 900}`,
      body: COMMENT_BODIES[(h >> 3) % COMMENT_BODIES.length],
      score: (h % 240) - 10,
    };
  });
}

/**
 * Read-only worker detail (ADR-0006): post content + a mock comments preview.
 * All write actions are delegated to reddit.com via "Open in Reddit".
 */
export function WorkerModal({ worker, subreddit, now, onClose }: Props) {
  const comments = mockComments(worker);
  const ageMin = Math.max(0, Math.round((now - worker.createdAt) / 60000));
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      className={styles.backdrop}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        tabIndex={-1}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={worker.title}
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className={styles.close} onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className={styles.subline} style={{ color: subreddit.color }}>
          <span className={styles.dot} style={{ background: subreddit.color }} />
          {subreddit.displayName}
          <span className={styles.author}>· {worker.author}</span>
          <span className={styles.author}>· {ageMin}m ago</span>
          {worker.trending && <span className={styles.trendTag}>trending</span>}
        </div>

        <h2 className={styles.title}>{worker.title}</h2>
        <p className={styles.body}>{worker.body}</p>

        <div className={styles.stats}>
          <span>▲ {worker.score.toLocaleString()}</span>
          <span>💬 {worker.comments.toLocaleString()}</span>
          <span>momentum {worker.momentum.toFixed(2)}×</span>
        </div>

        <div className={styles.commentsHead}>Comments preview</div>
        <ul className={styles.comments}>
          {comments.map((c, i) => (
            <li key={i} className={styles.comment}>
              <div className={styles.commentMeta}>
                <span>{c.author}</span>
                <span>▲ {c.score}</span>
              </div>
              <div className={styles.commentBody}>{c.body}</div>
            </li>
          ))}
        </ul>

        <a
          className={styles.reddit}
          href={worker.permalink}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Reddit ↗
        </a>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
