/**
 * Frame-time recorder and hitch log, read by the debug overlay when the page
 * is opened with ?debug=1. The game loop writes into this plain object every
 * frame (never into the store, which would re-render the HUD 60 times a
 * second); the overlay samples it on its own timer.
 */

export type Hitch = {
  /** seconds since the run started */
  at: number;
  /** frame time in ms */
  ms: number;
  /** what the game was doing */
  note: string;
};

export const perf = {
  /** last frame time, ms */
  frameMs: 0,
  /** worst frame in the current one-second window, ms */
  worstMs: 0,
  /** frames per second over the last window */
  fps: 0,
  /** frames over HITCH_MS, most recent last, capped */
  hitches: [] as Hitch[],
  /** draw calls and triangles from the last frame */
  calls: 0,
  triangles: 0,
  /** live confetti puff count */
  puffs: 0,
  /** JS heap in MB if the browser reports it */
  heapMB: 0,
  /**
   * Average time the game's own code took per frame over the last window, ms:
   * physics, animation, HUD and issuing the draw calls. If frames are slow but
   * this is small, the GPU is the bottleneck; if it is close to the frame
   * time, the CPU is.
   */
  cpuMs: 0,
  /** drawing buffer size in real pixels, and the pixel ratio behind it */
  bufW: 0,
  bufH: 0,
  pixelRatio: 1,
};

export const HITCH_MS = 120;

let windowStart = 0;
let windowFrames = 0;
let windowWorst = 0;
let windowCpu = 0;

export function recordFrame(nowMs: number, frameMs: number, cpuMs: number, note: () => string) {
  perf.frameMs = frameMs;
  windowFrames++;
  windowWorst = Math.max(windowWorst, frameMs);
  windowCpu += cpuMs;
  if (nowMs - windowStart >= 1000) {
    perf.fps = Math.round((windowFrames * 1000) / Math.max(1, nowMs - windowStart));
    perf.worstMs = Math.round(windowWorst);
    perf.cpuMs = Math.round((windowCpu / Math.max(1, windowFrames)) * 10) / 10;
    windowStart = nowMs;
    windowFrames = 0;
    windowWorst = 0;
    windowCpu = 0;
  }
  if (frameMs >= HITCH_MS) {
    perf.hitches.push({ at: Math.round(nowMs / 100) / 10, ms: Math.round(frameMs), note: note() });
    if (perf.hitches.length > 12) perf.hitches.shift();
  }
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  if (mem) perf.heapMB = Math.round(mem.usedJSHeapSize / 1048576);
}

export function debugEnabled() {
  return typeof location !== "undefined" && new URLSearchParams(location.search).has("debug");
}
