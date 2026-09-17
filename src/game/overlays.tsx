import { SPOTS } from "./furniture";
import { HomePanel } from "./home-panel";
import { useHome } from "./home-store";
import { CHANNELS } from "./music";
import { HELP_CARDS, HelpCard, type HelpId } from "./help-cards";
import { currentVoiceName, rankedVoices, setSpeechEnabled, setVoiceName, speak } from "./speech";
import { QuestPanel } from "./quest-panel";
import { Journal } from "./journal";
import { CarnivalPanel } from "./carnival-games";
import type { BoothGame } from "./carnival";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  ArrowBigUp,
  Cake,
  Calculator,
  Candy,
  Castle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  Footprints,
  Hand,
  Keyboard,
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
import { canFullscreen, enterFullscreen, toggleFullscreen, useFullscreen } from "./fullscreen";
import { HITCH_MS, debugEnabled, perf } from "./debug";
import { ACCESSORIES, accessory } from "./accessories";
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
}: {
  children: React.ReactNode;
  onClick?: () => void;
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
      className={cn(
        "press inline-flex min-h-12 items-center justify-center gap-2 px-6 font-display text-lg font-semibold tracking-wide",
        variant !== "ghost" && "chunk-sm gloss",
        variant === "primary" && "bg-accent text-accent-fg [text-shadow:0_2px_0_rgb(0_0_0/0.15)]",
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
  const toggleWardrobe = useGame((s) => s.toggleWardrobe);
  const setControls = useGame((s) => s.setControls);

  // Wide landscape screens (the TV, a phone on its side) get two columns that
  // each fit the height; portrait stacks and scrolls.
  return (
    <div
      className={cn(
        "pointer-events-auto flex h-full w-full flex-col overflow-y-auto touch-pan-y",
        "bg-[radial-gradient(ellipse_at_center,rgb(29_36_82/0)_35%,rgb(29_36_82/0.4)_100%)]",
        "pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1.25rem,env(safe-area-inset-top))]",
        "sm:landscape:overflow-hidden lg:pb-[max(2rem,env(safe-area-inset-bottom))] lg:pl-[max(2.5rem,env(safe-area-inset-left))] lg:pr-[max(2.5rem,env(safe-area-inset-right))] lg:pt-[max(2rem,env(safe-area-inset-top))]",
      )}
    >
      <div className="mx-auto grid w-full max-w-6xl flex-1 content-center items-center gap-6 sm:landscape:h-full sm:landscape:min-h-0 sm:landscape:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:landscape:grid-rows-[minmax(0,1fr)] sm:landscape:gap-6 lg:gap-12 2xl:max-w-[92rem] 2xl:gap-20">
        {/* left: the logo, and who is playing */}
        <section className="flex min-h-0 flex-col items-center gap-4 text-center sm:landscape:max-h-full sm:landscape:items-start sm:landscape:overflow-y-auto sm:landscape:p-2 sm:landscape:text-left lg:gap-6 2xl:gap-8">
          <div className="animate-ui-pop">
            <span className="ui-chip gloss bg-sun text-sm text-ink [@media(max-height:520px)]:hidden">
              <Sparkles className="size-4" />
              v3.1
            </span>
            <h1 className="ui-title mt-3 text-[clamp(3.25rem,min(9.5vw,14vh),10rem)] leading-[0.92] [@media(max-height:520px)]:mt-0">
              <span className="block">Sloanie's</span> <span className="block">World</span>
            </h1>
          </div>
          <p className="ui-glass animate-ui-rise max-w-md px-4 py-2.5 text-base font-semibold leading-snug text-ink lg:text-lg 2xl:max-w-xl 2xl:px-5 2xl:py-3 2xl:text-2xl [@media(max-height:520px)]:hidden">
            Help Sloan hunt hidden dumplings across giant parks, then solve a little math to keep
            each one. Parks unlock one at a time.
          </p>

          <div className="chunk animate-ui-rise w-full max-w-md bg-surface p-4 text-left lg:p-5 2xl:max-w-xl 2xl:p-7 [@media(max-height:520px)]:p-3">
            <label className="block font-display text-base font-semibold text-ink-soft 2xl:text-xl">
              <span className="flex items-center gap-2">
                <UserRound className="size-5 text-accent-2" />
                Explorer name
              </span>
              <input
                value={playerName}
                onChange={(e) => setName(e.target.value.slice(0, 18))}
                placeholder="Sloan"
                className="chunk-sm mt-2 block h-12 w-full bg-surface-2 px-4 font-display text-xl 2xl:h-16 2xl:text-3xl font-semibold text-ink outline-none placeholder:text-muted"
              />
            </label>

            <p className="mt-4 flex items-center gap-2 font-display text-base font-semibold text-ink-soft 2xl:mt-6 2xl:text-xl [@media(max-height:520px)]:mt-2">
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
                    "press grid size-12 place-items-center rounded-full 2xl:size-16 border-[3px] border-edge shadow-[inset_0_3px_0_rgb(255_255_255/0.35),0_3px_0_var(--color-edge)]",
                    dress === o.id && "scale-110",
                  )}
                  style={{ backgroundColor: o.hex }}
                >
                  {dress === o.id && <Check className="size-6 text-white drop-shadow-[0_2px_0_rgb(29_36_82/0.6)]" strokeWidth={3.5} />}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* right: the parks and the menu */}
        <section className="chunk animate-ui-rise flex min-h-0 flex-col overflow-hidden bg-surface text-ink sm:landscape:max-h-full">
          <div className="ui-ribbon flex shrink-0 items-center gap-3 bg-teal px-4 py-3 text-white sm:px-5 2xl:px-7 2xl:py-5 [@media(max-height:520px)]:py-2">
            <span className="chunk-sm gloss grid size-11 shrink-0 place-items-center rounded-full bg-surface 2xl:size-16 [@media(max-height:520px)]:size-10">
              <MapIcon className="size-6 text-teal 2xl:size-9" strokeWidth={2.4} />
            </span>
            <h2 className="font-display text-2xl font-semibold [text-shadow:0_2px_0_rgb(0_0_0/0.18)] lg:text-3xl 2xl:text-5xl">
              Pick a park
            </h2>
          </div>

          <div className="ui-dots min-h-0 touch-pan-y overflow-y-auto overscroll-contain p-4 lg:p-5 2xl:p-7 [@media(max-height:520px)]:p-3">
            <div className="grid gap-3 2xl:gap-4">
              {LEVELS.map((lv, i) => {
                const locked = i > unlocked;
                const found = collected[i]?.length ?? 0;
                const ParkIcon = PARK_ICON[i] ?? Trees;
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
                      "press chunk-sm flex min-h-[4.5rem] [@media(max-height:520px)]:min-h-14 w-full items-center gap-3 py-2 pl-2.5 pr-3 text-left lg:gap-4 2xl:min-h-28 2xl:gap-5 2xl:pl-4 2xl:pr-5",
                      locked ? "bg-surface-2 text-muted" : "gloss bg-surface text-ink",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-12 shrink-0 place-items-center rounded-full border-[3px] border-edge lg:size-14 2xl:size-20",
                        locked ? "bg-surface-3 text-muted" : cn("gloss text-white", PARK_TINT[i] ?? "bg-leaf"),
                      )}
                    >
                      {locked ? <Lock className="size-6 2xl:size-9" /> : <ParkIcon className="size-6 lg:size-7 2xl:size-10" strokeWidth={2.4} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-xl font-semibold leading-tight 2xl:text-3xl">
                        {locked ? "Locked park" : lv.name}
                      </span>
                      <span className="mt-0.5 block text-sm leading-snug text-ink-soft lg:text-base 2xl:text-xl [@media(max-height:520px)]:hidden">
                        {locked ? "Finish the park before this one" : lv.tagline}
                      </span>
                    </span>
                    {!locked && (
                      <span className="flex shrink-0 flex-col items-end gap-1.5">
                        {i === 0 && (
                          <span className="ui-chip gloss bg-accent text-base text-white 2xl:px-4 2xl:py-1 2xl:text-2xl">
                            <Play className="size-4 fill-current" />
                            Start
                          </span>
                        )}
                        <span className="whitespace-nowrap font-display text-sm font-semibold tabular-nums text-ink-soft 2xl:text-lg">
                          {found}/{lv.dumplings.length} found
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-3 2xl:mt-6 2xl:gap-4 [@media(max-height:520px)]:mt-3">
              <Btn variant="secondary" onClick={() => setHelp((v) => !v)} className="min-h-12 px-3 text-base lg:text-lg 2xl:min-h-16 2xl:text-2xl">
                <HelpCircle className="size-5 shrink-0 2xl:size-7 text-teal" />
                How to play
              </Btn>
              <Btn
                variant="secondary"
                onClick={() => {
                  sfx.click();
                  setControls(true);
                }}
                className="min-h-12 px-3 text-base lg:text-lg 2xl:min-h-16 2xl:text-2xl"
              >
                <Gamepad2 className="size-5 shrink-0 2xl:size-7 text-accent-2" />
                Controls
              </Btn>
              <Btn
                variant="secondary"
                onClick={() => {
                  sfx.click();
                  setShowTimes((v) => !v);
                }}
                className="min-h-12 px-3 text-base lg:text-lg 2xl:min-h-16 2xl:text-2xl"
              >
                <Trophy className="size-5 shrink-0 2xl:size-7 text-sun-deep" />
                Best times
              </Btn>
              <Btn
                variant="secondary"
                onClick={() => {
                  sfx.click();
                  setConfirmReset(true);
                }}
                className="min-h-12 px-3 text-base lg:text-lg 2xl:min-h-16 2xl:text-2xl"
              >
                <RotateCcw className="size-5 shrink-0 2xl:size-7 text-berry" />
                Start over
              </Btn>
              <Btn
                variant="secondary"
                onClick={() => {
                  sfx.click();
                  toggleWardrobe();
                }}
                className="min-h-12 px-3 text-base lg:text-lg 2xl:min-h-16 2xl:text-2xl"
              >
                <Shirt className="size-5 shrink-0 2xl:size-7 text-grape" />
                Wardrobe
              </Btn>
              {canFullscreen() && (
                <Btn
                  variant="secondary"
                  onClick={() => {
                    sfx.click();
                    void toggleFullscreen();
                  }}
                  className="min-h-12 px-3 text-base lg:text-lg 2xl:min-h-16 2xl:text-2xl"
                >
                  {fullscreen ? <Minimize className="size-5 shrink-0" /> : <Maximize className="size-5 shrink-0" />}
                  {fullscreen ? "Exit fullscreen" : "Fullscreen"}
                </Btn>
              )}
            </div>
            {showTimes && (
              <div className="animate-ui-rise mt-4 rounded-[1.1rem] bg-surface-2 p-3">
                <p className="flex items-center gap-2 font-display text-lg font-semibold">
                  <Trophy className="size-5 text-sun-deep" />
                  {LEVELS[0]!.name}
                </p>
                <BestTimes levelIndex={0} />
                <p className="mt-2 text-base text-ink-soft">
                  Change the explorer name above and each player keeps their own best time.
                </p>
              </div>
            )}
            {confirmReset && (
              <div className="chunk-sm animate-ui-rise mt-4 bg-surface-2 p-3">
                <p className="text-base font-semibold text-ink">
                  Hide every dumpling again and lock the other parks?
                </p>
                <div className="mt-3 flex flex-wrap gap-2.5">
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
              <ul className="animate-ui-rise mt-4 grid gap-2 rounded-[1.1rem] bg-surface-2 p-3 text-base leading-snug text-ink">
                {[
                  "Find the hidden dumplings! Warm means close. Cold means far.",
                  "Next to one? Press Collect (E, or X on a controller) and answer the math.",
                  "Miss twice and it runs off to hide somewhere new.",
                  "Find the backpack on the ball field. Then you can carry things.",
                  "Open your backpack with J or the Back button.",
                  "The sticker book is near the start. 30 stickers are hiding in the park.",
                  "Emmett rides up on his trike. Beat him at rock paper scissors to keep your dumplings.",
                  "Grab a juice box to run super fast for a little while.",
                  "At the carnival, play games to win tickets. Spend them at the prize booth.",
                  "Farmer Joe at the farm lost his pets. Can you bring them home?",
                  "Press N (RT on a controller) to play music on your iPod. Stand still and you will dance!",
                  "Find the big mountain and explore the cave inside.",
                  "Walk with W A S D or the left stick. Jump with Space or A.",
                  "Turn the camera with Q and C, LB and RB, or by dragging the screen.",
                ].map((line) => (
                  <li key={line} className="flex gap-2.5">
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-teal" />
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </div>
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
  const toast: { Icon: LucideIcon; bg: string } = emmettNotice
    ? { Icon: Truck, bg: "bg-grape text-white" }
    : fleeNotice
      ? { Icon: Footprints, bg: "bg-berry text-white" }
      : nearCollect
        ? { Icon: Hand, bg: "bg-accent text-white" }
        : boardReady || rideNear
          ? { Icon: FerrisWheel, bg: "bg-accent-2 text-white" }
          : close
            ? { Icon: Thermometer, bg: "bg-warm text-white" }
            : { Icon: Search, bg: "bg-teal text-white" };

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        {/* round icon buttons, top right; the phone minimap sits just under them */}
        <div className="pointer-events-auto absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] flex gap-1.5 sm:gap-2 2xl:gap-3">
          <IconBtn label="Controls" onClick={() => setControls(true)}>
            <Gamepad2 className="size-5 2xl:size-7" />
          </IconBtn>
          <IconBtn
            label="iPod: next song"
            onClick={() => {
              unlockAudio();
              useGame.getState().requestNextChannel();
            }}
          >
            <Music className="size-5 2xl:size-7" />
          </IconBtn>
          <IconBtn label="Journal" onClick={toggleJournal}>
            <BookOpen className="size-5 2xl:size-7" />
          </IconBtn>
          <IconBtn
            label={muted ? "Unmute" : "Mute"}
            onClick={() => {
              toggleMute();
              setMuted(!muted);
            }}
          >
            {muted ? <VolumeX className="size-5 2xl:size-7" /> : <Volume2 className="size-5 2xl:size-7" />}
          </IconBtn>
          <IconBtn label="Pause" onClick={pause}>
            <Pause className="size-5 fill-current 2xl:size-7" />
          </IconBtn>
        </div>

        {/*
          Left column: status, then the toast and the hint under it, so nothing
          sits over the middle of the screen. On a phone it starts below the
          icon row and stays clear of the minimap on the right.
        */}
        <div className="mt-[3.75rem] flex w-[min(21rem,calc(100vw-9.75rem))] flex-col items-start gap-2 sm:mt-0 sm:w-[min(24rem,calc(100vw-21rem))] 2xl:w-[30rem] 2xl:gap-3">
          <div className="ui-glass animate-ui-rise pointer-events-auto px-3 py-2 sm:px-4 sm:py-2.5 2xl:px-5 2xl:py-3">
            {boostLeft > 0 && <JuiceClock left={boostLeft} total={20} />}
            <p className="max-w-[16rem] truncate font-display text-xs font-semibold uppercase tracking-wider text-ink-soft sm:text-sm 2xl:max-w-none 2xl:text-base">
              {level.name}
            </p>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <p className="font-display text-2xl font-bold tabular-nums leading-none sm:text-3xl 2xl:text-4xl">
                {found}
                <span className="text-lg font-semibold text-ink-soft sm:text-xl 2xl:text-2xl"> / {level.dumplings.length}</span>
              </p>
              <p className={cn("flex items-center gap-1 font-display text-base font-bold sm:text-lg 2xl:text-2xl", TEMP_TINT[temp])}>
                <Thermometer className="size-4 sm:size-5" strokeWidth={2.6} />
                {TEMP_LABEL[temp]}
              </p>
            </div>
            {(tickets > 0 || runActive) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {tickets > 0 && (
                  <span className="ui-chip gloss bg-sun text-sm tabular-nums text-ink sm:text-base 2xl:text-lg">
                    <Ticket className="size-4" /> {tickets}
                  </span>
                )}
                {runActive && (
                  <span className="ui-chip bg-surface text-sm tabular-nums text-ink sm:text-base 2xl:text-lg">
                    <Timer className="size-4 text-accent-2" />
                    {clock(runSeconds)}
                  </span>
                )}
              </div>
            )}
          </div>

          {(nearCollect || fleeNotice || close || rideNear) && (
            <div className="ui-glass animate-ui-rise pointer-events-auto flex max-w-full items-center gap-2.5 py-1.5 pl-1.5 pr-3 2xl:gap-3 2xl:py-2 2xl:pl-2">
              <span className={cn("gloss grid size-9 shrink-0 place-items-center rounded-full border-[2.5px] border-edge 2xl:size-11", toast.bg)}>
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
              <span className="gloss grid size-9 shrink-0 place-items-center rounded-full border-[2.5px] border-edge bg-sun text-ink 2xl:size-11">
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

      {phase === "playing" && !rps && !carnivalOpen && !questOpen && !homeOpen && (homeNear || emmettTalkNear || questNear || carouselRing || carnivalNear || boardReady || (riding && nearCollect)) && (
        <BigAction
          key={homeNear ?? (emmettTalkNear ? "emmett" : null) ?? questNear ?? carouselRing ?? carnivalNear ?? (boardReady ? "ride" : "grab")}
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
              : carnivalNear
                ? CARNIVAL_LABEL[carnivalNear]
                : boardReady
                  ? "Ride the ferris wheel!"
                  : `Grab ${nearestName ?? "it"}!`
          }
          icon={homeNear ? "home" : emmettTalkNear ? "truck" : carouselRing || carnivalNear ? "carnival" : "wheel"}
          gold={carouselRing === "gold"}
          onPress={requestInteract}
        />
      )}

      {phase === "playing" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:pl-[max(1.5rem,env(safe-area-inset-left))]">
          <Joystick />
          <div className="pointer-events-auto flex flex-col items-end gap-3 md:items-start [@media(max-height:520px)]:flex-row [@media(max-height:520px)]:items-end">
            {nearCollect && !riding && (
              <Btn onClick={requestInteract} className="animate-ui-pop min-h-14 min-w-40 gap-2.5 text-xl 2xl:min-h-16 2xl:text-2xl">
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
              <span className="grid h-8 min-w-8 place-items-center rounded-full border-[2.5px] border-edge bg-surface px-1.5 text-base tabular-nums">
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
              className="press chunk gloss grid size-20 place-items-center rounded-full bg-teal text-white [text-shadow:0_2px_0_rgb(0_0_0/0.15)] sm:hidden"
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
      className="press chunk-sm gloss grid size-11 place-items-center rounded-full bg-surface text-ink sm:size-12 2xl:size-16"
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
      className="pointer-events-auto relative size-36 rounded-full border-[3px] border-edge bg-surface/60 shadow-[inset_0_2px_0_rgb(255_255_255/0.7),0_4px_0_var(--color-edge),0_14px_24px_-14px_rgb(29_36_82/0.5)] backdrop-blur-sm md:hidden"
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
  icon?: "wheel" | "carnival" | "home" | "truck";
  gold?: boolean;
}) {
  const Icon = icon === "wheel" ? FerrisWheel : icon === "home" ? House : icon === "truck" ? Truck : PartyPopper;
  // say what the button does as it pops up (it remounts per action)
  useEffect(() => speak(label.replace(/!$/, "")), [label]);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[34%] z-20 flex flex-col items-center gap-3 px-4 md:bottom-[26%] [@media(max-height:520px)]:bottom-[22%] [@media(max-height:520px)]:gap-2">
      <button
        type="button"
        onClick={onPress}
        className={cn(
          "press chunk gloss pointer-events-auto flex max-w-full items-center gap-3 py-3 pl-3 pr-7 text-left font-display text-2xl font-semibold leading-tight sm:gap-4 sm:py-4 sm:pl-4 sm:pr-10 sm:text-4xl 2xl:text-5xl [@media(max-height:520px)]:py-2 [@media(max-height:520px)]:pl-2 [@media(max-height:520px)]:text-3xl",
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
        Tap it, or press Collect (X · E · F)
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
  const toTitle = useGame((s) => s.toTitle);
  const lastRun = useGame((s) => s.lastRun);
  const level = LEVELS[levelIndex]!;
  const next = LEVELS[levelIndex + 1];
  return (
    <Layer z="z-30">
      <Sheet
        tone="teal"
        icon={Trophy}
        eyebrow="Park complete"
        title={playerName ? `${playerName} found them all` : "Every dumpling found"}
        className="max-w-lg sm:landscape:max-w-4xl 2xl:max-w-5xl"
      >
        <div className="grid gap-5 sm:landscape:grid-cols-2 sm:landscape:gap-6">
          <div>
            <p className="text-lg font-semibold leading-relaxed text-ink-soft 2xl:text-xl">
              {level.dumplings.length} squishy dumplings rescued from {level.name}.
            </p>

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
              {next && (
                <Btn onClick={nextLevel} className="min-h-14 text-xl">
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

          <div>
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
      {phase === "playing" && <QuestPanel />}
      {phase === "playing" && <HomePanel />}
      {(phase === "playing" || phase === "paused") && <HelpCard />}
      {controlsOpen && <ControlsPanel />}
      {showFps && phase !== "title" && <FpsCounter />}
      {debugEnabled() && <DebugOverlay />}
    </div>
  );
}

const CONTROLS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Controller",
    rows: [
      ["Left stick", "Walk"],
      ["Right stick", "Look around (up and down in first person)"],
      ["A", "Jump"],
      ["X", "Collect a dumpling, ride the ferris wheel"],
      ["B", "Big map"],
      ["Y", "Hint"],
      ["LB / RB", "Turn the camera"],
      ["LT", "First person on and off"],
      ["RT", "iPod: next song"],
      ["Back", "Journal: dumplings, stickers, backpack"],
      ["Start", "Pause"],
    ],
  },
  {
    title: "Keyboard",
    rows: [
      ["W A S D or arrows", "Walk"],
      ["Space", "Jump"],
      ["E or F", "Collect a dumpling, ride the ferris wheel"],
      ["Q / C", "Turn the camera left / right"],
      ["Drag the mouse", "Look around"],
      ["M", "Big map"],
      ["H", "Hint"],
      ["J", "Journal: dumplings, stickers, backpack"],
      ["V", "First person on and off"],
      ["N", "iPod: next song"],
      ["Esc or P", "Pause"],
    ],
  },
  {
    title: "Touch",
    rows: [
      ["Joystick", "Walk"],
      ["Drag the screen", "Look around"],
      ["Jump / Collect buttons", "Jump, collect, ride"],
      ["Tap the map", "Big map"],
    ],
  },
];

/** Every control in one place, reachable from the title, the pause menu and the HUD. */
const CONTROL_ICON: Record<string, LucideIcon> = { Controller: Gamepad2, Keyboard, Touch: Hand };
const CONTROL_TINT: Record<string, string> = { Controller: "bg-accent-2", Keyboard: "bg-teal", Touch: "bg-accent" };

function ControlsPanel() {
  const setControls = useGame((s) => s.setControls);
  return (
    <Layer z="z-40" onClick={() => setControls(false)}>
      <div className="flex max-h-full w-full max-w-lg sm:landscape:max-w-6xl 2xl:max-w-7xl" onClick={(e) => e.stopPropagation()}>
        <Sheet
          tone="blue"
          icon={Gamepad2}
          title="Controls"
          onClose={() => setControls(false)}
          closeLabel="Close controls"
        >
          <div className="grid gap-4 sm:landscape:grid-cols-2 lg:landscape:grid-cols-[1fr_1fr_0.85fr] 2xl:gap-6">
            {CONTROLS.map((group, gi) => {
              const GroupIcon = CONTROL_ICON[group.title] ?? Gamepad2;
              const last = gi === CONTROLS.length - 1;
              const card = (
                <div className="rounded-[1.1rem] border-[3px] border-line bg-surface p-3">
                  <p className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
                    <span className={cn("gloss grid size-9 place-items-center rounded-full border-[2.5px] border-edge text-white", CONTROL_TINT[group.title] ?? "bg-accent-2")}>
                      <GroupIcon className="size-5" strokeWidth={2.4} />
                    </span>
                    {group.title}
                  </p>
                  <dl className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5">
                    {group.rows.map(([k, v]) => (
                      <Fragment key={k}>
                        <dt className="max-w-[8.5rem] justify-self-start rounded-lg border-2 border-edge bg-surface-2 px-2 py-0.5 font-display text-sm font-semibold text-ink shadow-[0_2px_0_var(--color-edge)] 2xl:text-base">
                          {k}
                        </dt>
                        <dd className="text-base font-semibold leading-snug text-ink-soft 2xl:text-lg">{v}</dd>
                      </Fragment>
                    ))}
                  </dl>
                </div>
              );
              if (!last) return <Fragment key={group.title}>{card}</Fragment>;
              // the last, short column also holds the button, so the panel fits a 720p TV
              return (
                <div key={group.title} className="flex flex-col gap-4">
                  {card}
                  <Btn onClick={() => setControls(false)} className="mt-auto min-h-14 w-full text-xl">
                    <Check className="size-6" strokeWidth={3} />
                    Got it
                  </Btn>
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
                  <div>
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
