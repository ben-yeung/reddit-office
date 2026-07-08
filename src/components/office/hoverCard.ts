import type { Worker } from "@/lib/domain/types";
import { SURGE_MOMENTUM } from "@/lib/domain/constants";
import styles from "./hoverCard.module.css";

/**
 * Markup for the worker hover-preview card (P6): the post title (wraps to fit), a
 * content-type tag row (image / video / text - blank if none), and a stat row with
 * score + comments (hand-rolled inline SVG icons, never emoji) plus the momentum
 * multiplier as a tier-coloured pill. Returned as an HTML string so both renderers
 * share exactly one design - the 3D DOM overlay sets it via innerHTML, the 2D SVG
 * <foreignObject> via dangerouslySetInnerHTML.
 */
const ARROW_ICON = `<svg class="${styles.ic}" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1l4 5H6.2v3H3.8V6H1z"/></svg>`;
const BUBBLE_ICON = `<svg class="${styles.ic}" viewBox="0 0 12 11" aria-hidden="true"><path d="M1 1h10v6H5L2.5 9.2V7H1z"/></svg>`;

// Content-type tag icons (frame stroked, details filled - all currentColor).
const IMG_ICON = `<svg class="${styles.tic}" viewBox="0 0 16 14" aria-hidden="true"><path d="M1.5 2h13v10h-13z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="5" cy="5.4" r="1.4"/><path d="M2.5 11.5l3.5-3.2 2.4 2.2 2.6-2.8 2.5 2.6v1.2z"/></svg>`;
const VID_ICON = `<svg class="${styles.tic}" viewBox="0 0 16 14" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6.4 5.2l3.6 2.3-3.6 2.3z"/></svg>`;
const TXT_ICON = `<svg class="${styles.tic}" viewBox="0 0 16 14" aria-hidden="true"><path d="M2 3.5h12M2 7h12M2 10.5h8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
const LINK_ICON = `<svg class="${styles.tic}" viewBox="0 0 16 14" aria-hidden="true"><path d="M6 4.2H4.3a2.8 2.8 0 0 0 0 5.6H6M10 4.2h1.7a2.8 2.8 0 0 1 0 5.6H10M5.4 7h5.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

function fmt(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape post titles before injecting as HTML (they can contain markup chars). */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Momentum tier colour, matching the post modal's MomentumTag tiers. */
function momentumTier(m: number): string {
  if (m < 0.7) return "var(--ink-dim)"; // Cooling
  if (m < 1.4) return "#4a90d9"; // Steady
  if (m < SURGE_MOMENTUM) return "#e8a53c"; // Rising
  return "var(--accent)"; // Surging
}

/** Categorical colours per content type (distinct hues that read on both themes). */
const TAG_COLOR = {
  image: "#2f9e95",
  video: "#9b6dd6",
  text: "#6d78cf",
  link: "#c56b9a",
} as const;

function tag(icon: string, label: string, color: string): string {
  return `<span class="${styles.tag}" style="--tier:${color}">${icon}${label}</span>`;
}

/** Content-type tags for a post: image / video / body text. Blank if none apply
    (e.g. a bare link, or a title-only text post). */
function contentTags(w: Worker): string {
  const tags: string[] = [];
  if (w.kind === "image") tags.push(tag(IMG_ICON, "Image", TAG_COLOR.image));
  if (w.kind === "video") tags.push(tag(VID_ICON, "Video", TAG_COLOR.video));
  if (w.kind === "link") {
    tags.push(tag(LINK_ICON, escapeHtml(w.linkDomain || "Link"), TAG_COLOR.link));
  }
  if (w.kind === "text" && w.body && w.body.trim().length > 0) {
    tags.push(tag(TXT_ICON, "Text", TAG_COLOR.text));
  }
  if (tags.length === 0) return "";
  return `<div class="${styles.tags}">${tags.join("")}</div>`;
}

export function hoverCardHtml(w: Worker): string {
  const mom = Number.isFinite(w.momentum) ? w.momentum : 0;
  return (
    `<div class="${styles.card}">` +
    `<div class="${styles.title}">${escapeHtml(w.title)}</div>` +
    contentTags(w) +
    `<div class="${styles.meta}">` +
    `<span>${ARROW_ICON} <b>${fmt(w.score)}</b></span>` +
    `<span>${BUBBLE_ICON} <b>${fmt(w.comments)}</b></span>` +
    `<span class="${styles.mom}" style="--tier:${momentumTier(mom)}">${mom.toFixed(2)}x</span>` +
    `</div></div>`
  );
}
