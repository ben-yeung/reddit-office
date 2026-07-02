/** A small hand-rolled Reddit "Snoo" mark (no icon dependency). */
export function RedditGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" fill="none">
      <circle cx="10" cy="11.5" r="7.5" fill="#fff" />
      {/* antenna */}
      <path d="M10 4.5 L12.5 2.2" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="12.9" cy="2" r="1.4" fill="#fff" />
      {/* eyes */}
      <circle cx="7" cy="11" r="1.4" fill="var(--accent)" />
      <circle cx="13" cy="11" r="1.4" fill="var(--accent)" />
      {/* smile */}
      <path
        d="M6.6 13.6 Q10 16 13.4 13.6"
        stroke="var(--accent)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
