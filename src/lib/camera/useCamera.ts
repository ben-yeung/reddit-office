"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Camera } from "@/lib/domain/types";
import type { Bounds } from "@/lib/data/layout";

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 3;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface Size {
  width: number;
  height: number;
}

/**
 * Pan/zoom camera over the office world (ADR-0007). Camera is a screen-space
 * `translate(x, y) scale(zoom)`, so world->screen is `screen = world*zoom + {x,y}`.
 * Zoom is anchored at a screen point so the office zooms toward the cursor.
 *
 * Pan/zoom deltas are applied to a live ref immediately and flushed to React
 * state at most once per animation frame. Pointer/wheel events can fire faster
 * than the display refreshes (coalesced moves, high-Hz mice), so this caps scene
 * re-renders at one per frame instead of one per input event.
 */
export function useCamera(initial: Camera = { x: 0, y: 0, zoom: 1 }) {
  const [camera, setCamera] = useState<Camera>(initial);
  // The authoritative, always-current camera. React state trails it by <=1 frame.
  const live = useRef<Camera>(initial);
  const raf = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (raf.current != null) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      setCamera(live.current);
    });
  }, []);

  useEffect(
    () => () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    },
    [],
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      const c = live.current;
      live.current = { ...c, x: c.x + dx, y: c.y + dy };
      flush();
    },
    [flush],
  );

  const zoomAt = useCallback(
    (screenX: number, screenY: number, factor: number) => {
      const c = live.current;
      const zoom = clamp(c.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const k = zoom / c.zoom;
      live.current = {
        zoom,
        x: screenX - (screenX - c.x) * k,
        y: screenY - (screenY - c.y) * k,
      };
      flush();
    },
    [flush],
  );

  // Direct set (e.g. programmatic jumps); keeps the live ref authoritative.
  const setCameraSynced = useCallback((next: Camera) => {
    live.current = next;
    setCamera(next);
  }, []);

  /** Frame the whole office within the viewport ("at a glance" default). */
  const fitTo = useCallback((bounds: Bounds, viewport: Size) => {
    if (!viewport.width || !viewport.height || !bounds.width || !bounds.height) return;
    const zoom = clamp(
      Math.min(viewport.width / bounds.width, viewport.height / bounds.height) * 0.92,
      MIN_ZOOM,
      MAX_ZOOM,
    );
    const cx = bounds.minX + bounds.width / 2;
    const cy = bounds.minY + bounds.height / 2;
    const next = {
      zoom,
      x: viewport.width / 2 - cx * zoom,
      y: viewport.height / 2 - cy * zoom,
    };
    live.current = next;
    setCamera(next);
  }, []);

  return { camera, setCamera: setCameraSynced, panBy, zoomAt, fitTo };
}
