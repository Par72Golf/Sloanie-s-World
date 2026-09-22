import { useHome } from "./home-store";
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
import { ACCESSORIES, NOTHING_WORN, accessory, allAccessories, type AccessoryId, type Slot, type Worn } from "./accessories";
import type { BoothGame } from "./carnival";
import type { PetKindId, PetSave, QuestSave, QuestStage } from "./types";
import type { HelpId } from "./help-cards";
import type { ChannelId } from "./music";

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
    /** a game at his truck: tickets to win, nothing to lose */
    friendly?: boolean;
  } | null;
  /** she is at Emmett's truck while he is home */
  emmettTalkNear: boolean;
  setEmmettTalkNear: (v: boolean) => void;
  /**
   * Emmett's monster truck gauntlet in Sugar Rush: how many of his five
   * challenges she has won, and whether the truck is hers. Saved, because
   * five challenges is more than one sitting for a seven-year-old.
   */
  truckWins: number;
  truckOwned: boolean;
  winTruckStage: () => void;
  /** live while she is running one of his courses, for the clock on the HUD */
  truckRace: { name: string; gate: number; gates: number; time: number; target: number; started: number } | null;
  setTruckRace: (v: GameStore["truckRace"]) => void;
  /** she is driving his monster truck */
  driving: boolean;
  setDriving: (v: boolean) => void;
  /** she is standing at the parked truck, so Collect would get her in */
  truckNear: boolean;
  setTruckNear: (v: boolean) => void;
  /**
   * Sugar Rush's chocolate factory. While it is stopped the river runs
   * vanilla, which is the thing you can see from anywhere in the park;
   * starting it floods the whole river brown. Saved, because a park that
   * forgets she fixed it would be a park that broke itself overnight.
   */
  factoryFixed: boolean;
  fixFactory: () => void;
  /** the three things the candy princess's factory is missing, as she finds them */
  candyParts: string[];
  findCandyPart: (id: string) => void;
  /** she is standing close enough to the candy princess to talk to her */
  princessNear: boolean;
  setPrincessNear: (v: boolean) => void;
  /** the princess's creatures she has got out of trouble, and the ones living in her house */
  candyCreatures: string[];
  creaturesHome: string[];
  freeCreature: (id: string) => void;
  setCreatureHome: (id: string, home: boolean) => void;
  /** she is standing next to a creature she could pick up */
  creatureNear: boolean;
  setCreatureNear: (v: boolean) => void;
  /** she is at the basket by her door: "in" sends them to live there, "out" calls them back */
  basketNear: "in" | "out" | null;
  setBasketNear: (v: "in" | "out" | null) => void;
  boostLeft: number;
  emmettNotice: string | null;
  /** Name card shown while a freshly caught dumpling floats above her head. */
  celebrate: { name: string; color: string; accent: string } | null;
  /** Dumplings that ran off or were stolen, so a reload keeps them where they went. */
  movedSpots: Record<string, [number, number, number]>;
  setMovedSpot: (id: string, pos: [number, number, number]) => void;
  /** A run resumed from a save still shows its clock, but does not go on the board. */
  runValid: boolean;
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
  /** Mini golf: the tee she is on, whether she is putting, the finished card, and her best round. */
  golfNear: number | null;
  setGolfNear: (v: number | null) => void;
  golfPlaying: boolean;
  setGolfPlaying: (v: boolean) => void;
  golfCard: GolfCard | null;
  setGolfCard: (c: GolfCard | null) => void;
  golfBest: number | null;
  setGolfBest: (total: number) => void;
  /** Lawn bowls: the mat she is on, whether she is bowling, the finished card, and her best game. */
  bowlsNear: number | null;
  setBowlsNear: (v: number | null) => void;
  bowlsPlaying: boolean;
  setBowlsPlaying: (v: boolean) => void;
  bowlsCard: BowlsCard | null;
  setBowlsCard: (c: BowlsCard | null) => void;
  bowlsBest: number | null;
  setBowlsBest: (score: number) => void;
  /** Floor is Lava: seconds so far on the course (whole seconds only), and her best crossing. */
  lavaTime: number | null;
  setLavaTime: (v: number | null) => void;
  lavaBest: number | null;
  setLavaBest: (seconds: number) => void;
  /** Carnival tickets (saved). spendTickets returns false if she can't afford it. */
  tickets: number;
  addTickets: (n: number) => void;
  spendTickets: (n: number) => boolean;
  /** Buy a prize booth item with tickets: it goes on like a prize. */
  buyItem: (id: AccessoryId, price: number) => boolean;
  /** Sticker book and stickers (saved). Stickers need the book. */
  stickerBook: boolean;
  /** Sugar Rush's own book: a different park, a different hunt, its own book */
  candyStickerBook: boolean;
  stickers: string[];
  findStickerBook: () => void;
  findCandyStickerBook: () => void;
  findSticker: (id: string, name: string) => void;
  /** Journal tab: dumplings, stickers, or the backpack's contents. */
  journalTab: "dumplings" | "stickers" | "bag";
  setJournalTab: (t: "dumplings" | "stickers" | "bag") => void;
  /** Farmer Joe's three rescues and the pets she has adopted (saved). */
  quest: QuestSave;
  setQuestStage: (stage: QuestStage) => void;
  /** Start this chapter's hunt, naming the pet it is about. */
  startChapter: (seek: PetKindId, stage: QuestStage) => void;
  collectTreat: (index: number) => void;
  /** Every pet she has adopted, in the order she chose them. */
  pets: PetSave[];
  /** The first one, so the house and the journal keep reading one pet. */
  pet: PetSave | null;
  adoptPet: (pet: PetSave) => void;
  /** Quest panel open (talking to the farmer, picking who to look for, or choosing a pet). Freezes her like a booth. */
  questPanel: "farmer" | "pick" | "choose" | null;
  setQuestPanel: (v: "farmer" | "pick" | "choose" | null) => void;
  /** Standing where Collect would talk to the farmer or help the lost pets. */
  questNear: "farmer" | "pets" | null;
  setQuestNear: (v: "farmer" | "pets" | null) => void;
  /** Camera view; the runtime reads it every frame. */
  view: "third" | "first";
  toggleView: () => void;
  setView: (v: "third" | "first") => void;
  /** Instruction card on screen, and the ones already shown (saved). */
  helpCard: HelpId | null;
  seenHelp: string[];
  /** Show a card the first time (or again with force, from the pause menu). */
  showHelp: (id: HelpId, force?: boolean) => void;
  closeHelpCard: () => void;
  /** iPod channel playing (not saved: music starts off each visit). */
  channel: ChannelId | null;
  setChannelPlaying: (c: ChannelId | null) => void;
  /** The HUD's music button asks the runtime for the next channel. */
  musicGen: number;
  requestNextChannel: () => void;
  /** Bumped on each channel change so the HUD can flash "Now playing". */
  channelGen: number;
  /** Read-aloud voice name ("" = best installed); saved. */
  voice: string;
  setVoice: (name: string) => void;
  /** Read messages and panels aloud; saved. */
  readAloud: boolean;
  toggleReadAloud: () => void;
  /** Frame-rate readout on the HUD; saved. */
  showFps: boolean;
  toggleFps: () => void;
  /** Render quality (runtime.ts applyGraphics); saved. */
  graphics: "sharp" | "smooth";
  toggleGraphics: () => void;
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
  /** Close the finished-park screen and stay in the park: the run is over, the side quests are not. */
  keepExploring: () => void;
  nextLevel: () => void;
  replayLevel: () => void;
  toTitle: () => void;
  /** Wipe all progress. Best times are kept unless asked; settings always are. */
  resetAll: (opts?: { bestTimes?: boolean }) => void;
  /**
   * Free-fly camera: a building tool, not part of the game. It unhooks the
   * camera from her so a park under construction can be looked at from above.
   */
  fly: boolean;
  setFly: (v: boolean) => void;
  /** Vertical nudge from the touch buttons while flying: -1, 0 or 1. */
  flyLift: number;
  setFlyLift: (v: number) => void;
  flySpeed: number;
  setFlySpeed: (v: number) => void;
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
  openRps: (friendly?: boolean) => void;
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

/** The round she just finished, shown on the scorecard panel. */
export type GolfCard = {
  /** the hole she teed off on (0-based): a round can start at any tee */
  from: number;
  /** strokes, in the order she played them */
  scores: number[];
  total: number;
  par: number;
  tickets: number;
  /** her best before this round, if she had one */
  best: number | null;
  isBest: boolean;
  /** all five holes from the first tee: only those count for a best round */
  full: boolean;
  line: string;
};

/** The lawn bowls game she just finished, shown on the scorecard panel. */
export type BowlsCard = {
  /** pins knocked down in each turn, in order */
  turns: number[];
  score: number;
  max: number;
  tickets: number;
  /** her best before this game, if she had one */
  best: number | null;
  isBest: boolean;
  perfect: boolean;
  line: string;
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
    movedSpots: s.movedSpots,
    foundAccessories: s.foundAccessories,
    worn: s.worn,
    view: s.view,
    showFps: s.showFps,
    graphics: s.graphics,
    tickets: s.tickets,
    golfBest: s.golfBest,
    bowlsBest: s.bowlsBest,
    lavaBest: s.lavaBest,
    stickerBook: s.stickerBook,
    candyStickerBook: s.candyStickerBook,
    truckWins: s.truckWins,
    truckOwned: s.truckOwned,
    factoryFixed: s.factoryFixed,
    candyParts: s.candyParts,
    candyCreatures: s.candyCreatures,
    creaturesHome: s.creaturesHome,
    stickers: s.stickers,
    quest: s.quest,
    pets: s.pets,
    pet: s.pet,
    readAloud: s.readAloud,
    seenHelp: s.seenHelp,
    voice: s.voice,
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
    const def = allAccessories().find((a) => a.id === id);
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
  movedSpots: saved.movedSpots ?? {},
  setMovedSpot: (id, pos) => {
    set({ movedSpots: { ...get().movedSpots, [id]: pos } });
    persistSlice(get());
  },
  runValid: true,
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
  golfNear: null,
  setGolfNear: (golfNear) => {
    if (get().golfNear !== golfNear) set({ golfNear });
  },
  golfPlaying: false,
  setGolfPlaying: (golfPlaying) => set({ golfPlaying, golfNear: null }),
  golfCard: null,
  setGolfCard: (golfCard) => set({ golfCard }),
  golfBest: saved.golfBest,
  setGolfBest: (total) => {
    set({ golfBest: total });
    persistSlice(get());
  },
  bowlsNear: null,
  setBowlsNear: (bowlsNear) => {
    if (get().bowlsNear !== bowlsNear) set({ bowlsNear });
  },
  bowlsPlaying: false,
  setBowlsPlaying: (bowlsPlaying) => set({ bowlsPlaying, bowlsNear: null }),
  bowlsCard: null,
  setBowlsCard: (bowlsCard) => set({ bowlsCard }),
  bowlsBest: saved.bowlsBest,
  setBowlsBest: (score) => {
    set({ bowlsBest: score });
    persistSlice(get());
  },
  lavaTime: null,
  setLavaTime: (lavaTime) => {
    if (get().lavaTime !== lavaTime) set({ lavaTime });
  },
  lavaBest: saved.lavaBest,
  setLavaBest: (seconds) => {
    set({ lavaBest: seconds });
    persistSlice(get());
  },
  tickets: saved.tickets,
  addTickets: (n) => {
    if (n <= 0) return;
    set({ tickets: get().tickets + n });
    persistSlice(get());
  },
  spendTickets: (n) => {
    if (get().tickets < n) return false;
    set({ tickets: get().tickets - n });
    persistSlice(get());
    return true;
  },
  buyItem: (id, price) => {
    const st = get();
    if (st.foundAccessories.includes(id) || st.tickets < price) return false;
    const def = accessory(id);
    set({
      tickets: st.tickets - price,
      foundAccessories: [...st.foundAccessories, id],
      worn: { ...st.worn, [def.slot]: id },
      wornGen: st.wornGen + 1,
      emmettNotice: `You bought the ${def.name.toLowerCase()}! It's on.`,
    });
    persistSlice(get());
    return true;
  },
  stickerBook: saved.stickerBook,
  candyStickerBook: saved.candyStickerBook ?? false,
  stickers: saved.stickers,
  findStickerBook: () => {
    if (get().stickerBook) return;
    set({ stickerBook: true, emmettNotice: "You found a sticker book! Now you can collect stickers." });
    persistSlice(get());
    get().showHelp("stickers");
  },
  findCandyStickerBook: () => {
    if (get().candyStickerBook) return;
    set({ candyStickerBook: true, emmettNotice: "You found a candy sticker book! Now you can collect candy stickers." });
    persistSlice(get());
    get().showHelp("stickers");
  },
  findSticker: (id, name) => {
    const st = get();
    // either park's book will keep a sticker: the hunt that offered it has
    // already checked she has the right one
    if ((!st.stickerBook && !st.candyStickerBook) || st.stickers.includes(id)) return;
    const stickers = [...st.stickers, id];
    set({ stickers, emmettNotice: `${name} sticker! That's ${stickers.length} in your book.` });
    persistSlice(get());
  },
  journalTab: "dumplings",
  setJournalTab: (journalTab) => set({ journalTab }),
  quest: saved.quest,
  setQuestStage: (stage) => {
    set({ quest: { ...get().quest, stage } });
    persistSlice(get());
  },
  startChapter: (seek, stage) => {
    set({ quest: { ...get().quest, stage, seek, treats: [] } });
    persistSlice(get());
  },
  collectTreat: (index) => {
    const q = get().quest;
    if (q.treats.includes(index)) return;
    set({ quest: { ...q, treats: [...q.treats, index] } });
    persistSlice(get());
  },
  questPanel: null,
  setQuestPanel: (questPanel) => set({ questPanel, questNear: null }),
  questNear: null,
  setQuestNear: (questNear) => {
    if (get().questNear !== questNear) set({ questNear });
  },
  pets: saved.pets,
  pet: saved.pet,
  adoptPet: (pet) => {
    const had = get().pets;
    const pets = had.some((p) => p.kind === pet.kind) ? had : [...had, pet];
    // each rescue ends with a pet; after the third there is nothing left to ask
    const chapter = Math.min(3, pets.length);
    set({
      pets,
      pet: pets[0] ?? null,
      quest: { stage: chapter >= 3 ? "done" : "none", treats: [], chapter, seek: null },
    });
    persistSlice(get());
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
  helpCard: null,
  seenHelp: saved.seenHelp,
  showHelp: (id, force = false) => {
    const st = get();
    if (!force && st.seenHelp.includes(id)) return;
    set({ helpCard: id, seenHelp: st.seenHelp.includes(id) ? st.seenHelp : [...st.seenHelp, id] });
    persistSlice(get());
  },
  closeHelpCard: () => set({ helpCard: null }),
  channel: null,
  channelGen: 0,
  setChannelPlaying: (channel) => set({ channel, channelGen: get().channelGen + 1 }),
  musicGen: 0,
  requestNextChannel: () => set({ musicGen: get().musicGen + 1 }),
  voice: saved.voice,
  setVoice: (voice) => {
    set({ voice });
    persistSlice(get());
  },
  readAloud: saved.readAloud,
  toggleReadAloud: () => {
    set({ readAloud: !get().readAloud });
    persistSlice(get());
  },
  showFps: saved.showFps,
  toggleFps: () => {
    set({ showFps: !get().showFps });
    persistSlice(get());
  },
  graphics: saved.graphics,
  toggleGraphics: () => {
    set({ graphics: get().graphics === "smooth" ? "sharp" : "smooth" });
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
      ...(fresh ? { layout: rollLayout(get().layout), movedSpots: {} } : {}),
      runSeconds: 0,
      // the clock shows for a resumed run too; only a clean run goes on the board
      runActive: true,
      runValid: fresh,
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
      golfCard: null,
      golfPlaying: false,
      golfNear: null,
      bowlsCard: null,
      bowlsPlaying: false,
      bowlsNear: null,
      questPanel: null,
      boostLeft: 0,
      emmettNotice: null,
      celebrate: null,
    });
  },
  // close the pause menu's sub-panels too, or they reappear on the next pause
  resumePlay: () => set({ phase: "playing", wardrobeOpen: false, controlsOpen: false }),
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
  openRps: (friendly = false) =>
    set({ rps: { playerPick: null, emmettPick: null, result: null, round: 1, friendly } }),
  emmettTalkNear: false,
  setEmmettTalkNear: (emmettTalkNear) => {
    if (get().emmettTalkNear !== emmettTalkNear) set({ emmettTalkNear });
  },
  truckWins: saved.truckWins,
  truckOwned: saved.truckOwned,
  winTruckStage: () => {
    const truckWins = Math.min(5, get().truckWins + 1);
    set({ truckWins, truckOwned: truckWins >= 5 });
    persistSlice(get());
  },
  truckRace: null,
  setTruckRace: (truckRace) => set({ truckRace }),
  driving: false,
  setDriving: (driving) => set({ driving }),
  truckNear: false,
  setTruckNear: (truckNear) => {
    if (get().truckNear !== truckNear) set({ truckNear });
  },
  candyCreatures: saved.candyCreatures,
  creaturesHome: saved.creaturesHome,
  freeCreature: (id) => {
    if (get().candyCreatures.includes(id)) return;
    set({ candyCreatures: [...get().candyCreatures, id] });
    persistSlice(get());
  },
  setCreatureHome: (id, home) => {
    const at = get().creaturesHome.filter((c) => c !== id);
    set({ creaturesHome: home ? [...at, id] : at });
    persistSlice(get());
  },
  creatureNear: false,
  setCreatureNear: (creatureNear) => {
    if (get().creatureNear !== creatureNear) set({ creatureNear });
  },
  basketNear: null,
  setBasketNear: (basketNear) => {
    if (get().basketNear !== basketNear) set({ basketNear });
  },
  princessNear: false,
  setPrincessNear: (princessNear) => {
    if (get().princessNear !== princessNear) set({ princessNear });
  },
  candyParts: saved.candyParts,
  findCandyPart: (id) => {
    if (get().candyParts.includes(id)) return;
    set({ candyParts: [...get().candyParts, id] });
    persistSlice(get());
  },
  factoryFixed: saved.factoryFixed,
  fixFactory: () => {
    if (get().factoryFixed) return;
    set({ factoryFixed: true });
    persistSlice(get());
  },

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
        friendly: s.rps?.friendly,
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
        friendly: s.rps?.friendly,
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
    const { levelIndex, unlocked, runActive, runValid, runSeconds, hintsUsedThisRun, playerName } = st;
    const nextUnlock = Math.max(unlocked, levelIndex + 1);
    const last = levelIndex >= 2;

    let board = st.leaderboard.map((row) => row.slice());
    let lastRun: GameStore["lastRun"] = null;

    // Only a clean run from an empty park goes on the board, otherwise loading
    // a nearly finished save would post an unbeatable time.
    if (runActive && runValid && runSeconds > 0) {
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
  keepExploring: () =>
    set({
      phase: "playing",
      // the time is already on the board; the clock stays stopped
      runActive: false,
      quiz: null,
      rps: null,
      carnival: null,
      golfCard: null,
      golfPlaying: false,
      golfNear: null,
      bowlsCard: null,
      bowlsPlaying: false,
      bowlsNear: null,
      questPanel: null,
      journalOpen: false,
      mapOpen: false,
      celebrate: null,
      emmettNotice: "The park is all yours! Carnival, pets, stickers and your house are waiting.",
    }),
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
      golfCard: null,
      golfPlaying: false,
      golfNear: null,
      bowlsCard: null,
      bowlsPlaying: false,
      bowlsNear: null,
      questPanel: null,
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
      golfCard: null,
      golfPlaying: false,
      golfNear: null,
      bowlsCard: null,
      bowlsPlaying: false,
      bowlsNear: null,
      questPanel: null,
      boostLeft: 0,
      emmettNotice: null,
      celebrate: null,
    });
    persistSlice(get());
  },
  resetAll: (opts) => {
    const keptBoard = opts?.bestTimes ? get().leaderboard.map(() => []) : get().leaderboard.map((r) => r.slice());
    clearSave();
    useHome.getState().reset();
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
      golfCard: null,
      golfPlaying: false,
      golfNear: null,
      bowlsCard: null,
      bowlsPlaying: false,
      bowlsNear: null,
      questPanel: null,
      boostLeft: 0,
      emmettNotice: null,
      celebrate: null,
      foundAccessories: [],
      worn: { ...NOTHING_WORN },
      wornGen: get().wornGen + 1,
      tickets: 0,
      golfBest: null,
      bowlsBest: null,
      lavaBest: null,
      lavaTime: null,
      stickerBook: false,
      candyStickerBook: false,
      truckWins: 0,
      truckOwned: false,
      factoryFixed: false,
      candyParts: [],
      candyCreatures: [],
      creaturesHome: [],
      truckRace: null,
      driving: false,
      stickers: [],
      quest: { stage: "none", treats: [], chapter: 0, seek: null },
      pets: [],
      pet: null,
      movedSpots: {},
      // instruction cards pop up again for a new explorer
      seenHelp: [],
      helpCard: null,
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
      golfCard: null,
      golfPlaying: false,
      golfNear: null,
      bowlsCard: null,
      bowlsPlaying: false,
      bowlsNear: null,
      questPanel: null,
      boostLeft: 0,
      emmettNotice: null,
      celebrate: null,
    }),
  fly: false,
  setFly: (fly) => set({ fly, flyLift: 0 }),
  flyLift: 0,
  setFlyLift: (flyLift) => set({ flyLift }),
  flySpeed: 26,
  setFlySpeed: (flySpeed) => set({ flySpeed: Math.max(4, Math.min(120, flySpeed)) }),
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
