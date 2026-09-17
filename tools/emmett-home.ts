/**
 * Emmett's day from his truck: he laps at home, rides out to find her once the
 * timer runs out, catches her (she stands still at spawn here), then pedals
 * back home and starts again. Passes if he completes at least 3 round trips
 * and his model never gets a NaN transform (zero-length frames included), and
 * every encounter ends with him back at the yard.
 */
import * as THREE from "three";
import { Emmett } from "../src/game/emmett";
import { EMMETT_BASE } from "../src/game/emmett-base";
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";
const warn = console.warn; console.warn = (...a: unknown[]) => { if (typeof a[0] === "string" && a[0].includes("undefined")) return; warn(...a); };
const noop = () => {};
const ctx = new Proxy({} as Record<string, unknown>, {
  get: (target, k) => (k === "getImageData" || k === "createImageData" ? (a: number, b: number, w = a, h = b) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }) : k === "measureText" ? () => ({ width: 40 }) : k in target ? target[k as string] : noop),
  set: (target, k, v) => ((target[k as string] = v), true),
});
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
const anyNode: any = new Proxy(function () {}, { get: (_t, k) => (k === "then" ? undefined : k === Symbol.toPrimitive ? () => 0 : k === "currentTime" || k === "sampleRate" ? 1 : anyNode), apply: () => anyNode, construct: () => anyNode, set: () => true });
(globalThis as any).window = { AudioContext: anyNode, setInterval: () => 0, clearInterval: () => {} };
const lv = LEVELS[0]!;
const cols = collidersFor(lv);
const scene = new THREE.Scene();
const e = new Emmett(scene, lv.bounds, lv.emmettKeepOut ?? [], { x: EMMETT_BASE.x, z: EMMETT_BASE.z, loop: EMMETT_BASE.loop, park: EMMETT_BASE.trikePark });
// the browser can hand the first frame a zero or negative length; that once
// made his lean NaN and hid him for the rest of the game
e.update(0, 0, 0, 22, 3, 16, cols, false);
e.update(-0.004, 0, 0, 22, 3, 16, cols, false);
let nanFrames = 0;
const finite = () => {
  let ok = true;
  e.group.updateMatrixWorld(true);
  e.group.traverse((o) => { if (o.matrixWorld.elements.some((v) => !Number.isFinite(v))) ok = false; });
  return ok;
};
let last = ""; let t = 0; const dt = 1 / 30;
/*
 * Two meeting places: the spawn lawn, and the pond lawn south of the big
 * stepped berm that sits between the middle of the park and his yard. The
 * pond lawn is where a tester found him circling for good, never getting
 * home, which took his truck game with him.
 */
const SPOTS = [
  { name: "spawn lawn", x: 0, z: 22 },
  { name: "pond lawn", x: 0, z: -38 },
];
let her = SPOTS[0]!;
let caught = 0;
let homeAgain = 0;
for (let i = 0; i < 30 * 900; i++) {
  t += dt;
  // swap meeting place halfway, so both routes home are exercised
  her = SPOTS[i < 30 * 450 ? 0 : 1]!;
  const c = e.update(dt, t, her.x, her.z, 3, 16, cols, false);
  if (e.state !== last) {
    console.log(`${t.toFixed(1)}s ${last} -> ${e.state} at (${e.group.position.x.toFixed(1)}, ${e.group.position.z.toFixed(1)}) [${her.name}]`);
    if (last === "leaving" && e.state === "home") homeAgain++;
    last = e.state;
  }
  if (i % 30 === 0 && !finite()) nanFrames++;
  if (c) { caught++; console.log(`${t.toFixed(1)}s caught`); e.leave(); }
}
// every encounter must end with him back at the yard, or his truck game is gone
const ok = caught >= 3 && nanFrames === 0 && homeAgain >= caught;
console.log(
  `caught ${caught} times in 15 minutes, got home ${homeAgain} times, ${nanFrames} seconds with a NaN transform: ${ok ? "PASS" : "FAIL"}`,
);
process.exit(ok ? 0 : 1);
