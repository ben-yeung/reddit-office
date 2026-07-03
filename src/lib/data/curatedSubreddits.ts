import type { Subreddit } from "@/lib/domain/types";

/**
 * The curated demo office (ADR-0009): a fixed list of iconic, SFW subreddits.
 * Hand-picked (not `/subreddits/popular`) so the unauthenticated first
 * impression is stable, always populated, and predictable. Colors are tuned to
 * stay legible against the dark office floor.
 */
const CURATED: Array<{ name: string; color: string }> = [
  { name: "aww", color: "#ff9ec4" },
  { name: "gaming", color: "#a06bff" },
  { name: "food", color: "#ff8a3c" },
  { name: "todayilearned", color: "#5aa9e6" },
  { name: "interestingasfuck", color: "#42c8c0" },
  { name: "oddlysatisfying", color: "#7c86ff" },
  { name: "MadeMeSmile", color: "#f5d442" },
  { name: "dataisbeautiful", color: "#69c9d0" },
  { name: "NatureIsFuckingLit", color: "#4ac26b" },
  { name: "explainlikeimfive", color: "#e0b23c" },
  { name: "funny", color: "#ff6f61" },
  { name: "pics", color: "#8da0ff" },
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
