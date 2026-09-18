import { activePad } from "./input";
import { ControlsRemap } from "./controls-remap";
import { SPOTS } from "./furniture";
import { HomePanel } from "./home-panel";
import { useHome } from "./home-store";
import { CHANNELS } from "./music";
import { HELP_CARDS, HelpCard, type HelpId } from "./help-cards";
import { currentVoiceName, rankedVoices, setSpeechEnabled, setVoiceName, speak } from "./speech";
import { QuestPanel } from "./quest-panel";
import { Journal } from "./journal";
import { CarnivalPanel } from "./carnival-games";
import { GolfOverlay } from "./minigolf-ui";
import type { BoothGame } from "./carnival";
import { useEffect, useRef, useState } from "react";
import {
  ArrowBigUp,
  Cake,
  Calculator,
  Candy,
  Castle,
  Compass,
  Crown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  Footprints,
  Hand,
  Lightbulb,
  Lock,
  LogOut,
  Map as MapIcon,
  Palette,
  Scissors,
  Search,
  Thermometer,
  Timer,
  Trees,
  UserRound,
  type LucideIcon,
  BookOpen,
  FerrisWheel,
  Flag,
  Gamepad2,
  Gauge,
  PartyPopper,
  Ticket,
  Music,
  HelpCircle,
  Maximize,
  Minimize,
  MonitorCog,
  RotateCcw,
  Shirt,
  Trophy,
  Pause,
  Play,
  Sparkles,
  Volume2,
  VolumeX,
  X,
  House,
  Truck,
} from "lucide-react";
import { bindingLabel } from "./bindings";
import { canFullscreen, enterFullscreen, toggleFullscreen, useFullscreen } from "./fullscreen";
import { HITCH_MS, debugEnabled, perf } from "./debug";
import { ACCESSORIES, accessory } from "./accessories";
import { ItemThumb } from "./item-thumbs";
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

/** the warm/cold word as a solid pill, so it reads from the sofa */
const TEMP_PILL: Record<string, string> = {
  freezing: "bg-cold text-white",
  cold: "bg-cold text-white",
  chilly: "bg-sky text-ink",
  lukewarm: "bg-surface-3 text-ink",
  warm: "bg-warm text-white",
  hot: "bg-accent text-white",
  burning: "bg-accent text-white",
};

export function Panel({
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

export function Btn({
  children,
  onClick,
  variant = "primary",
  className,
  disabled,
  type = "button",
  padDefault,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  /** where the controller lands when this screen opens */
  padDefault?: boolean;
  /** primary: coral, the one thing to press. go: teal. sun: rewards. grape: special. secondary: white. */
  variant?: "primary" | "secondary" | "ghost" | "go" | "sun" | "grape";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      data-pad-default={padDefault || undefined}
      className={cn(
        "press inline-flex min-h-12 items-center justify-center gap-2 px-6 font-display text-lg font-semibold tracking-wide",
        variant !== "ghost" && "chunk-sm gloss",
        // the one thing to press gets a slow jewel shimmer
        variant === "primary" && "ui-shimmer bg-accent text-accent-fg [text-shadow:0_2px_0_rgb(0_0_0/0.15)]",
        variant === "go" && "bg-teal text-white [text-shadow:0_2px_0_rgb(0_0_0/0.15)]",
        variant === "sun" && "bg-sun text-ink",
        variant === "grape" && "bg-grape text-white [text-shadow:0_2px_0_rgb(0_0_0/0.15)]",
        variant === "secondary" && "bg-surface text-ink",
        variant === "ghost" && "bg-transparent text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ---------- shared modal pieces ---------- */

type Tone = "accent" | "teal" | "sun" | "grape" | "blue" | "leaf" | "berry";

const RIBBON_BG: Record<Tone, string> = {
  accent: "bg-accent text-white",
  teal: "bg-teal text-white",
  sun: "bg-sun text-ink",
  grape: "bg-grape text-white",
  blue: "bg-accent-2 text-white",
  leaf: "bg-leaf text-white",
  berry: "bg-berry text-white",
};

const TONE_TEXT: Record<Tone, string> = {
  accent: "text-accent",
  teal: "text-teal",
  sun: "text-sun-deep",
  grape: "text-grape",
  blue: "text-accent-2",
  leaf: "text-leaf",
  berry: "text-berry",
};

/**
 * Full-screen dimmed layer behind a modal. Keeps `pointer-events-auto inset-0`
 * and a z class, which is how the pad menu finds the topmost layer.
 */
function Layer({
  children,
  z,
  onClick,
}: {
  children: React.ReactNode;
  z: "z-30" | "z-40";
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        "ui-backdrop animate-ui-fade pointer-events-auto absolute inset-0 flex items-center justify-center",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))]",
        "lg:pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:pt-[max(1.5rem,env(safe-area-inset-top))]",
        z,
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

/**
 * The modal card: a coloured ribbon with an icon badge and title, then a body
 * that scrolls inside the card when the screen is too short for it.
 */
function Sheet({
  tone,
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  onClose,
  closeLabel,
  className,
  bodyClassName,
  children,
}: {
  tone: Tone;
  icon: LucideIcon;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  const light = tone === "sun";
  return (
    <div
      className={cn(
        "chunk animate-ui-pop flex max-h-full w-full flex-col overflow-hidden bg-surface text-ink",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={cn(
          "ui-ribbon relative flex shrink-0 items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4 [@media(max-height:520px)]:py-2",
          RIBBON_BG[tone],
        )}
      >
        <span className="chunk-sm gloss grid size-12 shrink-0 place-items-center rounded-full bg-surface sm:size-14 [@media(max-height:520px)]:size-11">
          <Icon className={cn("size-6 sm:size-8 [@media(max-height:520px)]:size-6", TONE_TEXT[tone])} strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p
              className={cn(
                "font-display text-sm font-semibold uppercase tracking-wider sm:text-base",
                light ? "text-ink/70" : "text-white/85",
              )}
            >
              {eyebrow}
            </p>
          )}
          <h2
            className={cn(
              "font-display text-2xl font-semibold leading-tight sm:text-3xl 2xl:text-4xl",
              !light && "[text-shadow:0_2px_0_rgb(0_0_0/0.18)]",
            )}
          >
            {title}
          </h2>
          {subtitle && (
            <p className={cn("mt-0.5 text-base font-semibold sm:text-lg", light ? "text-ink/75" : "text-white/90")}>
              {subtitle}
            </p>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="press chunk-sm gloss grid size-12 shrink-0 place-items-center rounded-full bg-surface text-ink [@media(max-height:520px)]:size-11"
          >
            <X className="size-6" strokeWidth={2.6} />
          </button>
        )}
      </div>
      <div
        className={cn(
          "ui-dots min-h-0 touch-pan-y overflow-y-auto overscroll-contain p-4 sm:p-6 [@media(max-height:520px)]:p-3",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </div>
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
      <p className="mt-3 rounded-[1.1rem] border-[3px] border-dashed border-line bg-surface px-4 py-3 text-base text-ink-soft">
        No times yet. Finish a park from the start to set one.
      </p>
    );
  }
  const medal = ["1st", "2nd", "3rd"];
  const medalBg = ["bg-sun", "bg-surface-3", "bg-[#f3b98c]"];
  return (
    <ul className="mt-3 grid gap-1.5">
      {rows.map((r, i) => (
        <li
          key={`${r.name}-${r.at}`}
          className={cn(
            "chunk-sm flex items-center gap-3 py-1 pl-1.5 pr-3 text-left",
            highlight === i + 1 ? "bg-sun" : "bg-surface",
          )}
        >
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full border-[2.5px] border-edge font-display text-sm font-bold",
              highlight === i + 1 ? "bg-surface" : (medalBg[i] ?? "bg-surface-2"),
            )}
          >
            {medal[i] ?? `${i + 1}th`}
          </span>
          <span className="min-w-0 flex-1 truncate font-display text-lg font-semibold">{r.name}</span>
          <span className="font-display text-xl font-bold tabular-nums">{clock(r.seconds)}</span>
          <span className="w-16 text-right text-sm font-semibold text-ink-soft">
            {r.hintsUsed === 0 ? "no hints" : `${r.hintsUsed} hint${r.hintsUsed > 1 ? "s" : ""}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

const PARK_ICON: LucideIcon[] = [Trees, Candy, Castle];
const PARK_TINT = ["bg-leaf", "bg-berry", "bg-grape"];
const PARK_GEM = ["var(--color-emerald)", "var(--color-ruby)", "var(--color-amethyst)"];

/** Where the twinkles sit around the logo, as % of the logo box. */
const LOGO_SPARKLES = [
  { left: "-3%", top: "8%", size: "1.6rem", delay: "0.9s" },
  { left: "88%", top: "-4%", size: "2.1rem", delay: "1.5s" },
  { left: "63%", top: "44%", size: "1.2rem", delay: "2.3s" },
  { left: "96%", top: "62%", size: "1.5rem", delay: "0.4s" },
  { left: "8%", top: "90%", size: "1.1rem", delay: "1.9s" },
];

type TitleDetail = "explorer" | "help" | "times" | "reset" | null;

/** One row of the start menu. The sliding selector bar behind it follows focus. */
function MenuItem({
  icon: Icon,
  tint,
  label,
  side,
  active,
  onClick,
  onFocus,
  itemRef,
  delay,
}: {
  icon: LucideIcon;
  tint: string;
  label: React.ReactNode;
  side?: React.ReactNode;
  active: boolean;
  onClick: () => void;
  onFocus: () => void;
  itemRef: (el: HTMLButtonElement | null) => void;
  delay: number;
}) {
  return (
    <button
      ref={itemRef}
      type="button"
      onClick={onClick}
      onFocus={onFocus}
      data-sel={active || undefined}
      className="ui-menu-item animate-ui-slide relative z-[1] flex min-h-12 w-full items-center gap-3 rounded-[1rem] py-1.5 pl-3 pr-3 text-left font-display text-xl font-semibold text-ink lg:min-h-[3.25rem] 2xl:min-h-[4.5rem] 2xl:gap-4 2xl:pl-4 2xl:text-3xl [@media(max-height:520px)]:min-h-10 [@media(max-height:520px)]:text-lg"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full border-[2.5px] border-edge bg-surface 2xl:size-12 [@media(max-height:520px)]:size-8",
          tint,
        )}
      >
        <Icon className="size-5 2xl:size-7 [@media(max-height:520px)]:size-4" strokeWidth={2.5} />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {side}
    </button>
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
  const [detail, setDetail] = useState<TitleDetail>(null);
  const fullscreen = useFullscreen();
  const toggleWardrobe = useGame((s) => s.toggleWardrobe);
  const setControls = useGame((s) => s.setControls);

  // the selector bar slides to whichever menu row has focus
  const [sel, setSel] = useState(0);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    /*
     * Measure the row against the scrolling box the bar lives in. offsetTop is
     * relative to the nearest positioned ancestor, which is the inner grid, so
     * it left the bar short by the box's padding and the highlight sat off the
     * row it was meant to be on.
     */
    const place = () => {
      const el = rows.current[sel];
      const list = listRef.current;
      if (!el || !list) return;
      const r = el.getBoundingClientRect();
      const lr = list.getBoundingClientRect();
      setBar({ top: r.top - lr.top + list.scrollTop, height: r.height });
    };
    place();
    // fonts and the pop-in animation settle a frame or two later
    const raf = requestAnimationFrame(place);
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return () => cancelAnimationFrame(raf);
    const ro = new ResizeObserver(place);
    ro.observe(list);
    for (const el of rows.current) if (el) ro.observe(el);
    list.addEventListener("scroll", place, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      list.removeEventListener("scroll", place);
    };
  }, [sel, unlocked, detail]);

  /*
   * Wipe and reload. The park is built once, so without the reload the old
   * world stays up: pickups she had already taken never come back, and the
   * backpack cannot be found again, which leaves nothing carryable.
   */
  const startOver = (bestTimes: boolean) => {
    sfx.click();
    resetAll({ bestTimes });
    setDetail(null);
    window.setTimeout(() => window.location.reload(), 150);
  };

  const toggle = (d: Exclude<TitleDetail, null>) => {
    sfx.click();
    setDetail((cur) => (cur === d ? null : d));
  };

  const dressHex = DRESS_OPTS.find((o) => o.id === dress)?.hex ?? DRESS_OPTS[0]!.hex;
  const unlockedParks = LEVELS.map((lv, i) => ({ lv, i })).filter(({ i }) => i <= unlocked);
  const lockedCount = LEVELS.length - unlockedParks.length;

  let row = 0;
  const rowProps = () => {
    const i = row++;
    return {
      active: sel === i,
      onFocus: () => setSel(i),
      itemRef: (el: HTMLButtonElement | null) => {
        rows.current[i] = el;
      },
      delay: 260 + i * 55,
    };
  };

  const detailTitle: Record<Exclude<TitleDetail, null>, { icon: LucideIcon; text: string; tone: string }> = {
    explorer: { icon: UserRound, text: "Explorer", tone: "bg-accent-2" },
    help: { icon: HelpCircle, text: "How to play", tone: "bg-teal" },
    times: { icon: Trophy, text: "Best times", tone: "bg-sun text-ink" },
    reset: { icon: RotateCcw, text: "Start over", tone: "bg-berry" },
  };
  const D = detail ? detailTitle[detail] : null;

  // Wide landscape screens (the TV, a phone on its side): logo and any open
  // detail card on the left, the menu on the right. Portrait stacks and scrolls.
  return (
    <div
      className={cn(
        "pointer-events-auto relative flex h-full w-full flex-col overflow-y-auto touch-pan-y",
        "bg-[radial-gradient(ellipse_at_30%_35%,rgb(255_190_230/0.18)_0%,rgb(46_24_86/0)_40%,rgb(46_24_86/0.5)_100%)]",
        "pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1.25rem,env(safe-area-inset-top))]",
        "sm:landscape:overflow-hidden lg:pb-[max(1.75rem,env(safe-area-inset-bottom))] lg:pl-[max(2.5rem,env(safe-area-inset-left))] lg:pr-[max(2.5rem,env(safe-area-inset-right))] lg:pt-[max(1.75rem,env(safe-area-inset-top))]",
      )}
    >
      <div className="ui-rays fixed [--rays-x:50%] [--rays-y:14%] sm:landscape:[--rays-x:26%] sm:landscape:[--rays-y:30%]" aria-hidden />

      <div className="relative mx-auto grid w-full max-w-6xl flex-1 content-center items-center gap-5 sm:landscape:[align-content:stretch] sm:landscape:h-full sm:landscape:min-h-0 sm:landscape:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] sm:landscape:grid-rows-[auto_minmax(0,1fr)] sm:landscape:gap-x-8 sm:landscape:gap-y-4 lg:gap-x-14 2xl:max-w-[92rem] 2xl:gap-x-24">
        {/* the logo, dropping in with a bounce */}
        <section className="flex flex-col items-center text-center sm:landscape:col-start-1 sm:landscape:row-start-1 sm:landscape:items-start sm:landscape:self-end sm:landscape:text-left">
          <span className="ui-chip gloss animate-ui-pop bg-sun text-sm text-ink [@media(max-height:520px)]:hidden">
            <Sparkles className="size-4" />
            v3.2
          </span>
          <h1 className="animate-ui-drop relative mt-2 text-[clamp(3.25rem,min(9.5vw,14.5vh),10.5rem)] leading-[0.92] [@media(max-height:520px)]:mt-0">
            <span className="ui-title ui-logo" data-text="Sloanie's">
              Sloanie's
            </span>{" "}
            <br />
            <span className="ui-title ui-logo" data-text="World">
              World
            </span>
            {LOGO_SPARKLES.map((s) => (
              <span
                key={s.left + s.top}
                className="ui-sparkle"
                aria-hidden
                style={{ left: s.left, top: s.top, width: s.size, ["--delay" as string]: s.delay }}
              />
            ))}
          </h1>
          <p className="animate-ui-pulse mt-4 inline-flex items-center gap-2 rounded-full border-[3px] border-edge bg-edge/80 py-1 pl-1 pr-4 font-display text-base font-semibold text-white shadow-[0_4px_0_rgb(46_24_86/0.5)] 2xl:mt-6 2xl:text-2xl [@media(max-height:520px)]:mt-2 [@media(max-height:520px)]:text-sm">
            <span className="grid size-7 place-items-center rounded-full border-2 border-white/80 bg-leaf font-bold leading-none 2xl:size-10 pointer-coarse:hidden">
              A
            </span>
            <span className="pointer-coarse:hidden">Press A or Enter to play</span>
            <span className="hidden pointer-coarse:inline">
              <Play className="mr-1 inline size-4 fill-current align-[-2px]" />
              Tap a park to play
            </span>
          </p>
        </section>

        {/* the start menu */}
        <nav
          aria-label="Main menu"
          className="chunk animate-ui-rise relative flex min-h-0 flex-col overflow-hidden bg-surface/95 sm:landscape:col-start-2 sm:landscape:row-span-2 sm:landscape:row-start-1 sm:landscape:max-h-full sm:landscape:self-center"
        >
          <div ref={listRef} className="ui-dots relative min-h-0 touch-pan-y overflow-y-auto overscroll-contain p-3 lg:p-4 2xl:p-6 [@media(max-height:520px)]:p-2">
            {bar && (
              <span
                aria-hidden
                className="ui-menu-bar pointer-events-none absolute inset-x-3 z-0 lg:inset-x-4 2xl:inset-x-6 [@media(max-height:520px)]:inset-x-2"
                style={{ transform: `translateY(${bar.top}px)`, height: bar.height, top: 0 }}
              >
                <span className="ui-gem ui-gem-diamond absolute -left-2.5 top-1/2 size-6 -translate-y-1/2 [--gem:var(--color-sun)] 2xl:size-8" />
              </span>
            )}

            <div className="relative grid gap-1.5 2xl:gap-2.5">
              {unlockedParks.map(({ lv, i }) => {
                const found = collected[i]?.length ?? 0;
                const ParkIcon = PARK_ICON[i] ?? Trees;
                const p = rowProps();
                return (
                  <button
                    key={lv.id}
                    ref={p.itemRef}
                    type="button"
                    data-pad-default={i === 0 ? "" : undefined}
                    onFocus={p.onFocus}
                    data-sel={p.active || undefined}
                    onClick={() => {
                      unlockAudio();
                      sfx.click();
                      // Start is a real click, which is the one moment the browser
                      // lets us go fullscreen; refused silently for pad-driven clicks.
                      void enterFullscreen();
                      startLevel(i);
                    }}
                    className="ui-menu-item animate-ui-slide relative z-[1] flex min-h-[4.5rem] w-full items-center gap-3 rounded-[1rem] py-2 pl-3 pr-3 text-left text-ink 2xl:min-h-28 2xl:gap-5 2xl:pl-4 [@media(max-height:520px)]:min-h-14"
                    style={{ animationDelay: `${p.delay}ms` }}
                  >
                    <span
                      className={cn(
                        "gloss grid size-12 shrink-0 place-items-center rounded-full border-[3px] border-edge text-white lg:size-14 2xl:size-20 [@media(max-height:520px)]:size-10",
                        PARK_TINT[i] ?? "bg-leaf",
                      )}
                    >
                      <ParkIcon className="size-6 lg:size-7 2xl:size-10" strokeWidth={2.4} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="ui-menu-eyebrow block font-display text-xs font-semibold uppercase tracking-wider text-ink-soft 2xl:text-base [@media(max-height:520px)]:hidden">
                        {i === 0 ? "Play" : "Next park"}
                      </span>
                      <span className="block font-display text-2xl font-semibold leading-tight 2xl:text-4xl [@media(max-height:520px)]:text-xl">
                        {lv.name}
                      </span>
                    </span>
                    <span
                      className="ui-gem shrink-0 px-2.5 py-1 font-display text-base font-bold tabular-nums leading-none [text-shadow:0_1.5px_0_rgb(46_24_86/0.55)] 2xl:px-4 2xl:py-2 2xl:text-2xl"
                      style={{ ["--gem" as string]: PARK_GEM[i] ?? PARK_GEM[0] }}
                    >
                      {found}/{lv.dumplings.length}
                    </span>
                    <span className="ui-shimmer gloss hidden size-10 shrink-0 place-items-center rounded-full border-[3px] border-edge bg-accent text-white sm:grid 2xl:size-14">
                      <Play className="ml-0.5 size-5 fill-current 2xl:size-7" />
                    </span>
                  </button>
                );
              })}

              {lockedCount > 0 && (
                <div className="animate-ui-slide flex flex-wrap items-center gap-2 px-3 pb-1 pt-0.5" style={{ animationDelay: "300ms" }}>
                  {LEVELS.map((lv, i) =>
                    i > unlocked ? (
                      <button
                        key={lv.id}
                        type="button"
                        disabled
                        className="flex items-center gap-1.5 rounded-full border-[2.5px] border-dashed border-muted/70 bg-surface-2 px-3 py-0.5 font-display text-sm font-semibold text-muted 2xl:text-lg"
                      >
                        <Lock className="size-3.5 2xl:size-5" />
                        Locked park
                      </button>
                    ) : null,
                  )}
                </div>
              )}

              <div className="mx-3 my-0.5 h-[3px] rounded-full bg-[linear-gradient(90deg,rgb(46_24_86/0),rgb(46_24_86/0.14),rgb(46_24_86/0))]" aria-hidden />

              <MenuItem
                {...rowProps()}
                icon={UserRound}
                tint="text-accent-2"
                label="Explorer"
                side={
                  <span className="flex min-w-0 max-w-[45%] items-center gap-2 font-display text-base font-semibold text-ink-soft 2xl:text-2xl">
                    <span className="truncate">{playerName || "Sloan"}</span>
                    <span className="size-5 shrink-0 rounded-full border-[2.5px] border-edge 2xl:size-7" style={{ backgroundColor: dressHex }} />
                  </span>
                }
                onClick={() => toggle("explorer")}
              />
              <MenuItem {...rowProps()} icon={HelpCircle} tint="text-teal" label="How to play" onClick={() => toggle("help")} />
              <MenuItem
                {...rowProps()}
                icon={Gamepad2}
                tint="text-accent-2"
                label="Controls"
                onClick={() => {
                  sfx.click();
                  setControls(true);
                }}
              />
              <MenuItem
                {...rowProps()}
                icon={Shirt}
                tint="text-grape"
                label="Wardrobe"
                onClick={() => {
                  sfx.click();
                  toggleWardrobe();
                }}
              />
              <MenuItem {...rowProps()} icon={Trophy} tint="text-sun-deep" label="Best times" onClick={() => toggle("times")} />
              {canFullscreen() && (
                <MenuItem
                  {...rowProps()}
                  icon={fullscreen ? Minimize : Maximize}
                  tint="text-ink"
                  label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                  onClick={() => {
                    sfx.click();
                    void toggleFullscreen();
                  }}
                />
              )}
              <MenuItem {...rowProps()} icon={RotateCcw} tint="text-berry" label="Start over" onClick={() => toggle("reset")} />
            </div>
          </div>
        </nav>

        {/* the open detail card: the blurb until something is picked */}
        <section className="flex min-h-0 flex-col items-center sm:landscape:col-start-1 sm:landscape:row-start-2 sm:landscape:max-h-full sm:landscape:items-start sm:landscape:self-start">
          {!D ? (
            <p className="ui-glass animate-ui-rise max-w-md px-4 py-2.5 text-center text-base font-semibold leading-snug text-ink sm:landscape:text-left lg:text-lg 2xl:max-w-xl 2xl:px-5 2xl:py-3 2xl:text-2xl [@media(max-height:520px)]:hidden">
              Help Sloan hunt hidden dumplings across giant parks, then solve a little math to keep
              each one. Parks unlock one at a time.
            </p>
          ) : (
            <div key={detail} className="chunk animate-ui-pop flex max-h-full min-h-0 w-full max-w-md flex-col overflow-hidden bg-surface text-left 2xl:max-w-xl">
              <div className={cn("ui-ribbon flex shrink-0 items-center gap-2.5 px-3 py-2 text-white 2xl:px-5 2xl:py-3", D.tone)}>
                <span className="chunk-sm gloss grid size-9 shrink-0 place-items-center rounded-full bg-surface text-ink 2xl:size-12">
                  <D.icon className="size-5 2xl:size-7" strokeWidth={2.4} />
                </span>
                <h2 className="min-w-0 flex-1 font-display text-xl font-semibold [text-shadow:0_2px_0_rgb(0_0_0/0.15)] 2xl:text-3xl">{D.text}</h2>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => {
                    sfx.click();
                    setDetail(null);
                  }}
                  className="press chunk-sm gloss grid size-10 shrink-0 place-items-center rounded-full bg-surface text-ink 2xl:size-12"
                >
                  <X className="size-5" strokeWidth={2.6} />
                </button>
              </div>
              <div tabIndex={0} className="ui-scroll ui-dots min-h-0 touch-pan-y overflow-y-auto overscroll-contain p-3 lg:p-4 2xl:p-6">
                {detail === "explorer" && (
                  <>
                    <label className="block font-display text-base font-semibold text-ink-soft 2xl:text-xl">
                      <span className="flex items-center gap-2">
                        <UserRound className="size-5 text-accent-2" />
                        Explorer name
                      </span>
                      <input
                        value={playerName}
                        onChange={(e) => setName(e.target.value.slice(0, 18))}
                        placeholder="Sloan"
                        className="chunk-sm mt-2 block h-12 w-full bg-surface-2 px-4 font-display text-xl font-semibold text-ink outline-none placeholder:text-muted 2xl:h-16 2xl:text-3xl"
                      />
                    </label>
                    <p className="mt-3 flex items-center gap-2 font-display text-base font-semibold text-ink-soft 2xl:mt-5 2xl:text-xl">
                      <Palette className="size-5 text-accent" />
                      Dress
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2.5">
                      {DRESS_OPTS.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          aria-label={o.label}
                          onClick={() => setDress(o.id)}
                          className={cn(
                            "press grid size-12 place-items-center rounded-full border-[3px] border-edge shadow-[inset_0_3px_0_rgb(255_255_255/0.35),0_3px_0_var(--color-edge)] 2xl:size-16",
                            dress === o.id && "scale-110",
                          )}
                          style={{ backgroundColor: o.hex }}
                        >
                          {dress === o.id && <Check className="size-6 text-white drop-shadow-[0_2px_0_rgb(46_24_86/0.6)]" strokeWidth={3.5} />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {detail === "times" && (
                  <>
                    <p className="flex items-center gap-2 font-display text-lg font-semibold">
                      <Trophy className="size-5 text-sun-deep" />
                      {LEVELS[0]!.name}
                    </p>
                    <BestTimes levelIndex={0} />
                    <p className="mt-2 text-base text-ink-soft">
                      Change the explorer name and each player keeps their own best time.
                    </p>
                  </>
                )}
                {detail === "reset" && (
                  <>
                    <p className="text-base font-semibold text-ink 2xl:text-xl">
                      Start a brand new adventure? Dumplings, stickers, tickets, pets, prizes and the house all go back
                      to the beginning.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2.5">
                      <Btn onClick={() => startOver(false)}>Yes, start over</Btn>
                      <Btn variant="secondary" onClick={() => startOver(true)}>
                        Start over and clear best times
                      </Btn>
                      <Btn variant="ghost" onClick={() => setDetail(null)}>
                        Cancel
                      </Btn>
                    </div>
                  </>
                )}
                {detail === "help" && (
                  <ul className="grid gap-2 text-base leading-snug text-ink 2xl:text-xl">
                    {[
                      "Find the hidden dumplings! Warm means close. Cold means far.",
                      `Next to one? Press Collect (${bindingLabel("collect")}) and answer the math.`,
                      "Miss twice and it runs off to hide somewhere new.",
                      "Find the backpack on the ball field. Then you can carry things.",
                      `Open your backpack with ${bindingLabel("journal")}.`,
                      "The sticker book is near the start. 30 stickers are hiding in the park.",
                      "Emmett rides up on his trike. Beat him at rock paper scissors to keep your dumplings.",
                      "Grab a juice box to run super fast for a little while.",
                      "At the carnival, play games to win tickets. Spend them at the prize booth.",
                      "Farmer Joe at the farm lost his pets. Can you bring them home?",
                      `Press ${bindingLabel("music")} to play music on your iPod. Stand still and you will dance!`,
                      "Find the big mountain and explore the cave inside.",
                      `Walk with W A S D or the left stick. Jump with ${bindingLabel("jump")}.`,
                      "Turn the camera with the shoulder buttons, or by dragging the screen.",
                    ].map((line) => (
                      <li key={line} className="flex gap-2.5">
                        <span className="mt-1.5 size-2.5 shrink-0 rotate-45 rounded-[2px] border-2 border-edge bg-rose" />
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
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
  const rideNear = useGame((s) => s.rideNear);
  const boardReady = useGame((s) => s.boardReady);
  const carnivalNear = useGame((s) => s.carnivalNear);
  const golfNear = useGame((s) => s.golfNear);
  const golfPlaying = useGame((s) => s.golfPlaying);
  const carouselRing = useGame((s) => s.carouselRing);
  const carnivalOpen = useGame((s) => s.carnival);
  const questNear = useGame((s) => s.questNear);
  const homeNear = useHome((s) => s.near);
  const emmettTalkNear = useGame((s) => s.emmettTalkNear);
  const homeOpen = useHome((s) => s.panel);
  const questOpen = useGame((s) => s.questPanel);
  const tickets = useGame((s) => s.tickets);
  const riding = useGame((s) => s.riding);
  const rps = useGame((s) => s.rps);
  const setControls = useGame((s) => s.setControls);
  const level = LEVELS[levelIndex]!;
  const found = collected[levelIndex]?.length ?? 0;

  const close = temp === "warm" || temp === "hot" || temp === "burning";
  const status = emmettNotice
    ? emmettNotice
    : fleeNotice
    ? fleeNotice
    : nearCollect
      ? `${playerName ? `${playerName}, ` : ""}this is ${nearestName}. Press Collect!`
      : boardReady
        ? "All aboard the ferris wheel!"
        : rideNear
        ? "Ferris wheel! Stand on the yellow platform and press Collect to ride."
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

  // colour and icon for the status toast, following the same order as `status`
  const toast: { Icon: LucideIcon; gem: string } = emmettNotice
    ? { Icon: Truck, gem: "var(--color-amethyst)" }
    : fleeNotice
      ? { Icon: Footprints, gem: "var(--color-ruby)" }
      : nearCollect
        ? { Icon: Hand, gem: "var(--color-accent)" }
        : boardReady || rideNear
          ? { Icon: FerrisWheel, gem: "var(--color-sapphire)" }
          : close
            ? { Icon: Thermometer, gem: "var(--color-warm)" }
            : { Icon: Search, gem: "var(--color-teal)" };

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        {/* round icon buttons, top right; the phone minimap sits just under them */}
        <div
          className={cn(
            "pointer-events-auto absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] flex gap-1.5 sm:gap-2 2xl:gap-3",
            // putting has its own Quit button up here, and its own scoreboard
            golfPlaying && "hidden",
          )}
        >
          <IconBtn label="Controls" tint="text-accent-2" onClick={() => setControls(true)}>
            <Gamepad2 className="size-5 2xl:size-7" />
          </IconBtn>
          <IconBtn
            label="iPod: next song"
            tint="text-accent"
            onClick={() => {
              unlockAudio();
              useGame.getState().requestNextChannel();
            }}
          >
            <Music className="size-5 2xl:size-7" />
          </IconBtn>
          <IconBtn label="Journal" tint="text-grape" onClick={toggleJournal}>
            <BookOpen className="size-5 2xl:size-7" />
          </IconBtn>
          <IconBtn
            label={muted ? "Unmute" : "Mute"}
            tint="text-teal"
            onClick={() => {
              toggleMute();
              setMuted(!muted);
            }}
          >
            {muted ? <VolumeX className="size-5 2xl:size-7" /> : <Volume2 className="size-5 2xl:size-7" />}
          </IconBtn>
          <IconBtn label="Pause" tint="text-berry" onClick={pause}>
            <Pause className="size-5 fill-current 2xl:size-7" />
          </IconBtn>
        </div>

        {/*
          Left column: status, then the toast and the hint under it, so nothing
          sits over the middle of the screen. On a phone it starts below the
          icon row and stays clear of the minimap on the right.
        */}
        <div
          className={cn(
            "mt-[3.75rem] flex w-[min(21rem,calc(100vw-9.75rem))] flex-col items-start gap-2 sm:mt-0 sm:w-[min(24rem,calc(100vw-21rem))] 2xl:w-[30rem] 2xl:gap-3",
            // clear of the putting scoreboard, which sits in this corner
            golfPlaying && "mt-[8.5rem] sm:mt-[7.5rem] 2xl:mt-[9rem]",
          )}
        >
          {/* the treasure card: how many dumplings, how close, and what she has */}
          <div
            className={cn(
              "ui-glass animate-ui-rise pointer-events-auto w-full px-2.5 py-2 sm:px-3 sm:py-2.5 2xl:px-4 2xl:py-3",
              golfPlaying && "hidden",
            )}
          >
            <div className="flex items-center gap-2.5 2xl:gap-4">
              <span
                className="ui-gem size-[3.25rem] shrink-0 sm:size-[3.75rem] 2xl:size-20"
                style={{ ["--gem" as string]: "var(--color-accent)" }}
              >
                <span className="flex flex-col items-center leading-none [text-shadow:0_2px_0_rgb(46_24_86/0.5)]">
                  <span className="font-display text-2xl font-bold tabular-nums sm:text-[1.75rem] 2xl:text-4xl">{found}</span>
                  <span className="font-display text-[0.6rem] font-semibold uppercase tracking-wide opacity-90 2xl:text-sm">
                    of {level.dumplings.length}
                  </span>
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-display text-xs font-semibold uppercase tracking-wider text-ink-soft sm:text-sm 2xl:text-lg">
                    {level.name}
                  </p>
                  {boostLeft > 0 && <JuiceClock left={boostLeft} total={20} />}
                </div>
                {/* one diamond per dumpling: two rows on a phone, one on a TV */}
                <div className="mt-1 grid gap-x-1 gap-y-1 [grid-template-columns:repeat(8,minmax(0,1fr))] sm:gap-x-[3px] sm:[grid-template-columns:repeat(16,minmax(0,1fr))] 2xl:gap-x-1.5">
                  {level.dumplings.map((_, i) => (
                    <span key={i} className="ui-pip" data-on={i < found ? "" : undefined} />
                  ))}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1 sm:gap-1.5 2xl:mt-2.5 2xl:gap-2">
                  <span
                    className={cn(
                      "ui-chip gloss gap-1 px-1.5 text-[0.78rem] sm:gap-1.5 sm:px-2.5 sm:text-base 2xl:text-xl",
                      TEMP_PILL[temp] ?? "bg-surface-3 text-ink",
                    )}
                  >
                    <Thermometer className="size-3.5 sm:size-4 2xl:size-5" strokeWidth={2.6} />
                    {TEMP_LABEL[temp]}
                  </span>
                  {tickets > 0 && (
                    <span className="ui-chip gloss gap-1 bg-sun px-1.5 text-[0.78rem] tabular-nums text-ink sm:gap-1.5 sm:px-2.5 sm:text-base 2xl:text-xl">
                      <Ticket className="size-3.5 sm:size-4 2xl:size-5" /> {tickets}
                    </span>
                  )}
                  {runActive && (
                    <span className="ui-chip gap-1 bg-surface px-1.5 text-[0.78rem] tabular-nums text-ink sm:gap-1.5 sm:px-2.5 sm:text-base 2xl:text-xl">
                      <Timer className="size-3.5 text-accent-2 sm:size-4 2xl:size-5" />
                      {clock(runSeconds)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* while she is putting, only her own golf messages belong on screen */}
          {(golfPlaying ? !!emmettNotice : emmettNotice || fleeNotice || nearCollect || boardReady || rideNear || close) && (
            <div className="ui-glass animate-ui-rise pointer-events-auto flex max-w-full items-center gap-2.5 py-1.5 pl-1.5 pr-3 2xl:gap-3 2xl:py-2 2xl:pl-2">
              <span className="ui-gem size-9 shrink-0 2xl:size-11" style={{ ["--gem" as string]: toast.gem }}>
                <toast.Icon className="size-5 2xl:size-6" strokeWidth={2.4} />
              </span>
              <p className="min-w-0 flex-1 py-0.5 text-sm font-bold leading-snug text-ink sm:text-base 2xl:text-xl">{status}</p>
              {fleeNotice && (
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={clearFleeNotice}
                  className="-my-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-ink-soft"
                >
                  <X className="size-5" strokeWidth={2.6} />
                </button>
              )}
            </div>
          )}

          {hintText && (
            <div className="ui-glass animate-ui-rise pointer-events-auto flex max-w-full items-start gap-2.5 py-2 pl-2 pr-1 2xl:gap-3 2xl:py-2.5">
              <span className="ui-gem size-9 shrink-0 text-ink 2xl:size-11" style={{ ["--gem" as string]: "var(--color-topaz)" }}>
                <Lightbulb className="size-5 2xl:size-6" strokeWidth={2.4} />
              </span>
              <p className="min-w-0 flex-1 py-1 text-sm font-semibold leading-snug text-ink sm:text-base 2xl:text-xl">{hintText}</p>
              <button
                type="button"
                aria-label="Dismiss hint"
                onClick={clearHint}
                className="-my-1 grid size-11 shrink-0 place-items-center rounded-full text-ink-soft"
              >
                <X className="size-5" strokeWidth={2.6} />
              </button>
            </div>
          )}
        </div>
      </div>

      <NowPlaying />

      {phase === "playing" && !rps && !carnivalOpen && !questOpen && !homeOpen && !golfPlaying && (homeNear || emmettTalkNear || questNear || carouselRing || carnivalNear || golfNear != null || boardReady || (riding && nearCollect)) && (
        <BigAction
          key={homeNear ?? (emmettTalkNear ? "emmett" : null) ?? questNear ?? carouselRing ?? carnivalNear ?? (golfNear != null ? `golf${golfNear}` : null) ?? (boardReady ? "ride" : "grab")}
          label={
            homeNear
              ? homeNear === "door"
                ? "Go inside your house"
                : homeNear === "exit"
                  ? "Go outside"
                  : `Decorate: ${SPOTS.find((s) => s.id === homeNear)?.name ?? homeNear}`
              : emmettTalkNear
                ? "Play with Emmett"
                : questNear
              ? questNear === "farmer"
                ? "Talk to Farmer Joe"
                : "Give them the treats!"
              : carouselRing
              ? `Grab the ${carouselRing} ring!`
              : golfNear != null
                ? `Putt hole ${golfNear + 1}!`
              : carnivalNear
                ? CARNIVAL_LABEL[carnivalNear]
                : boardReady
                  ? "Ride the ferris wheel!"
                  : `Grab ${nearestName ?? "it"}!`
          }
          icon={homeNear ? "home" : emmettTalkNear ? "truck" : golfNear != null ? "golf" : carouselRing || carnivalNear ? "carnival" : "wheel"}
          gold={carouselRing === "gold"}
          onPress={requestInteract}
        />
      )}

      {phase === "playing" && !golfPlaying && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:pl-[max(1.5rem,env(safe-area-inset-left))]">
          <Joystick />
          <div className="pointer-events-auto flex flex-col items-end gap-3 md:items-start [@media(max-height:520px)]:flex-row [@media(max-height:520px)]:items-end">
            {nearCollect && !riding && (
              <Btn onClick={requestInteract} className="ui-shimmer animate-ui-pop min-h-14 min-w-40 gap-2.5 text-xl 2xl:min-h-16 2xl:text-2xl">
                <Hand className="size-6" strokeWidth={2.4} />
                Collect
              </Btn>
            )}
            <Btn
              variant="sun"
              onClick={useHint}
              disabled={hintsLeft <= 0}
              className="min-h-12 gap-2 pl-4 pr-2 2xl:min-h-14 2xl:text-xl"
            >
              <Lightbulb className="size-5" strokeWidth={2.4} />
              Hint
              <span
                className="ui-gem size-8 shrink-0 text-base font-bold tabular-nums text-ink"
                style={{ ["--gem" as string]: "var(--color-pearl)" }}
              >
                {hintsLeft}
              </span>
            </Btn>
            <button
              type="button"
              aria-label="Jump"
              onPointerDown={(e) => {
                e.preventDefault();
                triggerJump();
              }}
              className="press chunk gloss grid size-20 place-items-center rounded-full bg-teal text-white [text-shadow:0_2px_0_rgb(0_0_0/0.15)] [@media(hover:hover)_and_(pointer:fine)]:hidden"
            >
              <span className="flex flex-col items-center font-display text-sm font-semibold leading-none">
                <ArrowBigUp className="size-8 fill-current" />
                Jump
              </span>
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
  tint,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
  /** jewel tint for the icon, so the row reads as a little set of stones */
  tint?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "press chunk-sm gloss grid size-11 place-items-center rounded-full bg-[linear-gradient(170deg,#fff,var(--color-blush)_55%,var(--color-lilac))] sm:size-12 2xl:size-16",
        tint ?? "text-ink",
      )}
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
      className="pointer-events-auto relative size-36 rounded-full border-[3px] border-edge bg-surface/60 shadow-[inset_0_2px_0_rgb(255_255_255/0.7),0_4px_0_var(--color-edge),0_14px_24px_-14px_rgb(29_36_82/0.5)] backdrop-blur-sm [@media(hover:hover)_and_(pointer:fine)]:hidden"
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
      <ChevronUp className="pointer-events-none absolute left-1/2 top-1.5 size-6 -translate-x-1/2 text-ink/45" strokeWidth={3} />
      <ChevronDown className="pointer-events-none absolute bottom-1.5 left-1/2 size-6 -translate-x-1/2 text-ink/45" strokeWidth={3} />
      <ChevronLeft className="pointer-events-none absolute left-1.5 top-1/2 size-6 -translate-y-1/2 text-ink/45" strokeWidth={3} />
      <ChevronRight className="pointer-events-none absolute right-1.5 top-1/2 size-6 -translate-y-1/2 text-ink/45" strokeWidth={3} />
      <div className="gloss pointer-events-none absolute inset-[30%] rounded-full border-[3px] border-edge bg-surface shadow-[inset_0_2px_0_rgb(255_255_255/0.9),0_3px_0_var(--color-edge)]" />
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
    <div className="-my-1 flex shrink-0 items-center gap-1">
      <svg width="26" height="30" viewBox="0 0 52 60" className="shrink-0 2xl:h-11 2xl:w-9" aria-hidden>
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
          "font-display text-base font-bold tabular-nums 2xl:text-2xl",
          low ? "text-accent" : "text-ink",
        )}
      >
        {Math.ceil(value)}s
      </span>
    </div>
  );
}

/**
 * The big pop-up action for the ferris wheel: boarding on the platform, and
 * grabbing the sky dumpling as the gondola passes the top. Sized to read from
 * the sofa and to be an easy target for a thumb, since on a touch screen this
 * is the only way to press Collect there.
 */
const CARNIVAL_LABEL: Record<BoothGame | "carousel", string> = {
  rings: "Play Ring Toss!",
  ducks: "Play Duck Pond!",
  moles: "Play Whack-a-Mole!",
  prizes: "Visit the prize booth!",
  carousel: "Ride the carousel!",
};

function BigAction({
  label,
  onPress,
  icon = "wheel",
  gold = false,
}: {
  label: string;
  onPress: () => void;
  icon?: "wheel" | "carnival" | "home" | "truck" | "golf";
  gold?: boolean;
}) {
  const Icon = icon === "wheel" ? FerrisWheel : icon === "home" ? House : icon === "truck" ? Truck : icon === "golf" ? Flag : PartyPopper;
  // say what the button does as it pops up (it remounts per action)
  useEffect(() => speak(label.replace(/!$/, "")), [label]);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[34%] z-20 flex flex-col items-center gap-3 px-4 md:bottom-[26%] [@media(max-height:520px)]:bottom-[22%] [@media(max-height:520px)]:gap-2">
      <button
        type="button"
        onClick={onPress}
        className={cn(
          "press chunk gloss ui-shimmer pointer-events-auto flex max-w-full items-center gap-3 py-3 pl-3 pr-7 text-left font-display text-2xl font-semibold leading-tight sm:gap-4 sm:py-4 sm:pl-4 sm:pr-10 sm:text-4xl 2xl:text-5xl [@media(max-height:520px)]:py-2 [@media(max-height:520px)]:pl-2 [@media(max-height:520px)]:text-3xl",
          gold ? "bg-sun text-ink" : "bg-accent text-accent-fg [text-shadow:0_2px_0_rgb(0_0_0/0.18)]",
        )}
        style={{ animation: "catchPop 260ms ease-out, bigNudge 1.3s ease-in-out 400ms infinite" }}
      >
        <span className="grid size-14 shrink-0 place-items-center rounded-full border-[3px] border-edge bg-surface shadow-[inset_0_-3px_0_rgb(29_36_82/0.12)] sm:size-[4.5rem] 2xl:size-20 [@media(max-height:520px)]:size-14">
          <Icon className={cn("size-8 sm:size-10 2xl:size-12", gold ? "text-sun-deep" : "text-accent")} strokeWidth={2.4} />
        </span>
        {label}
      </button>
      <p className="ui-chip bg-surface/90 px-3 py-0.5 text-sm text-ink sm:text-base">
        Tap it, or press {bindingLabel("collect")}
      </p>
    </div>
  );
}

/**
 * Frame-rate readout for judging the game on the real screen. Samples the
 * perf object on its own timer, never per frame, so it costs nothing to show.
 * fps: frames drawn in the last second. worst: the slowest single frame, which
 * is what a stutter feels like. cpu: the game's own work per frame (if frames
 * are slow and this is low, the GPU is the limit). Last, the size it really
 * draws at, which on a Retina screen is twice the window in each direction.
 */
function FpsCounter() {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, []);
  const fps = perf.fps;
  const tone = fps >= 55 ? "text-[#7be08a]" : fps >= 40 ? "text-[#ffd166]" : "text-[#ff7a6b]";
  return (
    <div className="pointer-events-none absolute bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-white/20 bg-ink/80 px-3 py-1 font-mono text-xs text-white tabular-nums backdrop-blur-sm">
      <span className={cn("font-bold", tone)}>{fps} fps</span>
      {" · "}worst {perf.worstMs}ms · cpu {perf.cpuMs}ms · {perf.bufW}×{perf.bufH} @{perf.pixelRatio}x
    </div>
  );
}

/** "Now playing" pill in the channel's colour for a moment after each change. */
function NowPlaying() {
  const channel = useGame((s) => s.channel);
  const gen = useGame((s) => s.channelGen);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (gen === 0) return;
    setShown(true);
    const def = CHANNELS.find((c) => c.id === channel);
    speak(def ? `Now playing, ${def.name}` : "Music off");
    const t = window.setTimeout(() => setShown(false), 2600);
    return () => window.clearTimeout(t);
  }, [gen, channel]);
  if (!shown) return null;
  const def = CHANNELS.find((c) => c.id === channel);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[26%] z-20 flex justify-center px-4" key={gen}>
      <div
        className="chunk gloss flex items-center gap-3 py-2.5 pl-2.5 pr-7 font-display text-2xl font-semibold text-ink sm:text-3xl 2xl:text-4xl"
        style={{ backgroundColor: def?.color ?? "#dcebff", animation: "catchPop 240ms ease-out" }}
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-full border-[3px] border-edge bg-surface 2xl:size-14">
          <Music className="size-6 2xl:size-7" strokeWidth={2.4} />
        </span>
        {def ? def.name : "Music off"}
      </div>
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
        className="chunk gloss flex animate-[catchPop_240ms_ease-out] flex-col items-center gap-1.5 px-8 pb-3 pt-4 text-center"
        style={{ backgroundColor: celebrate.color }}
      >
        <p className="ui-title text-4xl leading-none [-webkit-text-stroke-width:6px] sm:text-5xl">
          {celebrate.name}
        </p>
        <p className="ui-chip gloss bg-sun text-base uppercase tracking-wider text-ink">
          <Sparkles className="size-4" />
          caught!
        </p>
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
      if (pad) {
        const a = Boolean(pad.buttons[0]?.pressed);
        const left = Boolean(pad.buttons[14]?.pressed) || (pad.axes[0] ?? 0) < -0.55;
        const right = Boolean(pad.buttons[15]?.pressed) || (pad.axes[0] ?? 0) > 0.55;
        // buttons are tracked every frame, so an A held for a jump when Emmett
        // arrives doesn't throw a hand the instant the panel opens
        if (st.rps) {
          if (left && !prevL) setSel((v) => (v + 2) % 3);
          if (right && !prevR) setSel((v) => (v + 1) % 3);
          if (a && !prevA) {
            sfx.click();
            if (!st.rps.result) st.playRps(RPS_HANDS[selRef.current]!);
            else if (st.rps.result === "tie") st.nextRpsRound();
            else st.closeRps();
          }
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
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <div
        className={cn(
          "chunk-sm grid size-28 place-items-center transition-opacity sm:size-32 [@media(max-height:520px)]:size-20 [&_svg]:h-[74%] [&_svg]:w-[74%]",
          done && winner ? "gloss bg-sun" : done ? "bg-surface-2 opacity-50" : "bg-surface-2",
        )}
      >
        {hand ? (
          <HandIcon hand={hand} size={78} />
        ) : (
          <span className="font-display text-5xl font-bold text-muted">?</span>
        )}
      </div>
      <p className="mt-2 font-display text-xl font-semibold leading-tight [@media(max-height:520px)]:mt-1 [@media(max-height:520px)]:text-lg">
        {label}
      </p>
      {hand && <p className="text-base font-semibold capitalize leading-tight text-ink-soft">{hand}</p>}
    </div>
  );

  return (
    <Layer z="z-30">
      <Sheet
        tone="grape"
        icon={Scissors}
        title="Emmett wants to play!"
        className="max-w-xl 2xl:max-w-2xl"
        bodyClassName="text-center"
      >
        {!done && (
          <p className="text-lg font-semibold leading-snug text-ink-soft [@media(max-height:520px)]:text-base">
            {rps.friendly
              ? "Just for fun at his truck. Win and you get 3 tickets!"
              : "Win and you keep your dumplings. Lose and he takes one."}
          </p>
        )}

        <div className="mt-4 flex items-center justify-center gap-3 sm:gap-6 [@media(max-height:520px)]:mt-2">
          <Side label="You" hand={rps.playerPick} winner={won} />
          <span className="gloss grid size-12 shrink-0 place-items-center rounded-full border-[3px] border-edge bg-accent font-display text-lg font-bold text-white">
            vs
          </span>
          <Side label="Emmett" hand={rps.emmettPick} winner={done && !won && !tied} />
        </div>

        {banner && (
          <div className={cn("chunk-sm gloss animate-ui-pop mt-4 px-4 py-3 [@media(max-height:520px)]:mt-3 [@media(max-height:520px)]:py-2", banner.bg)}>
            <p className={cn("font-display text-3xl font-bold", banner.fg)}>{banner.text}</p>
            {!tied && (
              <p className={cn("mt-0.5 text-lg font-semibold opacity-95", banner.fg)}>
                {rps.friendly
                  ? won
                    ? "3 tickets for you!"
                    : "Good game! Play again any time."
                  : won
                    ? "Every dumpling stays yours."
                    : "He is taking one and hiding it."}
              </p>
            )}
          </div>
        )}

        {!done ? (
          <>
            <div className="mt-5 grid grid-cols-3 gap-3 [@media(max-height:520px)]:mt-3">
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
                    "press chunk-sm flex flex-col items-center justify-center gap-1 py-3 [@media(max-height:520px)]:py-1.5 [@media(max-height:520px)]:[&_svg]:size-12",
                    i === sel ? "gloss bg-sun" : "bg-surface",
                  )}
                >
                  <HandIcon hand={h} size={64} />
                  <span className="font-display text-lg font-semibold capitalize">{h}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-base font-semibold text-ink-soft [@media(max-height:520px)]:hidden">
              Tap one, or press 1, 2 or 3
            </p>
          </>
        ) : (
          <div className="mt-5 flex justify-center [@media(max-height:520px)]:mt-3">
            <Btn
              onClick={() => {
                sfx.click();
                if (tied) nextRpsRound();
                else closeRps();
              }}
              className="min-h-14 min-w-44 px-8 text-xl"
            >
              {tied ? "Play again" : won ? "Yes!" : "Okay..."}
            </Btn>
          </div>
        )}
      </Sheet>
    </Layer>
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
      const pad = activePad();
      if (pad) {
        const a = Boolean(pad.buttons[0]?.pressed);
        // answers sit in a column on a phone and a row on a TV: either way works
        const up = Boolean(pad.buttons[12]?.pressed) || Boolean(pad.buttons[14]?.pressed) || (pad.axes[1] ?? 0) < -0.55 || (pad.axes[0] ?? 0) < -0.55;
        const down = Boolean(pad.buttons[13]?.pressed) || Boolean(pad.buttons[15]?.pressed) || (pad.axes[1] ?? 0) > 0.55 || (pad.axes[0] ?? 0) > 0.55;
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
    // keyboard: arrows move, 1 2 3 pick straight away, Enter or Space picks the highlighted one
    const onKey = (e: KeyboardEvent) => {
      const q = useGame.getState().quiz;
      if (!q || e.repeat) return;
      const n = q.q.choices.length;
      const digit = Number.parseInt(e.key, 10);
      if (["ArrowUp", "ArrowLeft", "KeyW", "KeyA"].includes(e.code)) setSel((s) => (s - 1 + n) % n);
      else if (["ArrowDown", "ArrowRight", "KeyS", "KeyD"].includes(e.code)) setSel((s) => (s + 1) % n);
      else if (digit >= 1 && digit <= n) {
        setSel(digit - 1);
        pickRef.current(q.q.choices[digit - 1]!);
      } else if (e.code === "Enter" || e.code === "Space") {
        pickRef.current(q.q.choices[((selRef.current % n) + n) % n]!);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // read the sum as words: "What is 7 minus 3?"
  const said = quiz ? `What is ${quiz.q.prompt.replace(/\+/g, " plus ").replace(/[−-]/g, " minus ")}?` : null;
  useEffect(() => speak(said), [said]);
  if (!quiz) return null;

  return (
    <Layer z="z-30">
      <Sheet tone="sun" icon={Calculator} title="Solve it to keep the dumpling" className="max-w-xl 2xl:max-w-2xl">
        <div className={cn("text-center", shake && "animate-pulse")}>
          <p className="font-display text-6xl font-bold tabular-nums tracking-tight 2xl:text-7xl [@media(max-height:520px)]:text-4xl">
            {quiz.q.prompt} = ?
          </p>
          {quiz.q.visual && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-4 rounded-[1.1rem] bg-surface-2 px-4 py-3 [@media(max-height:520px)]:mt-2 [@media(max-height:520px)]:py-2">
              {quiz.q.visual.map((n, i) => (
                <div key={i} className="flex items-center gap-3">
                  {i > 0 && <span className="font-display text-3xl font-bold text-ink-soft">+</span>}
                  <div className="flex max-w-[11rem] flex-wrap gap-1.5">
                    {Array.from({ length: n }).map((_, j) => (
                      <span key={j} className="size-5 rounded-full border-2 border-edge bg-accent" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-5 grid gap-3 [@media(max-height:520px)]:mt-3 [@media(max-height:520px)]:grid-cols-3">
            {quiz.q.choices.map((c, i) => (
              <button
                key={c}
                type="button"
                onClick={() => pick(c)}
                className={cn(
                  "press chunk-sm min-h-20 font-display text-5xl font-bold tabular-nums text-ink [@media(max-height:520px)]:min-h-16 [@media(max-height:520px)]:text-4xl",
                  i === sel % quiz.q.choices.length ? "gloss bg-sun" : "bg-surface",
                )}
              >
                {c}
              </button>
            ))}
          </div>
          {quiz.attempts > 0 && (
            <p className="animate-ui-rise mt-4 rounded-full bg-berry/10 px-4 py-2 text-lg font-bold text-berry">
              Almost. One more miss and it will run away.
            </p>
          )}
          <p className="mt-3 flex items-center justify-center gap-2 text-base font-semibold text-ink-soft [@media(max-height:520px)]:hidden">
            <Gamepad2 className="size-5" />
            Controller: D-pad to choose, A to answer.
          </p>
        </div>
      </Sheet>
    </Layer>
  );
}

function PauseScreen() {
  const resumePlay = useGame((s) => s.resumePlay);
  const toTitle = useGame((s) => s.toTitle);
  const fullscreen = useFullscreen();
  const toggleWardrobe = useGame((s) => s.toggleWardrobe);
  const setControls = useGame((s) => s.setControls);
  const view = useGame((s) => s.view);
  const toggleView = useGame((s) => s.toggleView);
  const showFps = useGame((s) => s.showFps);
  const toggleFps = useGame((s) => s.toggleFps);
  const graphics = useGame((s) => s.graphics);
  const toggleGraphics = useGame((s) => s.toggleGraphics);
  const readAloud = useGame((s) => s.readAloud);
  const toggleReadAloud = useGame((s) => s.toggleReadAloud);
  const showHelp = useGame((s) => s.showHelp);
  const setVoice = useGame((s) => s.setVoice);
  const voicePref = useGame((s) => s.voice);
  const voiceShown = voicePref || currentVoiceName();
  const item = "min-h-12 justify-start px-4 text-left text-lg 2xl:min-h-14 2xl:text-xl";
  return (
    <Layer z="z-30">
      <Sheet
        tone="blue"
        icon={Pause}
        title="Paused"
        subtitle="The dumplings will wait."
        className="max-w-md sm:max-w-4xl 2xl:max-w-5xl"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Btn onClick={resumePlay} className="min-h-14 gap-2.5 text-xl sm:col-span-3 2xl:min-h-16 2xl:text-2xl">
            <Play className="size-6 fill-current" />
            Keep hunting
          </Btn>
          <Btn variant="secondary" onClick={toggleWardrobe} className={item}>
            <Shirt className="size-5 shrink-0 text-grape" />
            Wardrobe
          </Btn>
          <Btn variant="secondary" onClick={() => setControls(true)} className={item}>
            <Gamepad2 className="size-5 shrink-0 text-accent-2" />
            Controls
          </Btn>
          <Btn variant="secondary" onClick={toggleView} className={item}>
            <Eye className="size-5 shrink-0 text-teal" />
            {view === "first" ? "Third person view" : "First person view"}
          </Btn>
          <div className="rounded-[1.1rem] border-[3px] border-line bg-surface-2 p-2.5 sm:col-span-3">
            <p className="px-1 pb-2 font-display text-sm font-semibold uppercase tracking-wider text-ink-soft 2xl:text-base">
              Help cards
            </p>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {(Object.keys(HELP_CARDS) as HelpId[]).map((id) => {
                const CardIcon = HELP_CARDS[id].Icon;
                return (
                  <Btn
                    key={id}
                    variant="secondary"
                    onClick={() => showHelp(id, true)}
                    className="h-auto min-h-12 justify-start gap-2 px-3 text-left text-base leading-tight 2xl:text-lg"
                  >
                    <CardIcon className="size-5 shrink-0" style={{ color: HELP_CARDS[id].color }} />
                    {HELP_CARDS[id].title}
                  </Btn>
                );
              })}
            </div>
          </div>
          <Btn
            variant="secondary"
            onClick={() => {
              // cycle through the installed voices, best first, and say hello in the new one
              const ranked = rankedVoices();
              if (!ranked.length) return;
              const at = ranked.findIndex((v) => v.name === currentVoiceName());
              const next = ranked[(at + 1) % ranked.length]!;
              setVoice(next.name);
              setVoiceName(next.name);
              speak(`Hi ${useGame.getState().playerName || "there"}! This is how I sound.`, true);
            }}
            className={item}
          >
            <Volume2 className="size-5 shrink-0 text-accent" />
            <span className="truncate">Voice: {(voiceShown || "default").replace(/\s*\(.*\)\s*$/, "")}</span>
          </Btn>
          <Btn variant="secondary" onClick={toggleReadAloud} className={item}>
            <Volume2 className="size-5 shrink-0 text-accent" />
            {readAloud ? "Read aloud: on" : "Read aloud: off"}
          </Btn>
          <Btn variant="secondary" onClick={toggleFps} className={item}>
            <Gauge className="size-5 shrink-0 text-leaf" />
            {showFps ? "Hide frame rate" : "Show frame rate"}
          </Btn>
          <Btn variant="secondary" onClick={toggleGraphics} className={item}>
            <MonitorCog className="size-5 shrink-0 text-accent-2" />
            {graphics === "smooth" ? "Graphics: Smooth" : "Graphics: Sharp"}
          </Btn>
          {canFullscreen() && (
            <Btn variant="secondary" onClick={() => void toggleFullscreen()} className={item}>
              {fullscreen ? <Minimize className="size-5 shrink-0" /> : <Maximize className="size-5 shrink-0" />}
              {fullscreen ? "Exit fullscreen" : "Fullscreen"}
            </Btn>
          )}
          <Btn variant="secondary" onClick={toTitle} className={item}>
            <LogOut className="size-5 shrink-0 text-berry" />
            Back to title
          </Btn>
        </div>
      </Sheet>
    </Layer>
  );
}

function CompleteScreen() {
  const levelIndex = useGame((s) => s.levelIndex);
  const playerName = useGame((s) => s.playerName);
  const nextLevel = useGame((s) => s.nextLevel);
  const replayLevel = useGame((s) => s.replayLevel);
  const keepExploring = useGame((s) => s.keepExploring);
  const toTitle = useGame((s) => s.toTitle);
  const lastRun = useGame((s) => s.lastRun);
  const level = LEVELS[levelIndex]!;
  const next = LEVELS[levelIndex + 1];
  // The first park is the one she will finish on her birthday, so it gets the
  // party treatment: the crown she just earned, and her name in lights.
  const party = levelIndex === 0;
  return (
    <Layer z="z-30">
      <Sheet
        tone={party ? "grape" : "teal"}
        icon={party ? Cake : Trophy}
        eyebrow="Park complete"
        title={
          party
            ? `Happy birthday${playerName ? `, ${playerName}` : ", Sloan"}!`
            : playerName
              ? `${playerName} found them all`
              : "Every dumpling found"
        }
        subtitle={party ? "You found every dumpling in the park!" : undefined}
        className="max-w-lg sm:landscape:max-w-4xl 2xl:max-w-5xl"
      >
        <div className="grid gap-5 sm:landscape:grid-cols-2 sm:landscape:gap-6">
          <div>
            <p className="text-lg font-semibold leading-relaxed text-ink-soft 2xl:text-xl">
              {level.dumplings.length} squishy dumplings rescued from {level.name}.
            </p>

            {party && (
              <div className="chunk-sm gloss ui-shimmer animate-ui-pop relative mt-4 flex items-center gap-3 bg-grape px-3 py-2 text-white sm:px-4">
                <span className="ui-gem size-14 shrink-0" style={{ ["--gem" as string]: "var(--color-topaz)" }}>
                  <Crown className="size-7 text-ink" strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-xl font-bold leading-tight [text-shadow:0_2px_0_rgb(0_0_0/0.2)] sm:text-2xl">
                    The Golden Crown is yours
                  </p>
                  <p className="text-sm font-semibold leading-snug text-white/90 sm:text-base">
                    Put it on any time from your backpack.
                  </p>
                </div>
                <span className="ui-sparkle" aria-hidden style={{ left: "80%", top: "8%", width: "1.3rem" }} />
                <span className="ui-sparkle" aria-hidden style={{ left: "92%", top: "62%", width: "1rem", ["--delay" as string]: "1.1s" }} />
              </div>
            )}

            {lastRun ? (
              <div className="chunk-sm gloss animate-ui-pop mt-4 flex items-center gap-4 bg-sun px-4 py-3">
                <span className="grid size-14 shrink-0 place-items-center rounded-full border-[3px] border-edge bg-surface">
                  <Timer className="size-8 text-accent-2" strokeWidth={2.4} />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-5xl font-bold leading-none tabular-nums">
                    {clock(lastRun.seconds)}
                  </p>
                  <p className="mt-1 font-display text-lg font-semibold leading-tight">
                    {lastRun.rank === 1
                      ? "Fastest time yet!"
                      : lastRun.best
                        ? `Your best so far, ${ordinal(lastRun.rank)} overall`
                        : "Not your quickest this time"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-[1.1rem] bg-surface-2 px-4 py-3 text-base text-ink-soft">
                Runs are only timed when you start a park from the beginning.
              </p>
            )}
            <div className="mt-5 grid gap-3">
              {/* first, because finding them all is where the rest of the park
                  opens up: the carnival, Farmer Joe's pets, stickers, her house */}
              <Btn padDefault onClick={keepExploring} className="min-h-14 text-xl">
                <Compass className="size-5" strokeWidth={2.6} />
                Keep exploring
              </Btn>
              {next && (
                <Btn variant="go" onClick={nextLevel} className="min-h-14 text-xl">
                  <Play className="size-5 fill-current" />
                  Play {next.name}
                </Btn>
              )}
              <Btn variant="secondary" onClick={replayLevel} className="min-h-14">
                <RotateCcw className="size-5 text-teal" />
                Hunt this park again
              </Btn>
              <Btn variant="secondary" onClick={toTitle} className="min-h-14">
                <LogOut className="size-5 text-berry" />
                Title
              </Btn>
            </div>
          </div>

          <div className="relative">
            <p className="flex items-center gap-2 font-display text-xl font-semibold">
              <Trophy className="size-5 text-sun-deep" />
              Best times
            </p>
            <BestTimes levelIndex={levelIndex} highlight={lastRun?.rank} />
          </div>
        </div>
      </Sheet>
    </Layer>
  );
}

function VictoryScreen() {
  const playerName = useGame((s) => s.playerName);
  const replayLevel = useGame((s) => s.replayLevel);
  const toTitle = useGame((s) => s.toTitle);
  return (
    <Layer z="z-30">
      <div className="flex max-h-full w-full max-w-2xl flex-col items-center overflow-y-auto touch-pan-y px-1 pb-2 pt-1 text-center">
        <span className="chunk gloss animate-ui-pop grid size-20 shrink-0 place-items-center rounded-full bg-sun sm:size-24 [@media(max-height:520px)]:size-12">
          <Cake className="size-11 text-ink sm:size-14 [@media(max-height:520px)]:size-7" strokeWidth={2.2} />
        </span>
        <h2 className="ui-title animate-ui-pop mt-4 text-5xl leading-[0.95] sm:text-7xl [@media(max-height:520px)]:mt-2 [@media(max-height:520px)]:text-5xl">
          Happy birthday{playerName ? `, ${playerName}` : ", Sloan"}
        </h2>
        <div className="chunk animate-ui-rise ui-dots mt-6 w-full max-w-xl bg-surface p-5 sm:p-6 [@media(max-height:520px)]:mt-3 [@media(max-height:520px)]:p-4">
          <p className="ui-chip gloss bg-teal text-base text-white">
            <PartyPopper className="size-4" />
            The hunt is over
          </p>
          <p className="mt-3 text-lg font-semibold leading-relaxed text-ink 2xl:text-xl [@media(max-height:520px)]:mt-2 [@media(max-height:520px)]:leading-snug">
            You searched the park, the village, and the castle in the clouds. Every squishy dumpling
            is home.
          </p>
          <div className="mt-5 grid gap-3 sm:landscape:grid-cols-[1.25fr_1fr] [@media(max-height:520px)]:mt-3">
            <Btn onClick={replayLevel} className="min-h-14 px-4">
              <Play className="size-5 fill-current" />
              Play Cloud Castle again
            </Btn>
            <Btn variant="secondary" onClick={toTitle} className="min-h-14">
              <LogOut className="size-5 text-berry" />
              Back to title
            </Btn>
          </div>
        </div>
      </div>
    </Layer>
  );
}

export function Overlays() {
  const phase = useGame((s) => s.phase);
  const muted = useGame((s) => s.muted);
  const wardrobeOpen = useGame((s) => s.wardrobeOpen);
  const controlsOpen = useGame((s) => s.controlsOpen);
  const showFps = useGame((s) => s.showFps);

  useEffect(() => {
    setMuted(muted);
  }, [muted]);

  // read aloud: messages, hints and the name of a freshly caught dumpling
  const readAloud = useGame((s) => s.readAloud);
  const emmettNotice = useGame((s) => s.emmettNotice);
  const fleeNotice = useGame((s) => s.fleeNotice);
  const hintText = useGame((s) => s.hintText);
  const celebrate = useGame((s) => s.celebrate);
  useEffect(() => setSpeechEnabled(readAloud), [readAloud]);
  const voiceName = useGame((s) => s.voice);
  useEffect(() => setVoiceName(voiceName), [voiceName]);
  useEffect(() => speak(emmettNotice), [emmettNotice]);
  useEffect(() => speak(fleeNotice), [fleeNotice]);
  useEffect(() => speak(hintText), [hintText]);
  useEffect(() => speak(celebrate ? `${celebrate.name}, caught!` : null), [celebrate]);

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
      {wardrobeOpen && (phase === "title" || phase === "paused") && <Wardrobe />}
      {phase === "playing" && <CarnivalPanel />}
      {phase === "playing" && <GolfOverlay />}
      {phase === "playing" && <QuestPanel />}
      {phase === "playing" && <HomePanel />}
      {(phase === "playing" || phase === "paused") && <HelpCard />}
      {controlsOpen && <ControlsRemap />}
      {showFps && phase !== "title" && <FpsCounter />}
      {debugEnabled() && <DebugOverlay />}
    </div>
  );
}

/**
 * Wardrobe: everything there is to find, what she has, and what she is
 * wearing. One item per slot; putting something on takes the slot's current
 * item off. Unfound items show a hint instead of a button.
 */
function Wardrobe() {
  const found = useGame((s) => s.foundAccessories);
  const worn = useGame((s) => s.worn);
  const setWorn = useGame((s) => s.setWorn);
  const setWardrobe = useGame((s) => s.setWardrobe);
  return (
    <Layer z="z-40" onClick={() => setWardrobe(false)}>
      <div className="flex max-h-full w-full max-w-lg sm:max-w-3xl lg:max-w-5xl 2xl:max-w-6xl" onClick={(e) => e.stopPropagation()}>
        <Sheet
          tone="grape"
          icon={Shirt}
          title="Wardrobe"
          subtitle={`Found ${found.length} of ${ACCESSORIES.length}. Look for the glowing rings around the park.`}
          onClose={() => setWardrobe(false)}
          closeLabel="Close wardrobe"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {ACCESSORIES.map((a) => {
              const have = found.includes(a.id);
              const wearing = worn[a.slot] === a.id;
              return (
                <div
                  key={a.id}
                  className={cn(
                    "flex min-h-24 flex-col justify-between p-3",
                    have
                      ? cn("chunk-sm", wearing ? "gloss bg-sun" : "bg-surface")
                      : "rounded-[1.1rem] border-[3px] border-dashed border-muted/50 bg-surface-2/80 text-muted",
                  )}
                >
                  {/* the item itself; not found yet shows its dark shape */}
                  <ItemThumb
                    kind="accessory"
                    id={a.id}
                    locked={!have}
                    className="mx-auto -mt-0.5 mb-1.5 size-20 rounded-full bg-[radial-gradient(circle,rgb(255_255_255/0.9)_0%,rgb(255_255_255/0)_70%)] sm:size-24"
                  />
                  <div className="flex-1">
                    <p className="flex items-center gap-1.5 font-display text-lg font-semibold leading-tight">
                      {!have && <Lock className="size-4 shrink-0" />}
                      {have ? a.name : "?"}
                    </p>
                    <p className={cn("mt-1 text-sm font-semibold leading-snug", have ? "capitalize text-ink-soft" : "text-ink-soft/80")}>
                      {have ? a.slot : a.reward ? `Reward: ${a.reward}` : a.hint}
                    </p>
                  </div>
                  {have && (
                    <Btn
                      variant={wearing ? "primary" : "secondary"}
                      onClick={() => {
                        sfx.click();
                        setWorn(a.slot, wearing ? null : a.id);
                      }}
                      className="mt-3 min-h-11 gap-1.5 px-3 text-base"
                    >
                      {wearing && <Check className="size-5" strokeWidth={3} />}
                      {wearing ? "Wearing" : "Put on"}
                    </Btn>
                  )}
                </div>
              );
            })}
          </div>
        </Sheet>
      </div>
    </Layer>
  );
}

/**
 * ?debug=1 overlay: frame rate, worst frame, draw calls, and the last few
 * hitches with what the game was doing. Samples the plain perf object on a
 * timer; the game loop never writes to the store for this.
 */
function DebugOverlay() {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="pointer-events-none absolute left-2 top-24 z-40 max-w-[22rem] rounded-md bg-ink/75 p-2 font-mono text-[11px] leading-snug text-white">
      <div>
        {perf.fps} fps · worst {perf.worstMs}ms · {perf.calls} calls · {(perf.triangles / 1000).toFixed(0)}k tris
        {perf.heapMB ? ` · ${perf.heapMB}MB` : ""} · puffs {perf.puffs}
      </div>
      {perf.hitches.length > 0 && (
        <div className="mt-1 border-t border-white/20 pt-1">
          <div className="font-semibold">hitches ≥{HITCH_MS}ms</div>
          {perf.hitches.map((h, i) => (
            <div key={i}>
              {h.at}s: {h.ms}ms — {h.note}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
