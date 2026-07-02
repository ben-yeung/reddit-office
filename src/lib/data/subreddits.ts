import type { Subreddit } from "@/lib/domain/types";

/**
 * The fixed set of mock subreddits used until real subscriptions arrive
 * (iteration 2 replaces this via the onboarding picker). Colors are chosen
 * to stay legible against the dark office floor.
 */
const SEED: Array<{ name: string; color: string }> = [
  { name: "programming", color: "#5aa9e6" },
  { name: "gaming", color: "#a06bff" },
  { name: "science", color: "#4ac26b" },
  { name: "movies", color: "#ff6f61" },
  { name: "aww", color: "#ff9ec4" },
  { name: "technology", color: "#42c8c0" },
  { name: "worldnews", color: "#e0b23c" },
  { name: "art", color: "#ef6ea8" },
  { name: "music", color: "#7c86ff" },
  { name: "food", color: "#ff8a3c" },
  { name: "space", color: "#8da0ff" },
  { name: "books", color: "#c08457" },
  { name: "pics", color: "#69c9d0" },
  { name: "askreddit", color: "#ffb14a" },
  { name: "funny", color: "#f5d442" },
  { name: "sports", color: "#5fd08a" },
];

export const MOCK_SUBREDDITS: Subreddit[] = SEED.map((s, i) => ({
  id: `t5_${String(i + 1).padStart(4, "0")}`,
  name: s.name,
  displayName: `r/${s.name}`,
  color: s.color,
}));
