import type { DressId, HairId, PetSave, QuestSave } from "./types";

const KEY = "sloanies-world-v1";
const SAVE_VERSION = 3;

/** One completed run. Kept per explorer name so siblings can take turns. */
export type RunRecord = {
  name: string;
  seconds: number;
  hintsUsed: number;
  at: number;
};

export type SaveData = {
  version: number;
  playerName: string;
  dress: DressId;
  hair: HairId;
  unlocked: number;
  collected: string[][];
  muted: boolean;
  levelIndex: number;
  /** Which set of hiding spots the current run is using. */
  layout: number;
  /** Dumplings that ran off or were stolen, by id, so a reload keeps them there. */
  movedSpots: Record<string, [number, number, number]>;
  /** Best runs per park, fastest first. */
  leaderboard: RunRecord[][];
  /** Accessories found so far, across all parks. */
  foundAccessories: string[];
  /** What she is wearing, by slot. */
  worn: Record<string, string | null>;
  /** Camera: third person by default, first person opt-in. */
  view: "third" | "first";
  /** Frame-rate readout, switched on from the pause menu. */
  showFps: boolean;
  /** Render quality: "sharp" (full resolution, bloom) or "smooth" (lighter, for a slow screen). */
  graphics: "sharp" | "smooth";
  /** Carnival tickets, spent at the prize booth. */
  tickets: number;
  /** Best mini golf round for the five-hole course, in strokes. */
  golfBest: number | null;
  /** Best lawn bowls game, in pins knocked down out of 27. */
  bowlsBest: number | null;
  /** Fastest crossing of the Floor is Lava course, in seconds to one decimal. */
  lavaBest: number | null;
  /** Whether she has found the sticker book (stickers need it), and her stickers. */
  stickerBook: boolean;
  /** Sugar Rush's own sticker book */
  candyStickerBook: boolean;
  /** Emmett's five monster-truck challenges, and whether the truck is hers */
  truckWins: number;
  truckOwned: boolean;
  /** the chocolate factory has been started, so the river runs brown */
  factoryFixed: boolean;
  stickers: string[];
  quest: QuestSave;
  /** Every pet she has adopted, in the order she chose them (up to three). */
  pets: PetSave[];
  /** The first pet, kept so older readers of the save (and the house) still work. */
  pet: PetSave | null;
  /** Read HUD messages and panels aloud (speech.ts). */
  readAloud: boolean;
  /** Instruction cards already shown (help-cards.tsx). */
  seenHelp: string[];
  /** Read-aloud voice by name; empty means the best installed one. */
  voice: string;
};

const DEFAULT: SaveData = {
  version: SAVE_VERSION,
  playerName: "Sloan",
  dress: "coral",
  hair: "brown",
  unlocked: 0,
  collected: [[], [], []],
  muted: false,
  levelIndex: 0,
  leaderboard: [[], [], []],
  layout: 0,
  movedSpots: {},
  foundAccessories: [],
  worn: { head: null, hair: null, face: null, back: null },
  view: "third",
  showFps: false,
  graphics: "sharp",
  tickets: 0,
  golfBest: null,
  bowlsBest: null,
  lavaBest: null,
  stickerBook: false,
  candyStickerBook: false,
  truckWins: 0,
  truckOwned: false,
  factoryFixed: false,
  stickers: [],
  quest: { stage: "none", treats: [], chapter: 0, seek: null },
  pets: [],
  pet: null,
  readAloud: true,
  seenHelp: [],
  voice: "",
};

function migrate(raw: SaveData): SaveData {
  const s = { ...DEFAULT, ...raw };
  if (!Array.isArray(s.collected) || s.collected.length < 3) {
    s.collected = [[], [], []];
  }
  s.collected = [0, 1, 2].map((i) =>
    Array.isArray(s.collected[i]) ? s.collected[i]!.slice() : [],
  );
  if (!Array.isArray(s.leaderboard) || s.leaderboard.length < 3) {
    s.leaderboard = [[], [], []];
  }
  s.leaderboard = [0, 1, 2].map((i) =>
    Array.isArray(s.leaderboard[i]) ? s.leaderboard[i]!.slice() : [],
  );
  if (typeof s.layout !== "number") s.layout = 0;
  if (!s.movedSpots || typeof s.movedSpots !== "object") s.movedSpots = {};
  s.movedSpots = Object.fromEntries(
    Object.entries(s.movedSpots).filter(
      ([, p]) => Array.isArray(p) && p.length === 3 && p.every((n) => typeof n === "number" && Number.isFinite(n)),
    ),
  ) as SaveData["movedSpots"];
  if (!Array.isArray(s.foundAccessories)) s.foundAccessories = [];
  s.foundAccessories = s.foundAccessories.filter((x) => typeof x === "string");
  if (!s.worn || typeof s.worn !== "object") s.worn = {};
  s.worn = {
    head: typeof s.worn.head === "string" ? s.worn.head : null,
    hair: typeof s.worn.hair === "string" ? s.worn.hair : null,
    face: typeof s.worn.face === "string" ? s.worn.face : null,
    back: typeof s.worn.back === "string" ? s.worn.back : null,
    hand: typeof s.worn.hand === "string" ? s.worn.hand : null,
  };
  if (s.view !== "first") s.view = "third";
  s.showFps = s.showFps === true;
  if (s.graphics !== "smooth") s.graphics = "sharp";
  s.readAloud = s.readAloud !== false;
  s.voice = typeof s.voice === "string" ? s.voice : "";
  s.seenHelp = Array.isArray(s.seenHelp) ? s.seenHelp.filter((x) => typeof x === "string") : [];
  s.tickets = Number.isFinite(s.tickets) && s.tickets > 0 ? Math.floor(s.tickets) : 0;
  s.stickerBook = s.stickerBook === true;
  s.candyStickerBook = s.candyStickerBook === true;
  s.truckWins = Math.min(5, Math.max(0, Math.round(Number(s.truckWins) || 0)));
  s.truckOwned = s.truckOwned === true;
  s.factoryFixed = s.factoryFixed === true;
  s.golfBest = Number.isFinite(s.golfBest) && (s.golfBest as number) > 0 ? Math.floor(s.golfBest as number) : null;
  s.bowlsBest = Number.isFinite(s.bowlsBest) && (s.bowlsBest as number) > 0 ? Math.floor(s.bowlsBest as number) : null;
  s.lavaBest = Number.isFinite(s.lavaBest) && (s.lavaBest as number) > 0 ? Math.round((s.lavaBest as number) * 10) / 10 : null;
  s.stickers = Array.isArray(s.stickers) ? s.stickers.filter((x) => typeof x === "string") : [];
  const onePet = (p: PetSave | null | undefined): PetSave | null =>
    p && ["puppy", "kitten", "bunny"].includes(p.kind) && typeof p.name === "string"
      ? { kind: p.kind, coat: typeof p.coat === "string" ? p.coat : "", name: p.name.slice(0, 16) }
      : null;
  // v2 saved a single `pet`; v3 keeps every pet she has adopted, that one
  // first. The spread over DEFAULT gives a v2 save an empty `pets`, so the
  // fallback has to trigger on an empty list, not just a missing one.
  const list = Array.isArray(s.pets) && s.pets.length ? s.pets : s.pet ? [s.pet] : [];
  const pets: PetSave[] = [];
  for (const raw of list) {
    const p = onePet(raw);
    if (p && !pets.some((q) => q.kind === p.kind)) pets.push(p);
  }
  s.pets = pets.slice(0, 3);
  s.pet = s.pets[0] ?? null;

  const stages = ["none", "treats", "trail", "seek", "escort", "choose", "done"];
  const q = s.quest as Partial<QuestSave> | undefined;
  s.quest =
    q && typeof q.stage === "string" && stages.includes(q.stage)
      ? {
          stage: q.stage,
          treats: Array.isArray(q.treats) ? q.treats.filter((x) => Number.isInteger(x)) : [],
          chapter: Number.isInteger(q.chapter) ? Math.min(3, Math.max(0, q.chapter as number)) : s.pets.length,
          seek: q.seek && ["puppy", "kitten", "bunny"].includes(q.seek) ? q.seek : null,
        }
      : { stage: "none", treats: [], chapter: s.pets.length, seek: null };
  // escorting pets back cannot resume mid-walk; they wait where they were hiding.
  // Chapter 2 hid its pet at the last place checked, so that hunt starts again.
  if (s.quest.stage === "escort") {
    if (s.quest.chapter === 2) {
      s.quest.stage = "seek";
      s.quest.treats = [];
    } else {
      s.quest.stage = "trail";
    }
  }
  // a v2 save that finished the one quest is chapter 1 with Farmer Joe ready to ask again
  if (s.quest.stage === "done" && s.pets.length < 3) s.quest.stage = "none";
  // she cannot be further on than the pets she has: a chapter she has not
  // finished cannot be behind her, and a finished one cannot still be open
  s.quest.chapter = Math.max(s.quest.chapter, s.pets.length);
  if (s.quest.chapter > s.pets.length && s.quest.stage !== "choose") s.quest.chapter = s.pets.length;
  if (s.quest.chapter >= 3) {
    s.quest = { stage: "done", treats: [], chapter: 3, seek: null };
  } else if (s.quest.stage === "none") {
    s.quest.treats = [];
    s.quest.seek = null;
  }
  // a stage that belongs to another chapter would strand her: send her back to Joe
  const belongs: Record<string, number[]> = { treats: [0], trail: [0, 1], seek: [2], escort: [0, 1, 2], choose: [0, 1, 2], none: [0, 1, 2] };
  if (s.quest.stage !== "done" && !belongs[s.quest.stage]!.includes(s.quest.chapter)) {
    s.quest = { stage: "none", treats: [], chapter: s.quest.chapter, seek: null };
  }
  // chapters 1 and 2 need to know which pet is missing before they can run
  if (s.quest.chapter > 0 && s.quest.stage !== "none" && !s.quest.seek) {
    const left = (["puppy", "kitten", "bunny"] as const).filter((k) => !s.pets.some((p) => p.kind === k));
    s.quest.seek = left[0] ?? null;
    if (!s.quest.seek) s.quest = { stage: "done", treats: [], chapter: 3, seek: null };
  }
  s.version = SAVE_VERSION;
  return s;
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT, collected: [[], [], []], leaderboard: [[], [], []], layout: 0 };
    const parsed = JSON.parse(raw) as SaveData;
    return migrate(parsed);
  } catch {
    return { ...DEFAULT, collected: [[], [], []], leaderboard: [[], [], []], layout: 0 };
  }
}

export function persistSave(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
  } catch {
    /* private mode / quota */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
