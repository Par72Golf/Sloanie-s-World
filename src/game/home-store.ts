import { create } from "zustand";
import { HOUSE_KITS, type HouseKit, type HouseKitId } from "./furniture-kits";
import { SPOTS, type FurnitureId, type SpotId } from "./furniture";

/**
 * Her house: what's placed at each decoration spot, what she owns, and the
 * house's UI state. Kept in its own small store and save slot so the house can
 * be added (or reset) without touching the main save format.
 *
 * There are two houses now — the clubhouse in park one and the gingerbread
 * house in Sugar Rush — and they are the same room with different furniture in
 * it. One store serves both: the park says which kit is in use when it loads,
 * and the store swaps catalogue and save slot together. Everything that reads
 * this store (the decorate panel, the runtime's input guards, the minimap) sees
 * one house, whichever one she is standing in.
 *
 * Starter furniture is always owned. Reward furniture is granted by the runtime
 * when its condition is met (the crown, all 30 stickers, adopting a pet). Shop
 * furniture is bought with the main store's tickets. Prize furniture (only
 * the candy house has any) is granted when a gumball machine gives it out.
 *
 * The gingerbread house also has a `stage`: she upgrades the outside with
 * tickets, cottage to candy house to candy castle, and each stage opens another
 * room inside. It is saved in that house's slot, because it is that house.
 */

type HomeSave = { placed: Partial<Record<SpotId, FurnitureId>>; owned: FurnitureId[]; stage?: number };

function starters(kit: HouseKit): Record<SpotId, FurnitureId> {
  const out = kit.starters();
  // a kit missing a starter for a spot would leave it undefined, and an
  // undefined id renders as nothing at all
  for (const s of SPOTS) out[s.id] ??= kit.catalogue.find((f) => f.spot === s.id)?.id as FurnitureId;
  return out;
}

function load(kit: HouseKit): HomeSave {
  try {
    const raw = JSON.parse(localStorage.getItem(kit.saveKey) ?? "null") as HomeSave | null;
    if (raw && typeof raw === "object") {
      const known = new Set(kit.catalogue.map((f) => f.id));
      return {
        placed: Object.fromEntries(Object.entries(raw.placed ?? {}).filter(([, id]) => known.has(id as string))),
        owned: Array.isArray(raw.owned) ? raw.owned.filter((id) => known.has(id)) : [],
        stage: typeof raw.stage === "number" ? Math.min(5, Math.max(1, Math.round(raw.stage))) : 1,
      };
    }
  } catch {
    /* private mode or bad data: start fresh */
  }
  return { placed: {}, owned: [], stage: 1 };
}

function persist(kit: HouseKit, s: HomeSave) {
  try {
    localStorage.setItem(kit.saveKey, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export type HomeNear = SpotId | "door" | "exit" | "upgrade" | null;

type HomeStore = {
  /** which house she is in: the clubhouse's furniture, or the candy house's */
  kit: HouseKit;
  setKit: (id: HouseKitId) => void;
  /** furniture at each spot (starters fill any gap) */
  placed: Record<SpotId, FurnitureId>;
  /** non-starter furniture she owns */
  owned: FurnitureId[];
  /** how far the candy house has been built up: 1 cottage, 2 house, 3 castle */
  stage: number;
  /** spend nothing here: the caller takes the tickets, this records the build */
  setStage: (stage: number) => void;
  /** she is inside the house */
  inside: boolean;
  setInside: (v: boolean) => void;
  /** what Collect would do here: a decoration spot, the front door, the way out, the builder's board */
  near: HomeNear;
  setNear: (v: HomeNear) => void;
  /** decorate panel open for a spot */
  panel: SpotId | null;
  setPanel: (v: SpotId | null) => void;
  /** the upgrade board's panel is open */
  upgrading: boolean;
  setUpgrading: (v: boolean) => void;
  owns: (id: FurnitureId) => boolean;
  place: (spot: SpotId, id: FurnitureId) => void;
  grant: (id: FurnitureId) => boolean;
  reset: () => void;
};

const firstKit = HOUSE_KITS.clubhouse;
const saved = load(firstKit);

export const useHome = create<HomeStore>((set, get) => ({
  kit: firstKit,
  setKit: (id) => {
    const kit = HOUSE_KITS[id];
    if (get().kit === kit) return;
    const next = load(kit);
    set({
      kit,
      placed: { ...starters(kit), ...next.placed } as Record<SpotId, FurnitureId>,
      owned: next.owned,
      stage: next.stage ?? 1,
      inside: false,
      near: null,
      panel: null,
      upgrading: false,
    });
  },
  placed: { ...starters(firstKit), ...saved.placed } as Record<SpotId, FurnitureId>,
  owned: saved.owned,
  stage: saved.stage ?? 1,
  setStage: (stage) => {
    set({ stage });
    persist(get().kit, { placed: get().placed, owned: get().owned, stage });
  },
  inside: false,
  setInside: (inside) => set({ inside }),
  near: null,
  setNear: (near) => {
    if (get().near !== near) set({ near });
  },
  panel: null,
  setPanel: (panel) => set({ panel }),
  upgrading: false,
  setUpgrading: (upgrading) => set({ upgrading }),
  owns: (id) => get().kit.catalogue.find((f) => f.id === id)?.source === "starter" || get().owned.includes(id),
  place: (spot, id) => {
    if (!get().owns(id)) return;
    set({ placed: { ...get().placed, [spot]: id } });
    persist(get().kit, { placed: get().placed, owned: get().owned, stage: get().stage });
  },
  /** add furniture to what she owns; true if it was new */
  grant: (id) => {
    if (get().owned.includes(id)) return false;
    set({ owned: [...get().owned, id] });
    persist(get().kit, { placed: get().placed, owned: get().owned, stage: get().stage });
    return true;
  },
  /** a new game empties both houses, not only the one she is standing in */
  reset: () => {
    const kit = get().kit;
    set({ placed: starters(kit), owned: [], stage: 1, inside: false, panel: null, near: null, upgrading: false });
    for (const k of Object.values(HOUSE_KITS)) persist(k, { placed: {}, owned: [], stage: 1 });
  },
}));
