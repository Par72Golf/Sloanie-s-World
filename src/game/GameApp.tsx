import { useEffect, useRef } from "react";
import { Overlays } from "./overlays";
import { resumeAudio, startMusic, suspendAudio, unlockAudio } from "./audio";
import { useGame } from "./store";

export function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /*
   * ?preview unlocks every park for a look round, without touching her save:
   * it is how a half-built park gets tested before it is finished. The unlock
   * is only in memory — the store writes her real save on its own schedule, so
   * this flag never makes it to disk unless she plays and saves anyway.
   */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const building = q.has("preview") || q.has("fly");
    if (!building) return;
    if (useGame.getState().unlocked < 2) useGame.setState({ unlocked: 2 });
    if (q.has("fly")) useGame.setState({ fly: true });
    // F flies and lands. Only while building, so a stray F in the park does
    // nothing, and never while she is typing her name into the explorer card.
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyF" || e.repeat) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      useGame.getState().setFly(!useGame.getState().fly);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let rt: { start: () => void; stop: () => void; dispose: () => void; resize: () => void } | null =
      null;
    let extra = () => {};

    const onFirst = () => {
      unlockAudio();
      startMusic();
    };
    window.addEventListener("pointerdown", onFirst, { once: true });
    window.addEventListener("keydown", onFirst, { once: true });

    void import("./runtime").then(({ GameRuntime }) => {
      if (cancelled || !canvasRef.current) return;
      const game = new GameRuntime(canvasRef.current);
      rt = game;
      game.start();
      const onResize = () => game.resize();
      window.addEventListener("resize", onResize);
      /*
       * Away from the game (another app, another tab, the phone locking): the
       * loop stops, the sound stops with it, and the screen is allowed to
       * sleep again. Coming back picks all three up.
       */
      let wake: WakeLockSentinel | null = null;
      const keepAwake = async () => {
        // only while she is actually playing, and only where it exists
        if (document.hidden || wake) return;
        try {
          wake = (await navigator.wakeLock?.request("screen")) ?? null;
          wake?.addEventListener("release", () => {
            wake = null;
          });
        } catch {
          /* denied, unsupported, or not allowed yet: the screen just sleeps */
        }
      };
      const letSleep = () => {
        void wake?.release().catch(() => {});
        wake = null;
      };
      const vis = () => {
        if (document.hidden) {
          game.stop();
          suspendAudio();
          letSleep();
        } else {
          game.start();
          resumeAudio();
          void keepAwake();
        }
      };
      document.addEventListener("visibilitychange", vis);
      // the first tap unlocks audio; it is also the gesture that lets a phone
      // keep its screen on
      window.addEventListener("pointerdown", keepAwake, { once: true });
      window.addEventListener("keydown", keepAwake, { once: true });
      extra = () => {
        window.removeEventListener("resize", onResize);
        document.removeEventListener("visibilitychange", vis);
        window.removeEventListener("pointerdown", keepAwake);
        window.removeEventListener("keydown", keepAwake);
        letSleep();
      };
    });

    return () => {
      cancelled = true;
      extra();
      rt?.dispose();
      window.removeEventListener("pointerdown", onFirst);
      window.removeEventListener("keydown", onFirst);
    };
  }, []);

  return (
    <div className="game-shell">
      <canvas ref={canvasRef} className="game-canvas" />
      <Overlays />
    </div>
  );
}