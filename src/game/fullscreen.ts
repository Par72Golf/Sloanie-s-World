import { useEffect, useState } from "react";

/**
 * Fullscreen helpers. Browsers only grant fullscreen from a real user gesture
 * (click, key, touch). A click synthesised from gamepad polling does not
 * count, so on the TV one trackpad click on Start is needed once; after that
 * the controller does everything.
 */

type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

export function canFullscreen() {
  if (typeof document === "undefined") return false;
  const el = document.documentElement as FsEl;
  return Boolean(document.fullscreenEnabled || el.webkitRequestFullscreen);
}

export function isFullscreen() {
  if (typeof document === "undefined") return false;
  const d = document as FsDoc;
  return Boolean(d.fullscreenElement || d.webkitFullscreenElement);
}

/** Resolves false when the browser refuses (no gesture, iframe policy, iOS). */
export async function enterFullscreen(): Promise<boolean> {
  if (!canFullscreen() || isFullscreen()) return isFullscreen();
  const el = document.documentElement as FsEl;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    return isFullscreen();
  } catch {
    return false;
  }
}

export async function exitFullscreen() {
  const d = document as FsDoc;
  try {
    if (document.exitFullscreen && d.fullscreenElement) await document.exitFullscreen();
    else if (d.webkitExitFullscreen && d.webkitFullscreenElement) await d.webkitExitFullscreen();
  } catch {
    /* already out */
  }
}

export function toggleFullscreen() {
  return isFullscreen() ? exitFullscreen() : enterFullscreen();
}

/** Current fullscreen state, updated on the browser's change events. */
export function useFullscreen() {
  const [on, setOn] = useState(isFullscreen());
  useEffect(() => {
    const sync = () => setOn(isFullscreen());
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);
  return on;
}
