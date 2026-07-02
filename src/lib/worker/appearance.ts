/**
 * Procedural worker appearance, seeded deterministically from a post id.
 *
 * A given post always looks the same, but the office is full of variety. The
 * shirt keeps the subreddit color (shaded per worker); everything else is rolled.
 */
import { mulberry32, hashString, pick, type Rng } from "@/lib/util/rng";

export type HairStyle = "short" | "bun" | "spiky" | "long" | "beanie" | "noogler" | "bald";
export type Accessory = "none" | "glasses" | "headphones" | "earbuds";
export type DeskProp = "mug" | "plant" | "papers" | "dual";

export interface WorkerAppearance {
  skin: string;
  hair: string;
  style: HairStyle;
  accessory: Accessory;
  prop: DeskProp;
  /** Lightness delta applied to the subreddit color for this worker's shirt. */
  shirtPct: number;
  /** Beanie color. */
  cap: string;
}

const SKIN = ["#f2c9a0", "#e8b88c", "#c68642", "#a56a3e", "#8d5524"] as const;
const HAIR = ["#2a1a0f", "#5a3a1a", "#8a6a3a", "#3a3a3a", "#c9a227", "#d9d9d9"] as const;
const HAIR_STYLE: HairStyle[] = ["short", "bun", "spiky", "long", "beanie", "noogler", "bald"];
const ACCESSORY: Accessory[] = ["none", "none", "glasses", "headphones", "earbuds"];
const DESK_PROP: DeskProp[] = ["mug", "plant", "papers", "dual"];
const CAP_COLORS = ["#c0392b", "#2d7d46", "#2b5fa8", "#8e44ad"] as const;

export function appearanceFor(id: string): WorkerAppearance {
  const r: Rng = mulberry32(hashString(id));
  return {
    skin: pick(r, SKIN),
    hair: pick(r, HAIR),
    style: pick(r, HAIR_STYLE),
    accessory: pick(r, ACCESSORY),
    prop: pick(r, DESK_PROP),
    shirtPct: (r() - 0.5) * 0.4,
    cap: pick(r, CAP_COLORS),
  };
}

/** Shade a hex color by pct in [-1, 1]: negative darkens, positive lightens. */
export function shade(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const f = (c: number) =>
    Math.max(0, Math.min(255, Math.round(pct < 0 ? c * (1 + pct) : c + (255 - c) * pct)));
  return "#" + ((f(r) << 16) | (f(g) << 8) | f(b)).toString(16).padStart(6, "0");
}
