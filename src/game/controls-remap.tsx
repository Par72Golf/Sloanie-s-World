import { useEffect, useRef, useState } from "react";
import { Gamepad2, Keyboard, Lock, RotateCcw, Check, X } from "lucide-react";
import { sfx } from "./audio";
import {
  ACTIONS,
  KEY_RESERVED,
  PAD_RESERVED,
  keyName,
  padName,
  useBindings,
  type Action,
} from "./bindings";
import { activePad, claimPad } from "./input";
import { Btn } from "./overlays";
import { useGame } from "./store";
import { cn } from "@/lib/utils";

/**
 * Change which button or key does each play action. Pick a row, then press
 * the new button (or key). Whatever already had that button swaps over, so
 * nothing is ever left without a control. Moving and the menu buttons are
 * fixed and listed at the bottom, so no layout can lock anyone out.
 */

type Device = "pad" | "keys";
const LISTEN_MS = 7000;

// Esc closes this screen through input.ts, which decides Esc for every screen
const firstPad = activePad;

export function ControlsRemap() {
  const close = () => useGame.getState().setControls(false);
  const pad = useBindings((s) => s.pad);
  const keys = useBindings((s) => s.keys);
  const [device, setDevice] = useState<Device>(() => (firstPad() ? "pad" : "keys"));
  const [listening, setListening] = useState<Action | null>(null);
  const [pressed, setPressed] = useState<number[]>([]);
  const [flash, setFlash] = useState<Action | null>(null);
  const listenStart = useRef(0);

  // show which buttons are down right now, so she can see what each one does
  useEffect(() => {
    let raf = 0;
    let last = "";
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const p = firstPad();
      const now: number[] = [];
      if (p) p.buttons.forEach((b, i) => b.pressed && now.push(i));
      const key = now.join(",");
      if (key !== last) {
        last = key;
        setPressed(now);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // waiting for the new button: the pad belongs to this screen until then
  useEffect(() => {
    if (!listening) return;
    listenStart.current = performance.now();
    const release = claimPad();
    const done = (ok: boolean) => {
      if (ok) {
        sfx.correct();
        setFlash(listening);
        window.setTimeout(() => setFlash(null), 900);
      } else sfx.click();
      setListening(null);
    };

    let raf = 0;
    let cleared = false;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (performance.now() - listenStart.current > LISTEN_MS) return done(false);
      if (device !== "pad") return;
      const p = firstPad();
      if (!p) return;
      const down = p.buttons.map((b, i) => (b.pressed ? i : -1)).filter((i) => i >= 0);
      // the press that chose this row has to let go first
      if (!cleared) {
        if (down.length === 0) cleared = true;
        return;
      }
      const b = down.find((i) => !PAD_RESERVED.has(i));
      if (b != null) {
        useBindings.getState().setPad(listening, b);
        done(true);
      }
    };
    raf = requestAnimationFrame(loop);

    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (e.code === "Escape") return done(false);
      if (device !== "keys") return;
      if (KEY_RESERVED.has(e.code)) {
        sfx.wrong();
        return;
      }
      useBindings.getState().setKey(listening, e.code);
      done(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey, true);
      release();
    };
  }, [listening, device]);

  const binding = (a: Action) =>
    device === "pad" ? [padName(pad[a])] : keys[a].map(keyName);

  return (
    <div
      className="ui-backdrop animate-ui-fade pointer-events-auto absolute inset-0 z-40 flex items-center justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      onClick={() => !listening && close()}
    >
      <div
        className="chunk animate-ui-pop flex max-h-full w-full max-w-4xl flex-col overflow-hidden bg-surface text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-ribbon flex items-center gap-3 bg-accent-2 px-4 py-3 text-white sm:px-5">
          <span className="gloss grid size-11 shrink-0 place-items-center rounded-full border-[3px] border-edge bg-white text-accent-2">
            <Gamepad2 className="size-6" strokeWidth={2.4} />
          </span>
          <h2 className="flex-1 font-display text-2xl font-semibold [text-shadow:0_2px_0_rgb(0_0_0/0.2)] sm:text-3xl">
            Controls
          </h2>
          <button
            type="button"
            aria-label="Close controls"
            onClick={close}
            className="press grid size-12 place-items-center rounded-full border-[3px] border-edge bg-white text-ink"
          >
            <X className="size-6" strokeWidth={2.6} />
          </button>
        </div>

        <div className="ui-dots min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {(["pad", "keys"] as Device[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  sfx.click();
                  setListening(null);
                  setDevice(d);
                }}
                className={cn(
                  "press chunk-sm flex min-h-12 items-center gap-2 px-4 font-display text-lg font-semibold",
                  device === d ? "gloss bg-accent-2 text-white" : "bg-surface text-ink",
                )}
              >
                {d === "pad" ? <Gamepad2 className="size-5" /> : <Keyboard className="size-5" />}
                {d === "pad" ? "Controller" : "Keyboard"}
              </button>
            ))}
            <p className="ml-auto text-base font-semibold text-ink-soft">
              Pick one, then press the new {device === "pad" ? "button" : "key"}.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {ACTIONS.map(({ id, label, detail }) => {
              const live = device === "pad" && pressed.includes(pad[id]);
              const waiting = listening === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    sfx.click();
                    setListening(waiting ? null : id);
                  }}
                  className={cn(
                    "press chunk-sm flex min-h-16 items-center gap-3 px-3 py-2 text-left",
                    waiting ? "gloss bg-sun" : live ? "bg-surface-3" : flash === id ? "bg-[#e3f7ee]" : "bg-surface",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-xl font-semibold leading-tight">{label}</span>
                    <span className="block truncate text-sm font-semibold text-ink-soft">
                      {waiting ? `Press a ${device === "pad" ? "button" : "key"} now…` : detail}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {waiting ? (
                      <span className="ui-chip animate-pulse bg-white text-lg">?</span>
                    ) : (
                      binding(id).map((b) => (
                        <span key={b} className={cn("ui-chip text-lg", live ? "bg-sun" : "bg-surface-2")}>
                          {b}
                        </span>
                      ))
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-[1.1rem] border-[3px] border-line bg-surface p-3">
            <p className="mb-2 flex items-center gap-2 font-display text-lg font-semibold text-ink-soft">
              <Lock className="size-4" /> Always the same
            </p>
            <ul className="grid gap-x-4 gap-y-1 text-base font-semibold text-ink-soft sm:grid-cols-2">
              <li>Move: left stick, d-pad, WASD or arrow keys</li>
              <li>Look around: right stick or drag</li>
              <li>In menus: A to choose, B to go back</li>
              <li>Keyboard menus: Enter to choose, Esc to go back</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t-[3px] border-line bg-surface-2 px-3 py-3 sm:px-5">
          <Btn
            variant="secondary"
            onClick={() => {
              sfx.click();
              setListening(null);
              useBindings.getState().resetDefaults();
            }}
          >
            <RotateCcw className="size-5" /> Reset to normal
          </Btn>
          <Btn variant="go" onClick={close} className="min-w-36">
            <Check className="size-5" strokeWidth={3} /> Done
          </Btn>
        </div>
      </div>
    </div>
  );
}
