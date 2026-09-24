/**
 * Nothing she picks up may sit inside somebody else's button.
 *
 * There is one Collect key, and runtime.tryCollect reads it in order: the
 * telescope, the fair games, the boat, the carousel, a stuck creature, the
 * shop, the princess, her truck, Emmett, the factory door, her own front door,
 * the park-1 games, the booths, the ferris wheel — and only then, last of all,
 * the sweet at her feet. So a sweet that lies inside a ride's boarding circle
 * is not a sweet she can pick up: she walks to it, presses Collect, and gets on
 * the ferris wheel instead. That is exactly what the bubblegum at the
 * fairground used to do.
 *
 * The rule: every hidden thing must be further from every button than the
 * button's own radius plus the 2.15m she can collect from, so there is no
 * standing spot where both are live at once.
 *
 * Run: npx jiti tools/buttons.ts        (exits 1 on any overlap)
 */
import { LEVELS } from "../src/game/levels";
import { applyLevelOrigins } from "../src/game/level-origins";

import { BOOTHS, boothStand } from "../src/game/carnival";
import { holeWorld } from "../src/game/minigolf";
import { GOLF } from "../src/game/park";
import { BOWLS, laneWorld } from "../src/game/bowls";
import { TOSS } from "../src/game/marshmallow-toss";

import { WHACK, START_R as WHACK_R } from "../src/game/whack-a-gummy";
import { SORTER, START_R as SORTER_R } from "../src/game/sweet-sorter";
import { CAROUSEL, NEAR_R as CAROUSEL_R } from "../src/game/carousel-ride";
import { boatBoard, NEAR_R as BOAT_R } from "../src/game/boat-ride";
import { STAND as SHOP_STAND, NEAR_R as SHOP_R } from "../src/game/candy-shop";
import { PRINCESS, TALK_R } from "../src/game/candy-quest";
import { CREATURES, FREE_R } from "../src/game/candy-creatures";
import { TRUCK_PARK } from "../src/game/truck-gauntlet";
import { CANDY_HOUSE_AT, candyHouseSpots } from "../src/game/sugar-home";
import { CANDY_HOUSE } from "../src/game/candy-house";
import { ICE_CREAM_MOUNTAIN } from "../src/game/candy-builds";
import { REACH as GLASS_R } from "../src/game/looking-glass";
import { SUGAR } from "../src/game/sugar-rush";
import { WHEEL_BOARD } from "../src/game/meshes";

/** runtime.ts: how far from a dumpling she can be and still collect it */
const COLLECT_R = 2.15;
/** runtime.ts measures from her hands, not her feet */
const HAND_Y = 0.8;

/**
 * How far across the ground she can stand from a sweet and still reach it.
 * A sweet well above her head — park 1's Sky Dumpling floats over the top of
 * the ferris wheel — cannot be collected from the ground at all, so no button
 * on the ground can steal it. Those come back as 0 and are skipped.
 */
function groundReach(y: number): number {
  const dy = Math.abs(y - HAND_Y);
  return dy >= COLLECT_R ? 0 : Math.sqrt(COLLECT_R * COLLECT_R - dy * dy);
}

type Button = { name: string; x: number; z: number; r: number };

/** The ferris wheel's boarding spot: `origin + boardLocal`, the way runtime reads it. */
function wheelButton(index: number): Button {
  const ride = LEVELS[index]!.ride!;
  return { name: "the ferris wheel", x: ride.x, z: ride.z + WHEEL_BOARD.dz, r: WHEEL_BOARD.r };
}

/** The buttons in park 1: the four booths, the golf tees, the bowls mats. */
function picnicButtons(): Button[] {
  const out: Button[] = [];
  for (const b of BOOTHS) {
    const [x, z] = boothStand(b);
    out.push({ name: b.name, x, z, r: 2.6 });
  }
  for (let i = 0; i < GOLF.holes; i++) {
    const h = holeWorld(i);
    out.push({ name: `golf tee ${i + 1}`, x: h.x, z: h.teeZ, r: 1.7 });
  }
  for (let i = 0; i < BOWLS.laneDx.length; i++) {
    const w = laneWorld(i);
    out.push({ name: `bowls mat ${i + 1}`, x: w.x, z: w.matZ, r: 2.8 });
  }
  out.push(wheelButton(0));
  return out;
}

/** The buttons in Sugar Rush. */
function sugarButtons(): Button[] {
  const boat = boatBoard();
  const spots = candyHouseSpots();
  const out: Button[] = [
    { name: "Whack-a-Gummy", x: WHACK.x, z: WHACK.z + WHACK.standD, r: WHACK_R },
    { name: "Sweet Sorter", x: SORTER.x, z: SORTER.z + SORTER.standZ, r: SORTER_R },
    { name: "the cupcake carousel", x: CAROUSEL.x, z: CAROUSEL.z + CAROUSEL.standD, r: CAROUSEL_R },
    { name: "the boat jetty", x: boat.x, z: boat.z, r: BOAT_R },
    { name: "the sweet shop", x: SHOP_STAND.x, z: SHOP_STAND.z, r: SHOP_R },
    { name: "the princess", x: PRINCESS.x, z: PRINCESS.z, r: TALK_R },
    { name: "her monster truck", x: TRUCK_PARK.x, z: TRUCK_PARK.z, r: 3.4 },
    { name: "her front door", x: spots.door[0], z: spots.door[1], r: 2.0 },
    { name: "her house sign", x: CANDY_HOUSE_AT.x - 3.4, z: CANDY_HOUSE_AT.z + CANDY_HOUSE.d / 2 + 2.4, r: 2.4 },
    {
      name: "the looking glass",
      x: SUGAR.mountain.x + ICE_CREAM_MOUNTAIN.glass.x,
      z: SUGAR.mountain.z + ICE_CREAM_MOUNTAIN.glass.z,
      r: GLASS_R,
    },
    { name: "the marshmallow toss", x: TOSS.x + TOSS.standD, z: TOSS.z, r: 3.2 },
  ];
  for (const c of CREATURES) out.push({ name: c.name, x: c.at[0], z: c.at[1], r: FREE_R });
  out.push(wheelButton(1));
  // the gumball machines' fronts (gumballs.ts), and anywhere in the build yard,
  // where Collect starts building (a circle round the square's corners)
  const level = LEVELS[1]!;
  applyLevelOrigins(level);
  for (const p of level.props) {
    if (p.kind !== "model" || p.id !== "gumball-machine") continue;
    const d = 1.1 * (p.scale ?? 1) + 0.9;
    out.push({ name: "a gumball machine", x: p.x + Math.sin(p.ry ?? 0) * d, z: p.z + Math.cos(p.ry ?? 0) * d, r: 1.5 });
  }
  out.push({ name: "the build yard", x: SUGAR.buildYard.x, z: SUGAR.buildYard.z, r: (SUGAR.buildYard.cells / 2) * Math.SQRT2 + 0.5 });
  return out;
}

type Thing = { name: string; x: number; y: number; z: number; pad?: number };

/** runtime.ts: how far off a landmark's centre a rehidden sweet can land */
const NUDGE = 3.5 / 2;

/**
 * The sweets, and only the sweets. Everything else she picks up — the stickers,
 * the accessories, the boosts, the factory parts — is taken by walking over it,
 * so a button standing on top of one costs her nothing. A sweet is the one
 * thing that needs the key.
 */
function sweetsIn(index: number): Thing[] {
  const level = LEVELS[index]!;
  applyLevelOrigins(level);
  const out: Thing[] = level.dumplings.map((d) => ({ name: d.name, x: d.pos[0], y: d.pos[1], z: d.pos[2] }));
  /*
   * And where Emmett puts one he has won. `emmettTakesOne` nudges the sweet up
   * to 1.75m off the landmark's centre so repeats are not identical, so a
   * landmark needs that much clearance on top of everything else.
   */
  for (const r of level.rehideSpots ?? []) {
    out.push({ name: `a sweet rehidden at ${r.name}`, x: r.pos[0], y: r.pos[1], z: r.pos[2], pad: NUDGE });
  }
  return out;
}

let bad = 0;
let checks = 0;
for (const [index, buttons] of [
  [0, picnicButtons()],
  [1, sugarButtons()],
] as const) {
  const name = LEVELS[index]!.name;
  for (const t of sweetsIn(index)) {
    const reach = groundReach(t.y);
    if (reach === 0) continue;
    for (const b of buttons) {
      checks++;
      const need = b.r + reach + (t.pad ?? 0);
      const d = Math.hypot(t.x - b.x, t.z - b.z);
      if (d < need) {
        bad++;
        console.log(
          `${name}: ${t.name} at (${t.x.toFixed(1)}, ${t.z.toFixed(1)}) is ${d.toFixed(2)}m from ` +
            `${b.name}'s button — needs ${need.toFixed(2)}m, or Collect presses the button instead`,
        );
      }
    }
  }
}

console.log(`${checks} button checks, ${bad} too close`);
process.exit(bad ? 1 : 0);
