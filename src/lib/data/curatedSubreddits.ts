import type { Subreddit } from "@/lib/domain/types";

/**
 * The curated demo office (ADR-0009): a fixed list of iconic, SFW subreddits.
 * Hand-picked (not `/subreddits/popular`) so the unauthenticated first
 * impression is stable, always populated, and predictable. Colors are tuned to
 * stay legible against the dark office floor.
 */
const CURATED: Array<{ name: string; color: string }> = [
  { name: "pics", color: "#69c9d0" },
  { name: "aww", color: "#ff9ec4" },
  { name: "gaming", color: "#a06bff" },
  { name: "food", color: "#ff8a3c" },
  { name: "todayilearned", color: "#5aa9e6" },
  { name: "interestingasfuck", color: "#e0b23c" },
  { name: "oddlysatisfying", color: "#42c8c0" },
  { name: "MadeMeSmile", color: "#ff6f61" },
  { name: "dataisbeautiful", color: "#7c86ff" },
  { name: "NatureIsFuckingLit", color: "#4ac26b" },
  { name: "explainlikeimfive", color: "#ef6ea8" },
  { name: "funny", color: "#f5d442" },
];

/** Stable synthetic id for a demo subreddit (real t5 id is not needed here). */
export function demoSubredditId(name: string): string {
  return `demo_${name}`;
}

export const CURATED_SUBREDDITS: Subreddit[] = CURATED.map((s) => ({
  id: demoSubredditId(s.name),
  name: s.name,
  displayName: `r/${s.name}`,
  color: s.color,
}));
