/**
 * Reddit lets subreddits attach custom "snoo" emojis to flair (and titles),
 * which arrive from the API as shortcodes like `:snoo_hearteyes:`. Those map to
 * per-subreddit image assets we can't render inline, so translate the common
 * ones to their nearest plain-unicode equivalent - e.g.
 *   `:snoo_hearteyes: Wholesome Moments :snoo_simple_smile:` -> `😍 Wholesome Moments 🙂`
 * and drop any unrecognized snoo codes so a tag never leaks a raw `:snoo_...:`.
 */

/** Shortcode (without the surrounding colons) -> unicode emoji. */
const EMOJI: Record<string, string> = {
  // Snoo faces (the alien mascot and its expression set).
  snoo: "👽",
  snoo_smile: "🙂",
  snoo_simple_smile: "🙂",
  snoo_hearteyes: "😍",
  snoo_heart_eyes: "😍",
  snoo_heart: "❤️",
  snoo_love: "😍",
  snoo_wink: "😉",
  snoo_tongue: "😛",
  snoo_joy: "😂",
  snoo_laughing: "😂",
  snoo_thumbsup: "👍",
  snoo_thumbs_up: "👍",
  snoo_thumbsdown: "👎",
  snoo_sad: "😢",
  snoo_cry: "😭",
  snoo_biblethump: "😭",
  snoo_angry: "😠",
  snoo_rage: "😡",
  snoo_scream: "😱",
  snoo_surprised: "😮",
  snoo_wow: "😮",
  snoo_shock: "😲",
  snoo_thoughtful: "🤔",
  snoo_think: "🤔",
  snoo_hmm: "🤔",
  snoo_facepalm: "🤦",
  snoo_shrug: "🤷",
  snoo_putback: "🤷",
  snoo_dealwithit: "😎",
  snoo_cool: "😎",
  snoo_sunglasses: "😎",
  snoo_disapproval: "😒",
  snoo_unamused: "😒",
  snoo_confused: "😕",
  snoo_feelsgoodman: "😌",
  snoo_feelsbadman: "😞",
  snoo_trollface: "😈",
  snoo_evil: "😈",
  snoo_wholesome: "🥰",
  snoo_hug: "🤗",
  snoo_dizzy: "😵",
  snoo_sleep: "😴",
  snoo_sleepy: "😴",
  snoo_yum: "😋",
  snoo_salute: "🫡",
  snoo_wave: "👋",
  snoo_clap: "👏",
  snoo_ok: "👌",
  snoo_pray: "🙏",
  snoo_fire: "🔥",
  snoo_star: "⭐",
  snoo_100: "💯",
  snoo_party: "🎉",
  // Common non-snoo custom flair shortcodes seen across the curated subs.
  upvote: "⬆️",
  downvote: "⬇️",
  cake: "🎂",
  cakeday: "🎂",
  redditgold: "🏅",
  partyparrot: "🦜",
  tableflip: "😤",
  table_flip: "😤",
  sloth: "🦥",
  orly: "🦉",
  smilingface: "🙂",
  smilingface2: "🙂",
  heart: "❤️",
  heart_eyes: "😍",
  star: "⭐",
  fire: "🔥",
  paw: "🐾",
  paws: "🐾",
};

/** `:code:` where code is letters/digits/underscores (matches emoji shortcodes). */
const SHORTCODE = /:([a-z0-9_]+):/gi;

/**
 * Replace known emoji shortcodes with unicode emoji.
 *
 * `stripUnknown` controls what happens to codes we don't recognize. In flair
 * (`stripUnknown: true`) every `:token:` is a custom subreddit emoji, so unknown
 * ones are dropped rather than left as broken literals. In free text like titles
 * (the default) only unknown *snoo* codes are dropped; other `:token:` sequences
 * (times like `8:00`, ratios, unrelated shortcodes) are left untouched.
 */
export function renderRedditEmoji(text: string, stripUnknown = false): string {
  if (!text || !text.includes(":")) return text;
  const out = text.replace(SHORTCODE, (full, code: string) => {
    const key = code.toLowerCase();
    if (key in EMOJI) return EMOJI[key];
    if (stripUnknown || key.startsWith("snoo")) return "";
    return full;
  });
  // Tidy up spacing left behind by any dropped codes.
  return out.replace(/\s{2,}/g, " ").trim();
}
