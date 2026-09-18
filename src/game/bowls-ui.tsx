import { useEffect, useRef } from "react";
import { CircleDot, LogOut, Star, Ticket, Trophy } from "lucide-react";
import { sfx } from "./audio";
import { AIM_LIMIT, BOWLS, PIN_SPOTS, bowlsInput, bowlsPose } from "./bowls";
import { ModalFrame, PadKey, PanelRibbon, useInput } from "./carnival-games";
import { HearButton } from "./help-cards";
import { claimPad } from "./input";
import { speak } from "./speech";
import { Btn } from "./overlays";
import { useGame } from "./store";
import { cn } from "@/lib/utils";

/**
 * The bowling screen and the scorecard.
 *
 * While she is bowling the game loop is frozen, so this overlay owns the
 * controls, and one button does the whole shot: the arrow swings from side to
 * side by itself, A / Space / a tap on the green / the big button stops it,
 * and the same button held again fills the power meter and lets go to bowl.
 * B, Esc or Quit leaves at any step. It claims the pad, so A never also jumps
 * or collects.
 *
 * There is deliberately no left and right: nudging the arrow and timing the
 * arrow are two different games, and having both on screen taught her to
 * ignore the swing.
 *
 * Nothing here re-renders per frame: the meter, the aim, the turn and the
 * nine pin lamps are written straight into the DOM from `bowlsPose` on this
 * overlay's own animation frame, the same trick the minimap uses.
 */

/* -------------------------------------------------- the nine pin lamps */

/**
 * The diamond, drawn from the same `PIN_SPOTS` the physics uses, so the HUD
 * can never show a pin where there isn't one. Lane-local +z is towards the
 * mat, which on screen is down, so z is flipped.
 */
function pinLayout() {
  const xs = PIN_SPOTS.map((p) => p[0]);
  const zs = PIN_SPOTS.map((p) => p[1]);
  const spanX = Math.max(...xs) - Math.min(...xs) || 1;
  const spanZ = Math.max(...zs) - Math.min(...zs) || 1;
  return PIN_SPOTS.map(([x, z]) => ({
    left: ((x - Math.min(...xs)) / spanX) * 100,
    top: ((Math.max(...zs) - z) / spanZ) * 100,
  }));
}
const LAMPS = pinLayout();

/** What to tell her at each step, painted from the pose. */
const HINT: Record<string, string> = {
  sweep: "Stop the arrow when it points straight!",
  set: "Now hold for power, let go to bowl",
  charge: "Let go to bowl!",
  roll: "Here it goes!",
  tally: "",
};

/* ------------------------------------------------------------- bowling */

function BowlingHud() {
  const meter = useRef<HTMLDivElement>(null);
  const meterWrap = useRef<HTMLDivElement>(null);
  const turnT = useRef<HTMLSpanElement>(null);
  const bowlT = useRef<HTMLSpanElement>(null);
  const totalT = useRef<HTMLSpanElement>(null);
  const laneT = useRef<HTMLParagraphElement>(null);
  const aimT = useRef<HTMLDivElement>(null);
  const dialT = useRef<HTMLDivElement>(null);
  const hintT = useRef<HTMLParagraphElement>(null);
  const bigT = useRef<HTMLButtonElement>(null);
  const lamps = useRef<(HTMLSpanElement | null)[]>([]);

  /**
   * Touch: the big button, and a tap anywhere on the green.
   *
   * A press is latched for a few frames rather than read live: a quick tap can
   * put its pointerdown and pointerup inside one animation frame, and the
   * press would then never be seen at all.
   */
  const touchCharge = useRef({ down: false, latch: 0 });

  // the pad belongs to this screen for as long as it is up
  useEffect(() => claimPad(), []);

  useEffect(() => {
    let raf = 0;
    // whatever was held when bowling began (the Collect press) does not count
    let armedA = false;
    let armedB = false;
    let lastLane = -1;
    let lastState = "";
    const keys = { charge: false };

    const onKey = (e: KeyboardEvent, down: boolean) => {
      let used = true;
      if (e.code === "Space" || e.code === "Enter") keys.charge = down;
      else if (e.code === "Escape" || e.code === "KeyB") {
        if (down) bowlsInput.quit = true;
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
        if (armedB && b) bowlsInput.quit = true;
      }
      const tc = touchCharge.current;
      bowlsInput.charge = charge || tc.down || tc.latch > 0;
      if (!tc.down && tc.latch > 0) tc.latch--;

      // paint
      const p = bowlsPose;
      if (meter.current) meter.current.style.height = `${Math.round(p.power * 100)}%`;
      if (meterWrap.current) meterWrap.current.style.opacity = p.state === "charge" ? "1" : p.state === "set" ? "0.8" : "0.35";
      if (turnT.current) turnT.current.textContent = `${p.turn + 1}`;
      if (bowlT.current) bowlT.current.textContent = `${Math.max(0, BOWLS.perTurn - p.delivered)}`;
      if (totalT.current) totalT.current.textContent = `${p.total}`;
      if (aimT.current) aimT.current.style.transform = `rotate(${(p.aim / AIM_LIMIT) * 30}deg)`;
      if (laneT.current && p.lane !== lastLane) {
        lastLane = p.lane;
        laneT.current.textContent = BOWLS.laneNames[p.lane] ?? "";
      }
      // the dial lights up while the arrow is loose, and settles once stopped
      if (dialT.current) dialT.current.dataset.sweeping = p.state === "sweep" ? "1" : "0";
      if (p.state !== lastState) {
        lastState = p.state;
        if (hintT.current) hintT.current.textContent = HINT[p.state] ?? "";
        if (bigT.current) {
          bigT.current.textContent = p.state === "sweep" ? "STOP!" : "BOWL";
          bigT.current.setAttribute("aria-label", p.state === "sweep" ? "Stop the arrow" : "Hold to bowl");
        }
      }
      for (let i = 0; i < LAMPS.length; i++) {
        const el = lamps.current[i];
        if (!el) continue;
        const up = p.standing[i] !== false;
        el.style.opacity = up ? "1" : "0.22";
        el.style.transform = up ? "scale(1)" : "scale(0.55)";
      }
    };
    raf = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      bowlsInput.charge = false;
    };
  }, []);

  /** One press, however it arrives: the big button or a tap on the green. */
  const press = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      touchCharge.current = { down: true, latch: 3 };
    },
    onPointerUp: () => {
      touchCharge.current.down = false;
    },
    onPointerCancel: () => {
      touchCharge.current.down = false;
    },
    onPointerLeave: () => {
      touchCharge.current.down = false;
    },
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-30 select-none">
      {/* the whole green is a button too: tap to stop the arrow, hold for power */}
      <div className="pointer-events-auto absolute inset-x-0 top-0 h-[52%] touch-none" aria-hidden {...press} />

      {/* scoreboard, top left, big enough to read from the sofa */}
      <div className="absolute left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] flex flex-col gap-2">
        <div className="ui-glass flex items-center gap-3 px-3 py-2 2xl:gap-4 2xl:px-4">
          <span className="ui-gem size-10 shrink-0 text-ink 2xl:size-12" style={{ ["--gem" as string]: "var(--color-emerald)" }}>
            <CircleDot className="size-5 2xl:size-6" strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-xl font-bold leading-none text-ink 2xl:text-3xl">
              Turn <span ref={turnT}>1</span> of {BOWLS.turns}
            </p>
            <p ref={laneT} className="text-sm font-semibold leading-tight text-ink-soft 2xl:text-lg">
              {BOWLS.laneNames[bowlsPose.lane]}
            </p>
          </div>
          {/* the nine pins, as they stand right now */}
          <div className="relative ml-1 size-14 shrink-0 2xl:size-16" aria-hidden>
            {LAMPS.map((p, i) => (
              <span
                key={i}
                ref={(el) => {
                  lamps.current[i] = el;
                }}
                className="absolute size-3 rounded-full bg-sun ring-2 ring-edge/40 transition-all duration-150 2xl:size-3.5"
                style={{ left: `${p.left}%`, top: `${p.top}%`, marginLeft: "-0.375rem", marginTop: "-0.375rem" }}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <span className="ui-chip gloss bg-surface px-3 py-1 text-base text-ink 2xl:text-xl">
            Bowls left: <b ref={bowlT}>2</b>
          </span>
          <span className="ui-chip gloss bg-sun px-3 py-1 text-base text-ink 2xl:text-xl">
            Pins: <b ref={totalT}>0</b>
          </span>
        </div>
      </div>

      {/* leave, top right, always available */}
      <button
        type="button"
        onClick={() => {
          bowlsInput.quit = true;
        }}
        className="press chunk-sm gloss pointer-events-auto absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] flex min-h-12 items-center gap-2 bg-surface px-4 font-display text-lg font-semibold text-ink 2xl:text-xl"
      >
        <LogOut className="size-5" strokeWidth={2.5} /> Quit
      </button>

      {/* the controls, along the bottom: what to press, then the buttons */}
      <div className="absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] flex flex-col gap-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]">
        <p
          ref={hintT}
          className="ui-chip gloss animate-ui-pop mx-auto w-fit max-w-full bg-sun px-4 py-1 text-center font-display text-lg font-bold text-ink [@media(max-height:520px)]:text-base sm:text-2xl"
        >
          {HINT.sweep}
        </p>
        <p className="mx-auto w-fit max-w-full rounded-full bg-surface/85 px-3 py-0.5 text-center text-sm font-semibold text-ink [@media(max-height:560px)]:hidden sm:text-base">
          <PadKey>A</PadKey> stops the arrow, then hold <PadKey>A</PadKey> for power
          <span className="hidden sm:inline">
            {" "}
            &middot; <PadKey>B</PadKey> to leave
          </span>
        </p>
        <div className="flex items-end justify-between gap-3">
          {/* the dial: the swinging arrow, blown up so it reads from the sofa */}
          <div
            ref={dialT}
            data-sweeping="1"
            className="chunk gloss grid size-24 place-items-center bg-surface-2 data-[sweeping=1]:bg-sun/35 sm:size-28 2xl:size-32"
            aria-hidden
          >
            <div ref={aimT} className="grid place-items-center">
              <svg viewBox="0 0 24 24" className="size-14 text-accent sm:size-16" fill="none">
                <path d="M12 22V5" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M5.5 10.5L12 4l6.5 6.5" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          <div className="pointer-events-auto flex items-end gap-3">
            {/* the power meter, filling upwards beside the button */}
            <div
              ref={meterWrap}
              className="chunk relative h-28 w-9 overflow-hidden bg-surface-2 transition-opacity sm:h-36 sm:w-10 2xl:h-44 2xl:w-12"
              aria-hidden
            >
              <div
                ref={meter}
                className="absolute inset-x-0 bottom-0 h-0"
                style={{ background: "linear-gradient(to top, #17b47a 0%, #ffc93a 55%, #f2457f 100%)" }}
              />
              <div className="absolute inset-x-0 top-1/2 h-0.5 bg-edge/30" />
            </div>
            <button
              ref={bigT}
              type="button"
              aria-label="Stop the arrow"
              {...press}
              className="press chunk gloss ui-shimmer grid size-24 place-items-center bg-accent text-center font-display text-2xl font-bold leading-none text-accent-fg sm:size-28 2xl:size-32 2xl:text-3xl"
            >
              STOP!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- scorecard */

function turnTone(pins: number) {
  if (pins >= BOWLS.pins) return "bg-sun text-ink";
  if (pins >= 6) return "bg-teal text-white";
  if (pins >= 3) return "bg-surface text-ink";
  return "bg-surface-3 text-ink";
}

function Scorecard() {
  const card = useGame((s) => s.bowlsCard);
  const setCard = useGame((s) => s.setBowlsCard);
  const done = () => {
    sfx.click();
    setCard(null);
  };
  // The last bowl is a held A, and letting go of it is what rolled it. Without
  // this the scorecard would open and close in the same breath, the same trap
  // the carnival results screens have.
  const shownAt = useRef(0);
  useEffect(() => {
    if (card) shownAt.current = performance.now();
  }, [card]);
  useInput((e) => {
    if ((e === "a" || e === "b") && performance.now() - shownAt.current > 800) done();
  }, !!card);
  const spoken =
    card &&
    `You knocked down ${card.score} pins out of ${card.max}. ${card.line} Plus ${card.tickets} ticket${card.tickets === 1 ? "" : "s"}.`;
  useEffect(() => {
    if (spoken) speak(spoken);
  }, [spoken]);
  if (!card) return null;
  return (
    <ModalFrame className="max-w-xl lg:max-w-2xl">
      <PanelRibbon color="#17b47a" Icon={CircleDot} title="Bowls Scorecard" onClose={done} closeLabel="Done" padSkip pattern="gingham" />
      <div className="ui-dots grid gap-4 p-4 sm:p-6">
        {/* one column per turn */}
        <div
          className="animate-ui-rise grid gap-1.5 sm:gap-2"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, card.turns.length)}, minmax(0, 1fr))` }}
        >
          {card.turns.map((pins, i) => (
            <div key={i} className="grid justify-items-center gap-1">
              <span className="text-xs font-bold text-ink-soft sm:text-sm">Turn {i + 1}</span>
              <span
                className={cn(
                  "chunk-sm gloss grid h-14 w-full place-items-center font-display text-3xl font-bold sm:h-16 sm:text-4xl",
                  turnTone(pins),
                )}
              >
                {pins}
              </span>
              {pins >= BOWLS.pins && <Star className="size-4 text-sun" fill="#ffc93a" aria-label="all nine" />}
            </div>
          ))}
        </div>

        <div className="animate-ui-rise flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "60ms" }}>
          <span className="ui-chip gloss bg-accent px-5 py-1.5 font-display text-2xl text-accent-fg sm:text-3xl">
            {card.score} pins
          </span>
          <span className="ui-chip gloss bg-surface px-5 py-1.5 font-display text-2xl text-ink sm:text-3xl">out of {card.max}</span>
        </div>

        <div className="animate-ui-rise flex flex-wrap items-start gap-3" style={{ animationDelay: "120ms" }}>
          <p className="min-w-[12rem] flex-1 text-2xl font-semibold leading-snug text-ink">{card.line}</p>
          <HearButton text={spoken ?? ""} className="press min-h-12 shrink-0" />
        </div>

        <p className="ui-chip animate-ui-pop gloss mx-auto gap-2 bg-sun px-5 py-1.5 text-2xl text-ink">
          <Ticket className="size-7" strokeWidth={2.5} /> +{card.tickets} ticket{card.tickets === 1 ? "" : "s"}!
        </p>

        <div className="flex items-center justify-center gap-2 rounded-2xl bg-teal/12 px-4 py-2 text-lg font-bold text-teal-deep">
          <Trophy className="size-6 shrink-0" strokeWidth={2.6} />
          {card.isBest
            ? card.best == null
              ? "Your first game — that's the one to beat!"
              : `New best! The old one was ${card.best} pins.`
            : `Best game: ${card.best} pins. Play again to beat it!`}
        </div>

        <Btn onClick={done} padDefault className="min-h-14 w-full text-2xl">
          Done
        </Btn>
        <p className="text-center text-base font-semibold text-ink-soft">
          <PadKey>A</PadKey> to close
        </p>
      </div>
    </ModalFrame>
  );
}

/** Everything lawn bowls puts on the screen. */
export function BowlsOverlay() {
  const playing = useGame((s) => s.bowlsPlaying);
  const card = useGame((s) => s.bowlsCard);
  return (
    <>
      {playing && <BowlingHud />}
      {card && <Scorecard />}
    </>
  );
}
