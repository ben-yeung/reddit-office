"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Subreddit, Worker } from "@/lib/domain/types";
import type { DemoCommentsPayload } from "@/lib/reddit/dto";
import { useDialog } from "@/lib/util/useDialog";
import { VideoPlayer } from "./VideoPlayer";
import styles from "./WorkerModal.module.css";

/**
 * A skeleton block's vertical pitch: its own height (padding + three shimmer
 * bars ≈ 64px) plus the comment column's 10px flex gap. Kept in sync with the
 * `.skeleton` / `.comments` rules so the loading state can measure the column
 * and render exactly enough placeholders to fill it.
 */
const SKELETON_PITCH = 74;

/**
 * Measure the comment column while it's loading and report how many skeleton
 * placeholders it takes to fill its height (re-measured on resize), so the
 * loading state never leaves a short stub of placeholders above empty space.
 */
function useSkeletonFill(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(6);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const measure = () => {
      const h = el.clientHeight;
      if (h > 0) setCount(Math.max(3, Math.ceil(h / SKELETON_PITCH)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);
  return { ref, count };
}

interface CommentItem {
  id: string;
  author: string;
  body: string;
  score: number;
  /** Absolute reddit.com URL to this comment (post permalink for mock items). */
  permalink: string;
}

type CommentsState =
  | { status: "loading" }
  | { status: "real"; items: CommentItem[] }
  | { status: "mock"; items: CommentItem[] };

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
  "Been waiting for someone to post about this.",
  "Great write-up, the details really help.",
  "Wait, does this work on older versions too?",
  "Commenting so I can find this again later.",
  "This deserves way more attention than it's getting.",
  "Nice. Bookmarked and shared with my team.",
];

/**
 * Deterministic mock comments so a given post always reads the same. Used as a
 * fallback when live Reddit comments are unavailable (mock office / fetch error).
 */
function mockComments(worker: Worker): CommentItem[] {
  const seed = hash(worker.id);
  const count = 6 + (seed % 7);
  return Array.from({ length: count }, (_, i) => {
    const h = hash(`${worker.id}:${i}`);
    return {
      id: `mock-${i}`,
      author: `u/${["reader", "lurker", "poster", "mod_ish", "night_owl"][h % 5]}_${h % 900}`,
      body: COMMENT_BODIES[(h >> 3) % COMMENT_BODIES.length],
      score: (h % 240) - 10,
      permalink: worker.permalink,
    };
  });
}

/** Reddit-style compact count, e.g. 4123 -> "4.1K", 1_200_000 -> "1.2M". */
function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs < 1000) return `${n}`;
  if (abs < 1_000_000) {
    const k = n / 1000;
    return `${Number.isInteger(k) || abs >= 100_000 ? Math.round(k) : k.toFixed(1)}K`;
  }
  const m = n / 1_000_000;
  return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
}

/** Open a comment's reddit.com permalink in a new tab. */
function openComment(url: string): void {
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * If a link actually points at an image, return the image URL so it can be
 * embedded rather than shown as a link. Handles direct image URLs and Reddit's
 * `reddit.com/media?url=<encoded image>` share wrapper.
 */
function imageUrlFromLink(href: string): string | null {
  const isImg = (s: string) =>
    /\.(?:jpe?g|png|gif|webp|bmp)(?:$|\?)/i.test(s) ||
    /(?:^|\/\/|\.)(?:i|preview|external-preview)\.redd\.it\//i.test(s);
  try {
    const u = new URL(href);
    if (/(?:^|\.)reddit\.com$/i.test(u.hostname) && u.pathname === "/media") {
      const inner = u.searchParams.get("url"); // URLSearchParams decodes it
      if (inner && isImg(inner)) return inner;
    }
    if (isImg(href)) return href;
  } catch {
    /* not a parseable URL */
  }
  return null;
}

/** Human "x ago" from an age in minutes. */
function formatAge(min: number): string {
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// --- hand-rolled inline SVG icons (no emoji, no icon package) --------------

function Icon({
  size = 16,
  filled = false,
  children,
}: {
  size?: number;
  filled?: boolean;
  children: ReactNode;
}) {
  return (
    <svg
      className={styles.icon}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const ArrowUpIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M10 15.5V5M5.5 9.5 10 5l4.5 4.5" />
  </Icon>
);
const ArrowDownIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M10 4.5v10.5M5.5 10.5 10 15l4.5-4.5" />
  </Icon>
);
const CommentIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M4 4.5h12A1.5 1.5 0 0 1 17.5 6v6a1.5 1.5 0 0 1-1.5 1.5H8.5L5 16.5v-3H4A1.5 1.5 0 0 1 2.5 12V6A1.5 1.5 0 0 1 4 4.5Z" />
  </Icon>
);
const AwardIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size} filled>
    <path d="M10 2.6l2.06 4.17 4.6.67-3.33 3.24.79 4.58L10 13.9l-4.12 2.16.79-4.58L3.34 7.44l4.6-.67z" />
  </Icon>
);
const ShareIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M10 3v9M6.5 6.5 10 3l3.5 3.5M5 11.5V15a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3.5" />
  </Icon>
);
const ExternalIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M11 4h5v5M15.5 4.5 9 11M14 11.5V15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3.5" />
  </Icon>
);
const CloseIcon = () => (
  <Icon size={18}>
    <path d="M5 5l10 10M15 5 5 15" strokeWidth={2} />
  </Icon>
);

/**
 * Render Reddit markdown (GFM) to safe HTML - react-markdown ignores raw HTML by
 * default, so this is XSS-safe. Embedded links don't navigate directly; a single
 * click routes through `onLinkClick`, which opens a confirmation showing the full
 * destination URL before leaving to a new tab.
 */
function Markdown({
  source,
  className,
  onLinkClick,
}: {
  source: string;
  className: string;
  onLinkClick: (url: string) => void;
}) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Strip react-markdown's `node` so it isn't spread onto the DOM node.
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          a: ({ node, ...props }) => {
            const href = typeof props.href === "string" ? props.href : "";
            // A link that is really an image (incl. reddit's /media wrapper)
            // renders inline instead of as a link.
            const asImage = href ? imageUrlFromLink(href) : null;
            if (asImage) {
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={asImage} alt="" loading="lazy" className={styles.mdImage} />
              );
            }
            return (
              <a
                {...props}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (href) onLinkClick(href);
                }}
              />
            );
          },
          // Inline images / gifs (Reddit media refs resolved to URLs upstream).
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          img: ({ node, ...props }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              {...props}
              alt={typeof props.alt === "string" ? props.alt : ""}
              loading="lazy"
              className={styles.mdImage}
            />
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

/**
 * External-link confirmation. Reddit comment/post markdown can link anywhere, so
 * a single click surfaces the full URL for review before opening a new tab.
 * Escape is captured here so it cancels this dialog without also closing the
 * post modal behind it.
 */
function LinkConfirm({
  url,
  onCancel,
  onConfirm,
}: {
  url: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return createPortal(
    <motion.div
      className={styles.confirmBackdrop}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <div
        className={styles.confirmPanel}
        role="dialog"
        aria-modal="true"
        aria-label="Open external link"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.confirmTitle}>Open this link?</div>
        <p className={styles.confirmSub}>This will open an external site in a new tab.</p>
        <div className={styles.confirmUrl}>{url}</div>
        <div className={styles.confirmActions}>
          <button className={styles.confirmCancel} onClick={onCancel}>
            Cancel
          </button>
          <button className={styles.confirmOpen} onClick={onConfirm} autoFocus>
            Open link
            <ExternalIcon size={15} />
          </button>
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}

/**
 * Read-only worker detail (ADR-0006): a post rendered close to Reddit's own
 * layout - a post column (header, title, flair, media, action bar, and the
 * "Open in Reddit" delegation pinned below it) beside a scrollable comments
 * column. Image/link posts render the image + a domain bar, not a bare URL.
 * All write actions are delegated to reddit.com.
 */
export function WorkerModal({ worker, subreddit, now, onClose }: Props) {
  const ageMin = Math.max(0, Math.round((now - worker.createdAt) / 60000));
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const [imageOk, setImageOk] = useState(true);
  const [comments, setComments] = useState<CommentsState>({ status: "loading" });
  // An embedded link awaiting confirmation before opening in a new tab.
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  // How many loading skeletons it takes to fill the comment column's height.
  const { ref: skeletonRef, count: skeletonCount } = useSkeletonFill(
    comments.status === "loading",
  );

  // Load the post's top-upvoted comments (demo app-token endpoint). Falls back
  // to a deterministic mock preview when live comments aren't available.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/demo/comments?id=${encodeURIComponent(worker.id)}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<DemoCommentsPayload>)
      .then((payload) => {
        if (cancelled) return;
        if (payload.configured && payload.comments.length > 0) {
          setComments({ status: "real", items: payload.comments });
        } else {
          setComments({ status: "mock", items: mockComments(worker) });
        }
      })
      .catch(() => {
        if (!cancelled) setComments({ status: "mock", items: mockComments(worker) });
      });
    return () => {
      cancelled = true;
    };
  }, [worker]);

  if (typeof document === "undefined") return null;

  const avatarLetter = subreddit.name.charAt(0).toUpperCase();
  // Body and image are independent: a post can have selftext, an image, or both.
  const hasVideo = worker.kind === "video" && Boolean(worker.video);
  const hasImage = !hasVideo && Boolean(worker.image) && imageOk;
  const isLink = worker.kind === "link";
  const showBody = worker.body.trim().length > 0;
  const awards = 1 + (hash(worker.id) % 9);

  return createPortal(
    <>
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
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className={styles.close} onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>

        {/* Post column: scrolls as one; the Open-in-Reddit button sits inline at
            the right end of the action row. */}
        <div className={styles.main}>
          <header className={styles.head}>
            <span className={styles.avatar} style={{ background: subreddit.color }}>
              {avatarLetter}
            </span>
            <div className={styles.headText}>
              <div className={styles.headTop}>
                <span className={styles.sub} style={{ color: subreddit.color }}>
                  {subreddit.displayName}
                </span>
                <span className={styles.metaDot}>·</span>
                <span className={styles.metaDim}>{formatAge(ageMin)}</span>
              </div>
              <div className={styles.headBottom}>
                <span className={styles.author}>{worker.author}</span>
                {worker.trending && <span className={styles.trendTag}>trending</span>}
                <span className={styles.metaDim}>· {worker.momentum.toFixed(2)}× momentum</span>
              </div>
            </div>
          </header>

          <h2 className={styles.title}>{worker.title}</h2>

          {worker.flair && (
            <span
              className={styles.flair}
              style={{ borderColor: subreddit.color, color: subreddit.color }}
            >
              {worker.flair}
            </span>
          )}

          {showBody && (
            <Markdown source={worker.body} className={styles.body} onLinkClick={setPendingUrl} />
          )}

          {hasVideo && (
            <figure className={styles.media}>
              <VideoPlayer
                className={styles.video}
                video={worker.video!}
                poster={worker.image}
                title={worker.title}
              />
            </figure>
          )}

          {hasImage && (
            <figure className={styles.media}>
              {/* Real posts use Reddit's image URLs; mock posts use inline SVG
                  data URIs. Plain <img> avoids next/image remote-domain config. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.image}
                src={worker.image}
                alt={worker.title}
                loading="lazy"
                onError={() => setImageOk(false)}
              />
              {isLink && worker.linkDomain && (
                <figcaption className={styles.linkBar}>
                  <span className={styles.linkDomain}>{worker.linkDomain}</span>
                  <a
                    className={styles.openBtn}
                    href={worker.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open
                  </a>
                </figcaption>
              )}
            </figure>
          )}

          {/* Link post with no usable preview: still surface the domain + Open. */}
          {isLink && !hasImage && worker.linkDomain && (
            <div className={styles.linkRow}>
              <span className={styles.linkDomain}>{worker.linkDomain}</span>
              <a
                className={styles.openBtn}
                href={worker.permalink}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open
              </a>
            </div>
          )}

          <div className={styles.actions}>
            <div className={styles.voteChip}>
              <span className={styles.up}>
                <ArrowUpIcon />
              </span>
              <span className={styles.voteCount}>{compact(worker.score)}</span>
              <span className={styles.down}>
                <ArrowDownIcon />
              </span>
            </div>
            <a
              className={styles.chip}
              href={worker.permalink}
              target="_blank"
              rel="noopener noreferrer"
            >
              <CommentIcon />
              {compact(worker.comments)}
            </a>
            <div className={styles.chip}>
              <AwardIcon />
              {awards}
            </div>
            <a
              className={styles.chip}
              href={worker.permalink}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ShareIcon />
              Share
            </a>
            <a
              className={styles.reddit}
              href={worker.permalink}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Reddit
              <ExternalIcon size={15} />
            </a>
          </div>
        </div>

        {/* Comments column: floated inside the pane so its content scrolls to
            the post column's height instead of stretching the modal taller. */}
        <aside className={styles.commentsPane}>
          <div className={styles.commentsInner}>
            <div className={styles.commentsHead}>
              Comments · {worker.comments.toLocaleString()}
            </div>
            {comments.status === "loading" ? (
              <div ref={skeletonRef} className={`${styles.comments} ${styles.commentsLoading}`}>
                {Array.from({ length: skeletonCount }).map((_, i) => (
                  <div key={i} className={styles.skeleton}>
                    <div className={styles.skelMeta} />
                    <div className={styles.skelLine} />
                    <div className={styles.skelLineShort} />
                  </div>
                ))}
              </div>
            ) : comments.items.length === 0 ? (
              <div className={styles.commentsEmpty}>No comments yet.</div>
            ) : (
              <ul className={styles.comments}>
                {comments.items.map((c) => (
                  <li key={c.id}>
                    {/* Clickable card (not an <a>, so markdown links inside stay
                        valid). Opens the exact comment on Reddit. */}
                    <div
                      className={styles.comment}
                      role="link"
                      tabIndex={0}
                      onClick={() => openComment(c.permalink)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openComment(c.permalink);
                        }
                      }}
                    >
                      <div className={styles.commentMeta}>
                        <span className={styles.commentAuthor}>{c.author}</span>
                        <span className={styles.commentScore}>
                          <ArrowUpIcon size={11} />
                          {compact(c.score)}
                        </span>
                      </div>
                      <Markdown
                        source={c.body}
                        className={styles.commentBody}
                        onLinkClick={setPendingUrl}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </motion.div>
    </motion.div>
    {pendingUrl && (
      <LinkConfirm
        url={pendingUrl}
        onCancel={() => setPendingUrl(null)}
        onConfirm={() => {
          window.open(pendingUrl, "_blank", "noopener,noreferrer");
          setPendingUrl(null);
        }}
      />
    )}
    </>,
    document.body,
  );
}
