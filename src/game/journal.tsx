import { useEffect, useRef, useState } from "react";
import {
  Backpack,
  Bird,
  BookOpen,
  Cat,
  Check,
  Cloud,
  Crown,
  Fan,
  Feather,
  Flower2,
  Glasses,
  Heart,
  Lollipop,
  PartyPopper,
  PawPrint,
  Rabbit,
  Ribbon,
  Shield,
  Shirt,
  Sparkles,
  Star,
  Sticker,
  Ticket,
  WandSparkles,
  X,
} from "lucide-react";
import { ACCESSORIES, SLOTS, accessory, type AccessoryId, type Slot } from "./accessories";
import { sfx } from "./audio";
import { useInput } from "./carnival-games";
import { STICKER_SPOTS } from "./collectibles";
import { HearButton } from "./help-cards";
import { STICKER_ART, stickerDataUrl } from "./sticker-art";
import { LEVELS } from "./levels";
import { Panel } from "./overlays";
import { useGame } from "./store";
import { cn } from "@/lib/utils";

/**
 * The journal (J on the keyboard, Back on a controller): three tabs.
 * Dumplings lists the park's dumplings, Stickers is the sticker book, and Bag
 * shows what she carries, which is nothing until she finds the backpack.
 * LB and RB (Q and E on the keyboard) switch tabs; arrows or the d-pad move in
 * a tab's grid; A equips; Esc or B closes.
 */

type Tab = "dumplings" | "stickers" | "bag";
const TABS: { id: Tab; label: string; Icon: typeof BookOpen }[] = [
  { id: "dumplings", label: "Dumplings", Icon: BookOpen },
  { id: "stickers", label: "Stickers", Icon: Sticker },
  { id: "bag", label: "Bag", Icon: Backpack },
];

function useTabKeys() {
  const setTab = useGame((s) => s.setJournalTab);
  const setJournal = useGame((s) => s.setJournal);
  const prev = useRef({ l: false, r: false, b: false, armed: false });
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
        const p = prev.current;
        if (p.armed) {
          if (l && !p.l) step(-1);
          if (r && !p.r) step(1);
          if (b && !p.b) setJournal(false);
        }
        prev.current = { l, r, b, armed: true };
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
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-ink/40 p-4">
      <Panel className="relative flex max-h-[86dvh] w-full max-w-lg flex-col p-5">
        <button
          type="button"
          aria-label="Close journal"
          className="absolute right-3 top-3 grid size-10 place-items-center rounded-sm text-ink"
          onClick={() => setJournal(false)}
        >
          <X className="size-5" />
        </button>
        <div className="mb-4 flex gap-2 pr-10">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "chunk-sm flex flex-1 items-center justify-center gap-1.5 px-2 py-2 font-display text-base font-semibold",
                tab === t.id ? "bg-accent text-accent-fg" : "bg-surface-2 text-ink",
              )}
            >
              <t.Icon className="size-4" />
              {t.label}
            </button>
          ))}
        </div>
        <div className="min-h-0 overflow-y-auto">
          {tab === "dumplings" && <DumplingsTab />}
          {tab === "stickers" && <StickersTab />}
          {tab === "bag" && <BagTab />}
        </div>
        <p className="mt-3 text-center text-xs text-ink-soft">LB / RB (or Q / E) to switch pages · B to close</p>
      </Panel>
    </div>
  );
}

function DumplingsTab() {
  const levelIndex = useGame((s) => s.levelIndex);
  const collected = useGame((s) => s.collected[levelIndex] ?? []);
  const level = LEVELS[levelIndex]!;
  return (
    <>
      <h2 className="font-display text-2xl font-semibold">Dumpling journal</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {collected.length} of {level.dumplings.length} found in {level.name}
      </p>
      <ul className="mt-4 space-y-2">
        {level.dumplings.map((d) => {
          const got = collected.includes(d.id);
          return (
            <li key={d.id} className="chunk-sm flex items-center gap-3 bg-surface-2 px-3 py-2">
              <span className="size-8 rounded-full border border-line" style={{ background: got ? d.color : "#e2d5c4" }} />
              <span>
                <span className="block font-semibold">{got ? d.name : "Unknown dumpling"}</span>
                <span className="block text-sm text-ink-soft">
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

function StickersTab() {
  const hasBook = useGame((s) => s.stickerBook);
  const stickers = useGame((s) => s.stickers);
  if (!hasBook) {
    return (
      <div className="grid justify-items-center gap-2 py-8 text-center">
        <Sticker className="size-12 text-ink-soft" />
        <h2 className="font-display text-2xl font-semibold">No sticker book yet</h2>
        <p className="text-ink-soft">There's a sticker book somewhere near the start of the park. Find it to collect stickers!</p>
      </div>
    );
  }
  return <StickerBook stickers={stickers} />;
}

/**
 * The sticker book: all 30 spaces, found stickers in colour, the rest as grey
 * shapes with a question mark. Choosing a space shows its name, or a clue to
 * where it's hiding.
 */
function StickerBook({ stickers }: { stickers: string[] }) {
  const [cursor, setCursor] = useState(0);
  const cols = 6;
  const n = STICKER_ART.length;
  useInput((e) => {
    if (e === "left") setCursor((c) => (c + n - 1) % n);
    else if (e === "right") setCursor((c) => (c + 1) % n);
    else if (e === "up") setCursor((c) => (c - cols + n) % n);
    else if (e === "down") setCursor((c) => (c + cols) % n);
  });
  const sel = STICKER_ART[cursor]!;
  const have = stickers.includes(sel.id);
  const spot = STICKER_SPOTS.find((s) => s.id === sel.id);
  const line = have ? `${sel.name}${sel.rarity === "shiny" ? ", a shiny one!" : sel.rarity === "rare" ? ", a rare one!" : "!"}` : `Still hiding. ${spot?.hint ?? ""}`;
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-semibold">Sticker book</h2>
        <span className="rounded-full bg-[#b98ce0] px-3 py-1 font-display text-lg font-semibold text-white">
          {stickers.length} / {n}
        </span>
      </div>
      <div className="grid grid-cols-6 gap-1.5 rounded-xl border-[3px] border-edge bg-[#fdf6ff] p-2">
        {STICKER_ART.map((art, i) => {
          const got = stickers.includes(art.id);
          return (
            <button
              key={art.id}
              type="button"
              onClick={() => setCursor(i)}
              className={cn(
                "grid aspect-square place-items-center rounded-lg",
                got && art.rarity === "shiny" && "bg-[linear-gradient(135deg,#fff4b0,#f5c8ff,#c8f0ff)]",
                i === cursor && "outline outline-4 outline-offset-1 outline-accent",
              )}
              aria-label={got ? art.name : "hidden sticker"}
            >
              <img src={stickerDataUrl(art.id, 96, got)} alt="" className="size-full" draggable={false} />
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
        <img src={stickerDataUrl(sel.id, 128, have)} alt="" className="size-16" />
        <p className="flex-1 text-lg font-semibold leading-snug">{line}</p>
        <HearButton text={line} />
      </div>
    </div>
  );
}

const SLOT_LABEL: Record<Slot, string> = { head: "Head", hair: "Hair", face: "Face", back: "Back", hand: "Hand" };
const ITEM_ICON: Partial<Record<AccessoryId, typeof BookOpen>> = {
  sunglasses: Glasses,
  partyhat: PartyPopper,
  bow: Ribbon,
  backpack: Backpack,
  flowercrown: Flower2,
  crown: Crown,
  balloon: Heart,
  duckhat: Bird,
  starglasses: Star,
  unicorn: Sparkles,
  teddy: PawPrint,
  catears: Cat,
  wings: Feather,
  heartglasses: Glasses,
  tiara: Crown,
  cape: Shield,
  bunnyears: Rabbit,
  wand: WandSparkles,
  lollipop: Lollipop,
  cottoncandy: Cloud,
  pinwheel: Fan,
};

/**
 * Equip, Minecraft style: her slots down the side, everything she owns in a
 * grid. Choosing an item puts it in its slot (taking off whatever was there);
 * choosing something she is already wearing takes it off. The backpack is
 * the bag itself, so it isn't in the grid.
 */
function EquipGrid() {
  const found = useGame((s) => s.foundAccessories);
  const worn = useGame((s) => s.worn);
  const setWorn = useGame((s) => s.setWorn);
  const items = ACCESSORIES.filter((a) => found.includes(a.id) && a.id !== "backpack");
  const [cursor, setCursor] = useState(0);
  const cols = 5;
  const toggle = (id: AccessoryId) => {
    const def = accessory(id);
    sfx.click();
    setWorn(def.slot, worn[def.slot] === id ? null : id);
  };
  useInput((e) => {
    if (!items.length) return;
    const n = items.length;
    if (e === "left") setCursor((c) => (c + n - 1) % n);
    else if (e === "right") setCursor((c) => (c + 1) % n);
    else if (e === "up") setCursor((c) => (c - cols + n) % n);
    else if (e === "down") setCursor((c) => (c + cols) % n);
    else if (e === "a") toggle(items[Math.min(cursor, n - 1)]!.id);
  });
  return (
    <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-1">
        {SLOTS.map((slot) => {
          const id = worn[slot];
          const Icon = id ? (ITEM_ICON[id] ?? Shirt) : Shirt;
          return (
            <button
              key={slot}
              type="button"
              onClick={() => id && toggle(id)}
              className="chunk-sm flex flex-col items-center gap-0.5 bg-surface px-1 py-1.5 sm:flex-row sm:gap-2 sm:px-2"
              aria-label={id ? `Take off ${accessory(id).name}` : `${SLOT_LABEL[slot]} is empty`}
            >
              <span className={cn("grid size-8 place-items-center rounded-md border-2 border-edge", id ? "bg-sun" : "bg-surface-2")}>
                <Icon className={cn("size-5", id ? "text-ink" : "text-muted")} />
              </span>
              <span className="text-left leading-tight">
                <span className="block text-[11px] font-bold uppercase text-ink-soft">{SLOT_LABEL[slot]}</span>
                <span className="hidden text-xs font-semibold sm:block">{id ? accessory(id).name : "Empty"}</span>
              </span>
            </button>
          );
        })}
      </div>
      {items.length ? (
        <div className="grid grid-cols-5 content-start gap-1.5">
          {items.map((a, i) => {
            const on = worn[a.slot] === a.id;
            const Icon = ITEM_ICON[a.id] ?? Shirt;
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
                  "relative grid aspect-square place-items-center rounded-lg border-[3px] border-edge",
                  on ? "bg-sun" : "bg-surface-2",
                  i === cursor && "outline outline-4 outline-offset-1 outline-accent",
                )}
                aria-label={`${on ? "Take off" : "Put on"} ${a.name}`}
              >
                <Icon className="size-7 text-ink" />
                {on && <Check className="absolute right-0.5 top-0.5 size-4 text-ok" />}
              </button>
            );
          })}
          <p className="col-span-5 text-sm font-semibold text-ink-soft">
            {items[Math.min(cursor, items.length - 1)]!.name} ·{" "}
            {SLOT_LABEL[items[Math.min(cursor, items.length - 1)]!.slot]}
          </p>
        </div>
      ) : (
        <p className="self-center text-ink-soft">Nothing to wear yet. Find things around the park and win prizes at the carnival!</p>
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
      <div className="grid justify-items-center gap-2 py-8 text-center">
        <Backpack className="size-12 text-ink-soft" />
        <h2 className="font-display text-2xl font-semibold">No backpack yet</h2>
        <p className="text-ink-soft">
          Without a backpack you can't carry anything you find. There's one out on the ball field!
        </p>
        <p className="mt-2 flex items-center gap-2 rounded-full bg-sun px-4 py-1 font-display text-lg font-semibold">
          <Ticket className="size-5" /> {tickets} tickets in your pocket
        </p>
      </div>
    );
  }
  const row = "chunk-sm flex items-center gap-3 bg-surface-2 px-3 py-2.5";
  return (
    <div className="grid gap-2">
      <h2 className="font-display text-2xl font-semibold">Backpack</h2>
      <EquipGrid />
      <div className={row}>
        <span className="grid size-10 place-items-center rounded-full bg-sun">
          <Ticket className="size-5" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold">{tickets} tickets</span>
          <span className="block text-sm text-ink-soft">Win more at the carnival. Spend them at the prize booth.</span>
        </span>
      </div>
      <button type="button" className={cn(row, "text-left")} onClick={() => setTab("stickers")}>
        <span className="grid size-10 place-items-center rounded-full bg-[#b98ce0] text-white">
          <Sticker className="size-5" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold">{hasBook ? "Sticker book" : "Sticker book (not found)"}</span>
          <span className="block text-sm text-ink-soft">{hasBook ? `${stickers} stickers inside` : "Look near the start of the park."}</span>
        </span>
      </button>
      {quest.stage !== "none" && quest.stage !== "done" && (
        <div className={row}>
          <span className="grid size-10 place-items-center rounded-full bg-[#e8c49a] font-display font-semibold">{quest.treats.length}</span>
          <span className="flex-1">
            <span className="block font-semibold">Pet treats</span>
            <span className="block text-sm text-ink-soft">{quest.treats.length} of 5 found for the lost pet.</span>
          </span>
        </div>
      )}
      {pet && (
        <div className={row}>
          <span className="grid size-10 place-items-center rounded-full bg-[#f5a8c8] font-display font-semibold">♥</span>
          <span className="flex-1">
            <span className="block font-semibold">{pet.name}</span>
            <span className="block text-sm text-ink-soft">Your {pet.kind}. Always by your side.</span>
          </span>
        </div>
      )}
    </div>
  );
}
