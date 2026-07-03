"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Freeze-the-background coordination for modals.
 *
 * When a modal is open, its blurred backdrop covers the office. `backdrop-filter`
 * re-samples whatever is behind it, so any motion back there (the ~70 worker idle
 * bobs, the ambient NPCs) forces the browser to re-blur the whole viewport every
 * frame - free on the GPU, but brutal on the CPU when hardware acceleration is
 * off, and the dominant source of modal-animation jank. Freezing all background
 * motion while a modal is up lets the blur rasterize once and stay cached.
 *
 * The pause is ref-counted so overlapping modals compose, and a modal holds its
 * pause for its entire mounted life. Since AnimatePresence keeps a modal mounted
 * until its exit animation completes, the freeze spans entrance, open, and exit -
 * so the closing animation stays smooth too, not just the opening one.
 */

const PausedContext = createContext(false);
// Split so the acquire fn keeps a stable identity even as the count changes;
// otherwise the acquiring effect would re-run in a release/re-acquire loop.
const PauseControlContext = createContext<(() => () => void) | null>(null);

export function BackgroundMotionProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  const acquire = useCallback(() => {
    setCount((c) => c + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setCount((c) => c - 1);
    };
  }, []);

  return (
    <PauseControlContext.Provider value={acquire}>
      <PausedContext.Provider value={count > 0}>{children}</PausedContext.Provider>
    </PauseControlContext.Provider>
  );
}

/** True while any modal has asked the office background to hold still. */
export function useBackgroundMotionPaused(): boolean {
  return useContext(PausedContext);
}

/**
 * Freeze office background motion for as long as the calling component stays
 * mounted. Call this from a modal; the pause releases automatically on unmount.
 */
export function usePauseBackgroundMotion(): void {
  // `acquire` is a stable useCallback from the provider, so this effect runs once
  // on mount and its cleanup (the returned release fn) runs once on unmount.
  const acquire = useContext(PauseControlContext);
  useEffect(() => acquire?.(), [acquire]);
}
