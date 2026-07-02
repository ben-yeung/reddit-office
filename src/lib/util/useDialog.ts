"use client";

import { useEffect, useRef } from "react";

/**
 * Accessibility + interaction plumbing shared by modals. On open it focuses the
 * dialog and locks background scroll; on close it restores focus to whatever was
 * focused before. Escape invokes `onClose`. Modals should also be portaled to
 * `document.body` so their pointer/wheel events never reach the pannable office
 * stage behind them.
 */
export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    ref.current?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return ref;
}
