import { useEffect, useRef } from "react";
import { Coffee, LogOut, Ticket } from "lucide-react";
import { sfx } from "./audio";
import { ModalFrame, PadKey, PanelRibbon, useInput } from "./carnival-games";
import { HearButton } from "./help-cards";
import { claimPad } from "./input";
import { TOSS, tossInput, tossPose, useToss } from "./marshmallow-toss";
import { Btn } from "./overlays";
import { speak } from "./speech";
import { cn } from "@/lib/utils";

/**
 * Marshmallow Toss: the throwing HUD and the tray at the end.
 *
 * A thin HUD, not a panel — the game is the park. While she is throwing this
 * overlay owns the controls (hold A / Space / the big button to fill the
 * meter, let go to throw, B or Quit to leave) and claims the pad so A never
 * also jumps or collects.
 *
 * Nothing here re-renders per frame. The meter, the marshmallows left and the
 * three mug lights are written straight into the DOM from `tossPose` on this
 * overlay's own animation frame, the same trick mini golf and the minimap use.
 *
 * The meter carries a target band: the green stripe is the hold that lands in
 * the mug she is on, and the notch is the middle of it. The measured windows
 * are 406ms, 343ms and 276ms (tools/toss.ts), so the band is a real target and
 * not a decoration — she can learn where it is and hit it again.
 */

function ThrowingHud() {
  const meter = useRef<HTMLDivElement>(null);
  const meterWrap = useRef<HTMLDivElement>(null);
  const band = useRef<HTMLDivElement>(null);
  const notch = useRef<HTMLDivElement>(null);
  const leftT = useRef<HTMLSpanElement>(null);
  const distT = useRef<HTMLSpanElement>(null);
  const lights = useRef<(HTMLSpanElement | null)[]>([]);
  const pips = useRef<(HTMLSpanElement | null)[]>([]);
  const hint = useRef<HTMLParagraphElement>(null);

  /**
   * Touch: the big button. Latched for a few frames rather than read live,
   * because a quick tap can put its pointerdown and pointerup inside one
   * animation frame and the throw would never have happened at all.
   */
  const touchCharge = useRef({ down: false, latch: 0 });

  // the pad belongs to this screen for as long as it is up
  useEffect(() => claimPad(), []);

  useEffect(() => {
    let raf = 0;
    // whatever was held when the go began (the Collect press) does not count
    let armedA = false;
    let armedB = false;
    let lastTarget = -2;
    const keys = { charge: false };

    const onKey = (e: KeyboardEvent, down: boolean) => {
      let used = true;
      if (e.code === "Space" || e.code === "Enter") keys.charge = down;
      else if (e.code === "Escape" || e.code === "KeyB") {
        if (down) tossInput.quit = true;
      } else used = false;
      if (used) e.preventDefault();
    };
    const down = (e: KeyboardEvent) => onKey(e, true);
    const up = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    const loop = () => {
      raf = window.requestAnimationFrame(loop);
      const pad = (navigator.getGamepads?.() ?? []).find((p) => p && p.buttons.length > 0);
      let charge = keys.charge;
      if (pad) {
        const a = Boolean(pad.buttons[0]?.pressed);
        const b = Boolean(pad.buttons[1]?.pressed);
        if (!a) armedA = true;
        if (!b) armedB = true;
        if (armedA && a) charge = true;
        if (armedB && b) tossInput.quit = true;
      }
      const tc = touchCharge.current;
      tossInput.charge = charge || tc.down || tc.latch > 0;
      if (!tc.down && tc.latch > 0) tc.latch--;

      // paint
      const p = tossPose;
      if (meter.current) meter.current.style.height = `${Math.round(p.power * 100)}%`;
      if (meterWrap.current) meterWrap.current.style.opacity = p.state === "charge" ? "1" : "0.6";
      if (leftT.current) leftT.current.textContent = String(p.left);
      for (let i = 0; i < 3; i++) {
        const pip = pips.current[i];
        if (pip) pip.style.opacity = i < p.left ? "1" : "0.18";
        const light = lights.current[i];
        if (light) {
          light.dataset.on = p.filled[i] ? "yes" : "no";
          light.dataset.aim = p.target === i ? "yes" : "no";
        }
      }
      if (p.target !== lastTarget) {
        lastTarget = p.target;
        const d = p.target >= 0 ? TOSS.mugD[p.target] : null;
        if (distT.current) distT.current.textContent = d == null ? "all full!" : `${d}m away`;
        if (hint.current) {
          hint.current.textContent =
            p.target < 0 ? "Every mug is full!" : `Mug ${p.target + 1} is next — fill the meter to the green.`;
        }
        // the band and the notch only move when the mug does
        const half = Math.max(0.03, p.targetBand * 0.9);
        if (band.current) {
          band.current.style.bottom = `${Math.max(0, (p.targetPower - half) * 100)}%`;
          band.current.style.height = `${Math.min(100, half * 200)}%`;
          band.current.style.opacity = p.target < 0 ? "0" : "1";
        }
        if (notch.current) {
          notch.current.style.bottom = `${p.targetPower * 100}%`;
          notch.current.style.opacity = p.target < 0 ? "0" : "1";
        }
      }
    };
    raf = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      tossInput.charge = false;
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-30 select-none">
      {/* scoreboard, top left, big enough to read from the sofa */}
      <div className="absolute left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] flex flex-col gap-2">
        <div className="ui-glass flex items-center gap-3 px-3 py-2 2xl:gap-4 2xl:px-4">
          <span className="ui-gem size-10 shrink-0 text-ink 2xl:size-12" style={{ ["--gem" as string]: "var(--color-topaz)" }}>
            <Coffee className="size-5 2xl:size-6" strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-xl font-bold leading-none text-ink 2xl:text-3xl">Marshmallow Toss</p>
            <p ref={hint} className="text-sm font-semibold leading-tight text-ink-soft 2xl:text-lg">
              Mug 1 is next — fill the meter to the green.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* the three mugs, lighting up as they fill */}
          <span className="ui-chip gloss flex items-center gap-1.5 bg-surface px-3 py-1 text-base text-ink 2xl:text-xl">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                ref={(el) => {
                  lights.current[i] = el;
                }}
                data-on="no"
                data-aim={i === 0 ? "yes" : "no"}
                className="grid size-6 place-items-center rounded-full border-[3px] border-edge/40 bg-surface-3 text-transparent transition-colors 2xl:size-7 data-[aim=yes]:border-accent data-[on=yes]:border-teal data-[on=yes]:bg-teal data-[on=yes]:text-white"
              >
                <Coffee className="size-3.5" strokeWidth={3} />
              </span>
            ))}
          </span>
          {/* the marshmallows she has left */}
          <span className="ui-chip gloss flex items-center gap-1.5 bg-surface px-3 py-1 text-base text-ink 2xl:text-xl">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                ref={(el) => {
                  pips.current[i] = el;
                }}
                className="size-5 rounded-md bg-[#ff93c4] shadow-[0_2px_0_rgba(0,0,0,0.18)] transition-opacity 2xl:size-6"
              />
            ))}
            <b ref={leftT} className="ml-1">
              3
            </b>
          </span>
          <span className="ui-chip gloss bg-sun px-3 py-1 text-base text-ink 2xl:text-xl">
            <span ref={distT}>{TOSS.mugD[0]}m away</span>
          </span>
        </div>
      </div>

      {/* leave, top right, always available */}
      <button
        type="button"
        onClick={() => {
          tossInput.quit = true;
        }}
        className="press chunk-sm gloss pointer-events-auto absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] flex min-h-12 items-center gap-2 bg-surface px-4 font-display text-lg font-semibold text-ink 2xl:text-xl"
      >
        <LogOut className="size-5" strokeWidth={2.5} /> Quit
      </button>

      {/* the controls, along the bottom */}
      <div className="absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] flex flex-col gap-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]">
        <p className="mx-auto w-fit max-w-full rounded-full bg-surface/85 px-3 py-0.5 text-center text-sm font-semibold text-ink [@media(max-height:560px)]:hidden sm:text-base">
          hold <PadKey>A</PadKey> to swing the arc out, let go to throw
          <span className="hidden sm:inline">
            {" "}
            &middot; <PadKey>B</PadKey> to leave
          </span>
        </p>
        <div className="flex items-end justify-end gap-3">
          <div className="pointer-events-auto flex items-end gap-3">
            {/* the power meter: the green band is where this mug wants it */}
            <div
              ref={meterWrap}
              className="chunk relative h-32 w-10 overflow-hidden bg-surface-2 transition-opacity sm:h-40 sm:w-11 2xl:h-48 2xl:w-14"
              aria-hidden
            >
              <div
                ref={meter}
                className="absolute inset-x-0 bottom-0 h-0"
                style={{ background: "linear-gradient(to top, #6fe3c4 0%, #ffc83a 55%, #e8384f 100%)" }}
              />
              <div ref={band} className="absolute inset-x-0 bg-white/45 ring-2 ring-inset ring-[#17b47a]" style={{ bottom: "0%", height: "14%" }} />
              <div ref={notch} className="absolute inset-x-0 h-1 -translate-y-1/2 bg-[#17b47a]" style={{ bottom: "15%" }} />
            </div>
            <button
              type="button"
              aria-label="Hold to throw"
              onPointerDown={(e) => {
                e.preventDefault();
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                touchCharge.current = { down: true, latch: 3 };
              }}
              onPointerUp={() => {
                touchCharge.current.down = false;
              }}
              onPointerCancel={() => {
                touchCharge.current.down = false;
              }}
              onPointerLeave={() => {
                touchCharge.current.down = false;
              }}
              className="press chunk gloss ui-shimmer grid size-24 place-items-center bg-accent text-center font-display text-2xl font-bold leading-none text-accent-fg sm:size-28 2xl:size-32 2xl:text-3xl"
            >
              THROW
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- the tray */

const THROW_WORD = { in: "In!", miss: "Missed", tip: "Knocked it over!" } as const;

function Tray() {
  const card = useToss((s) => s.card);
  const setCard = useToss((s) => s.setCard);
  const done = () => {
    sfx.click();
    setCard(null);
  };
  // The last throw is a released A, and releasing it is what threw it. Without
  // this the tray opened and closed in the same breath, the same trap the
  // carnival results screens have.
  const shownAt = useRef(0);
  useEffect(() => {
    if (card) shownAt.current = performance.now();
  }, [card]);
  useInput((e) => {
    if ((e === "a" || e === "b") && performance.now() - shownAt.current > 800) done();
  }, !!card);
  const spoken =
    card && `${card.mugs} mug${card.mugs === 1 ? "" : "s"} out of three. ${card.line} Plus ${card.tickets} ticket${card.tickets === 1 ? "" : "s"}.`;
  useEffect(() => {
    if (spoken) speak(spoken);
  }, [spoken]);
  if (!card) return null;
  return (
    <ModalFrame className="max-w-lg lg:max-w-xl">
      <PanelRibbon color="#ff6aa8" Icon={Coffee} title="Hot chocolate!" onClose={done} closeLabel="Done" padSkip pattern="gingham" />
      <div className="ui-dots grid gap-4 p-4 sm:p-6">
        <div className="animate-ui-rise grid grid-cols-3 gap-2 sm:gap-3">
          {[0, 1, 2].map((i) => {
            const t = card.throws[i];
            return (
              <div key={i} className="grid justify-items-center gap-1">
                <span className="text-xs font-bold text-ink-soft sm:text-sm">Throw {i + 1}</span>
                <span
                  className={cn(
                    "chunk-sm gloss grid h-16 w-full place-items-center px-1 text-center font-display text-base font-bold leading-tight sm:h-20 sm:text-lg",
                    t === "in" ? "bg-teal text-white" : t === "tip" ? "bg-sun text-ink" : "bg-surface-3 text-ink",
                  )}
                >
                  {t ? THROW_WORD[t] : "—"}
                </span>
              </div>
            );
          })}
        </div>

        <div className="animate-ui-rise flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "60ms" }}>
          <span className="ui-chip gloss bg-accent px-5 py-1.5 font-display text-2xl text-accent-fg sm:text-3xl">
            {card.mugs} of 3 mugs
          </span>
        </div>

        <div className="animate-ui-rise flex flex-wrap items-start gap-3" style={{ animationDelay: "120ms" }}>
          <p className="min-w-[12rem] flex-1 text-2xl font-semibold leading-snug text-ink">{card.line}</p>
          <HearButton text={spoken ?? ""} className="press min-h-12 shrink-0" />
        </div>

        <p className="ui-chip animate-ui-pop gloss mx-auto gap-2 bg-sun px-5 py-1.5 text-2xl text-ink">
          <Ticket className="size-7" strokeWidth={2.5} /> +{card.tickets} ticket{card.tickets === 1 ? "" : "s"}!
        </p>

        <Btn onClick={done} padDefault className="min-h-14 w-full text-2xl">
          Done
        </Btn>
        <p className="text-center text-base font-semibold text-ink-soft">
          <PadKey>A</PadKey> to close &middot; stand at the counter for another go
        </p>
      </div>
    </ModalFrame>
  );
}

/** Everything the booth puts on the screen. */
export function TossOverlay() {
  const playing = useToss((s) => s.playing);
  const card = useToss((s) => s.card);
  return (
    <>
      {playing && <ThrowingHud />}
      {card && <Tray />}
    </>
  );
}
