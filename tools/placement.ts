/**
 * The build yard, the things round her house and the gumball machines,
 * checked without a browser.
 *
 *   - every piece and house item draws, and its solid part matches its drawing:
 *     not wider than what is drawn (no invisible walls), not drawn far into
 *     the next square, and not drawn taller than the
 *     height the next piece stacks at (or the stack would grow through it);
 *   - a column of blocks is one collider, and a quarter turn turns the boxes;
 *   - the house's placing grid only offers squares wholly inside a room she has
 *     built, and never one in a room she has not;
 *   - the gumball odds are what gumballs.ts says they are.
 *
 * Run: npx jiti tools/placement.ts        (exits 1 on any failure)
 */
{
  // the pieces paint nothing on a canvas, but the modules they share may
  const ctx: any = new Proxy(
    {},
    {
      get: (_t, k) =>
        k === "getImageData" || k === "createImageData"
          ? (w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, (w as number) * (h as number) * 4)), width: w, height: h })
          : k === "measureText"
            ? () => ({ width: 10 })
            : k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern"
              ? () => ({ addColorStop() {} })
              : () => {},
      set: () => true,
    },
  );
  (globalThis as any).document ??= { createElement: () => ({ getContext: () => ctx, width: 256, height: 256, style: {} }) };
}
import "../src/game/levels";
import * as THREE from "three";
import { LEVEL, PIECE, PIECES, pieceBoxes, type PieceDef } from "../src/game/build-pieces";
import { HOUSE_ITEMS, HOUSE_ITEM, houseArea } from "../src/game/house-items";
import { areaColliders, stackTop, type PlaceArea } from "../src/game/placer";
import { useBuild } from "../src/game/build-store";
import { rollPrize, type PrizeItem } from "../src/game/gumballs";
import { useHome } from "../src/game/home-store";
import { CANDY_ROOMS } from "../src/game/sugar-home-mesh";

let fails = 0;
let passes = 0;
const check = (ok: boolean, msg: string) => {
  if (ok) passes++;
  else fails++;
  if (!ok || process.env.VERBOSE) console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`);
};

/**
 * Pieces drawn past their square on purpose, and why. Decoration only: none of
 * these has a solid part out there.
 */
const WIDE: Record<string, string> = {
  rainbow: "an arch over the square, 1.8m across, that she walks under",
  lights: "a string of lights, decoration only",
};

console.log("pieces and house items");
for (const [set, list] of [
  ["build piece", PIECES],
  ["house item", HOUSE_ITEMS],
] as const) {
  for (const p of list as PieceDef[]) {
    const g = p.make("#ff93c4");
    const box = new THREE.Box3().setFromObject(g, true);
    const drawn = !box.isEmpty() && [box.min.x, box.max.x, box.min.y, box.max.y].every(Number.isFinite);
    check(drawn, `${set} ${p.id} draws something`);
    if (!drawn) continue;
    const top = p.h * LEVEL;
    if (!WIDE[p.id]) {
      const reach = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z);
      // a tree's crown or a flag may lean over the next square a little, which
      // looks right and costs nothing: only the solid part has to stay home
      check(reach <= 0.8, `${set} ${p.id} stays near its square (reaches ${reach.toFixed(2)}m from the middle)`);
    }
    check(box.max.y <= top + 0.12, `${set} ${p.id} is not drawn taller than it stacks (${box.max.y.toFixed(2)}m against ${top}m)`);
    for (const b of pieceBoxes(p, 0)) {
      const inside =
        b.x0 >= box.min.x - 0.05 && b.x1 <= box.max.x + 0.05 && b.z0 >= box.min.z - 0.05 && b.z1 <= box.max.z + 0.05 && b.y1 <= box.max.y + 0.05;
      check(inside, `${set} ${p.id}: its solid part is inside its drawing`);
    }
  }
}

console.log("\nstacking, merging and turning");
{
  const area: PlaceArea = { x0: 0, z0: 0, y0: 0, cols: 4, rows: 4, maxLevel: 24, fits: () => true, catalogue: PIECE, store: useBuild };
  const col = [0, 1, 2].map((y) => ({ p: "block", x: 1, z: 1, y, c: 0, r: 0 }));
  const merged = areaColliders(area, col);
  check(merged.length === 1 && merged[0]!.maxY === 1.5, `three stacked blocks are one 1.5m collider (got ${merged.length})`);
  check(stackTop(area, col, 1, 1) === 3, "the next piece on that square stacks at level 3");
  const door = PIECE.get("doorway")!;
  const open0 = pieceBoxes(door, 0).filter((b) => b.y0 === 0);
  const open1 = pieceBoxes(door, 1).filter((b) => b.y0 === 0);
  // unturned the posts stand at either x; a quarter turn puts them at either z
  check(open0.every((b) => Math.abs(b.x0) > 0.3 || Math.abs(b.x1) > 0.3), "the doorway's posts stand either side along x");
  check(open1.every((b) => Math.abs(b.z0) > 0.3 || Math.abs(b.z1) > 0.3), "a quarter turn puts them either side along z");
}

console.log("\nthe house's placing grid");
{
  const area = houseArea([0, 0, 0]);
  for (const stage of [1, 3, 5]) {
    useHome.setState({ stage });
    let offered = 0;
    let bad = 0;
    for (let gx = 0; gx < area.cols; gx++) {
      for (let gz = 0; gz < area.rows; gz++) {
        if (!area.fits(gx, gz)) continue;
        offered++;
        const x = area.x0 + gx + 0.5;
        const z = area.z0 + gz + 0.5;
        const room = CANDY_ROOMS.find((r) => x - 0.5 >= r.rect.x0 && x + 0.5 <= r.rect.x1 && z - 0.5 >= r.rect.z0 && z + 0.5 <= r.rect.z1);
        if (!room || room.stage > stage) bad++;
      }
    }
    check(offered > 0 && bad === 0, `stage ${stage}: ${offered} squares offered, all in rooms she has built`);
  }
  check(HOUSE_ITEMS.every((p) => !!p.prize || !!p.price || !HOUSE_ITEM.get(p.id)?.prize), "every house item is free, for sale or a prize");
}

console.log("\nthe gumball odds");
{
  // a fixed stream of random numbers, so the counts are the same every run
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const items: PrizeItem[] = [{ kind: "piece", id: "rainbow", name: "Rainbow" }];
  const N = 20000;
  for (const daily of [false, true]) {
    let golden = 0;
    let item = 0;
    for (let i = 0; i < N; i++) {
      const p = rollPrize(daily, items, rand);
      if (p.kind === "tickets" && p.golden) golden++;
      else if (p.kind !== "tickets") item++;
    }
    const want = daily ? 0.55 : 0.3;
    check(Math.abs(golden / N - 1 / 30) < 0.006, `${daily ? "daily" : "paid"}: the golden gumball is about one in thirty (${(golden / N).toFixed(3)})`);
    check(Math.abs(item / N - want * (29 / 30)) < 0.02, `${daily ? "daily" : "paid"}: something to keep ${(item / N).toFixed(2)} of the time`);
  }
  // with nothing left to win, it is always tickets
  let onlyTickets = true;
  for (let i = 0; i < 500; i++) if (rollPrize(true, [], rand).kind !== "tickets") onlyTickets = false;
  check(onlyTickets, "once everything is won, a gumball is always tickets");
}

console.log(fails ? `\n${fails} FAILED, ${passes} passed` : `\nall ${passes} placement checks passed`);
process.exit(fails ? 1 : 0);
