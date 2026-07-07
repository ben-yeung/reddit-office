"use client";

import { useEffect, useRef } from "react";
import type { PostVideo } from "@/lib/domain/types";

interface Props {
  video: PostVideo;
  /** Preview frame shown before playback starts. */
  poster?: string;
  title: string;
  className?: string;
}

/**
 * Player for a reddit-hosted (v.redd.it) clip. Reddit serves the video and audio
 * as separate tracks, muxed back together only in the HLS playlist - so a plain
 * `<video src={fallback}>` would play silently. We attach the HLS stream with
 * hls.js (dynamically imported so it only ships when a video is actually shown),
 * using the browser's native HLS only where hls.js's MSE path is unavailable
 * (real Safari/iOS), and fall back to the progressive (muted) mp4 as a last
 * resort. Order matters: Chromium falsely reports it can play HLS natively via
 * `canPlayType`, so hls.js support must be checked *first* - otherwise the native
 * path is taken and the element errors out (SRC_NOT_SUPPORTED, play disabled).
 *
 * Converted gifs (no audio track) autoplay muted on a loop, matching Reddit.
 */
export function VideoPlayer({ video, poster, title, className }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const isGif = !video.hasAudio;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let hls: { destroy(): void } | null = null;
    let cancelled = false;

    const playFallback = () => {
      if (!cancelled) el.src = video.fallback;
    };

    if (!video.hls) {
      playFallback();
      return;
    }

    const hlsUrl = video.hls;
    import("hls.js")
      .then(({ default: Hls }) => {
        if (cancelled) return;
        if (Hls.isSupported()) {
          const inst = new Hls();
          inst.on(Hls.Events.ERROR, (_evt, data) => {
            // A fatal HLS error means the stream can't play; drop to the mp4.
            if (data.fatal) {
              inst.destroy();
              playFallback();
            }
          });
          inst.loadSource(hlsUrl);
          inst.attachMedia(el);
          hls = inst;
        } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
          el.src = hlsUrl; // native HLS (real Safari / iOS)
        } else {
          playFallback();
        }
      })
      .catch(playFallback);

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [video.hls, video.fallback]);

  const ratio = video.width > 0 && video.height > 0 ? `${video.width} / ${video.height}` : undefined;

  return (
    <video
      ref={ref}
      className={className}
      poster={poster}
      controls
      playsInline
      preload="metadata"
      loop={isGif}
      muted={isGif}
      autoPlay={isGif}
      aria-label={title}
      style={ratio ? { aspectRatio: ratio } : undefined}
    />
  );
}
