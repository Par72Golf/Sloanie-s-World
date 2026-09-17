import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Backpack,
  BookOpen,
  Check,
  Heart,
  Shirt,
  Sparkles,
  Sticker,
  Ticket,
  X,
} from "lucide-react";
import { ACCESSORIES, SLOTS, accessory, type AccessoryId, type Slot } from "./accessories";
import { sfx } from "./audio";
import { useInput } from "./carnival-games";
import { STICKER_SPOTS } from "./collectibles";
import { HearButton } from "./help-cards";
import { gridMove } from "./grid-nav";
import { ItemThumb } from "./item-thumbs";
import { claimPad } from "./input";
import { STICKER_ART, stickerDataUrl } from "./sticker-art";
import { LEVELS } from "./levels";
import { Panel } from "./overlays";
import { speak } from "./speech";
import { useGame } from "./store";
import { cn } from "@/lib/utils";

/**
 * The journal (J on the keyboard, Back on a controller): three tabs.
 * Dumplings lists the park's dumplings, Stickers is the sticker book, and Bag
 * shows what she carries, which is nothing until she finds the backpack.
 * LB and RB (Q and E on the keyboard) switch tabs; arrows or the d-pad move in
 * a tab's grid; A equips; Esc, B or Back closes.
 */

type Tab = "dumplings" | "stickers" | "bag";
const TABS: { id: Tab; label: string; Icon: typeof BookOpen }[] = [
  { id: "dumplings", label: "Dumplings", Icon: BookOpen },
  { id: "stickers", label: "Stickers", Icon: Sticker },
  { id: "bag", label: "Bag", Icon: Backpack },
];

/** Each page has its own colour: its tab, its header band and its badge match. */
const TAB_LOOK: Record<Tab, { title: string; bg: string; text: string }> = {
  dumplings: { title: "Dumpling journal", bg: "bg-accent", text: "text-accent" },
  stickers: { title: "Sticker book", bg: "bg-grape", text: "text-grape" },
  bag: { title: "Backpack", bg: "bg-teal", text: "text-teal" },
};

function useTabKeys() {
  const setTab = useGame((s) => s.setJournalTab);
  const setJournal = useGame((s) => s.setJournal);
  const prev = useRef({ l: false, r: false, b: false, back: false, armed: false });
  // the journal has the pad while it is open, so Back is handled here too
  useEffect(() => claimPad(), []);
  useEffect(() => {
    const step = (d: number) => {
      const cur = useGame.getState().journalTab;
      const i = TABS.findIndex((t) => t.id === cur);
      setTab(TABS[(i + d + TABS.length) % TABS.length]!.id);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "q" || e.key === "Q") step(-1);
      else if (e.key === "e" || e.key === "E") step(1);
      else if (e.key === "Escape") setJournal(false);
    };
    window.addEventListener("keydown", onKey);
    let raf = 0;
    const loop = () => {
      const pad = (navigator.getGamepads?.() ?? []).find((p) => p && p.buttons.length > 0);
      if (pad) {
        const l = Boolean(pad.buttons[4]?.pressed);
        const r = Boolean(pad.buttons[5]?.pressed);
        const b = Boolean(pad.buttons[1]?.pressed);
        const back = Boolean(pad.buttons[8]?.pressed);
        const p = prev.current;
        if (p.armed) {
          if (l && !p.l) step(-1);
          if (r && !p.r) step(1);
          if ((b && !p.b) || (back && !p.back)) setJournal(false);
        }
        prev.current = { l, r, b, back, armed: true };
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.cancelAnimationFrame(raf);
    };
  }, [setTab, setJournal]);
}

export function Journal() {
  const tab = useGame((s) => s.journalTab);
  const setTab = useGame((s) => s.setJournalTab);
  const setJournal = useGame((s) => s.setJournal);
  useTabKeys();
  const look = TAB_LOOK[tab];
  const Icon = TABS.find((t) => t.id === tab)!.Icon;
  return (
    <div className="ui-backdrop animate-ui-fade pointer-events-auto absolute inset-0 z-30 flex items-center justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="animate-ui-pop flex h-full max-h-[52rem] w-full max-w-4xl flex-col 2xl:max-w-5xl">
        {/* folder tabs standing up off the top of the book; the chosen one joins its page */}
        <div className="relative z-10 -mb-[3px] flex items-end gap-1.5 px-2 sm:gap-2 sm:px-6">
          <span aria-hidden className="mb-2 mr-1 hidden rounded-md border-2 border-white/80 bg-edge px-1.5 font-display text-sm font-bold text-white sm:block [@media(pointer:coarse)]:hidden">
            LB
          </span>
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-t-[1.1rem] border-[3px] border-b-0 border-edge px-1 font-display font-semibold transition-[height,background-color] duration-150 sm:max-w-52 sm:flex-row sm:gap-2 sm:px-3",
                  on
                    ? cn(TAB_LOOK[t.id].bg, "h-16 text-white [text-shadow:0_2px_0_rgb(0_0_0/0.18)] sm:h-[3.75rem] lg:h-16 [@media(max-height:500px)]:h-12")
                    : "h-14 bg-surface-3 text-ink-soft sm:h-12 lg:h-[3.25rem] [@media(max-height:500px)]:h-11",
                )}
                style={on ? { backgroundImage: "linear-gradient(180deg, rgb(255 255 255 / 0.28), rgb(255 255 255 / 0) 70%)" } : undefined}
              >
                <t.Icon className={cn("shrink-0", on ? "size-6 lg:size-7" : "size-5 lg:size-6")} strokeWidth={2.5} />
                <span className={cn("truncate", on ? "text-sm sm:text-xl lg:text-2xl" : "text-sm sm:text-lg lg:text-xl")}>{t.label}</span>
              </button>
            );
          })}
          <span aria-hidden className="mb-2 ml-1 hidden rounded-md border-2 border-white/80 bg-edge px-1.5 font-display text-sm font-bold text-white sm:block [@media(pointer:coarse)]:hidden">
            RB
          </span>
          <button
            type="button"
            aria-label="Close journal"
            className="chunk-sm press mb-2 ml-auto grid size-12 shrink-0 place-items-center rounded-full bg-surface text-ink"
            onClick={() => setJournal(false)}
          >
            <X className="size-6" strokeWidth={3} />
          </button>
        </div>
        <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className={cn("ui-ribbon flex shrink-0 items-center gap-3 rounded-none px-4 py-2.5 sm:px-5 [@media(max-height:480px)]:py-1.5", look.bg)}>
            <span className={cn("chunk-sm grid size-11 shrink-0 place-items-center rounded-full bg-surface sm:size-12", look.text)}>
              <Icon className="size-6 sm:size-7" strokeWidth={2.5} />
            </span>
            <h2 className="ui-title min-w-0 flex-1 truncate py-1 text-2xl leading-tight sm:text-3xl lg:text-4xl [@media(max-height:500px)]:text-2xl">{look.title}</h2>
            <JournalCount tab={tab} />
          </div>
          <div className="ui-dots min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5 [@media(max-height:480px)]:py-3">
            {tab === "dumplings" && <DumplingsTab />}
            {tab === "stickers" && <StickersTab />}
            {tab === "bag" && <BagTab />}
          </div>
          <p className="shrink-0 border-t-[3px] border-line bg-surface-2 px-3 py-2 text-center text-sm font-bold text-ink-soft lg:text-base [@media(max-height:480px)]:hidden">
            LB / RB (or Q / E) to switch pages · B to close
          </p>
        </Panel>
      </div>
    </div>
  );
}

/** The count in a page's header band: dumplings found, stickers stuck in, tickets carried. */
function JournalCount({ tab }: { tab: Tab }) {
  const levelIndex = useGame((s) => s.levelIndex);
  const found = useGame((s) => (s.collected[levelIndex] ?? []).length);
  const hasBook = useGame((s) => s.stickerBook);
  const stickers = useGame((s) => s.stickers.length);
  const tickets = useGame((s) => s.tickets);
  const chip = "ui-chip shrink-0 bg-surface py-1 text-lg text-ink sm:text-xl";
  if (tab === "dumplings") return <span className={chip}>{found} / {LEVELS[levelIndex]!.dumplings.length}</span>;
  if (tab === "stickers") return hasBook ? <span className={chip}>{stickers} / {STICKER_ART.length}</span> : null;
  return (
    <span className={cn(chip, "bg-sun")}>
      <Ticket className="size-5" strokeWidth={2.5} /> {tickets}
    </span>
  );
}

function DumplingsTab() {
  const levelIndex = useGame((s) => s.levelIndex);
  const collected = useGame((s) => s.collected[levelIndex] ?? []);
  const level = LEVELS[levelIndex]!;
  const list = useRef<HTMLUListElement>(null);
  // the list can be taller than a TV's panel: up and down scroll it
  useInput((e) => {
    const box = list.current?.parentElement;
    if (box && (e === "up" || e === "down")) box.scrollBy({ top: e === "up" ? -140 : 140, behavior: "smooth" });
  });
  return (
    <>
      <p className="px-1 text-lg font-bold text-ink-soft lg:text-xl">
        {collected.length} of {level.dumplings.length} found in {level.name}
      </p>
      <ul ref={list} className="mt-3 grid gap-2.5 sm:grid-cols-2 sm:gap-3">
        {level.dumplings.map((d, i) => {
          const got = collected.includes(d.id);
          return (
            <li
              key={d.id}
              className={cn(
                "animate-ui-rise flex items-center gap-3 rounded-[1.1rem] border-[3px] px-3 py-2.5",
                got ? "border-edge bg-surface shadow-[0_4px_0_var(--color-edge)]" : "border-dashed border-muted bg-surface-2/80",
              )}
              style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
            >
              {got ? (
                <span className="relative size-12 shrink-0 rounded-full border-[3px] border-edge shadow-[inset_0_-5px_0_rgb(0_0_0/0.12),inset_0_4px_0_rgb(255_255_255/0.45)]" style={{ background: d.color }}>
                  <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full border-2 border-edge bg-teal text-white">
                    <Check className="size-3.5" strokeWidth={4} />
                  </span>
                </span>
              ) : (
                <span className="grid size-12 shrink-0 place-items-center rounded-full border-[3px] border-dashed border-muted bg-surface font-display text-2xl font-bold text-muted">
                  ?
                </span>
              )}
              <span className="min-w-0">
                <span className={cn("block font-display text-lg font-semibold leading-tight lg:text-xl", got ? "text-ink" : "text-ink-soft")}>
                  {got ? d.name : "Unknown dumpling"}
                </span>
                <span className="block text-base font-semibold leading-snug text-ink-soft">
                  {got ? `Found near ${d.region}` : d.hide === "hard" ? "Well hidden" : "Still out there"}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** A friendly empty page: a big badge, a heading and a line of help. */
function EmptyPage({ Icon, tone, title, children }: { Icon: typeof BookOpen; tone: string; title: string; children: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-3 px-2 py-6 text-center sm:py-10">
      <span className={cn("grid size-24 place-items-center rounded-full border-[3px] border-dashed border-muted bg-surface", tone)}>
        <Icon className="size-12" strokeWidth={2.2} />
      </span>
      <h2 className="font-display text-2xl font-semibold sm:text-3xl">{title}</h2>
      {children}
    </div>
  );
}

function StickersTab() {
  const hasBook = useGame((s) => s.stickerBook);
  const stickers = useGame((s) => s.stickers);
  if (!hasBook) {
    return (
      <EmptyPage Icon={Sticker} tone="text-grape" title="No sticker book yet">
        <p className="max-w-md text-lg font-semibold text-ink-soft lg:text-xl">There's a sticker book somewhere near the start of the park. Find it to collect stickers!</p>
      </EmptyPage>
    );
  }
  return <StickerBook stickers={stickers} />;
}

/** a hand-stuck look: each collected sticker sits at its own slight angle */
const TILT = [-7, 4, -3, 6, -5, 3, 5, -4, 2, -6, 7, -2];

/**
 * The sticker book: all 30 spaces, found stickers in colour, the rest as grey
 * shapes with a question mark. Choosing a space shows its name, or a clue to
 * where it's hiding.
 */
function StickerBook({ stickers }: { stickers: string[] }) {
  const [cursor, setCursor] = useState(0);
  const cols = 6;
  const n = STICKER_ART.length;
  const grid = useRef<HTMLDivElement>(null);
  const sel = STICKER_ART[cursor]!;
  const have = stickers.includes(sel.id);
  const spot = STICKER_SPOTS.find((s) => s.id === sel.id);
  const line = have ? `${sel.name}${sel.rarity === "shiny" ? ", a shiny one!" : sel.rarity === "rare" ? ", a rare one!" : "!"}` : `Still hiding. ${spot?.hint ?? ""}`;
  useInput((e) => {
    if (e === "left") setCursor((c) => (c + n - 1) % n);
    else if (e === "right") setCursor((c) => (c + 1) % n);
    else if (e === "up") setCursor((c) => (c - cols + n) % n);
    else if (e === "down") setCursor((c) => (c + cols) % n);
    // A is the Hear it button for the chosen space
    else if (e === "a") speak(line, true);
  });
  useEffect(() => {
    // braces matter: newer Chrome returns a Promise from scrollIntoView, and an effect must not return one
    grid.current?.children[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor]);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem] lg:items-start 2xl:grid-cols-[1fr_20rem] [@media(max-height:500px)]:grid-cols-[minmax(0,24rem)_1fr] [@media(max-height:500px)]:items-start">
      {/* the album page */}
      <div
        ref={grid}
        className="grid grid-cols-6 gap-1.5 rounded-[1.1rem] border-[3px] border-edge bg-[#fffdf7] p-2 shadow-[inset_0_0_0_5px_#fff,inset_0_0_0_7px_var(--color-line),0_4px_0_var(--color-edge)] sm:gap-2.5 sm:p-4 lg:gap-2 lg:p-3 2xl:gap-3 2xl:p-4"
      >
        {STICKER_ART.map((art, i) => {
          const got = stickers.includes(art.id);
          const on = i === cursor;
          return (
            <button
              key={art.id}
              type="button"
              onClick={() => setCursor(i)}
              className={cn(
                "relative grid aspect-square min-h-11 place-items-center rounded-[0.8rem] transition-transform duration-150",
                got ? "bg-transparent" : "border-[2.5px] border-dashed border-muted/70 bg-surface-2/70",
                got && art.rarity === "shiny" && "bg-[radial-gradient(circle,#fff4b0_0%,#f0e2ff_45%,transparent_72%)]",
                on && "z-10 scale-110 bg-accent/15 outline outline-4 outline-offset-2 outline-accent",
              )}
              aria-label={got ? art.name : "hidden sticker"}
            >
              <img
                src={stickerDataUrl(art.id, 96, got)}
                alt=""
                className={cn(
                  "size-full",
                  got ? "drop-shadow-[0_3px_2px_rgb(29_36_82/0.3)]" : "scale-75 opacity-45",
                )}
                style={got ? { transform: `rotate(${on ? 0 : TILT[i % TILT.length]}deg)` } : undefined}
                draggable={false}
              />
            </button>
          );
        })}
      </div>
      {/* the chosen space, big */}
      <div className="flex items-center gap-3 rounded-[1.1rem] border-[3px] border-edge bg-surface p-3 shadow-[0_4px_0_var(--color-edge)] lg:sticky lg:top-0 lg:flex-col lg:p-4 lg:text-center [@media(max-height:500px)]:sticky [@media(max-height:500px)]:top-0">
        <span
          className={cn(
            "grid size-20 shrink-0 place-items-center rounded-full lg:size-36",
            have ? (sel.rarity === "shiny" ? "bg-[radial-gradient(circle,#fff4b0,#f0e2ff_60%,#eef5ff)]" : "bg-surface-2") : "border-[3px] border-dashed border-muted bg-surface-2",
          )}
        >
          <img
            src={stickerDataUrl(sel.id, 128, have)}
            alt=""
            className={cn("size-full", have ? "-rotate-6 drop-shadow-[0_4px_3px_rgb(29_36_82/0.3)]" : "scale-75 opacity-50")}
          />
        </span>
        <div className="grid min-w-0 flex-1 gap-2 lg:w-full lg:justify-items-center">
          {have && sel.rarity !== "common" && (
            <span className={cn("ui-chip w-fit text-sm shadow-none", sel.rarity === "shiny" ? "bg-sun text-ink" : "bg-grape text-white")}>
              <Sparkles className="size-3.5" strokeWidth={3} /> {sel.rarity === "shiny" ? "Shiny" : "Rare"}
            </span>
          )}
          <p className="text-lg font-bold leading-snug lg:text-2xl">{line}</p>
          <HearButton text={line} className="w-fit" />
        </div>
      </div>
    </div>
  );
}

const SLOT_LABEL: Record<Slot, string> = { head: "Head", hair: "Hair", face: "Face", back: "Back", hand: "Hand" };

/**
 * Equip, Minecraft style: her slots down the side, everything she owns in a
 * grid. Choosing an item puts it in its slot (taking off whatever was there);
 * choosing something she is already wearing takes it off. The backpack shares
 * the back slot with the wings, the cape and the teddy, so it is in the grid
 * too: she can always put it back on.
 */
function EquipGrid() {
  const found = useGame((s) => s.foundAccessories);
  const worn = useGame((s) => s.worn);
  const setWorn = useGame((s) => s.setWorn);
  // the backpack is in the grid like everything else: wings, a cape and the
  // teddy share its slot, so she needs a way to put it back on. Finding it is
  // what unlocks pickups; wearing it is just how she looks.
  const items = ACCESSORIES.filter((a) => found.includes(a.id));
  const [cursor, setCursor] = useState(0);
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // braces matter: newer Chrome returns a Promise from scrollIntoView, and an effect must not return one
    grid.current?.children[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor]);
  const toggle = (id: AccessoryId) => {
    const def = accessory(id);
    sfx.click();
    setWorn(def.slot, worn[def.slot] === id ? null : id);
  };
  useInput((e) => {
    if (!items.length) return;
    const n = items.length;
    if (e === "left" || e === "right" || e === "up" || e === "down") {
      // move by the row as it is laid out, not by a fixed column count
      setCursor((c) => gridMove(grid.current, c, e, n));
    } else if (e === "a") toggle(items[Math.min(cursor, n - 1)]!.id);
  });
  // empty slots fill out the grid, so it reads as an inventory with room to spare
  const fillers = Math.max(8, Math.ceil(items.length / 4) * 4) - items.length;
  const slotWell = "rounded-[0.8rem] border-[3px] border-edge shadow-[inset_0_4px_0_rgb(29_36_82/0.12)]";
  return (
    <div className="grid gap-3 sm:grid-cols-[9.5rem_1fr] sm:gap-4 lg:grid-cols-[10.5rem_1fr] 2xl:grid-cols-[13rem_1fr]">
      {/* what she has on */}
      <div className="grid grid-cols-5 content-start gap-1.5 rounded-[1.1rem] border-[3px] border-edge bg-surface-3 p-1.5 shadow-[0_4px_0_var(--color-edge)] sm:grid-cols-1 sm:gap-2 sm:p-2">
        {SLOTS.map((slot) => {
          const id = worn[slot];
          return (
            <button
              key={slot}
              type="button"
              onClick={() => id && toggle(id)}
              className="flex min-h-11 flex-col items-center gap-1 rounded-[0.8rem] bg-surface px-0.5 py-1.5 sm:flex-row sm:gap-2.5 sm:p-1.5"
              aria-label={id ? `Take off ${accessory(id).name}` : `${SLOT_LABEL[slot]} is empty`}
            >
              <span className={cn("grid size-11 shrink-0 place-items-center overflow-hidden lg:size-14", slotWell, id ? "gloss bg-sun" : "border-dashed border-muted bg-surface-2 shadow-none")}>
                {id ? (
                  <ItemThumb kind="accessory" id={id} className="size-full p-0.5" />
                ) : (
                  <Shirt className="size-6 text-muted lg:size-7" strokeWidth={2.4} />
                )}
              </span>
              <span className="min-w-0 text-left leading-tight">
                <span className="block font-display text-xs font-semibold uppercase tracking-wide text-ink-soft sm:text-sm">{SLOT_LABEL[slot]}</span>
                <span className={cn("hidden truncate text-base font-bold sm:block", id ? "text-ink" : "text-muted")}>
                  {id ? accessory(id).name : "Empty"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {items.length ? (
        <div className="grid content-start gap-3">
          <div ref={grid} className="grid grid-cols-4 content-start gap-2 rounded-[1.1rem] border-[3px] border-edge bg-surface-3 p-2 shadow-[0_4px_0_var(--color-edge)] sm:gap-2.5 sm:p-2.5">
            {items.map((a, i) => {
              const on = worn[a.slot] === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setCursor(i);
                    toggle(a.id);
                  }}
                  title={a.name}
                  className={cn(
                    "@container relative grid aspect-square min-h-11 place-items-center transition-transform duration-150",
                    slotWell,
                    on ? "gloss bg-sun" : "bg-surface",
                    i === cursor && "z-10 scale-105 outline outline-4 outline-offset-2 outline-accent",
                  )}
                  aria-label={`${on ? "Take off" : "Put on"} ${a.name}`}
                >
                  <span className="flex size-full min-h-0 flex-col items-center justify-center px-0.5 pb-0.5 pt-1 @[4.5rem]:pb-1.5">
                    <ItemThumb kind="accessory" id={a.id} className="min-h-0 w-full flex-1" />
                    <span className="hidden w-full truncate px-0.5 text-center text-[0.7rem] font-extrabold leading-tight text-ink @[4.5rem]:block @[6.5rem]:text-sm">{a.name}</span>
                  </span>
                  {on && (
                    <span className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full border-2 border-edge bg-teal text-white">
                      <Check className="size-3.5" strokeWidth={4} />
                    </span>
                  )}
                </button>
              );
            })}
            {Array.from({ length: fillers }, (_, i) => (
              <span key={`empty${i}`} aria-hidden className={cn("aspect-square min-h-11 bg-surface-2/70", slotWell)} />
            ))}
          </div>
          <p className="flex items-center justify-center gap-2 rounded-full border-[3px] border-edge bg-surface px-4 py-1.5 text-center font-display text-lg font-semibold lg:text-xl">
            {items[Math.min(cursor, items.length - 1)]!.name}
            <span className="ui-chip bg-surface-3 text-sm text-ink-soft shadow-none">{SLOT_LABEL[items[Math.min(cursor, items.length - 1)]!.slot]}</span>
          </p>
        </div>
      ) : (
        <p className="self-center rounded-[1.1rem] border-[3px] border-dashed border-muted bg-surface px-4 py-6 text-center text-lg font-semibold text-ink-soft">
          Nothing to wear yet. Find things around the park and win prizes at the carnival!
        </p>
      )}
    </div>
  );
}

function BagTab() {
  const hasBag = useGame((s) => s.foundAccessories.includes("backpack"));
  const tickets = useGame((s) => s.tickets);
  const hasBook = useGame((s) => s.stickerBook);
  const stickers = useGame((s) => s.stickers.length);
  const quest = useGame((s) => s.quest);
  const pet = useGame((s) => s.pet);
  const setTab = useGame((s) => s.setJournalTab);
  if (!hasBag) {
    return (
      <EmptyPage Icon={Backpack} tone="text-teal" title="No backpack yet">
        <p className="max-w-md text-lg font-semibold text-ink-soft lg:text-xl">
          Without a backpack you can't carry anything you find. There's one out on the ball field!
        </p>
        <p className="ui-chip mt-1 bg-sun px-4 py-1.5 text-lg text-ink">
          <Ticket className="size-5" strokeWidth={2.5} /> {tickets} tickets in your pocket
        </p>
      </EmptyPage>
    );
  }
  const row = "flex min-h-16 items-center gap-3 rounded-[1.1rem] border-[3px] border-edge bg-surface px-3 py-2.5 shadow-[0_4px_0_var(--color-edge)]";
  const badge = "gloss grid size-11 shrink-0 place-items-center rounded-full border-[3px] border-edge";
  const title = "block font-display text-lg font-semibold leading-tight lg:text-xl";
  const sub = "block text-base font-semibold leading-snug text-ink-soft";
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_14rem] lg:items-start 2xl:grid-cols-[1fr_18rem]">
      <EquipGrid />
      <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-1">
        <h3 className="-mb-0.5 px-1 font-display text-lg font-semibold uppercase tracking-wide text-ink-soft sm:col-span-2 lg:col-span-1 lg:-mt-1">In your pockets</h3>
        <div className={row}>
          <span className={cn(badge, "bg-sun text-ink")}>
            <Ticket className="size-5" strokeWidth={2.5} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={title}>{tickets} tickets</span>
            <span className={sub}>Win more at the carnival. Spend them at the prize booth.</span>
          </span>
        </div>
        <button type="button" className={cn(row, "press text-left")} onClick={() => setTab("stickers")}>
          <span className={cn(badge, "bg-grape text-white")}>
            <Sticker className="size-5" strokeWidth={2.5} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={title}>{hasBook ? "Sticker book" : "Sticker book (not found)"}</span>
            <span className={sub}>{hasBook ? `${stickers} stickers inside` : "Look near the start of the park."}</span>
          </span>
        </button>
        {quest.stage !== "none" && quest.stage !== "done" && (
          <div className={row}>
            <span className={cn(badge, "bg-leaf font-display text-lg font-bold text-white")}>{quest.treats.length}</span>
            <span className="min-w-0 flex-1">
              <span className={title}>Pet treats</span>
              <span className={sub}>{quest.treats.length} of 5 found for the lost pet.</span>
            </span>
          </div>
        )}
        {pet && (
          <div className={row}>
            <span className={cn(badge, "bg-berry text-white")}>
              <Heart className="size-5 fill-current" strokeWidth={2.5} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={title}>{pet.name}</span>
              <span className={sub}>Your {pet.kind}. Always by your side.</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
