import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  HelpCircle,
  Maximize,
  Minimize,
  RotateCcw,
  Trophy,
  Pause,
  Play,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { canFullscreen, enterFullscreen, toggleFullscreen, useFullscreen } from "./fullscreen";
import { LEVELS } from "./levels";
import { MiniMap } from "./minimap";
import { PadMenu } from "./pad-menu";
import { useGame } from "./store";
import { TEMP_LABEL, type DressId } from "./types";
import { sfx, unlockAudio, setMuted } from "./audio";
import { touchMove, triggerJump } from "./input";
import { cn } from "@/lib/utils";

const DRESS_OPTS: { id: DressId; label: string; hex: string }[] = [
  { id: "coral", label: "Coral", hex: "#d45a4a" },
  { id: "sky", label: "Sky", hex: "#4f93c4" },
  { id: "mint", label: "Mint", hex: "#3f9a6b" },
  { id: "rose", label: "Rose", hex: "#c46b8a" },
  { id: "apricot", label: "Apricot", hex: "#d4894a" },
];

const TEMP_TINT: Record<string, string> = {
  freezing: "text-cold",
  cold: "text-cold",
  chilly: "text-accent-2",
  lukewarm: "text-ink-soft",
  warm: "text-warm",
  hot: "text-warm",
  burning: "text-accent",
};

function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "chunk bg-surface text-ink",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Btn({
  children,
  onClick,
  variant = "primary",
  className,
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "press inline-flex min-h-12 items-center justify-center px-6 font-display text-lg font-semibold",
        variant !== "ghost" && "chunk-sm",
        variant === "primary" && "bg-accent text-accent-fg",
        variant === "secondary" && "bg-surface-2 text-ink",
        variant === "ghost" && "bg-transparent text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** m:ss, which is how a 7-year-old reads a time. */
function ordinal(n: number) {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

/** Shared best-times table. */
function BestTimes({ levelIndex, highlight }: { levelIndex: number; highlight?: number }) {
  const leaderboard = useGame((s) => s.leaderboard);
  const rows = leaderboard[levelIndex] ?? [];
  if (!rows.length) {
    return (
      <p className="mt-3 text-sm text-ink-soft">
        No times yet. Finish a park from the start to set one.
      </p>
    );
  }
  const medal = ["1st", "2nd", "3rd"];
  return (
    <ul className="mt-3 grid gap-1.5">
      {rows.map((r, i) => (
        <li
          key={`${r.name}-${r.at}`}
          className={cn(
            "chunk-sm flex items-center gap-3 px-3 py-2 text-left",
            highlight === i + 1 ? "bg-sun" : "bg-surface-2",
          )}
        >
          <span className="w-9 font-display text-sm font-semibold text-ink-soft">
            {medal[i] ?? `${i + 1}th`}
          </span>
          <span className="flex-1 truncate font-display text-lg font-semibold">{r.name}</span>
          <span className="font-display text-lg font-semibold tabular-nums">
            {clock(r.seconds)}
          </span>
          <span className="w-16 text-right text-xs text-ink-soft">
            {r.hintsUsed === 0 ? "no hints" : `${r.hintsUsed} hint${r.hintsUsed > 1 ? "s" : ""}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function TitleScreen() {
  const playerName = useGame((s) => s.playerName);
  const dress = useGame((s) => s.dress);
  const unlocked = useGame((s) => s.unlocked);
  const collected = useGame((s) => s.collected);
  const startLevel = useGame((s) => s.startLevel);
  const resetAll = useGame((s) => s.resetAll);
  const setName = useGame((s) => s.setName);
  const setDress = useGame((s) => s.setDress);
  const [help, setHelp] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showTimes, setShowTimes] = useState(false);
  const fullscreen = useFullscreen();

  return (
    <div className="pointer-events-auto flex h-full w-full flex-col items-center justify-end overflow-y-auto bg-ink/25 p-4 pb-6 pt-10 sm:justify-center sm:pb-10">
      <Panel className="w-full max-w-lg p-5 sm:p-7">
        <p className="text-sm font-semibold tracking-wide text-ink-soft">v2.9</p>
        <h1 className="mt-1 font-display text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
          Sloanie's World
        </h1>
        <p className="mt-2 text-base leading-relaxed text-ink-soft">
          Help Sloan hunt hidden dumplings across giant parks, then solve a little math to keep
          each one. Parks unlock one at a time.
        </p>

        <label className="mt-5 block text-sm font-semibold text-ink">
          Explorer name
          <input
            value={playerName}
            onChange={(e) => setName(e.target.value.slice(0, 18))}
            placeholder="Sloan"
            className="chunk-sm mt-1.5 block h-12 w-full bg-surface-2 px-3 font-display text-lg text-ink outline-none ring-accent/50 placeholder:text-muted focus:ring-4"
          />
        </label>

        <p className="mt-4 text-sm font-semibold text-ink">Dress</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {DRESS_OPTS.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-label={o.label}
              onClick={() => setDress(o.id)}
              className={cn(
                "size-10 rounded-full border-2",
                dress === o.id ? "border-ink" : "border-line",
              )}
              style={{ background: o.hex }}
            />
          ))}
        </div>

        <div className="mt-5 grid gap-2">
          {LEVELS.map((lv, i) => {
            const locked = i > unlocked;
            const found = collected[i]?.length ?? 0;
            return (
              <button
                key={lv.id}
                type="button"
                disabled={locked}
                onClick={() => {
                  unlockAudio();
                  sfx.click();
                  // Start is a real click, which is the one moment the browser
                  // lets us go fullscreen; refused silently for pad-driven clicks.
                  void enterFullscreen();
                  startLevel(i);
                }}
                className={cn(
                  "press chunk-sm flex min-h-16 items-center justify-between px-4 text-left",
                  locked ? "bg-surface-2 text-muted" : "bg-sun text-ink",
                )}
              >
                <span>
                  <span className="block font-display text-lg font-medium">
                    {locked ? "Locked park" : lv.name}
                  </span>
                  <span className="block text-sm text-ink-soft">
                    {locked
                      ? "Finish the park before this one"
                      : `${lv.tagline}  ·  ${found}/${lv.dumplings.length} found`}
                  </span>
                </span>
                {!locked && i === 0 && (
                  <span className="rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-fg">
                    Start
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Btn variant="secondary" onClick={() => setHelp((v) => !v)} className="gap-2">
            <HelpCircle className="size-4" />
            How to play
          </Btn>
          <Btn
            variant="secondary"
            onClick={() => {
              sfx.click();
              setShowTimes((v) => !v);
            }}
            className="gap-2"
          >
            <Trophy className="size-4" />
            Best times
          </Btn>
          <Btn
            variant="secondary"
            onClick={() => {
              sfx.click();
              setConfirmReset(true);
            }}
            className="gap-2"
          >
            <RotateCcw className="size-4" />
            Start over
          </Btn>
          {canFullscreen() && (
            <Btn
              variant="secondary"
              onClick={() => {
                sfx.click();
                void toggleFullscreen();
              }}
              className="gap-2"
            >
              {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
              {fullscreen ? "Exit fullscreen" : "Fullscreen"}
            </Btn>
          )}
        </div>
        {showTimes && (
          <div className="mt-3">
            <p className="font-display text-lg font-semibold">{LEVELS[0]!.name}</p>
            <BestTimes levelIndex={0} />
            <p className="mt-2 text-sm text-ink-soft">
              Change the explorer name above and each player keeps their own best time.
            </p>
          </div>
        )}
        {confirmReset && (
          <div className="chunk-sm mt-3 bg-surface-2 p-3">
            <p className="text-sm text-ink-soft">
              Hide every dumpling again and lock the other parks?
            </p>
            <div className="mt-2 flex gap-2">
              <Btn
                onClick={() => {
                  sfx.click();
                  resetAll();
                  setConfirmReset(false);
                }}
              >
                Yes, start over
              </Btn>
              <Btn variant="secondary" onClick={() => setConfirmReset(false)}>
                Cancel
              </Btn>
            </div>
          </div>
        )}
        {help && (
          <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-ink-soft">
            <li>Walk with W A S D or the stick. Jump with Space.</li>
            <li>Drag the screen to look around. Q and E also turn the camera.</li>
            <li>
              On a controller: left stick walk, right stick look, A jump, B big map, X collect,
              Y hint, LB/RB turn camera, Back journal, Start pause. M on the keyboard opens the
              map too.
            </li>
            <li>The temperature tells you if a dumpling is close.</li>
            <li>When you are next to one, press Collect and answer the math.</li>
            <li>Miss twice and the dumpling runs away to a new hiding spot.</li>
            <li>Hints point to a region, not the exact hiding spot. Use them sparingly.</li>
          </ul>
        )}
      </Panel>
    </div>
  );
}

function HUD() {
  const temp = useGame((s) => s.temp);
  const nearestName = useGame((s) => s.nearestName);
  const nearCollect = useGame((s) => s.nearCollect);
  const collected = useGame((s) => s.collected);
  const levelIndex = useGame((s) => s.levelIndex);
  const hintsLeft = useGame((s) => s.hintsLeft);
  const hintText = useGame((s) => s.hintText);
  const muted = useGame((s) => s.muted);
  const journalOpen = useGame((s) => s.journalOpen);
  const playerName = useGame((s) => s.playerName);
  const pause = useGame((s) => s.pause);
  const toggleMute = useGame((s) => s.toggleMute);
  const toggleJournal = useGame((s) => s.toggleJournal);
  const useHint = useGame((s) => s.useHint);
  const requestInteract = useGame((s) => s.requestInteract);
  const fleeNotice = useGame((s) => s.fleeNotice);
  const clearFleeNotice = useGame((s) => s.clearFleeNotice);
  const emmettNotice = useGame((s) => s.emmettNotice);
  const setEmmettNotice = useGame((s) => s.setEmmettNotice);
  const boostLeft = useGame((s) => s.boostLeft);
  const runSeconds = useGame((s) => s.runSeconds);
  const runActive = useGame((s) => s.runActive);
  const clearHint = useGame((s) => s.clearHint);
  const phase = useGame((s) => s.phase);
  const level = LEVELS[levelIndex]!;
  const found = collected[levelIndex]?.length ?? 0;

  const close = temp === "warm" || temp === "hot" || temp === "burning";
  const status = emmettNotice
    ? emmettNotice
    : fleeNotice
    ? fleeNotice
    : nearCollect
      ? `${playerName ? `${playerName}, ` : ""}this is ${nearestName}. Press Collect!`
      : close
        ? "Getting warmer…"
        : "Search the park";

  useEffect(() => {
    if (!emmettNotice) return;
    const t = window.setTimeout(() => setEmmettNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, [emmettNotice, setEmmettNotice]);

  useEffect(() => {
    if (!fleeNotice) return;
    const t = window.setTimeout(() => clearFleeNotice(), 4200);
    return () => window.clearTimeout(t);
  }, [fleeNotice, clearFleeNotice]);

  useEffect(() => {
    if (!hintText) return;
    const t = window.setTimeout(() => clearHint(), 14000);
    return () => window.clearTimeout(t);
  }, [hintText, clearHint]);

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Panel className="pointer-events-auto px-3 py-2">
          {boostLeft > 0 && <JuiceClock left={boostLeft} total={20} />}
          <p className="font-display text-sm font-medium text-ink-soft">{level.name}</p>
          {runActive && (
            <p className="font-display text-sm font-semibold tabular-nums text-ink-soft">
              {clock(runSeconds)}
            </p>
          )}
          <p className="font-display text-xl font-semibold tabular-nums leading-tight">
            {found}
            <span className="text-ink-soft"> / {level.dumplings.length}</span>
          </p>
          <p className={cn("text-sm font-bold tabular-nums", TEMP_TINT[temp])}>
            {TEMP_LABEL[temp]}
          </p>
        </Panel>
        <div className="pointer-events-auto flex gap-2">
          <IconBtn label="Journal" onClick={toggleJournal}>
            <BookOpen className="size-5" />
          </IconBtn>
          <IconBtn
            label={muted ? "Unmute" : "Mute"}
            onClick={() => {
              toggleMute();
              setMuted(!muted);
            }}
          >
            {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </IconBtn>
          <IconBtn label="Pause" onClick={pause}>
            <Pause className="size-5" />
          </IconBtn>
        </div>
      </div>

      {(nearCollect || fleeNotice || close) && (
        <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center px-3">
          <Panel className="pointer-events-auto relative max-w-sm px-4 py-2 pr-10 text-center">
            <p className="text-sm font-semibold text-ink">{status}</p>
            {fleeNotice && (
              <button
                type="button"
                aria-label="Dismiss"
                onClick={clearFleeNotice}
                className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-sm text-ink-soft"
              >
                <X className="size-4" />
              </button>
            )}
          </Panel>
        </div>
      )}

      {hintText && (
        <div className="pointer-events-none absolute inset-x-0 top-40 flex justify-center px-4">
          <Panel className="pointer-events-auto relative max-w-md px-4 py-3 pr-11 text-center text-sm leading-relaxed text-ink">
            {hintText}
            <button
              type="button"
              aria-label="Dismiss hint"
              onClick={clearHint}
              className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-sm text-ink-soft"
            >
              <X className="size-4" />
            </button>
          </Panel>
        </div>
      )}

      {phase === "playing" && (
        <div className="pointer-events-none absolute bottom-4 left-0 right-0 z-10 flex items-end justify-between gap-3 px-3 pb-[env(safe-area-inset-bottom)] sm:bottom-6">
          <Joystick />
          <div className="pointer-events-auto flex flex-col items-end gap-2">
            {nearCollect && (
              <Btn onClick={requestInteract} className="min-w-36 shadow-[0_18px_40px_-24px_rgb(42_33_24_/_0.45)]">
                Collect
              </Btn>
            )}
            <Btn
              variant="secondary"
              onClick={useHint}
              disabled={hintsLeft <= 0}
              className="gap-2"
            >
              <Sparkles className="size-4" />
              Hint · {hintsLeft}
            </Btn>
            <button
              type="button"
              aria-label="Jump"
              onPointerDown={(e) => {
                e.preventDefault();
                triggerJump();
              }}
              className="grid size-16 place-items-center rounded-full border border-line bg-surface text-sm font-bold text-ink shadow-[0_18px_40px_-24px_rgb(42_33_24_/_0.45)] sm:hidden"
            >
              Jump
            </button>
          </div>
        </div>
      )}

      {journalOpen && <Journal />}
    </>
  );
}

function IconBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="press chunk-sm grid size-12 place-items-center bg-surface text-ink"
    >
      {children}
    </button>
  );
}

function Joystick() {
  const ref = useRef<HTMLDivElement>(null);
  const pid = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      touchMove.x = 0;
      touchMove.z = 0;
    };
  }, []);
  function setFrom(clientX: number, clientY: number) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let x = (clientX - cx) / (r.width * 0.42);
    let y = (clientY - cy) / (r.height * 0.42);
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    touchMove.x = x;
    touchMove.z = -y;
  }
  return (
    <div
      ref={ref}
      className="pointer-events-auto relative size-32 rounded-full border border-line bg-surface/80 md:hidden"
      onPointerDown={(e) => {
        pid.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        setFrom(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pid.current === e.pointerId) setFrom(e.clientX, e.clientY);
      }}
      onPointerUp={() => {
        pid.current = null;
        touchMove.x = 0;
        touchMove.z = 0;
      }}
      onPointerCancel={() => {
        pid.current = null;
        touchMove.x = 0;
        touchMove.z = 0;
      }}
    >
      <div className="absolute inset-7 rounded-full border border-line/80 bg-surface-2/90" />
    </div>
  );
}

function Journal() {
  const levelIndex = useGame((s) => s.levelIndex);
  const collected = useGame((s) => s.collected[levelIndex] ?? []);
  const setJournal = useGame((s) => s.setJournal);
  const level = LEVELS[levelIndex]!;
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-ink/40 p-4">
      <Panel className="relative max-h-[80dvh] w-full max-w-md overflow-y-auto p-5">
        <button
          type="button"
          aria-label="Close journal"
          className="absolute right-3 top-3 grid size-10 place-items-center rounded-sm text-ink"
          onClick={() => setJournal(false)}
        >
          <X className="size-5" />
        </button>
        <h2 className="font-display text-2xl font-semibold">Dumpling journal</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {collected.length} of {level.dumplings.length} found in {level.name}
        </p>
        <ul className="mt-4 space-y-2">
          {level.dumplings.map((d) => {
            const got = collected.includes(d.id);
            return (
              <li
                key={d.id}
                className="chunk-sm flex items-center gap-3 bg-surface-2 px-3 py-2"
              >
                <span
                  className="size-8 rounded-full border border-line"
                  style={{ background: got ? d.color : "#e2d5c4" }}
                />
                <span>
                  <span className="block font-semibold">{got ? d.name : "Unknown dumpling"}</span>
                  <span className="block text-sm text-ink-soft">
                    {got
                      ? `Found near ${d.region}`
                      : d.hide === "hard"
                        ? "Well hidden"
                        : "Still out there"}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

/**
 * Drawn shapes rather than emoji. Emoji render differently on every machine,
 * often monochrome, and at TV distance they are unreadable.
 */
function HandIcon({ hand, size = 72 }: { hand: string; size?: number }) {
  if (hand === "rock") {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <path
          d="M12 44c-3-8 1-18 9-23s20-4 26 3 6 18 0 24-16 8-24 6-9-7-11-10z"
          fill="#9a948a"
          stroke="#5d584f"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <circle cx="26" cy="32" r="3.5" fill="#7d776d" />
        <circle cx="40" cy="40" r="2.5" fill="#7d776d" />
        <circle cx="38" cy="25" r="2" fill="#b3ada2" />
      </svg>
    );
  }
  if (hand === "paper") {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <path
          d="M14 8h26l12 12v36H14z"
          fill="#fdf9ef"
          stroke="#5d584f"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M40 8v12h12" fill="#e6ded0" stroke="#5d584f" strokeWidth="3" strokeLinejoin="round" />
        <g stroke="#b9b1a3" strokeWidth="3" strokeLinecap="round">
          <line x1="21" y1="30" x2="44" y2="30" />
          <line x1="21" y1="38" x2="44" y2="38" />
          <line x1="21" y1="46" x2="36" y2="46" />
        </g>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <g stroke="#5d584f" strokeWidth="3" strokeLinecap="round">
        <line x1="18" y1="10" x2="42" y2="40" stroke="#c9cdd2" strokeWidth="7" />
        <line x1="46" y1="10" x2="22" y2="40" stroke="#c9cdd2" strokeWidth="7" />
        <line x1="18" y1="10" x2="42" y2="40" />
        <line x1="46" y1="10" x2="22" y2="40" />
      </g>
      <circle cx="20" cy="48" r="8" fill="none" stroke="#d4494f" strokeWidth="5" />
      <circle cx="44" cy="48" r="8" fill="none" stroke="#d4494f" strokeWidth="5" />
      <circle cx="32" cy="34" r="3" fill="#5d584f" />
    </svg>
  );
}

const RPS_HANDS = ["rock", "paper", "scissors"] as const;

/**
 * Boost timer drawn as a juice box with a sweeping second hand. The carton
 * drains as the clock runs down, so it reads at a glance from across a room.
 */
function JuiceClock({ left, total }: { left: number; total: number }) {
  // The store only carries whole seconds so the HUD is not re-rendering every
  // frame. The hand interpolates locally between those updates.
  const [shown, setShown] = useState(left);
  const base = useRef({ left, at: 0 });

  useEffect(() => {
    base.current = { left, at: performance.now() };
  }, [left]);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      if (now - last > 42) {
        last = now;
        const elapsed = (now - base.current.at) / 1000;
        setShown(Math.max(0, base.current.left - elapsed));
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  const value = shown;
  const frac = Math.max(0, Math.min(1, value / total));
  const angle = (1 - frac) * 360;
  const rad = ((angle - 90) * Math.PI) / 180;
  const cx = 26;
  const cy = 30;
  const r = 13;
  const low = value <= 5;

  return (
    <div className="mb-1 flex items-center gap-2">
      <svg width="52" height="60" viewBox="0 0 52 60" aria-hidden>
        <rect x="8" y="12" width="36" height="44" rx="3" fill="#c9442f" />
        <rect x="8" y={12 + 44 * (1 - frac)} width="36" height={44 * frac} rx="3" fill="#e8613f" />
        <rect x="8" y="12" width="36" height="44" rx="3" fill="none" stroke="#8f2d1f" strokeWidth="2" />
        <rect x="6" y="9" width="40" height="5" rx="2" fill="#f2ead8" />
        <rect x="30" y="0" width="4" height="11" rx="2" fill="#f7f3ee" />
        <rect x="30" y="0" width="4" height="4" rx="2" fill="#4f93c4" />
        <circle cx={cx} cy={cy} r={r + 2.5} fill="#fdf7ea" stroke="#8f2d1f" strokeWidth="1.5" />
        {[0, 1, 2, 3].map((i) => {
          const a = ((i * 90 - 90) * Math.PI) / 180;
          return (
            <line
              key={i}
              x1={cx + Math.cos(a) * (r - 2.5)}
              y1={cy + Math.sin(a) * (r - 2.5)}
              x2={cx + Math.cos(a) * r}
              y2={cy + Math.sin(a) * r}
              stroke="#8f2d1f"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          );
        })}
        <path
          d={`M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${angle > 180 ? 1 : 0} 1 ${
            cx + Math.cos(rad) * r
          } ${cy + Math.sin(rad) * r} Z`}
          fill="#f6c98a"
          opacity="0.85"
        />
        <line
          x1={cx}
          y1={cy}
          x2={cx + Math.cos(rad) * (r - 1)}
          y2={cy + Math.sin(rad) * (r - 1)}
          stroke={low ? "#c9442f" : "#3f3228"}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="2" fill="#3f3228" />
      </svg>
      <span
        className={cn(
          "font-display text-lg font-semibold tabular-nums",
          low ? "text-[#c9442f]" : "text-ink",
        )}
      >
        {Math.ceil(value)}s
      </span>
    </div>
  );
}

/** Name card that appears while the caught dumpling floats above her head. */
function CatchCard() {
  const celebrate = useGame((s) => s.celebrate);
  if (!celebrate) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[18%] z-20 flex justify-center px-4">
      <div
        className="chunk animate-[catchPop_240ms_ease-out] px-7 py-4 text-center"
        style={{ background: celebrate.color }}
      >
        <p className="font-display text-3xl font-semibold text-ink drop-shadow-[0_1px_0_rgba(255,255,255,0.45)]">
          {celebrate.name}
        </p>
        <p className="text-sm font-semibold text-ink/70">caught!</p>
      </div>
    </div>
  );
}

function RpsPanel() {
  const rps = useGame((s) => s.rps);
  const playRps = useGame((s) => s.playRps);
  const nextRpsRound = useGame((s) => s.nextRpsRound);
  const closeRps = useGame((s) => s.closeRps);
  const [sel, setSel] = useState(0);
  const selRef = useRef(0);
  selRef.current = sel;

  // Keyboard and gamepad, same as the quiz. She may well be on a controller
  // at the TV, where clicking is not an option.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useGame.getState();
      if (!st.rps) return;
      if (st.rps.result) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          sfx.click();
          if (st.rps.result === "tie") st.nextRpsRound();
          else st.closeRps();
        }
        return;
      }
      if (e.key === "1" || e.key.toLowerCase() === "r") st.playRps("rock");
      else if (e.key === "2" || e.key.toLowerCase() === "p") st.playRps("paper");
      else if (e.key === "3" || e.key.toLowerCase() === "s") st.playRps("scissors");
      else if (e.key === "ArrowLeft") setSel((v) => (v + 2) % 3);
      else if (e.key === "ArrowRight") setSel((v) => (v + 1) % 3);
      else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        st.playRps(RPS_HANDS[selRef.current]!);
      } else return;
      sfx.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let prevA = false;
    let prevL = false;
    let prevR = false;
    let raf = 0;
    const loop = () => {
      const pads = navigator.getGamepads?.() ?? [];
      const pad = pads.find((p) => p && p.buttons.length > 0);
      const st = useGame.getState();
      if (pad && st.rps) {
        const a = Boolean(pad.buttons[0]?.pressed);
        const left = Boolean(pad.buttons[14]?.pressed) || (pad.axes[0] ?? 0) < -0.55;
        const right = Boolean(pad.buttons[15]?.pressed) || (pad.axes[0] ?? 0) > 0.55;
        if (left && !prevL) setSel((v) => (v + 2) % 3);
        if (right && !prevR) setSel((v) => (v + 1) % 3);
        if (a && !prevA) {
          sfx.click();
          if (!st.rps.result) st.playRps(RPS_HANDS[selRef.current]!);
          else if (st.rps.result === "tie") st.nextRpsRound();
          else st.closeRps();
        }
        prevA = a;
        prevL = left;
        prevR = right;
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  if (!rps) return null;
  const done = rps.result != null;
  const won = rps.result === "win";
  const tied = rps.result === "tie";

  const banner = !done
    ? null
    : tied
      ? { text: "Same thing! Go again", bg: "bg-sun", fg: "text-ink" }
      : won
        ? { text: "You win!", bg: "bg-leaf", fg: "text-white" }
        : { text: "Emmett wins", bg: "bg-berry", fg: "text-white" };

  const Side = ({ label, hand, winner }: { label: string; hand: string | null; winner: boolean }) => (
    <div className="flex flex-1 flex-col items-center">
      <div
        className={cn(
          "chunk-sm flex size-[104px] items-center justify-center",
          done && winner ? "bg-sun" : done ? "bg-surface-2 opacity-50" : "bg-surface-2",
        )}
      >
        {hand ? (
          <HandIcon hand={hand} size={78} />
        ) : (
          <span className="font-display text-5xl text-ink-soft">?</span>
        )}
      </div>
      <p className="mt-2 font-display text-lg font-semibold">{label}</p>
      {hand && <p className="text-sm capitalize text-ink-soft">{hand}</p>}
    </div>
  );

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-ink/45 p-4">
      <Panel className="w-full max-w-lg p-6 text-center">
        <p className="font-display text-2xl font-semibold">Emmett wants to play!</p>
        {!done && (
          <p className="mt-1 text-base text-ink-soft">
            Win and you keep your dumplings. Lose and he takes one.
          </p>
        )}

        <div className="mt-5 flex items-center justify-center gap-3">
          <Side label="You" hand={rps.playerPick} winner={won} />
          <span className="font-display text-2xl font-semibold text-ink-soft">vs</span>
          <Side label="Emmett" hand={rps.emmettPick} winner={done && !won && !tied} />
        </div>

        {banner && (
          <div className={cn("chunk-sm mt-5 px-4 py-3", banner.bg)}>
            <p className={cn("font-display text-2xl font-semibold", banner.fg)}>{banner.text}</p>
            {!tied && (
              <p className={cn("mt-0.5 text-sm opacity-90", banner.fg)}>
                {won ? "Every dumpling stays yours." : "He is taking one and hiding it."}
              </p>
            )}
          </div>
        )}

        {!done ? (
          <>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {RPS_HANDS.map((h, i) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => {
                    sfx.click();
                    playRps(h);
                  }}
                  onPointerEnter={() => setSel(i)}
                  className={cn(
                    "press chunk-sm flex flex-col items-center justify-center gap-1 py-3",
                    i === sel ? "bg-sun" : "bg-surface-2",
                  )}
                >
                  <HandIcon hand={h} size={64} />
                  <span className="font-display text-base font-semibold capitalize">{h}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm text-ink-soft">Tap one, or press 1, 2 or 3</p>
          </>
        ) : (
          <div className="mt-5 flex justify-center">
            <Btn
              onClick={() => {
                sfx.click();
                if (tied) nextRpsRound();
                else closeRps();
              }}
              className="px-8 py-3 text-lg"
            >
              {tied ? "Play again" : won ? "Yes!" : "Okay..."}
            </Btn>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Quiz() {
  const quiz = useGame((s) => s.quiz);
  const bumpAttempt = useGame((s) => s.bumpAttempt);
  const markCollected = useGame((s) => s.markCollected);
  const fleeDumpling = useGame((s) => s.fleeDumpling);
  const [shake, setShake] = useState(false);
  const [sel, setSel] = useState(0);
  const pickRef = useRef<(n: number) => void>(() => {});
  const selRef = useRef(0);
  selRef.current = sel;

  function pick(n: number) {
    if (!quiz) return;
    if (n === quiz.q.answer) {
      sfx.correct();
      markCollected(quiz.dumplingId);
    } else if (quiz.attempts >= 1) {
      sfx.wrong();
      sfx.flee();
      fleeDumpling(quiz.dumplingId);
    } else {
      sfx.wrong();
      bumpAttempt();
      setShake(true);
      window.setTimeout(() => setShake(false), 400);
    }
  }
  pickRef.current = pick;

  useEffect(() => {
    let prevA = false;
    let prevUp = false;
    let prevDown = false;
    let raf = 0;
    const loop = () => {
      const pads = navigator.getGamepads?.() ?? [];
      const pad = pads.find((p) => p && p.buttons.length > 0);
      if (pad) {
        const a = Boolean(pad.buttons[0]?.pressed);
        const up = Boolean(pad.buttons[12]?.pressed) || (pad.axes[1] ?? 0) < -0.55;
        const down = Boolean(pad.buttons[13]?.pressed) || (pad.axes[1] ?? 0) > 0.55;
        const n = useGame.getState().quiz?.q.choices.length ?? 3;
        if (up && !prevUp) setSel((s) => (s - 1 + n) % n);
        if (down && !prevDown) setSel((s) => (s + 1) % n);
        if (a && !prevA) {
          const q = useGame.getState().quiz;
          if (q) {
            const i = ((selRef.current % n) + n) % n;
            pickRef.current(q.q.choices[i]!);
          }
        }
        prevA = a;
        prevUp = up;
        prevDown = down;
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  if (!quiz) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-ink/45 p-4">
      <Panel className={cn("w-full max-w-md p-6", shake && "animate-pulse")}>
        <p className="text-sm font-semibold text-ink-soft">Solve it to keep the dumpling</p>
        <p className="mt-2 font-display text-4xl font-semibold tabular-nums tracking-tight">
          {quiz.q.prompt} = ?
        </p>
        {quiz.q.visual && (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {quiz.q.visual.map((n, i) => (
              <div key={i} className="flex items-center gap-3">
                {i > 0 && <span className="font-display text-2xl text-ink-soft">+</span>}
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: n }).map((_, j) => (
                    <span key={j} className="size-4 rounded-full bg-accent/80" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-6 grid gap-2">
          {quiz.q.choices.map((c, i) => (
            <button
              key={c}
              type="button"
              onClick={() => pick(c)}
              className={cn(
                "press chunk-sm min-h-20 font-display text-4xl font-semibold tabular-nums text-ink",
                i === sel % quiz.q.choices.length ? "bg-sun" : "bg-surface-2",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        {quiz.attempts > 0 && (
          <p className="mt-3 text-sm text-ink-soft">
            Almost. One more miss and it will run away.
          </p>
        )}
        <p className="mt-2 text-xs text-ink-soft">Controller: D-pad to choose, A to answer.</p>
      </Panel>
    </div>
  );
}

function PauseScreen() {
  const resumePlay = useGame((s) => s.resumePlay);
  const toTitle = useGame((s) => s.toTitle);
  const fullscreen = useFullscreen();
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-ink/45 p-4">
      <Panel className="w-full max-w-sm p-6 text-center">
        <h2 className="font-display text-3xl font-semibold">Paused</h2>
        <p className="mt-2 text-ink-soft">The dumplings will wait.</p>
        <div className="mt-5 grid gap-2">
          <Btn onClick={resumePlay} className="gap-2">
            <Play className="size-4" />
            Keep hunting
          </Btn>
          {canFullscreen() && (
            <Btn variant="secondary" onClick={() => void toggleFullscreen()} className="gap-2">
              {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
              {fullscreen ? "Exit fullscreen" : "Fullscreen"}
            </Btn>
          )}
          <Btn variant="secondary" onClick={toTitle}>
            Back to title
          </Btn>
        </div>
      </Panel>
    </div>
  );
}

function CompleteScreen() {
  const levelIndex = useGame((s) => s.levelIndex);
  const playerName = useGame((s) => s.playerName);
  const nextLevel = useGame((s) => s.nextLevel);
  const replayLevel = useGame((s) => s.replayLevel);
  const toTitle = useGame((s) => s.toTitle);
  const lastRun = useGame((s) => s.lastRun);
  const level = LEVELS[levelIndex]!;
  const next = LEVELS[levelIndex + 1];
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-ink/45 p-4">
      <Panel className="max-h-full w-full max-w-lg overflow-y-auto p-6 text-center">
        <p className="text-sm font-semibold text-ok">Park complete</p>
        <h2 className="mt-1 font-display text-3xl font-semibold">
          {playerName ? `${playerName} found them all` : "Every dumpling found"}
        </h2>
        <p className="mt-2 leading-relaxed text-ink-soft">
          {level.dumplings.length} squishy dumplings rescued from {level.name}.
        </p>

        {lastRun ? (
          <div className="chunk-sm mt-4 bg-sun px-4 py-3">
            <p className="font-display text-4xl font-semibold tabular-nums">
              {clock(lastRun.seconds)}
            </p>
            <p className="mt-0.5 font-display text-base font-semibold">
              {lastRun.rank === 1
                ? "Fastest time yet!"
                : lastRun.best
                  ? `Your best so far, ${ordinal(lastRun.rank)} overall`
                  : "Not your quickest this time"}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">
            Runs are only timed when you start a park from the beginning.
          </p>
        )}

        <p className="mt-5 font-display text-lg font-semibold">Best times</p>
        <BestTimes levelIndex={levelIndex} highlight={lastRun?.rank} />
        <div className="mt-5 grid gap-2">
          {next && <Btn onClick={nextLevel}>Play {next.name}</Btn>}
          <Btn variant="secondary" onClick={replayLevel}>
            Hunt this park again
          </Btn>
          <Btn variant="ghost" onClick={toTitle}>
            Title
          </Btn>
        </div>
      </Panel>
    </div>
  );
}

function VictoryScreen() {
  const playerName = useGame((s) => s.playerName);
  const replayLevel = useGame((s) => s.replayLevel);
  const toTitle = useGame((s) => s.toTitle);
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-ink/45 p-4">
      <Panel className="w-full max-w-md p-6 text-center">
        <p className="text-sm font-semibold text-ok">The hunt is over</p>
        <h2 className="mt-1 font-display text-3xl font-semibold">
          Happy birthday{playerName ? `, ${playerName}` : ", Sloan"}
        </h2>
        <p className="mt-2 leading-relaxed text-ink-soft">
          You searched the park, the village, and the castle in the clouds. Every squishy dumpling
          is home.
        </p>
        <div className="mt-5 grid gap-2">
          <Btn onClick={replayLevel}>Play Cloud Castle again</Btn>
          <Btn variant="secondary" onClick={toTitle}>
            Back to title
          </Btn>
        </div>
      </Panel>
    </div>
  );
}

export function Overlays() {
  const phase = useGame((s) => s.phase);
  const muted = useGame((s) => s.muted);

  useEffect(() => {
    setMuted(muted);
  }, [muted]);

  return (
    <div className="overlay-root">
      <PadMenu />
      {phase === "title" && <TitleScreen />}
      {(phase === "playing" || phase === "paused" || phase === "quiz") && <HUD />}
      {phase === "quiz" && <Quiz />}
      {(phase === "playing" || phase === "quiz") && <MiniMap />}
      <CatchCard />
      {(phase === "playing" || phase === "quiz") && <RpsPanel />}
      {phase === "paused" && <PauseScreen />}
      {phase === "complete" && <CompleteScreen />}
      {phase === "victory" && <VictoryScreen />}
    </div>
  );
}
