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

/*
 * A controller can't go fullscreen: the browser only takes a real tap, click
 * or key, and a press of the pad is none of those. So when the Fullscreen
 * button is chosen with the pad and the browser says no, the next real tap
 * or key anywhere does it, and the button says so meanwhile.
 */
let armed = false;
const armWatchers = new Set<() => void>();
function setArmed(v: boolean) {
  armed = v;
  for (const f of armWatchers) f();
}
function armForNextTap() {
  if (armed) return;
  setArmed(true);
  const go = () => {
    window.removeEventListener("pointerup", go, true);
    window.removeEventListener("keydown", go, true);
    setArmed(false);
    void enterFullscreen();
  };
  window.addEventListener("pointerup", go, true);
  window.addEventListener("keydown", go, true);
}

export async function toggleFullscreen() {
  if (isFullscreen()) return exitFullscreen();
  if (!(await enterFullscreen())) armForNextTap();
}

/** True while fullscreen is waiting for a real tap (chosen with the controller). */
export function useFullscreenArmed() {
  const [on, setOn] = useState(armed);
  useEffect(() => {
    const f = () => setOn(armed);
    armWatchers.add(f);
    return () => {
      armWatchers.delete(f);
    };
  }, []);
  return on;
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
