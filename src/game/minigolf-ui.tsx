import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Flag, LogOut, Star, Ticket, Trophy } from "lucide-react";
import { sfx } from "./audio";
import { ModalFrame, PadKey, PanelRibbon, useInput } from "./carnival-games";
import { HearButton } from "./help-cards";
import { claimPad } from "./input";
import { AIM_LIMIT, golfInput, golfPose } from "./minigolf";
import { GOLF } from "./park";
import { speak } from "./speech";
import { Btn } from "./overlays";
import { useGame } from "./store";
import { cn } from "@/lib/utils";

/**
 * The putting screen and the scorecard.
 *
 * While she is putting the game loop is frozen, so this overlay owns the
 * controls: left and right aim (stick, d-pad, arrow keys, the on-screen
 * arrows or a finger dragged across the green), hold A / Space / the big
 * button to fill the power meter and let go to putt, B or Quit to leave.
 * It claims the pad, so A never also jumps or collects.
 *
 * Nothing here re-renders per frame: the meter, the aim and the stroke count
 * are written straight into the DOM from `golfPose` on this overlay's own
 * animation frame, the same trick the minimap uses.
 */

/* ------------------------------------------------------------- putting */

function PuttingHud() {
  const meter = useRef<HTMLDivElement>(null);
  const meterWrap = useRef<HTMLDivElement>(null);
  const strokeT = useRef<HTMLSpanElement>(null);
  const holeT = useRef<HTMLSpanElement>(null);
  const distT = useRef<HTMLSpanElement>(null);
  const aimT = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLParagraphElement>(null);

  /**
   * Touch: the arrows, the big button, and dragging across the green.
   *
   * A press is latched for a few frames rather than read live. A quick tap can
   * put its pointerdown and pointerup inside one animation frame, and the putt
   * then never happened at all: the loop below saw the button as never pressed.
   */
  const touchAim = useRef({ dir: 0, latch: 0 });
  const touchCharge = useRef({ down: false, latch: 0 });
  const drag = useRef<{ id: number; x: number; aim: number } | null>(null);

  // the pad belongs to this screen for as long as it is up
  useEffect(() => claimPad(), []);

  useEffect(() => {
    let raf = 0;
    // whatever was held when putting began (the Collect press) does not count
    let armedA = false;
    let armedB = false;
    let lastHole = -1;
    const keys = { left: false, right: false, charge: false };

    const onKey = (e: KeyboardEvent, down: boolean) => {
      let used = true;
      if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = down;
      else if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = down;
      else if (e.code === "Space" || e.code === "Enter") keys.charge = down;
      else if (e.code === "Escape" || e.code === "KeyB") {
        if (down) golfInput.quit = true;
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
      let left = keys.left;
      let right = keys.right;
      let charge = keys.charge;
      if (pad) {
        const ax = pad.axes[0] ?? 0;
        const a = Boolean(pad.buttons[0]?.pressed);
        const b = Boolean(pad.buttons[1]?.pressed);
        if (!a) armedA = true;
        if (!b) armedB = true;
        if (armedA && a) charge = true;
        if (armedB && b) golfInput.quit = true;
        if (Boolean(pad.buttons[14]?.pressed) || ax < -0.35) left = true;
        if (Boolean(pad.buttons[15]?.pressed) || ax > 0.35) right = true;
      }
      const ta = touchAim.current;
      const tc = touchCharge.current;
      golfInput.aim = (left ? -1 : 0) + (right ? 1 : 0) + (ta.dir || Math.sign(ta.latch));
      golfInput.charge = charge || tc.down || tc.latch > 0;
      if (!ta.dir && ta.latch) ta.latch += ta.latch > 0 ? -1 : 1;
      if (!tc.down && tc.latch > 0) tc.latch--;

      // paint
      const p = golfPose;
      if (meter.current) meter.current.style.height = `${Math.round(p.power * 100)}%`;
      if (meterWrap.current) meterWrap.current.style.opacity = p.state === "charge" ? "1" : "0.55";
      if (strokeT.current) strokeT.current.textContent = String(p.strokes);
      if (holeT.current) holeT.current.textContent = `${p.hole + 1}`;
      if (distT.current) distT.current.textContent = `${p.toCup.toFixed(1)}m`;
      if (aimT.current) aimT.current.style.transform = `rotate(${(p.aim / AIM_LIMIT) * 38}deg)`;
      if (hint.current && p.hole !== lastHole) {
        lastHole = p.hole;
        hint.current.textContent = GOLF.names[p.hole] ?? "";
      }
    };
    raf = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      golfInput.aim = 0;
      golfInput.charge = false;
    };
  }, []);

  const holdAim = (dir: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      touchAim.current = { dir, latch: dir * 3 };
    },
    onPointerUp: () => {
      touchAim.current.dir = 0;
    },
    onPointerCancel: () => {
      touchAim.current.dir = 0;
    },
    onPointerLeave: () => {
      touchAim.current.dir = 0;
    },
  });

  return (
    <div className="pointer-events-none absolute inset-0 z-30 select-none">
      {/* drag anywhere over the green to aim */}
      <div
        className="pointer-events-auto absolute inset-x-0 top-0 h-[52%] touch-none"
        onPointerDown={(e) => {
          drag.current = { id: e.pointerId, x: e.clientX, aim: golfPose.aim };
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          golfInput.aimTo = d.aim + ((e.clientX - d.x) / 240) * AIM_LIMIT;
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      />

      {/* scoreboard, top left, big enough to read from the sofa */}
      <div className="absolute left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] flex flex-col gap-2">
        <div className="ui-glass flex items-center gap-3 px-3 py-2 2xl:gap-4 2xl:px-4">
          <span className="ui-gem size-10 shrink-0 text-ink 2xl:size-12" style={{ ["--gem" as string]: "var(--color-emerald)" }}>
            <Flag className="size-5 2xl:size-6" strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-xl font-bold leading-none text-ink 2xl:text-3xl">
              Hole <span ref={holeT}>1</span> of {GOLF.holes}
            </p>
            <p ref={hint} className="text-sm font-semibold leading-tight text-ink-soft 2xl:text-lg">
              {GOLF.names[golfPose.hole]}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <span className="ui-chip gloss bg-surface px-3 py-1 text-base text-ink 2xl:text-xl">
            Shots: <b ref={strokeT}>0</b>
          </span>
          <span className="ui-chip gloss bg-surface px-3 py-1 text-base text-ink 2xl:text-xl">Par {GOLF.par}</span>
          <span className="ui-chip gloss bg-sun px-3 py-1 text-base text-ink 2xl:text-xl">
            <span ref={distT}>0m</span> to go
          </span>
        </div>
      </div>

      {/* leave, top right, always available */}
      <button
        type="button"
        onClick={() => {
          golfInput.quit = true;
        }}
        className="press chunk-sm gloss pointer-events-auto absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] flex min-h-12 items-center gap-2 bg-surface px-4 font-display text-lg font-semibold text-ink 2xl:text-xl"
      >
        <LogOut className="size-5" strokeWidth={2.5} /> Quit
      </button>

      {/* the controls, along the bottom: what to press, then the buttons */}
      <div className="absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] flex flex-col gap-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]">
        <p className="mx-auto w-fit max-w-full rounded-full bg-surface/85 px-3 py-0.5 text-center text-sm font-semibold text-ink [@media(max-height:560px)]:hidden sm:text-base">
          <PadKey>&larr;</PadKey>
          <PadKey>&rarr;</PadKey> aim &middot; hold <PadKey>A</PadKey> for power, let go to putt
          <span className="hidden sm:inline">
            {" "}
            &middot; <PadKey>B</PadKey> to leave
          </span>
        </p>
        <div className="flex items-end justify-between gap-3">
          <div className="pointer-events-auto flex items-end gap-2 sm:gap-3">
            <button type="button" aria-label="Aim left" {...holdAim(-1)} className="press chunk gloss grid size-16 place-items-center bg-surface text-ink sm:size-20 2xl:size-24">
              <ChevronLeft className="size-9 sm:size-10" strokeWidth={3} />
            </button>
            <div className="chunk gloss grid size-16 place-items-center bg-surface-2 sm:size-20 2xl:size-24" aria-hidden>
              <div ref={aimT} className="grid place-items-center transition-transform duration-75">
                <svg viewBox="0 0 24 24" className="size-10 text-accent sm:size-12" fill="none">
                  <path d="M12 21V6" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
                  <path d="M6 11l6-6 6 6" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            <button type="button" aria-label="Aim right" {...holdAim(1)} className="press chunk gloss grid size-16 place-items-center bg-surface text-ink sm:size-20 2xl:size-24">
              <ChevronRight className="size-9 sm:size-10" strokeWidth={3} />
            </button>
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
              type="button"
              aria-label="Hold to putt"
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
              PUTT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- scorecard */

function strokeTone(strokes: number) {
  if (strokes === 1) return "bg-sun text-ink";
  if (strokes < GOLF.par) return "bg-teal text-white";
  if (strokes === GOLF.par) return "bg-surface text-ink";
  return "bg-surface-3 text-ink";
}

function Scorecard() {
  const card = useGame((s) => s.golfCard);
  const setCard = useGame((s) => s.setGolfCard);
  const done = () => {
    sfx.click();
    setCard(null);
  };
  // The last putt is a held A, and letting go of it is what sank it. Without
  // this the scorecard opened and closed in the same breath and she never saw
  // her round, which is the same trap the carnival results screens have.
  const shownAt = useRef(0);
  useEffect(() => {
    if (card) shownAt.current = performance.now();
  }, [card]);
  useInput((e) => {
    if ((e === "a" || e === "b") && performance.now() - shownAt.current > 800) done();
  }, !!card);
  const spoken =
    card &&
    `Your round: ${card.total} shots, par ${card.par}. ${card.line} Plus ${card.tickets} ticket${card.tickets === 1 ? "" : "s"}.`;
  useEffect(() => {
    if (spoken) speak(spoken);
  }, [spoken]);
  if (!card) return null;
  const diff = card.total - card.par;
  return (
    <ModalFrame className="max-w-xl lg:max-w-2xl">
      <PanelRibbon
        color="#17b47a"
        Icon={Flag}
        title="Scorecard"
        onClose={done}
        closeLabel="Done"
        padSkip
        pattern="gingham"
      />
      <div className="ui-dots grid gap-4 p-4 sm:p-6">
        {/* one column per hole she played: a round can start at any tee */}
        <div className="animate-ui-rise grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, card.scores.length)}, minmax(0, 1fr))` }}>
          {card.scores.map((s, i) => (
            <div key={i} className="grid justify-items-center gap-1">
              <span className="text-xs font-bold text-ink-soft sm:text-sm">Hole {card.from + i + 1}</span>
              <span
                className={cn(
                  "chunk-sm gloss grid h-14 w-full place-items-center font-display text-3xl font-bold sm:h-16 sm:text-4xl",
                  strokeTone(s),
                )}
              >
                {s}
              </span>
              {s === 1 && <Star className="size-4 text-sun" fill="#ffc93a" aria-label="hole in one" />}
            </div>
          ))}
        </div>

        <div className="animate-ui-rise flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "60ms" }}>
          <span className="ui-chip gloss bg-accent px-5 py-1.5 font-display text-2xl text-accent-fg sm:text-3xl">
            Total {card.total}
          </span>
          <span className="ui-chip gloss bg-surface px-5 py-1.5 font-display text-2xl text-ink sm:text-3xl">Par {card.par}</span>
          <span className="ui-chip gloss bg-surface-2 px-4 py-1.5 font-display text-xl text-ink sm:text-2xl">
            {diff === 0 ? "level" : diff < 0 ? `${-diff} under` : `${diff} over`}
          </span>
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
          {!card.full
            ? `You played ${card.scores.length} hole${card.scores.length === 1 ? "" : "s"}. Start at hole 1 for a full round!`
            : card.isBest
              ? card.best == null
                ? "Your first round — that's the one to beat!"
                : `New best round! The old one was ${card.best}.`
              : `Best round: ${card.best}. Play again to beat it!`}
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

/** Everything mini golf puts on the screen. */
export function GolfOverlay() {
  const playing = useGame((s) => s.golfPlaying);
  const card = useGame((s) => s.golfCard);
  return (
    <>
      {playing && <PuttingHud />}
      {card && <Scorecard />}
    </>
  );
}
