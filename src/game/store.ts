import { create } from "zustand";
import {
  DRESS,
  HAIR,
  type DressId,
  type HairId,
  type Phase,
  type QuizQ,
  type TempBand,
} from "./types";
import { clearSave, loadSave, persistSave, type RunRecord } from "./save";
import { ACCESSORIES, NOTHING_WORN, accessory, type AccessoryId, type Slot, type Worn } from "./accessories";
import type { BoothGame } from "./carnival";

/** Never hand out the same layout twice in a row. */
const LAYOUT_COUNT = 3;
function rollLayout(previous: number) {
  if (LAYOUT_COUNT < 2) return 0;
  let next = Math.floor(Math.random() * (LAYOUT_COUNT - 1));
  if (next >= previous) next += 1;
  return next;
}

export type Hand = "rock" | "paper" | "scissors";
const HANDS: Hand[] = ["rock", "paper", "scissors"];
const BEATS: Record<Hand, Hand> = { rock: "scissors", paper: "rock", scissors: "paper" };

const saved = loadSave();

export type GameStore = {
  phase: Phase;
  playerName: string;
  dress: DressId;
  hair: HairId;
  levelIndex: number;
  unlocked: number;
  collected: string[][];
  quiz: { dumplingId: string; q: QuizQ; attempts: number } | null;
  temp: TempBand;
  nearestName: string | null;
  nearestDist: number;
  nearCollect: boolean;
  hintText: string | null;
  hintsLeft: number;
  highlightedId: string | null;
  muted: boolean;
  journalOpen: boolean;
  /** Big map overlay. Held here, not in the component, so the pad and M key can toggle it. */
  mapOpen: boolean;
  interactGen: number;
  hintGen: number;
  fleeGen: number;
  fleeId: string | null;
  fleeNotice: string | null;
  /** Rock paper scissors encounter with Emmett. */
  rps: {
    playerPick: Hand | null;
    emmettPick: Hand | null;
    result: "win" | "lose" | "tie" | null;
    round: number;
  } | null;
  boostLeft: number;
  emmettNotice: string | null;
  /** Name card shown while a freshly caught dumpling floats above her head. */
  celebrate: { name: string; color: string; accent: string } | null;
  /** Elapsed seconds in the current run, paused during panels. */
  /** Which set of hiding spots this run uses. */
  layout: number;
  runSeconds: number;
  runActive: boolean;
  hintsUsedThisRun: number;
  leaderboard: RunRecord[][];
  /** Where the run that just finished landed, for the results screen. */
  lastRun: { seconds: number; rank: number; best: boolean } | null;
  /** Accessories found, across all parks. */
  foundAccessories: AccessoryId[];
  /** What she is wearing. */
  worn: Worn;
  /** Bumped on every change to worn, so the runtime re-dresses her once. */
  wornGen: number;
  wardrobeOpen: boolean;
  /** On the ferris wheel: input, Emmett and the run clock all pause. */
  riding: boolean;
  setRiding: (v: boolean) => void;
  /** Standing near the wheel's platform: the HUD explains how to ride. */
  rideNear: boolean;
  setRideNear: (v: boolean) => void;
  /** On the boarding spot, so Collect would start a ride: the HUD shows a big Ride button. */
  boardReady: boolean;
  setBoardReady: (v: boolean) => void;
  /** The carnival game panel she is playing, if any. Input and Emmett pause. */
  carnival: BoothGame | null;
  openCarnival: (game: BoothGame) => void;
  closeCarnival: () => void;
  /** Standing where Collect would open a carnival game or board the carousel. */
  carnivalNear: BoothGame | "carousel" | null;
  setCarnivalNear: (v: BoothGame | "carousel" | null) => void;
  /** On the carousel, with the brass-ring arm in reach: which ring it holds. */
  carouselRing: "gold" | "silver" | null;
  setCarouselRing: (v: "gold" | "silver" | null) => void;
  /** A carnival prize: it goes on straight away and the HUD says so. */
  winPrize: (id: AccessoryId) => void;
  /** Camera view; the runtime reads it every frame. */
  view: "third" | "first";
  toggleView: () => void;
  setView: (v: "third" | "first") => void;
  /** Frame-rate readout on the HUD; saved. */
  showFps: boolean;
  toggleFps: () => void;
  controlsOpen: boolean;
  setControls: (v: boolean) => void;
  findAccessory: (id: AccessoryId) => void;
  setWorn: (slot: Slot, id: AccessoryId | null) => void;
  toggleWardrobe: () => void;
  setWardrobe: (v: boolean) => void;
  setName: (v: string) => void;
  setDress: (v: DressId) => void;
  setHair: (v: HairId) => void;
  startLevel: (index?: number) => void;
  resumePlay: () => void;
  pause: () => void;
  openQuiz: (dumplingId: string, q: QuizQ) => void;
  bumpAttempt: () => void;
  closeQuiz: () => void;
  markCollected: (dumplingId: string) => void;
  uncollectDumpling: (dumplingId: string) => void;
  completeLevel: () => void;
  nextLevel: () => void;
  replayLevel: () => void;
  toTitle: () => void;
  resetAll: () => void;
  setHud: (p: {
    temp: TempBand;
    nearestName: string | null;
    nearestDist: number;
    nearCollect: boolean;
  }) => void;
  setHint: (text: string | null, dumplingId: string | null) => void;
  useHint: () => void;
  requestInteract: () => void;
  fleeDumpling: (id: string) => void;
  clearFleeNotice: () => void;
  openRps: () => void;
  playRps: (pick: Hand) => "win" | "lose" | "tie";
  nextRpsRound: () => void;
  closeRps: () => void;
  setBoost: (seconds: number) => void;
  setEmmettNotice: (text: string | null) => void;
  setCelebrate: (c: { name: string; color: string; accent: string } | null) => void;
  addRunTime: (seconds: number) => void;
  clearBoard: (levelIndex: number) => void;
  clearHint: () => void;
  toggleMute: () => void;
  toggleJournal: () => void;
  setJournal: (v: boolean) => void;
  toggleMap: () => void;
  setMap: (v: boolean) => void;
};

function persistSlice(s: GameStore) {
  persistSave({
    version: 1,
    playerName: s.playerName,
    dress: s.dress,
    hair: s.hair,
    unlocked: s.unlocked,
    collected: s.collected,
    muted: s.muted,
    levelIndex: s.levelIndex,
    leaderboard: s.leaderboard,
    layout: s.layout,
    foundAccessories: s.foundAccessories,
    worn: s.worn,
    view: s.view,
    showFps: s.showFps,
  });
}

/**
 * Worn items from a save, keeping only known items in the slot they belong to
 * now. An item can change slot between versions (the unicorn headband moved
 * from hair to head), and an unknown id would otherwise crash the dresser.
 */
function wornFromSave(raw: Record<string, string | null>): Worn {
  const worn: Worn = { ...NOTHING_WORN };
  for (const id of Object.values(raw ?? {})) {
    if (!id) continue;
    const def = ACCESSORIES.find((a) => a.id === id);
    if (def) worn[def.slot] = def.id;
  }
  return worn;
}

export const useGame = create<GameStore>((set, get) => ({
  phase: "title",
  playerName: saved.playerName,
  dress: saved.dress,
  hair: saved.hair,
  levelIndex: 0,
  unlocked: saved.unlocked,
  collected: saved.collected,
  quiz: null,
  temp: "cold",
  nearestName: null,
  nearestDist: 99,
  nearCollect: false,
  hintText: null,
  hintsLeft: 4,
  highlightedId: null,
  muted: saved.muted,
  journalOpen: false, mapOpen: false,
  interactGen: 0,
  hintGen: 0,
  fleeGen: 0,
  fleeId: null,
  fleeNotice: null,
  rps: null,
  boostLeft: 0,
  emmettNotice: null,
  celebrate: null,
  layout: saved.layout ?? 0,
  runSeconds: 0,
  runActive: false,
  hintsUsedThisRun: 0,
  leaderboard: saved.leaderboard ?? [[], [], []],
  lastRun: null,
  foundAccessories: saved.foundAccessories as AccessoryId[],
  worn: wornFromSave(saved.worn),
  wornGen: 0,
  wardrobeOpen: false,
  riding: false,
  setRiding: (riding) => set({ riding }),
  rideNear: false,
  setRideNear: (rideNear) => {
    if (get().rideNear !== rideNear) set({ rideNear });
  },
  boardReady: false,
  setBoardReady: (boardReady) => {
    if (get().boardReady !== boardReady) set({ boardReady });
  },
  carnival: null,
  openCarnival: (carnival) => set({ carnival, carnivalNear: null }),
  closeCarnival: () => set({ carnival: null }),
  carnivalNear: null,
  setCarnivalNear: (carnivalNear) => {
    if (get().carnivalNear !== carnivalNear) set({ carnivalNear });
  },
  carouselRing: null,
  setCarouselRing: (carouselRing) => {
    if (get().carouselRing !== carouselRing) set({ carouselRing });
  },
  winPrize: (id) => {
    const found = get().foundAccessories;
    if (found.includes(id)) return;
    const def = accessory(id);
    set({
      foundAccessories: [...found, id],
      worn: { ...get().worn, [def.slot]: id },
      wornGen: get().wornGen + 1,
      emmettNotice: `You won the ${def.name.toLowerCase()}! It's on.`,
    });
    persistSlice(get());
  },
  view: saved.view,
  toggleView: () => {
    set({ view: get().view === "first" ? "third" : "first" });
    persistSlice(get());
  },
  setView: (view) => {
    set({ view });
    persistSlice(get());
  },
  showFps: saved.showFps,
  toggleFps: () => {
    set({ showFps: !get().showFps });
    persistSlice(get());
  },
  controlsOpen: false,
  setControls: (controlsOpen) => set({ controlsOpen }),
  findAccessory: (id) => {
    const found = get().foundAccessories;
    if (found.includes(id)) return;
    const def = accessory(id);
    // it goes straight on; anything in that slot comes off
    const worn = { ...get().worn, [def.slot]: id };
    set({
      foundAccessories: [...found, id],
      worn,
      wornGen: get().wornGen + 1,
      emmettNotice: `You found the ${def.name.toLowerCase()}! It's on.`,
    });
    persistSlice(get());
  },
  setWorn: (slot, id) => {
    if (id && !get().foundAccessories.includes(id)) return;
    set({ worn: { ...get().worn, [slot]: id }, wornGen: get().wornGen + 1 });
    persistSlice(get());
  },
  toggleWardrobe: () => set({ wardrobeOpen: !get().wardrobeOpen }),
  setWardrobe: (wardrobeOpen) => set({ wardrobeOpen }),
  setName: (playerName) => {
    set({ playerName });
    persistSlice(get());
  },
  setDress: (dress) => {
    set({ dress });
    persistSlice(get());
  },
  setHair: (hair) => {
    set({ hair });
    persistSlice(get());
  },
  startLevel: (index) => {
    const levelIndex = index ?? get().levelIndex;
    const fresh = (get().collected[levelIndex] ?? []).length === 0;
    set({
      ...(fresh ? { layout: rollLayout(get().layout) } : {}),
      runSeconds: 0,
      runActive: fresh,
      hintsUsedThisRun: 0,
      lastRun: null,
      phase: "playing",
      levelIndex,
      quiz: null,
      journalOpen: false, mapOpen: false,
      hintText: null,
      highlightedId: null,
      hintsLeft: 4,
      nearCollect: false,
      fleeNotice: null,
      fleeId: null,
      rps: null,
      carnival: null,
      boostLeft: 0,
      emmettNotice: null,
      celebrate: null,
    });
  },
  resumePlay: () => set({ phase: "playing" }),
  pause: () => {
    if (get().phase === "playing") set({ phase: "paused" });
  },
  openQuiz: (dumplingId, q) =>
    set({ phase: "quiz", quiz: { dumplingId, q, attempts: 0 } }),
  bumpAttempt: () => {
    const quiz = get().quiz;
    if (!quiz) return;
    set({ quiz: { ...quiz, attempts: quiz.attempts + 1 } });
  },
  closeQuiz: () => set({ phase: "playing", quiz: null }),
  openRps: () =>
    set({ rps: { playerPick: null, emmettPick: null, result: null, round: 1 } }),

  playRps: (pick) => {
    const emmett = HANDS[Math.floor(Math.random() * 3)]!;
    const result: "win" | "lose" | "tie" =
      pick === emmett ? "tie" : BEATS[pick] === emmett ? "win" : "lose";
    set((s) => ({
      rps: {
        playerPick: pick,
        emmettPick: emmett,
        result,
        round: s.rps?.round ?? 1,
      },
    }));
    return result;
  },

  // ties replay, so every encounter settles on a clean coin flip
  nextRpsRound: () =>
    set((s) => ({
      rps: {
        playerPick: null,
        emmettPick: null,
        result: null,
        round: (s.rps?.round ?? 1) + 1,
      },
    })),

  closeRps: () => set({ rps: null }),

  setBoost: (seconds) => set({ boostLeft: seconds }),

  setEmmettNotice: (text) => set({ emmettNotice: text }),

  setCelebrate: (c) => set({ celebrate: c }),

  // driven by the runtime, which only pushes whole seconds
  addRunTime: (seconds) => set({ runSeconds: seconds }),

  clearBoard: (levelIndex) => {
    set((s) => ({
      leaderboard: s.leaderboard.map((row, i) => (i === levelIndex ? [] : row.slice())),
    }));
    persistSlice(get());
  },

  fleeDumpling: (id) =>
    set((s) => ({
      phase: "playing",
      quiz: null,
      nearCollect: false,
      fleeId: id,
      fleeGen: s.fleeGen + 1,
      fleeNotice: "Oh no — it ran off! Hunt it down again.",
      hintText: null,
      highlightedId: null,
    })),
  clearFleeNotice: () => set({ fleeNotice: null }),
  clearHint: () => set({ hintText: null, highlightedId: null }),
  // Emmett won it, so it goes back on the board and the counter drops
  uncollectDumpling: (dumplingId) => {
    const { levelIndex, collected } = get();
    set({
      collected: collected.map((row, i) =>
        i === levelIndex ? row.filter((x) => x !== dumplingId) : row.slice(),
      ),
    });
  },

  markCollected: (dumplingId) => {
    const { levelIndex, collected } = get();
    const next = collected.map((row, i) =>
      i === levelIndex
        ? Array.from(new Set([...row, dumplingId]))
        : row.slice(),
    );
    set({ collected: next, quiz: null, phase: "playing", nearCollect: false });
    persistSlice(get());
  },
  completeLevel: () => {
    const st = get();
    const { levelIndex, unlocked, runActive, runSeconds, hintsUsedThisRun, playerName } = st;
    const nextUnlock = Math.max(unlocked, levelIndex + 1);
    const last = levelIndex >= 2;

    let board = st.leaderboard.map((row) => row.slice());
    let lastRun: GameStore["lastRun"] = null;

    // Only a clean run from an empty park goes on the board, otherwise loading
    // a nearly finished save would post an unbeatable time.
    if (runActive && runSeconds > 0) {
      const name = playerName.trim() || "Explorer";
      const rows = board[levelIndex] ?? [];
      const previousBest = rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
      const beatOwn = !previousBest || runSeconds < previousBest.seconds;
      if (beatOwn) {
        const kept = rows.filter((r) => r.name.toLowerCase() !== name.toLowerCase());
        kept.push({ name, seconds: runSeconds, hintsUsed: hintsUsedThisRun, at: Date.now() });
        kept.sort((a, b) => a.seconds - b.seconds);
        board[levelIndex] = kept.slice(0, 8);
      }
      const finalRows = board[levelIndex] ?? [];
      const rank = finalRows.findIndex(
        (r) => r.name.toLowerCase() === name.toLowerCase() && r.seconds === runSeconds,
      );
      lastRun = { seconds: runSeconds, rank: rank < 0 ? -1 : rank + 1, best: beatOwn };
    }

    // the golden crown is the reward for clearing a park
    const crowned = st.foundAccessories.includes("crown");
    const foundAccessories = crowned ? st.foundAccessories : [...st.foundAccessories, "crown" as AccessoryId];
    const worn = crowned ? st.worn : { ...st.worn, head: "crown" as AccessoryId };

    set({
      foundAccessories,
      worn,
      wornGen: st.wornGen + (crowned ? 0 : 1),
      phase: last ? "victory" : "complete",
      unlocked: nextUnlock,
      quiz: null,
      runActive: false,
      leaderboard: board,
      lastRun,
    });
    persistSlice(get());
  },
  nextLevel: () => {
    const levelIndex = Math.min(2, get().levelIndex + 1);
    set({
      runSeconds: 0,
      runActive: true,
      hintsUsedThisRun: 0,
      lastRun: null,
      phase: "playing",
      levelIndex,
      quiz: null,
      hintsLeft: 4,
      hintText: null,
      highlightedId: null,
      journalOpen: false, mapOpen: false,
      fleeNotice: null,
      fleeId: null,
      rps: null,
      carnival: null,
      boostLeft: 0,
      emmettNotice: null,
      celebrate: null,
    });
  },
  replayLevel: () => {
    const { levelIndex, collected } = get();
    const next = collected.map((row, i) => (i === levelIndex ? [] : row.slice()));
    set({
      layout: rollLayout(get().layout),
      collected: next,
      runSeconds: 0,
      runActive: true,
      hintsUsedThisRun: 0,
      lastRun: null,
      phase: "playing",
      quiz: null,
      hintsLeft: 4,
      hintText: null,
      highlightedId: null,
      journalOpen: false, mapOpen: false,
      fleeNotice: null,
      fleeId: null,
      rps: null,
      carnival: null,
      boostLeft: 0,
      emmettNotice: null,
      celebrate: null,
    });
    persistSlice(get());
  },
  resetAll: () => {
    const keptBoard = get().leaderboard.map((r) => r.slice());
    clearSave();
    set({
      leaderboard: keptBoard,
      runSeconds: 0,
      runActive: false,
      lastRun: null,
      phase: "title",
      levelIndex: 0,
      unlocked: 0,
      collected: [[], [], []],
      quiz: null,
      hintsLeft: 4,
      hintText: null,
      highlightedId: null,
      journalOpen: false, mapOpen: false,
      nearCollect: false,
      fleeNotice: null,
      fleeId: null,
      rps: null,
      carnival: null,
      boostLeft: 0,
      emmettNotice: null,
      celebrate: null,
    });
  },
  toTitle: () =>
    set({
      phase: "title",
      quiz: null,
      journalOpen: false, mapOpen: false,
      hintText: null,
      highlightedId: null,
      fleeNotice: null,
      fleeId: null,
      rps: null,
      carnival: null,
      boostLeft: 0,
      emmettNotice: null,
      celebrate: null,
    }),
  setHud: ({ temp, nearestName, nearestDist, nearCollect }) =>
    set({ temp, nearestName, nearestDist, nearCollect }),
  setHint: (hintText, highlightedId) => set({ hintText, highlightedId }),
  useHint: () => {
    if (get().hintsLeft <= 0 || get().phase !== "playing") return;
    set((s) => ({
      hintsLeft: s.hintsLeft - 1,
      hintGen: s.hintGen + 1,
      hintsUsedThisRun: s.hintsUsedThisRun + 1,
    }));
  },
  requestInteract: () => set({ interactGen: get().interactGen + 1 }),
  toggleMute: () => {
    set({ muted: !get().muted });
    persistSlice(get());
  },
  toggleJournal: () => set({ journalOpen: !get().journalOpen }),
  setJournal: (journalOpen) => set({ journalOpen }),
  toggleMap: () => set({ mapOpen: !get().mapOpen }),
  setMap: (mapOpen) => set({ mapOpen }),
}));

export function dressHex() {
  return DRESS[useGame.getState().dress];
}
export function hairHex() {
  return HAIR[useGame.getState().hair];
}
