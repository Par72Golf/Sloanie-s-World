import { useEffect, useRef } from "react";
import { Overlays } from "./overlays";
import { startMusic, unlockAudio } from "./audio";

export function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
      const vis = () => {
        if (document.hidden) game.stop();
        else game.start();
      };
      document.addEventListener("visibilitychange", vis);
      extra = () => {
        window.removeEventListener("resize", onResize);
        document.removeEventListener("visibilitychange", vis);
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