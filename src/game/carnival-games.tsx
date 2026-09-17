import { useEffect, useRef, useState } from "react";
import {
  Apple,
  Bird,
  Carrot,
  Cat,
  Check,
  Cherry,
  Cloud,
  Crown,
  Fan,
  Feather,
  Fish,
  Flower,
  Gift,
  Glasses,
  Hammer,
  Heart,
  Lock,
  Lollipop,
  Moon,
  PawPrint,
  Play,
  Rabbit,
  Rainbow,
  Shield,
  Snowflake,
  Sparkles,
  Star,
  Store,
  Sun,
  Target,
  Ticket,
  Timer,
  Trophy,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { accessory, type AccessoryId } from "./accessories";
import { sfx } from "./audio";
import {
  BOOTHS,
  DUCK_POND,
  GAME_PRIZES,
  SHOP,
  RING_TOSS,
  WHACK,
  bottleUnder,
  duckDeck,
  ringSweep,
  type Booth,
  type BoothGame,
} from "./carnival";
import { Btn, Panel } from "./overlays";
import { HearButton } from "./help-cards";
import { claimPad } from "./input";
import { speak } from "./speech";
import { useGame } from "./store";
import { cn } from "@/lib/utils";

/**
 * Carnival game panels. Each game is a short round (under a minute) with a
 * clear goal, playable with a controller (stick or d-pad and A, B to leave),
 * the keyboard (arrows, Space or Enter, Esc) or by tapping. Winning puts the
 * booth's prize on straight away; playing again after that is just for fun.
 *
 * Built for a smart seven-year-old: every game is winnable on the first or
 * second try, and each one asks for something different, whether timing,
 * memory, or quick reactions with a rule to remember.
 */

export type Edge = "a" | "b" | "up" | "down" | "left" | "right" | "lb" | "rb";

/**
 * Controller and keyboard presses as edges, always calling the latest handler.
 * While active, the panel has the pad: presses do nothing in play (see
 * claimPad). A panel that is always mounted passes active only while it shows.
 */
export function useInput(onEdge: (e: Edge, key?: string) => void, active = true) {
  const cb = useRef(onEdge);
  cb.current = onEdge;
  const on = useRef(active);
  on.current = active;
  useEffect(() => (active ? claimPad() : undefined), [active]);
  useEffect(() => {
    const prev: Record<Edge, boolean> = { a: false, b: false, up: false, down: false, left: false, right: false, lb: false, rb: false };
    let armed = false;
    let raf = 0;
    const loop = () => {
      const pad = (navigator.getGamepads?.() ?? []).find((p) => p && p.buttons.length > 0);
      if (pad) {
        const ax = pad.axes[0] ?? 0;
        const ay = pad.axes[1] ?? 0;
        const now: Record<Edge, boolean> = {
          a: Boolean(pad.buttons[0]?.pressed),
          b: Boolean(pad.buttons[1]?.pressed),
          up: Boolean(pad.buttons[12]?.pressed) || ay < -0.55,
          down: Boolean(pad.buttons[13]?.pressed) || ay > 0.55,
          left: Boolean(pad.buttons[14]?.pressed) || ax < -0.55,
          right: Boolean(pad.buttons[15]?.pressed) || ax > 0.55,
          lb: Boolean(pad.buttons[4]?.pressed),
          rb: Boolean(pad.buttons[5]?.pressed),
        };
        // whatever was already held when the panel opened does not count
        if (!armed) {
          Object.assign(prev, now);
          armed = true;
        }
        for (const k of Object.keys(now) as Edge[]) {
          if (now[k] && !prev[k] && on.current) cb.current(k);
          prev[k] = now[k];
        }
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !on.current) return;
      // while typing in a text box only Enter and Esc act as controls
      const typing = (e.target as HTMLElement | null)?.tagName === "INPUT";
      if (typing && e.key !== "Enter" && e.key !== "Escape") return;
      const map: Record<string, Edge> = {
        " ": "a",
        Enter: "a",
        Escape: "b",
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      };
      const edge = map[e.key];
      if (edge) {
        e.preventDefault();
        cb.current(edge, e.key);
      } else if (/^[1-9]$/.test(e.key)) {
        cb.current("a", e.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
}

const close = () => {
  sfx.click();
  useGame.getState().closeCarnival();
};

/**
 * Milliseconds since `value` last changed. A game ends while she is still
 * mashing A, so the result screen ignores A for a moment rather than skipping
 * straight into another round.
 */
function useSince(value: unknown) {
  const at = useRef(0);
  useEffect(() => {
    at.current = performance.now();
  }, [value]);
  return () => performance.now() - at.current;
}
const SETTLE_MS = 700;

/** Tickets for a round: shown on the result screen and added straight away. */
function payTickets(n: number) {
  if (n > 0) useGame.getState().addTickets(n);
  return n;
}

/** Award the booth's prize; returns true if it is new. */
function award(prize: AccessoryId) {
  const st = useGame.getState();
  const isNew = !st.foundAccessories.includes(prize);
  if (isNew) st.winPrize(prize);
  sfx.win();
  return isNew;
}

const PRIZE_ICON: Record<string, { Icon: LucideIcon; color: string }> = {
  balloon: { Icon: Heart, color: "#e8455f" },
  duckhat: { Icon: Sparkles, color: "#e0a800" }, // drawn as a duck below
  starglasses: { Icon: Star, color: "#f06aa8" },
  unicorn: { Icon: Sparkles, color: "#b98ce0" },
  teddy: { Icon: PawPrint, color: "#b87a4a" },
};

/* ------------------------------------------------------- shared chrome */

const CREAM = "#fff4e8";

/**
 * The full-screen modal layer. Keeps `pointer-events-auto absolute inset-0
 * z-30` on the outermost element: pad-menu.tsx finds the top layer by those.
 * Scrolls as a whole when a panel is taller than the screen (phone landscape).
 */
export function ModalFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="ui-backdrop animate-ui-fade pointer-events-auto absolute inset-0 z-30 overflow-y-auto overscroll-contain">
      <div className="flex min-h-full items-center justify-center pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Panel className={cn("animate-ui-pop relative w-full overflow-hidden", className)}>{children}</Panel>
      </div>
    </div>
  );
}

// the scalloped bottom edge of a carnival awning, one scallop per stripe
const SCALLOP_MASK =
  "radial-gradient(circle at 14px 0, #000 14px, transparent 14.5px) 0 100% / 28px 14px repeat-x, linear-gradient(#000 0 0) 0 0 / 100% calc(100% - 13.5px) no-repeat";

function Awning({ color, pattern }: { color: string; pattern: "awning" | "gingham" }) {
  if (pattern === "gingham") {
    return (
      <div
        aria-hidden
        className="h-5 border-b-[3px] border-edge/80 [@media(max-height:500px)]:h-3"
        style={{
          backgroundColor: color,
          backgroundImage: `linear-gradient(90deg, rgb(255 255 255 / 0.45) 50%, transparent 50%), linear-gradient(rgb(255 255 255 / 0.45) 50%, transparent 50%)`,
          backgroundSize: "20px 20px",
        }}
      />
    );
  }
  return (
    <div aria-hidden className="[filter:drop-shadow(0_3px_0_rgb(29_36_82/0.3))]">
      <div
        className="h-8 [@media(max-height:760px)]:h-6 [@media(max-height:500px)]:h-5"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 28px, ${CREAM} 28px 56px)`,
          WebkitMask: SCALLOP_MASK,
          mask: SCALLOP_MASK,
        }}
      />
    </div>
  );
}

/** Coloured header band: pattern strip, icon badge, outlined title, close button. */
export function PanelRibbon({
  color,
  Icon,
  title,
  onClose,
  closeLabel,
  padSkip,
  pattern = "awning",
}: {
  color: string;
  Icon: LucideIcon;
  title: React.ReactNode;
  onClose: () => void;
  closeLabel: string;
  padSkip?: boolean;
  pattern?: "awning" | "gingham";
}) {
  return (
    <div className="ui-ribbon relative z-10" style={{ backgroundColor: color }}>
      <Awning color={color} pattern={pattern} />
      <div className="flex items-center gap-3 px-4 pb-3.5 pt-2 sm:gap-4 sm:px-6 [@media(max-height:760px)]:pb-2.5 [@media(max-height:500px)]:pb-2 [@media(max-height:500px)]:pt-1">
        <span className="chunk-sm gloss grid size-12 shrink-0 place-items-center bg-surface sm:size-14" aria-hidden>
          <Icon className="size-7 sm:size-8" style={{ color }} strokeWidth={2.5} />
        </span>
        <h2 className="ui-title min-w-0 flex-1 text-[1.75rem] leading-tight [overflow-wrap:anywhere] sm:text-4xl">{title}</h2>
        <button
          type="button"
          aria-label={closeLabel}
          {...(padSkip ? { "data-pad-skip": true } : {})}
          onClick={onClose}
          className="chunk-sm press grid size-12 shrink-0 place-items-center bg-surface text-ink"
        >
          <X className="size-6" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}

/** A controller button glyph for the little "A to play" hints. */
export function PadKey({ children }: { children: React.ReactNode }) {
  return (
    <span className="mx-0.5 inline-grid size-7 place-items-center rounded-full border-2 border-edge bg-surface align-middle font-display text-base font-bold leading-none text-ink shadow-[0_2px_0_#1d2452]">
      {children}
    </span>
  );
}

const SHOP_ICON: Partial<Record<AccessoryId, { Icon: LucideIcon; color: string }>> = {
  pinwheel: { Icon: Fan, color: "#ff6a55" },
  catears: { Icon: Cat, color: "#e0842e" },
  heartglasses: { Icon: Glasses, color: "#f0506e" },
  lollipop: { Icon: Lollipop, color: "#e8455f" },
  bunnyears: { Icon: Rabbit, color: "#7b5cf0" },
  cottoncandy: { Icon: Cloud, color: "#e0609a" },
  wand: { Icon: WandSparkles, color: "#7b5cf0" },
  tiara: { Icon: Crown, color: "#f0a91c" },
  cape: { Icon: Shield, color: "#2f7fd6" },
  wings: { Icon: Feather, color: "#14a3a6" },
};

const BOOTH_ICON: Record<BoothGame, LucideIcon> = { rings: Target, ducks: Bird, moles: Hammer, prizes: Gift };

function PrizeBadge({ id, have, size = "md" }: { id: AccessoryId; have: boolean; size?: "md" | "lg" }) {
  const { Icon, color } = PRIZE_ICON[id]!;
  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full border-[3px]",
        size === "lg" ? "size-24" : "size-14",
        have ? "gloss border-edge bg-surface shadow-[0_4px_0_#1d2452]" : "border-dashed border-muted bg-surface-2",
      )}
    >
      {id === "duckhat" ? (
        <div className={cn(size === "lg" ? "size-16" : "size-10", !have && "opacity-50 grayscale")}>
          <DuckSvg />
        </div>
      ) : (
        <Icon
          className={size === "lg" ? "size-12" : "size-7"}
          style={{ color: have ? color : "#8a93b8" }}
          fill={have ? color : "none"}
          strokeWidth={have ? 2 : 2.5}
        />
      )}
    </div>
  );
}

function Intro({ booth, onPlay, children }: { booth: Booth; onPlay: () => void; children?: React.ReactNode }) {
  const have = useGame((s) => s.foundAccessories.includes(booth.prize));
  useEffect(() => speak(`${booth.name}. ${booth.pitch}`), [booth]);
  return (
    <div className="grid gap-4 sm:gap-5">
      <div className="animate-ui-rise flex flex-wrap items-start gap-3">
        <p className="min-w-[12rem] flex-1 text-2xl font-semibold leading-snug text-ink">{booth.pitch}</p>
        <HearButton text={`${booth.name}. ${booth.pitch}`} className="press min-h-12 shrink-0" />
      </div>
      {children}
      <div
        className="animate-ui-rise flex items-center gap-4 rounded-2xl border-[3px] border-edge bg-sun/20 p-3 pr-4 shadow-[0_4px_0_#1d2452]"
        style={{ animationDelay: "60ms" }}
      >
        <PrizeBadge id={booth.prize} have={have} />
        <p className="min-w-0 text-lg font-bold leading-snug text-ink sm:text-xl">
          {have
            ? `You already won the ${accessory(booth.prize).name.toLowerCase()}. Play for fun!`
            : `Prize: the ${accessory(booth.prize).name.toLowerCase()}!`}
        </p>
      </div>
      <Btn onClick={onPlay} className="min-h-16 w-full gap-3 text-3xl">
        <Play className="size-7" fill="currentColor" /> Play!
      </Btn>
    </div>
  );
}

function Result({
  booth,
  won,
  isNew,
  line,
  onAgain,
  tickets = 0,
}: {
  booth: Booth;
  won: boolean;
  isNew: boolean;
  line: string;
  onAgain: () => void;
  tickets?: number;
}) {
  useEffect(() => {
    speak(
      `${won ? "You won!" : "So close!"} ${line}${tickets > 0 ? ` Plus ${tickets} ticket${tickets === 1 ? "" : "s"}.` : ""}${
        won && isNew ? ` The ${accessory(booth.prize).name.toLowerCase()} is yours!` : ""
      }`,
    );
  }, [won, line, tickets, isNew, booth]);
  return (
    <div className="grid justify-items-center gap-3 text-center sm:gap-4">
      <div className="relative grid place-items-center">
        {/* sun rays behind the prize, or a soft glow when it was close */}
        <div
          aria-hidden
          className={cn("absolute size-48 rounded-full", won && "animate-[spin_16s_linear_infinite]")}
          style={
            won
              ? {
                  background: "repeating-conic-gradient(#ffc83a 0 11deg, transparent 11deg 30deg)",
                  WebkitMask: "radial-gradient(circle, #000 28%, transparent 70%)",
                  mask: "radial-gradient(circle, #000 28%, transparent 70%)",
                }
              : { background: "radial-gradient(circle, rgb(20 163 166 / 0.22) 30%, transparent 68%)" }
          }
        />
        <div className="animate-ui-pop relative">
          {won ? (
            <PrizeBadge id={booth.prize} have size="lg" />
          ) : (
            <div className="gloss grid size-24 place-items-center rounded-full border-[3px] border-edge bg-teal shadow-[0_4px_0_#1d2452]">
              <Heart className="size-12 text-white" fill="currentColor" />
            </div>
          )}
          {won && (
            <>
              <Sparkles className="absolute -left-7 -top-2 size-7 text-sun" fill="#ffc83a" strokeWidth={1.5} aria-hidden />
              <Star className="absolute -right-6 top-1 size-6 text-sun" fill="#ffc83a" strokeWidth={1.5} aria-hidden />
            </>
          )}
        </div>
      </div>
      <h3 className={cn("ui-title animate-ui-rise text-5xl leading-none", won ? "text-sun" : "text-white")}>
        {won ? "You won!" : "So close!"}
      </h3>
      <p className="text-xl font-semibold text-ink">{line}</p>
      {tickets > 0 && (
        <p className="ui-chip animate-ui-pop gloss gap-2 bg-sun px-5 py-1.5 text-2xl text-ink" style={{ animationDelay: "120ms" }}>
          <Ticket className="size-7" strokeWidth={2.5} /> +{tickets} ticket{tickets === 1 ? "" : "s"}!
        </p>
      )}
      {won && (
        <p className="flex items-center gap-2 rounded-2xl bg-teal/12 px-4 py-2 text-lg font-bold leading-snug text-teal-deep">
          <Check className="size-6 shrink-0" strokeWidth={3} />
          {isNew
            ? `The ${accessory(booth.prize).name.toLowerCase()} is yours. It's on! Change it in the wardrobe.`
            : "Champion again!"}
        </p>
      )}
      <div className="mt-1 grid w-full grid-cols-2 gap-3">
        <Btn onClick={onAgain} variant={won ? "secondary" : "primary"} className="min-h-14 px-3 text-xl">
          {won ? "Play again" : "Try again"}
        </Btn>
        <Btn onClick={close} variant={won ? "primary" : "secondary"} className="min-h-14 px-3 text-xl">
          Done
        </Btn>
      </div>
      <p className="text-lg font-semibold text-ink-soft">
        <PadKey>A</PadKey> to play again · <PadKey>B</PadKey> to leave
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ ring toss */

function RingToss({ booth }: { booth: Booth }) {
  const [stage, setStage] = useState<"intro" | "play" | "done">("intro");
  const [throwNo, setThrowNo] = useState(0);
  const [hits, setHits] = useState<boolean[]>([]);
  const [target, setTarget] = useState(2);
  const [flight, setFlight] = useState<null | { x: number; hit: boolean }>(null);
  const [outcome, setOutcome] = useState({ won: false, isNew: false, tickets: 0 });
  const t0 = useRef(0);
  const marker = useRef<HTMLDivElement>(null);
  const period = RING_TOSS.periods[Math.min(throwNo, RING_TOSS.periods.length - 1)]!;

  useEffect(() => {
    if (stage !== "play" || flight) return;
    let raf = 0;
    const loop = () => {
      const x = ringSweep((performance.now() - t0.current) / 1000, period);
      if (marker.current) marker.current.style.left = `${x * 100}%`;
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [stage, flight, period]);

  const start = () => {
    sfx.click();
    setStage("play");
    setThrowNo(0);
    setHits([]);
    setFlight(null);
    setTarget(Math.floor(Math.random() * RING_TOSS.bottles));
    t0.current = performance.now() - Math.random() * period * 1000;
  };

  const toss = () => {
    if (stage !== "play" || flight) return;
    const x = ringSweep((performance.now() - t0.current) / 1000, period);
    const hit = bottleUnder(x) === target;
    setFlight({ x, hit });
    if (hit) sfx.correct();
    else sfx.wrong();
    window.setTimeout(() => {
      const next = [...hits, hit];
      const got = next.filter(Boolean).length;
      setHits(next);
      if (got >= RING_TOSS.toWin || got + (RING_TOSS.rings - next.length) < RING_TOSS.toWin) {
        const won = got >= RING_TOSS.toWin;
        // a ticket per bottle ringed, and three more for winning
        const tickets = payTickets(got + (won ? 3 : 0));
        setOutcome({ won, isNew: won ? award(booth.prize) : false, tickets });
        setStage("done");
        return;
      }
      setThrowNo(next.length);
      let t = target;
      while (t === target) t = Math.floor(Math.random() * RING_TOSS.bottles);
      setTarget(t);
      setFlight(null);
      t0.current = performance.now() - Math.random() * period * 1000;
    }, 1150);
  };

  const since = useSince(stage);
  useInput((e) => {
    if (e === "b") return close();
    if (e !== "a") return;
    if (stage === "done" && since() < SETTLE_MS) return;
    if (stage === "intro" || stage === "done") start();
    else toss();
  });

  if (stage === "intro") return <Intro booth={booth} onPlay={start} />;
  if (stage === "done") {
    const got = hits.filter(Boolean).length;
    return (
      <Result
        booth={booth}
        won={outcome.won}
        isNew={outcome.isNew}
        line={`You ringed ${got} of ${hits.length} bottles.`}
        onAgain={start}
        tickets={outcome.tickets}
      />
    );
  }
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="ui-chip bg-surface px-3 py-1 text-lg text-ink sm:px-4 sm:text-xl">
          Ring {Math.min(throwNo + 1, RING_TOSS.rings)} of {RING_TOSS.rings}
        </p>
        <div className="flex gap-1 sm:gap-2">
          {Array.from({ length: RING_TOSS.rings }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "grid size-7 place-items-center rounded-full border-[3px] border-edge sm:size-8",
                hits[i] === true
                  ? "gloss bg-teal text-white shadow-[0_2px_0_#1d2452]"
                  : hits[i] === false
                    ? "bg-surface-3 text-muted"
                    : i === hits.length
                      ? "bg-surface"
                      : "bg-surface-2",
              )}
              style={hits[i] === undefined && i === hits.length ? { borderColor: booth.awning[0] } : undefined}
            >
              {hits[i] === true && <Check className="size-5" strokeWidth={3.5} />}
              {hits[i] === false && <X className="size-4" strokeWidth={3} />}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={toss}
        className="relative h-56 w-full overflow-hidden rounded-2xl border-[3px] border-edge shadow-[0_4px_0_#1d2452]"
        style={{ backgroundImage: "repeating-linear-gradient(90deg, #fff7ea 0 34px, #fdecd2 34px 68px)" }}
        aria-label="Throw the ring"
      >
        {/* booth back wall trim and the shelf the bottles stand on */}
        <div aria-hidden className="absolute inset-x-0 top-0 h-2" style={{ backgroundColor: booth.awning[0] }} />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-3 border-t-[3px] border-edge bg-[#c98a4f]" />
        {/* the swinging ring */}
        <div
          ref={flight ? undefined : marker}
          className="absolute top-3 size-16 -translate-x-1/2 rounded-full border-[10px] border-accent shadow-[0_0_0_3px_#1d2452,inset_0_0_0_3px_#1d2452] transition-[top,transform] duration-300 ease-in"
          style={
            flight
              ? { left: `${flight.x * 100}%`, top: "38%", transform: "translateX(-50%) scale(0.8, 0.45)" }
              : { left: "50%" }
          }
        />
        {/* bottles */}
        <div className="absolute inset-x-0 bottom-3 flex">
          {Array.from({ length: RING_TOSS.bottles }).map((_, i) => (
            <div key={i} className="flex flex-1 flex-col items-center">
              <div
                className={cn(
                  "h-9 w-5 rounded-t-md border-[3px] border-b-0 border-edge",
                  i === target ? "bg-sun shadow-[0_0_24px_8px_rgba(255,197,61,0.8)]" : "bg-[#3fa35c]",
                )}
              />
              <div
                className={cn(
                  "relative h-20 w-14 rounded-xl border-[3px] border-edge",
                  i === target ? "bg-sun shadow-[0_0_24px_8px_rgba(255,197,61,0.8)]" : "bg-[#3fa35c]",
                )}
              >
                <span aria-hidden className="absolute left-1.5 top-2 h-9 w-2 rounded-full bg-white/45" />
              </div>
            </div>
          ))}
        </div>
        {flight && (
          <p
            className={cn("ui-title absolute inset-x-0 top-24 text-4xl sm:text-5xl", flight.hit ? "text-sun" : "text-white")}
            style={{ animation: "catchPop 260ms ease-out" }}
          >
            {flight.hit ? "Ringed it!" : "Missed!"}
          </p>
        )}
      </button>
      <p className="text-center text-lg font-semibold leading-snug text-ink-soft">
        Tap, press <PadKey>A</PadKey> or Space when the ring is over the glowing bottle. Ring {RING_TOSS.toWin} to win!
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ duck pond */

// line icons that turn into blobs when filled (rainbow, snowflake) stay outlined
const PICTURES: { key: string; Icon: LucideIcon; color: string; outline?: boolean }[] = [
  { key: "star", Icon: Star, color: "#e0a800" },
  { key: "heart", Icon: Heart, color: "#e8455f" },
  { key: "moon", Icon: Moon, color: "#5a68c8" },
  { key: "sun", Icon: Sun, color: "#ff8a3d" },
  { key: "cloud", Icon: Cloud, color: "#4f93c4" },
  { key: "flower", Icon: Flower, color: "#d0508a" },
  { key: "fish", Icon: Fish, color: "#2f9fb0" },
  { key: "apple", Icon: Apple, color: "#d4403a" },
  { key: "cherry", Icon: Cherry, color: "#a8284f" },
  { key: "carrot", Icon: Carrot, color: "#f07a2a" },
  { key: "snow", Icon: Snowflake, color: "#3aa0d8", outline: true },
  { key: "rainbow", Icon: Rainbow, color: "#8a4ad0", outline: true },
];

function DuckSvg() {
  return (
    <svg viewBox="0 0 64 64" className="size-full" aria-hidden>
      <ellipse cx="30" cy="42" rx="22" ry="13" fill="#ffd23a" stroke="#3a2b20" strokeWidth="3" />
      <circle cx="44" cy="24" r="11" fill="#ffd23a" stroke="#3a2b20" strokeWidth="3" />
      <path d="M53 24 L62 27 L53 30 Z" fill="#ff8a3d" stroke="#3a2b20" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="47" cy="21" r="2.4" fill="#3a2b20" />
      <path d="M12 38 Q20 30 30 38" fill="none" stroke="#e0a800" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function DuckPond({ booth }: { booth: Booth }) {
  const cols = 4;
  const [stage, setStage] = useState<"intro" | "play" | "done">("intro");
  const [deck, setDeck] = useState<string[]>([]);
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [turns, setTurns] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [outcome, setOutcome] = useState({ won: false, isNew: false, tickets: 0 });
  const busy = useRef(false);

  const start = () => {
    sfx.click();
    const pics = [...PICTURES].sort(() => Math.random() - 0.5).map((p) => p.key);
    setDeck(duckDeck(pics));
    setOpen([]);
    setMatched(new Set());
    setTurns(0);
    setCursor(0);
    busy.current = false;
    setStage("play");
  };

  const flip = (i: number) => {
    if (stage !== "play" || busy.current || matched.has(i) || open.includes(i)) return;
    sfx.click();
    const next = [...open, i];
    setOpen(next);
    if (next.length < 2) return;
    busy.current = true;
    const used = turns + 1;
    setTurns(used);
    const [a, b] = next as [number, number];
    const same = deck[a] === deck[b];
    window.setTimeout(
      () => {
        const nowMatched = new Set(matched);
        if (same) {
          nowMatched.add(a);
          nowMatched.add(b);
          sfx.correct();
          setMatched(nowMatched);
        }
        setOpen([]);
        busy.current = false;
        const allFound = nowMatched.size === deck.length;
        if (allFound || used >= DUCK_POND.turns) {
          // a ticket per pair, and three more for finding them all
          const tickets = payTickets(nowMatched.size / 2 + (allFound ? 3 : 0));
          setOutcome({ won: allFound, isNew: allFound ? award(booth.prize) : false, tickets });
          setStage("done");
        }
      },
      same ? 450 : 1000,
    );
  };

  const since = useSince(stage);
  useInput((e) => {
    if (e === "b") return close();
    if (stage !== "play") {
      if (e === "a" && !(stage === "done" && since() < SETTLE_MS)) start();
      return;
    }
    const n = deck.length;
    if (e === "left") setCursor((c) => (c + n - 1) % n);
    else if (e === "right") setCursor((c) => (c + 1) % n);
    else if (e === "up") setCursor((c) => (c - cols + n) % n);
    else if (e === "down") setCursor((c) => (c + cols) % n);
    else if (e === "a") flip(cursor);
  });

  if (stage === "intro") return <Intro booth={booth} onPlay={start} />;
  if (stage === "done") {
    return (
      <Result
        booth={booth}
        won={outcome.won}
        isNew={outcome.isNew}
        line={
          outcome.won
            ? `You matched all ${DUCK_POND.pairs} pairs in ${turns} turns.`
            : `Out of turns! You found ${matched.size / 2} of ${DUCK_POND.pairs} pairs.`
        }
        onAgain={start}
        tickets={outcome.tickets}
      />
    );
  }
  return (
    <div className="grid gap-3 sm:gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="ui-chip bg-surface px-4 py-1 text-xl text-ink">
          <Heart className="size-5 text-[#4f93c4]" fill="#4f93c4" /> Pairs {matched.size / 2} of {DUCK_POND.pairs}
        </span>
        <span
          className={cn(
            "ui-chip px-4 py-1 text-xl",
            DUCK_POND.turns - turns <= 3 ? "bg-accent text-accent-fg" : "bg-surface text-ink",
          )}
        >
          Turns left: {DUCK_POND.turns - turns}
        </span>
      </div>
      <div
        className="mx-auto grid w-full grid-cols-4 gap-2 rounded-2xl border-[3px] border-edge p-2 shadow-[0_4px_0_#1d2452] sm:gap-3 sm:p-3"
        style={{
          maxWidth: "max(16rem, calc((100dvh - 22rem) * 4 / 3))",
          backgroundColor: "#8fd8f0",
          backgroundImage:
            "radial-gradient(ellipse 40px 10px at 25% 30%, rgb(255 255 255 / 0.35) 45%, transparent 55%), radial-gradient(ellipse 56px 12px at 75% 75%, rgb(255 255 255 / 0.3) 45%, transparent 55%)",
        }}
      >
        {deck.map((key, i) => {
          const up = open.includes(i) || matched.has(i);
          const pic = PICTURES.find((p) => p.key === key)!;
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                setCursor(i);
                flip(i);
              }}
              className={cn(
                "press relative grid aspect-square place-items-center rounded-xl border-[3px] border-edge shadow-[0_4px_0_#1d2452]",
                up ? "bg-surface" : "gloss bg-[#6cc4e0]",
                i === cursor && "outline outline-4 outline-offset-2 outline-accent",
                matched.has(i) && "bg-[#e3f6ef]",
              )}
              aria-label={up ? pic.key : "duck"}
            >
              {up ? (
                <pic.Icon
                  className="size-3/5"
                  style={{ color: pic.color }}
                  fill={pic.outline ? "none" : pic.color}
                  strokeWidth={pic.outline ? 2.75 : 2}
                />
              ) : (
                <div className="size-4/5" style={{ animation: `bigNudge ${1.6 + (i % 3) * 0.3}s ease-in-out infinite` }}>
                  <DuckSvg />
                </div>
              )}
              {matched.has(i) && (
                <span aria-hidden className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full border-2 border-edge bg-teal text-white">
                  <Check className="size-4" strokeWidth={3.5} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-center text-lg font-semibold leading-snug text-ink-soft">
        Tap a duck, or move with the arrows and press <PadKey>A</PadKey>.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------- whack-a-mole */

type Critter = { kind: "mole" | "gold" | "bunny"; until: number; id: number };

function CritterSvg({ kind }: { kind: Critter["kind"] }) {
  if (kind === "bunny") {
    return (
      <svg viewBox="0 0 64 64" className="size-full" aria-hidden>
        <ellipse cx="22" cy="14" rx="6" ry="15" fill="#fff" stroke="#3a2b20" strokeWidth="3" />
        <ellipse cx="42" cy="14" rx="6" ry="15" fill="#fff" stroke="#3a2b20" strokeWidth="3" />
        <ellipse cx="22" cy="15" rx="2.5" ry="9" fill="#f5a8c8" />
        <ellipse cx="42" cy="15" rx="2.5" ry="9" fill="#f5a8c8" />
        <circle cx="32" cy="42" r="20" fill="#fff" stroke="#3a2b20" strokeWidth="3" />
        <circle cx="25" cy="38" r="2.8" fill="#3a2b20" />
        <circle cx="39" cy="38" r="2.8" fill="#3a2b20" />
        <ellipse cx="32" cy="46" rx="3.5" ry="2.5" fill="#f06aa8" />
      </svg>
    );
  }
  const fur = kind === "gold" ? "#ffd23a" : "#8a5a3a";
  return (
    <svg viewBox="0 0 64 64" className="size-full" aria-hidden>
      <ellipse cx="32" cy="40" rx="22" ry="22" fill={fur} stroke="#3a2b20" strokeWidth="3" />
      <circle cx="24" cy="34" r="3" fill="#3a2b20" />
      <circle cx="40" cy="34" r="3" fill="#3a2b20" />
      <ellipse cx="32" cy="44" rx="6" ry="4.5" fill="#f5a8c8" stroke="#3a2b20" strokeWidth="2" />
      {kind === "gold" && (
        <>
          <path d="M8 12 l3 6 l6 1 l-5 4 l1 6 l-5 -3 l-5 3 l1 -6 l-5 -4 l6 -1 z" fill="#fff4b0" />
          <path d="M54 8 l2 4 l4 1 l-3 3 l1 4 l-4 -2 l-4 2 l1 -4 l-3 -3 l4 -1 z" fill="#fff4b0" />
        </>
      )}
    </svg>
  );
}

function WhackAMole({ booth }: { booth: Booth }) {
  const cols = 3;
  const [stage, setStage] = useState<"intro" | "play" | "done">("intro");
  const [, force] = useState(0);
  const [cursor, setCursor] = useState(1);
  const [outcome, setOutcome] = useState({ won: false, isNew: false, score: 0, tickets: 0 });
  const g = useRef({
    start: 0,
    score: 0,
    holes: Array<Critter | null>(WHACK.holes).fill(null),
    nextSpawn: 0,
    bonk: -1,
    bonkUntil: 0,
    msg: "",
    msgUntil: 0,
  });

  const start = () => {
    sfx.click();
    const now = performance.now();
    g.current = { start: now, score: 0, holes: Array(WHACK.holes).fill(null), nextSpawn: now + 600, bonk: -1, bonkUntil: 0, msg: "", msgUntil: 0 };
    setStage("play");
  };

  useEffect(() => {
    if (stage !== "play") return;
    const id = window.setInterval(() => {
      const s = g.current;
      const now = performance.now();
      const el = (now - s.start) / 1000;
      if (el >= WHACK.seconds) {
        window.clearInterval(id);
        const won = s.score >= WHACK.goal;
        // a ticket for every three points, and three more for winning
        const tickets = payTickets(Math.floor(s.score / 3) + (won ? 3 : 0));
        setOutcome({ won, isNew: won ? award(booth.prize) : false, score: s.score, tickets });
        setStage("done");
        return;
      }
      s.holes = s.holes.map((h) => (h && h.until > now ? h : null));
      const up = s.holes.filter(Boolean).length;
      const maxUp = el < 10 ? 1 : 2;
      if (now >= s.nextSpawn && up < maxUp) {
        const empty = s.holes.map((h, i) => (h ? -1 : i)).filter((i) => i >= 0);
        const i = empty[Math.floor(Math.random() * empty.length)]!;
        const r = Math.random();
        const kind: Critter["kind"] = r < 0.12 ? "gold" : r < 0.3 ? "bunny" : "mole";
        const k = el / WHACK.seconds;
        const dur = (WHACK.upStart + (WHACK.upEnd - WHACK.upStart) * k) * (kind === "gold" ? 0.85 : 1) * 1000;
        s.holes[i] = { kind, until: now + dur, id: now };
        s.nextSpawn = now + (WHACK.gapMin + Math.random() * (WHACK.gapMax - WHACK.gapMin)) * 1000 * (1 - k * 0.2);
      }
      force((n) => n + 1);
    }, 50);
    return () => window.clearInterval(id);
  }, [stage, booth.prize]);

  const whack = (i: number) => {
    if (stage !== "play") return;
    const s = g.current;
    const now = performance.now();
    s.bonk = i;
    s.bonkUntil = now + 180;
    const c = s.holes[i];
    if (!c) return force((n) => n + 1);
    s.holes[i] = null;
    if (c.kind === "bunny") {
      s.score = Math.max(0, s.score - 1);
      s.msg = "Oops! Not the bunny!";
      sfx.wrong();
    } else {
      s.score += c.kind === "gold" ? 3 : 1;
      s.msg = c.kind === "gold" ? "Golden mole! +3" : "";
      if (c.kind === "gold") sfx.correct();
      else sfx.click();
    }
    s.msgUntil = now + 900;
    force((n) => n + 1);
  };

  const since = useSince(stage);
  useInput((e, key) => {
    if (e === "b") return close();
    if (stage !== "play") {
      if (e === "a" && !(stage === "done" && since() < SETTLE_MS)) start();
      return;
    }
    if (key && /^[1-6]$/.test(key)) return whack(Number(key) - 1);
    const n = WHACK.holes;
    if (e === "left") setCursor((c) => (c + n - 1) % n);
    else if (e === "right") setCursor((c) => (c + 1) % n);
    else if (e === "up" || e === "down") setCursor((c) => (c + cols) % n);
    else if (e === "a") whack(cursor);
  });

  if (stage === "intro") {
    return (
      <Intro booth={booth} onPlay={start}>
        <div className="grid grid-cols-3 gap-2 text-center sm:gap-3">
          {(
            [
              ["mole", "+1"],
              ["gold", "+3"],
              ["bunny", "Don't!"],
            ] as const
          ).map(([k, label], i) => (
            <div
              key={k}
              className="animate-ui-rise grid justify-items-center gap-2 rounded-2xl border-[3px] border-edge bg-[#e4f3df] p-2.5 shadow-[0_4px_0_#1d2452]"
              style={{ animationDelay: `${40 + i * 50}ms` }}
            >
              <div className="size-16 sm:size-20">
                <CritterSvg kind={k} />
              </div>
              <span
                className={cn(
                  "ui-chip px-3 text-lg",
                  k === "mole" ? "bg-teal text-white" : k === "gold" ? "bg-sun text-ink" : "bg-accent text-accent-fg",
                )}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </Intro>
    );
  }
  if (stage === "done") {
    return (
      <Result
        booth={booth}
        won={outcome.won}
        isNew={outcome.isNew}
        line={`You scored ${outcome.score}. You needed ${WHACK.goal}.`}
        onAgain={start}
        tickets={outcome.tickets}
      />
    );
  }
  const s = g.current;
  const now = performance.now();
  const left = Math.max(0, WHACK.seconds - (now - s.start) / 1000);
  return (
    <div className="grid gap-3 sm:gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="ui-chip gap-2 bg-surface px-4 py-0.5 text-3xl text-ink">
          <Hammer className="size-6 text-[#3fa35c]" strokeWidth={2.5} />
          {s.score} <span className="text-lg text-ink-soft">/ {WHACK.goal}</span>
        </span>
        <span className={cn("ui-chip gap-2 px-4 py-0.5 text-3xl", left < 6 ? "bg-accent text-accent-fg" : "bg-surface text-ink")}>
          <Timer className="size-6" strokeWidth={2.5} />
          {Math.ceil(left)}s
        </span>
      </div>
      <div className="h-4 overflow-hidden rounded-full border-[3px] border-edge bg-surface-2">
        <div
          className={cn("h-full rounded-full transition-[width]", left < 6 ? "bg-accent" : "bg-leaf")}
          style={{ width: `${(left / WHACK.seconds) * 100}%` }}
        />
      </div>
      <div
        className="relative mx-auto grid w-full grid-cols-3 gap-3 rounded-2xl border-[3px] border-edge bg-[#6aae5c] p-3 shadow-[0_4px_0_#1d2452]"
        style={{ maxWidth: "max(16rem, calc((100dvh - 22rem) * 3 / 2))" }}
      >
        {s.holes.map((c, i) => (
          <button
            key={i}
            type="button"
            onPointerDown={(ev) => {
              ev.preventDefault();
              setCursor(i);
              whack(i);
            }}
            className={cn(
              "relative aspect-square overflow-hidden rounded-2xl bg-[#78bb69]",
              i === cursor && "outline outline-4 outline-offset-2 outline-sun",
            )}
            aria-label={`hole ${i + 1}`}
          >
            <div className="absolute inset-x-[4%] bottom-[3%] h-[40%] rounded-[50%] bg-[#8a5a3a]" />
            <div className="absolute inset-x-[8%] bottom-[6%] h-[34%] rounded-[50%] bg-[#3a2b20]" />
            <div
              className="absolute inset-x-[14%] bottom-[14%] h-[72%] transition-transform duration-100"
              style={{ transform: c ? "translateY(0)" : "translateY(110%)" }}
            >
              {c && <CritterSvg kind={c.kind} />}
            </div>
            <div className="absolute inset-x-0 bottom-0 h-[20%] bg-[#78bb69]" />
            {s.bonk === i && s.bonkUntil > now && (
              <div className="absolute inset-0 grid place-items-center">
                <Star className="size-2/3 text-sun" fill="#ffc53d" />
              </div>
            )}
            <span className="absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/25 font-display text-sm font-bold text-white">
              {i + 1}
            </span>
          </button>
        ))}
        {s.msg && s.msgUntil > now && (
          <p
            className="ui-title pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-3xl sm:text-4xl"
            style={{ animation: "catchPop 200ms ease-out" }}
          >
            {s.msg}
          </p>
        )}
      </div>
      <p className="text-center text-lg font-semibold leading-snug text-ink-soft">
        Tap the holes, press 1 to 6, or move with the arrows and press <PadKey>A</PadKey>.
      </p>
    </div>
  );
}

/* ----------------------------------------------------------- prize booth */

function PrizeBooth({ booth }: { booth: Booth }) {
  const found = useGame((s) => s.foundAccessories);
  const tickets = useGame((s) => s.tickets);
  const won = GAME_PRIZES.filter((p) => found.includes(p.prize)).length;
  const hasTeddy = found.includes("teddy");
  const ready = won === GAME_PRIZES.length && !hasTeddy;
  // the teddy is the big moment: when it's ready, open on it
  const [page, setPage] = useState<"shop" | "prizes">(ready ? "prizes" : "shop");
  const [cursor, setCursor] = useState(0);
  const claim = () => {
    if (!ready) return;
    award("teddy");
  };
  const buy = (i: number) => {
    const item = SHOP[i]!;
    if (found.includes(item.id)) return;
    if (useGame.getState().buyItem(item.id, item.price)) sfx.win();
    else {
      sfx.wrong();
      speak(`You need ${item.price - tickets} more tickets for the ${accessory(item.id).name.toLowerCase()}.`);
    }
  };
  useEffect(() => speak(`Prize booth. You have ${tickets} tickets.`), []); // eslint-disable-line react-hooks/exhaustive-deps
  useInput((e) => {
    if (e === "b") return close();
    if (e === "lb" || e === "rb") return setPage(page === "shop" ? "prizes" : "shop");
    if (page === "prizes") {
      if (e === "left" || e === "right") setPage("shop");
      else if (e === "a") (ready ? claim() : setPage("shop"));
      return;
    }
    const n = SHOP.length;
    if (e === "left" || e === "up") setCursor((c) => (c + n - 1) % n);
    else if (e === "right" || e === "down") setCursor((c) => (c + 1) % n);
    else if (e === "a") buy(cursor);
  });
  const tabs = (
    <div className="grid flex-1 grid-cols-2 gap-1.5 rounded-full border-[3px] border-edge bg-surface-3 p-1.5">
      {(["shop", "prizes"] as const).map((p) => {
        const Icon = p === "shop" ? Store : Trophy;
        return (
          <button
            key={p}
            type="button"
            onClick={() => setPage(p)}
            className={cn(
              "press flex min-h-12 items-center justify-center gap-2 rounded-full px-2 font-display text-base font-semibold leading-tight min-[400px]:text-lg sm:text-xl",
              "border-[3px]",
              page === p ? "gloss border-edge bg-grape text-white shadow-[0_3px_0_#1d2452]" : "border-transparent text-ink-soft",
            )}
          >
            <Icon className="hidden size-5 shrink-0 sm:block" strokeWidth={2.5} />
            {p === "shop" ? "Shop" : `Game prizes ${won}/${GAME_PRIZES.length}`}
          </button>
        );
      })}
    </div>
  );
  if (page === "shop") {
    return (
      <div className="grid gap-4 [@media(max-height:760px)]:gap-3">
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
          {tabs}
          <p className="ui-chip gloss gap-2 self-center bg-sun px-5 py-1.5 text-2xl text-ink">
            <Ticket className="size-7" strokeWidth={2.5} /> {tickets} tickets
          </p>
        </div>
        {ready && (
          <Btn onClick={() => setPage("prizes")} className="min-h-14 gap-2 px-3 text-lg sm:text-xl [@media(max-height:760px)]:min-h-12">
            <Gift className="size-6" /> Your giant teddy is ready!
          </Btn>
        )}
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 sm:gap-3">
          {SHOP.map((item, i) => {
            const have = found.includes(item.id);
            const afford = tickets >= item.price;
            const def = accessory(item.id);
            const { Icon, color } = SHOP_ICON[item.id] ?? { Icon: Gift, color: "#7b5cf0" };
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setCursor(i);
                  buy(i);
                }}
                className={cn(
                  "press relative grid content-between justify-items-center gap-1.5 rounded-2xl border-[3px] border-edge px-1 pb-2.5 pt-2.5 text-center sm:gap-2 sm:px-1.5 sm:py-3 [@media(max-height:760px)]:sm:gap-1.5 [@media(max-height:760px)]:sm:py-2 shadow-[0_4px_0_#1d2452]",
                  have ? "bg-[#e3f6ef]" : afford ? "bg-surface" : "bg-surface-2",
                  i === cursor && "outline outline-4 outline-offset-2 outline-accent",
                )}
              >
                <span
                  className={cn(
                    "grid size-12 place-items-center rounded-full border-[3px] sm:size-14 [@media(max-height:760px)]:sm:size-12",
                    afford || have ? "gloss border-edge" : "border-dashed border-muted bg-surface-3",
                  )}
                  style={afford || have ? { backgroundColor: `${color}26` } : undefined}
                >
                  <Icon className="size-7 sm:size-8" style={{ color: afford || have ? color : "#8a93b8" }} strokeWidth={2.25} />
                </span>
                <span className={cn("text-base font-bold leading-tight sm:text-lg", !afford && !have && "text-ink-soft")}>{def.name}</span>
                {have ? (
                  <span className="ui-chip bg-teal px-2.5 text-base text-white">
                    <Check className="size-4" strokeWidth={3.5} /> Yours
                  </span>
                ) : (
                  <span className={cn("ui-chip px-3 text-lg", afford ? "bg-sun text-ink" : "border-muted bg-surface-3 text-ink-soft shadow-none")}>
                    {afford ? <Ticket className="size-4" strokeWidth={2.5} /> : <Lock className="size-4" strokeWidth={2.5} />} {item.price}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {(() => {
          const item = SHOP[cursor]!;
          const def = accessory(item.id);
          if (found.includes(item.id))
            return (
              <p className="rounded-2xl bg-teal/12 px-4 py-2.5 text-center text-lg font-semibold leading-snug text-teal-deep">
                {def.name}: already yours. Wear it from your backpack.
              </p>
            );
          return (
            <p className="rounded-2xl bg-surface-2 px-4 py-2.5 text-center text-lg font-semibold leading-snug text-ink-soft">
              <span className="text-ink">{def.name}</span> costs {item.price}.{" "}
              {tickets >= item.price
                ? `You'd have ${tickets - item.price} tickets left.`
                : `You need ${item.price - tickets} more. Win tickets at the booths and the carousel!`}
            </p>
          );
        })()}
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <div className="flex">{tabs}</div>
      <p className="text-xl font-semibold leading-snug text-ink">{booth.pitch}</p>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {GAME_PRIZES.map((p) => {
          const have = found.includes(p.prize);
          return (
            <li
              key={p.prize}
              className={cn(
                "flex items-center gap-3 rounded-2xl border-[3px] p-2.5",
                have ? "border-edge bg-[#e3f6ef] shadow-[0_3px_0_#1d2452]" : "border-line bg-surface-2",
              )}
            >
              <PrizeBadge id={p.prize} have={have} />
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-semibold leading-tight">{accessory(p.prize).name}</p>
                <p className="text-base leading-snug text-ink-soft sm:text-lg">{have ? "Won!" : `Win it at ${p.where}.`}</p>
              </div>
              {have && (
                <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-edge bg-teal text-white">
                  <Check className="size-5" strokeWidth={3.5} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <div
        className={cn(
          "relative flex items-center gap-4 overflow-hidden rounded-2xl border-[3px] border-edge p-3 shadow-[0_4px_0_#1d2452]",
          hasTeddy || ready ? "bg-[#fff6dc]" : "bg-surface",
        )}
      >
        {(hasTeddy || ready) && (
          <div
            aria-hidden
            className="absolute -left-10 top-1/2 size-44 -translate-y-1/2 animate-[spin_18s_linear_infinite]"
            style={{
              background: "repeating-conic-gradient(rgb(255 200 58 / 0.7) 0 10deg, transparent 10deg 30deg)",
              WebkitMask: "radial-gradient(circle, #000 25%, transparent 70%)",
              mask: "radial-gradient(circle, #000 25%, transparent 70%)",
            }}
          />
        )}
        <div className="relative">
          <PrizeBadge id="teddy" have={hasTeddy || ready} size="lg" />
        </div>
        <div className="relative min-w-0 flex-1">
          <p className="font-display text-2xl font-semibold">Giant teddy</p>
          <p className="text-lg leading-snug text-ink-soft">
            {hasTeddy
              ? "He's yours! You won every carnival game."
              : ready
                ? "You won every game. Claim your teddy!"
                : `${won} of ${GAME_PRIZES.length} games won so far.`}
          </p>
          {!hasTeddy && !ready && (
            <div className="mt-2 flex gap-1.5" aria-hidden>
              {GAME_PRIZES.map((p) => (
                <span
                  key={p.prize}
                  className={cn("h-3 flex-1 rounded-full border-2 border-edge", found.includes(p.prize) ? "bg-sun" : "bg-surface-2")}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      {ready ? (
        <Btn onClick={claim} className="min-h-16 gap-2 text-2xl">
          <Gift className="size-7" /> Claim the giant teddy!
        </Btn>
      ) : (
        <Btn onClick={close} variant="secondary" className="min-h-14 text-xl">
          Done
        </Btn>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- panel */

export function CarnivalPanel() {
  const game = useGame((s) => s.carnival);
  if (!game) return null;
  const booth = BOOTHS.find((b) => b.game === game)!;
  return (
    <ModalFrame className={game === "prizes" ? "max-w-xl sm:max-w-2xl lg:max-w-3xl" : "max-w-xl lg:max-w-2xl 2xl:max-w-3xl"}>
      <PanelRibbon color={booth.awning[0]} Icon={BOOTH_ICON[game]} title={booth.name} onClose={close} closeLabel="Leave" padSkip />
      <div className="ui-dots p-4 sm:p-6 [@media(max-height:760px)]:sm:py-4 [@media(max-height:500px)]:py-3">
        {game === "rings" && <RingToss key="rings" booth={booth} />}
        {game === "ducks" && <DuckPond key="ducks" booth={booth} />}
        {game === "moles" && <WhackAMole key="moles" booth={booth} />}
        {game === "prizes" && <PrizeBooth key="prizes" booth={booth} />}
      </div>
    </ModalFrame>
  );
}
