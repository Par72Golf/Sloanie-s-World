/**
 * Sloan's save, from older versions of the game and in bad shape, loaded by
 * the code the game runs.
 *
 * Her real progress lives in one browser and has been carried through a lot
 * of changes: new fields, a park that went from sixteen sweets to twenty-five,
 * two more house stages, thirty more pieces of furniture, the build yard and
 * the things round her house in their own slots. A save that no longer loads
 * is the one bug that loses a child's work, so this loads every kind of save
 * she could have and checks nothing she earned is dropped and nothing the game
 * reads is missing or the wrong type.
 *
 * Run: npx jiti tools/save.ts        (exits 1 on any failure)
 */
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

let fails = 0;
let passes = 0;
const check = (ok: boolean, msg: string) => {
  if (ok) passes++;
  else fails++;
  if (!ok || process.env.VERBOSE) console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`);
};

const MAIN = "sloanies-world-v1";

async function main() {
  const save = await import("../src/game/save");
  // the key the game writes under
  const probe = { ...save.loadSave() };
  save.persistSave(probe);
  const key = [...store.keys()][0] ?? MAIN;
  store.clear();

  const load = (raw: unknown) => {
    store.clear();
    if (raw !== undefined) store.set(key, typeof raw === "string" ? raw : JSON.stringify(raw));
    return save.loadSave();
  };
  const wellFormed = (s: ReturnType<typeof save.loadSave>, label: string) => {
    const ok =
      Array.isArray(s.collected) &&
      s.collected.length === 3 &&
      s.collected.every((r) => Array.isArray(r)) &&
      typeof s.tickets === "number" &&
      Number.isFinite(s.tickets) &&
      Array.isArray(s.stickers) &&
      Array.isArray(s.candyCreatures) &&
      Array.isArray(s.creaturesHome) &&
      typeof s.gumballDay === "string" &&
      Array.isArray(s.pets) &&
      typeof s.quest === "object" &&
      Array.isArray(s.leaderboard) &&
      s.leaderboard.length === 3;
    check(ok, `${label}: loads with every field present and the right type`);
  };

  console.log("saves from before the latest changes");
  {
    // the shape her save had before the gumball machines, the creatures'
    // basket and the house stages: those fields simply are not there
    const old: Record<string, unknown> = {
      version: 2,
      playerName: "Sloan",
      unlocked: 1,
      levelIndex: 1,
      collected: [
        ["d1", "d2", "d3"],
        // all sixteen of the sweets Sugar Rush had then
        ["chocdrop", "canetwist", "sourwiggle", "gummybear", "jellybean", "lollyswirl", "marshpillow", "bubblegum", "licoricetwist", "peppermint", "toffeechew", "rockcandy", "cottonpuff", "caramelcube", "fudgeblock", "jawbreaker"],
        [],
      ],
      tickets: 212,
      foundAccessories: ["crown"],
      worn: { head: "crown" },
      stickers: ["s1", "s2"],
      stickerBook: true,
      candyStickerBook: true,
      truckWins: 3,
      factoryFixed: true,
      candyParts: ["cog"],
      candyCreatures: ["beanpuppy"],
      pet: { kind: "puppy", coat: "#fff", name: "Max" },
      leaderboard: [[{ name: "Sloan", seconds: 900, hintsUsed: 1, at: 1 }], [], []],
    };
    const s = load(old);
    wellFormed(s, "a version 2 save");
    check(s.tickets === 212, `her tickets are kept (${s.tickets})`);
    check(s.collected[1]!.length === 16, "her sixteen Sugar Rush finds are kept, with nine new sweets now left to find");
    check(s.collected[0]!.length === 3, "her first-park finds are kept");
    check(s.truckWins === 3 && s.factoryFixed && s.candyCreatures.includes("beanpuppy"), "her truck wins, the factory and her creature are kept");
    check(s.pets.length === 1 && s.pets[0]!.name === "Max", "her one pet from the older single-pet save is carried into the list");
    check(s.gumballDay === "", "a save from before the gumball machines has today's free gumball waiting");
    check(s.leaderboard[0]!.length === 1, "her best time is kept");
  }

  console.log("\nbroken saves");
  for (const [label, raw] of [
    ["no save at all", undefined],
    ["an empty object", {}],
    ["not JSON", "{this is not json"],
    ["null", "null"],
    ["the wrong types everywhere", { collected: "x", tickets: "lots", stickers: 5, pets: {}, leaderboard: null, gumballDay: 7, candyCreatures: "a", quest: 3 }],
    ["negative and fractional tickets", { tickets: -40.5 }],
  ] as const) {
    let s: ReturnType<typeof save.loadSave> | null = null;
    try {
      s = load(raw);
    } catch (e) {
      check(false, `${label}: loading threw ${(e as Error).message}`);
      continue;
    }
    wellFormed(s, label);
    check(s.tickets >= 0 && Number.isInteger(s.tickets), `${label}: tickets are a whole number, not negative (${s.tickets})`);
  }

  console.log("\nthe house and the build yard");
  {
    const home = await import("../src/game/home-store");
    const { HOUSE_KITS } = await import("../src/game/furniture-kits");
    const kit = HOUSE_KITS.candy;
    // a candy house from before stages 4 and 5, with a piece that no longer exists
    store.set(kit.saveKey, JSON.stringify({ placed: { bed: "candy_bed_bunk", rug: "not_a_real_rug" }, owned: ["candy_bed_bunk", "gone_forever"], stage: 3 }));
    home.useHome.getState().setKit("clubhouse");
    home.useHome.getState().setKit("candy");
    const h = home.useHome.getState();
    check(h.stage === 3, `the candy house keeps its stage (${h.stage})`);
    check(!h.owned.includes("gone_forever" as never), "furniture that no longer exists is dropped, not crashed on");
    check(Object.values(h.placed).every((id) => !!kit.def(id)), "every spot has real furniture in it");
    store.set(kit.saveKey, JSON.stringify({ placed: {}, owned: [], stage: 99 }));
    home.useHome.getState().setKit("clubhouse");
    home.useHome.getState().setKit("candy");
    check(home.useHome.getState().stage === 5, `a stage past the top is brought back to the top (${home.useHome.getState().stage})`);

    const { makeBuildStore } = await import("../src/game/build-store");
    const { PIECES } = await import("../src/game/build-pieces");
    store.set("test-builds", JSON.stringify({ pieces: [{ p: "block", x: 1, z: 1, y: 0, c: 0, r: 0 }, { p: "nope", x: 1, z: 1, y: 1, c: 0, r: 0 }, { p: "block", x: 1.5, z: 1, y: 0, c: 0, r: 0 }], unlocked: ["rocket", "nope"] }));
    const b = makeBuildStore("test-builds", PIECES).getState();
    check(b.pieces.length === 1, `a build keeps its good pieces and drops unknown or broken ones (${b.pieces.length} kept)`);
    check(b.unlocked.length === 1 && b.unlocked[0] === "rocket", "and its unlocked prizes, the same");
    store.set("test-builds-bad", "{nope");
    check(makeBuildStore("test-builds-bad", PIECES).getState().pieces.length === 0, "a damaged build save starts an empty yard instead of failing");
  }

  console.log(fails ? `\n${fails} FAILED, ${passes} passed` : `\nall ${passes} save checks passed`);
  process.exit(fails ? 1 : 0);
}
void main();
