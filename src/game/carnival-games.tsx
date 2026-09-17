import { useEffect, useRef, useState } from "react";
import {
  Apple,
  Carrot,
  Check,
  Cherry,
  Cloud,
  Fish,
  Flower,
  Gift,
  Heart,
  Moon,
  PawPrint,
  Rainbow,
  Snowflake,
  Sparkles,
  Star,
  Sun,
  Ticket,
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

function PrizeBadge({ id, have, size = "md" }: { id: AccessoryId; have: boolean; size?: "md" | "lg" }) {
  const { Icon, color } = PRIZE_ICON[id]!;
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-full border-[3px] border-edge",
        size === "lg" ? "size-20" : "size-12",
        have ? "bg-surface" : "bg-surface-2 opacity-60",
      )}
    >
      {id === "duckhat" ? (
        <div className={cn(size === "lg" ? "size-14" : "size-9", !have && "grayscale")}>
          <DuckSvg />
        </div>
      ) : (
        <Icon className={size === "lg" ? "size-10" : "size-6"} style={{ color: have ? color : "#9a8468" }} fill={have ? color : "none"} />
      )}
    </div>
  );
}

function Intro({ booth, onPlay, children }: { booth: Booth; onPlay: () => void; children?: React.ReactNode }) {
  const have = useGame((s) => s.foundAccessories.includes(booth.prize));
  useEffect(() => speak(`${booth.name}. ${booth.pitch}`), [booth]);
  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-3">
        <p className="flex-1 text-2xl font-semibold leading-snug text-ink">{booth.pitch}</p>
        <HearButton text={`${booth.name}. ${booth.pitch}`} />
      </div>
      {children}
      <div className="flex items-center gap-3 rounded-lg bg-surface-2 p-3">
        <PrizeBadge id={booth.prize} have={have} />
        <p className="text-sm font-semibold text-ink-soft">
          {have
            ? `You already won the ${accessory(booth.prize).name.toLowerCase()}. Play for fun!`
            : `Prize: the ${accessory(booth.prize).name.toLowerCase()}!`}
        </p>
      </div>
      <Btn onClick={onPlay} className="min-h-14 text-2xl">
        Play!
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
    <div className="grid justify-items-center gap-3 text-center">
      {won && <PrizeBadge id={booth.prize} have size="lg" />}
      <h3 className="font-display text-3xl font-semibold">{won ? "You won!" : "So close!"}</h3>
      <p className="text-lg text-ink">{line}</p>
      {tickets > 0 && (
        <p className="rounded-full bg-sun px-4 py-1 font-display text-xl font-semibold text-ink" style={{ animation: "catchPop 260ms ease-out" }}>
          +{tickets} ticket{tickets === 1 ? "" : "s"}!
        </p>
      )}
      {won && (
        <p className="text-sm font-semibold text-ok">
          {isNew
            ? `The ${accessory(booth.prize).name.toLowerCase()} is yours. It's on! Change it in the wardrobe.`
            : "Champion again!"}
        </p>
      )}
      <div className="mt-1 flex gap-2">
        <Btn onClick={onAgain} variant={won ? "secondary" : "primary"}>
          {won ? "Play again" : "Try again"}
        </Btn>
        <Btn onClick={close} variant={won ? "primary" : "secondary"}>
          Done
        </Btn>
      </div>
      <p className="text-xs text-ink-soft">A to play again · B to leave</p>
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
      <div className="flex items-center justify-between">
        <p className="font-semibold text-ink-soft">
          Ring {Math.min(throwNo + 1, RING_TOSS.rings)} of {RING_TOSS.rings}
        </p>
        <div className="flex gap-1.5">
          {Array.from({ length: RING_TOSS.rings }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "grid size-6 place-items-center rounded-full border-2 border-edge",
                hits[i] === true ? "bg-ok text-ok-fg" : hits[i] === false ? "bg-surface-2" : "bg-surface",
              )}
            >
              {hits[i] === true && <Check className="size-4" />}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={toss}
        className="relative h-56 w-full overflow-hidden rounded-xl border-[3px] border-edge bg-[#fdf0d8]"
        aria-label="Throw the ring"
      >
        {/* the swinging ring */}
        <div
          ref={flight ? undefined : marker}
          className="absolute top-3 size-16 -translate-x-1/2 rounded-full border-[10px] border-accent transition-[top,transform] duration-300 ease-in"
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
                  "h-20 w-14 rounded-xl border-[3px] border-edge",
                  i === target ? "bg-sun shadow-[0_0_24px_8px_rgba(255,197,61,0.8)]" : "bg-[#3fa35c]",
                )}
              />
            </div>
          ))}
        </div>
        {flight && (
          <p
            className={cn(
              "absolute inset-x-0 top-24 font-display text-4xl font-semibold drop-shadow",
              flight.hit ? "text-ok" : "text-ink-soft",
            )}
            style={{ animation: "catchPop 260ms ease-out" }}
          >
            {flight.hit ? "Ringed it!" : "Missed!"}
          </p>
        )}
      </button>
      <p className="text-center text-sm font-semibold text-ink-soft">
        Tap, press A or Space when the ring is over the glowing bottle. Ring {RING_TOSS.toWin} to win!
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
    <div className="grid gap-3">
      <div className="flex items-center justify-between font-semibold">
        <span className="text-ink-soft">
          Pairs {matched.size / 2} of {DUCK_POND.pairs}
        </span>
        <span className={cn(DUCK_POND.turns - turns <= 3 ? "text-accent" : "text-ink-soft")}>
          Turns left: {DUCK_POND.turns - turns}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 rounded-xl border-[3px] border-edge bg-[#8fd8f0] p-2">
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
                "relative grid aspect-square place-items-center rounded-lg border-[3px] border-edge transition-transform",
                up ? "bg-surface" : "bg-[#6cc4e0]",
                i === cursor && "outline outline-4 outline-offset-2 outline-accent",
                matched.has(i) && "bg-[#e8f8e8]",
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
            </button>
          );
        })}
      </div>
      <p className="text-center text-sm font-semibold text-ink-soft">Tap a duck, or move with the arrows and press A.</p>
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
        <div className="grid grid-cols-3 gap-2 text-center text-sm font-semibold">
          {(
            [
              ["mole", "+1"],
              ["gold", "+3"],
              ["bunny", "Don't!"],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="grid justify-items-center gap-1 rounded-lg bg-surface-2 p-2">
              <div className="size-14">
                <CritterSvg kind={k} />
              </div>
              <span className={k === "bunny" ? "text-accent" : "text-ink"}>{label}</span>
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
    <div className="grid gap-3">
      <div className="flex items-center justify-between font-display text-2xl font-semibold">
        <span>
          {s.score} <span className="text-base text-ink-soft">/ {WHACK.goal}</span>
        </span>
        <span className={cn(left < 6 && "text-accent")}>{Math.ceil(left)}s</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-leaf transition-[width]" style={{ width: `${(left / WHACK.seconds) * 100}%` }} />
      </div>
      <div className="relative grid grid-cols-3 gap-3 rounded-xl border-[3px] border-edge bg-[#6aae5c] p-3">
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
              "relative aspect-square overflow-hidden rounded-xl",
              i === cursor && "outline outline-4 outline-offset-2 outline-sun",
            )}
            aria-label={`hole ${i + 1}`}
          >
            <div className="absolute inset-x-[8%] bottom-[6%] h-[34%] rounded-[50%] bg-[#3a2b20]" />
            <div
              className="absolute inset-x-[14%] bottom-[14%] h-[72%] transition-transform duration-100"
              style={{ transform: c ? "translateY(0)" : "translateY(110%)" }}
            >
              {c && <CritterSvg kind={c.kind} />}
            </div>
            <div className="absolute inset-x-0 bottom-0 h-[20%] bg-[#6aae5c]" />
            {s.bonk === i && s.bonkUntil > now && (
              <div className="absolute inset-0 grid place-items-center">
                <Star className="size-2/3 text-sun" fill="#ffc53d" />
              </div>
            )}
            <span className="absolute left-1.5 top-1 text-xs font-bold text-white/80">{i + 1}</span>
          </button>
        ))}
        {s.msg && s.msgUntil > now && (
          <p
            className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-display text-3xl font-semibold text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.5)]"
            style={{ animation: "catchPop 200ms ease-out" }}
          >
            {s.msg}
          </p>
        )}
      </div>
      <p className="text-center text-sm font-semibold text-ink-soft">Tap the holes, press 1 to 6, or move with the arrows and press A.</p>
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
    <div className="flex gap-2">
      {(["shop", "prizes"] as const).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => setPage(p)}
          className={cn(
            "chunk-sm flex-1 px-3 py-1.5 font-display text-lg font-semibold",
            page === p ? "bg-accent text-accent-fg" : "bg-surface-2 text-ink",
          )}
        >
          {p === "shop" ? "Shop" : `Game prizes ${won}/${GAME_PRIZES.length}`}
        </button>
      ))}
    </div>
  );
  if (page === "shop") {
    return (
      <div className="grid gap-3">
        {tabs}
        <p className="flex items-center justify-center gap-2 rounded-full bg-sun px-4 py-1.5 font-display text-2xl font-semibold">
          <Ticket className="size-6" /> {tickets} tickets
        </p>
        {ready && (
          <Btn onClick={() => setPage("prizes")} className="gap-2">
            <Gift className="size-5" /> Your giant teddy is ready!
          </Btn>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {SHOP.map((item, i) => {
            const have = found.includes(item.id);
            const afford = tickets >= item.price;
            const def = accessory(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setCursor(i);
                  buy(i);
                }}
                className={cn(
                  "chunk-sm grid justify-items-center gap-1 p-2 text-center",
                  have ? "bg-[#e8f8e8]" : afford ? "bg-surface" : "bg-surface-2 opacity-70",
                  i === cursor && "outline outline-4 outline-offset-2 outline-accent",
                )}
              >
                <span className="text-sm font-semibold leading-tight">{def.name}</span>
                {have ? (
                  <span className="flex items-center gap-1 text-sm font-bold text-ok">
                    <Check className="size-4" /> Yours
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-display text-lg font-semibold">
                    <Ticket className="size-4" /> {item.price}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {(() => {
          const item = SHOP[cursor]!;
          const def = accessory(item.id);
          if (found.includes(item.id)) return <p className="text-center text-sm text-ink-soft">{def.name}: already yours. Wear it from your backpack.</p>;
          return (
            <p className="text-center text-sm font-semibold text-ink-soft">
              {def.name} costs {item.price}.{" "}
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
      {tabs}
      <p className="text-lg leading-relaxed text-ink">{booth.pitch}</p>
      <ul className="grid gap-2">
        {GAME_PRIZES.map((p) => {
          const have = found.includes(p.prize);
          return (
            <li key={p.prize} className="flex items-center gap-3 rounded-lg bg-surface-2 p-2.5">
              <PrizeBadge id={p.prize} have={have} />
              <div className="flex-1">
                <p className="font-semibold">{accessory(p.prize).name}</p>
                <p className="text-sm text-ink-soft">{have ? "Won!" : `Win it at ${p.where}.`}</p>
              </div>
              {have && <Check className="size-6 text-ok" />}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3 rounded-lg border-[3px] border-edge bg-surface p-3">
        <PrizeBadge id="teddy" have={hasTeddy || ready} size="lg" />
        <div className="flex-1">
          <p className="font-display text-xl font-semibold">Giant teddy</p>
          <p className="text-sm text-ink-soft">
            {hasTeddy
              ? "He's yours! You won every carnival game."
              : ready
                ? "You won every game. Claim your teddy!"
                : `${won} of ${GAME_PRIZES.length} games won so far.`}
          </p>
        </div>
      </div>
      {ready ? (
        <Btn onClick={claim} className="min-h-14 gap-2 text-2xl">
          <Gift className="size-6" /> Claim the giant teddy!
        </Btn>
      ) : (
        <Btn onClick={close} variant="secondary">
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
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-ink/45 p-3">
      <Panel className="relative w-full max-w-xl p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-3xl font-semibold" style={{ color: booth.awning[0] }}>
            {booth.name}
          </h2>
          <button
            type="button"
            aria-label="Leave"
            data-pad-skip
            onClick={close}
            className="grid size-10 place-items-center rounded-full border-[3px] border-edge bg-surface"
          >
            <X className="size-5" />
          </button>
        </div>
        {game === "rings" && <RingToss key="rings" booth={booth} />}
        {game === "ducks" && <DuckPond key="ducks" booth={booth} />}
        {game === "moles" && <WhackAMole key="moles" booth={booth} />}
        {game === "prizes" && <PrizeBooth key="prizes" booth={booth} />}
      </Panel>
    </div>
  );
}
