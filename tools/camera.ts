/**
 * Walks Sloan through the picnic park hedge maze and reports what the camera
 * does, with the low-obstacle lift on and off.
 *
 * The route is found by flood fill over the maze cells, derived from the hedge
 * colliders themselves, so it matches what the game builds. She walks it at
 * 60Hz with the camera yaw (a) fixed at the spawn yaw, which is what happens
 * when the player never touches the right stick, and (b) following her facing.
 *
 * Reported per variant:
 *   pulledFrames   frames where the boom was shortened at all
 *   tightFrames    frames where the camera was within 2.5m of her (in her back)
 *   pullEvents     free -> pulled transitions (each one is a visible lurch)
 *   maxJump        largest desired-position change between consecutive frames
 *   maxLift        highest the camera was lifted
 *
 * Run: npx jiti tools/camera.ts
 */
import * as THREE from "three";
import { LEVELS, PICNIC_MAZE } from "../src/game/levels";
import type { AABB } from "../src/game/collision";
import { placeCamera } from "../src/game/camera";
import { collidersFor } from "../src/game/colliders";

const level = LEVELS[0]!;
const MAZE_ORIGIN = [PICNIC_MAZE.ox, PICNIC_MAZE.oz] as const;
const CELL = PICNIC_MAZE.cell;
const N = PICNIC_MAZE.n;
const HALF = (N - 1) / 2;

// the engine's own colliders
const boxes: AABB[] = collidersFor(level);

// Maze grid from the hedge colliders near the maze origin.
const blocked = new Set<string>();
for (const p of level.props) {
  if (p.kind !== "box" || p.color !== "#5aaa62") continue;
  const col = Math.round((p.pos[0] - MAZE_ORIGIN[0]) / CELL) + HALF;
  const row = Math.round((p.pos[2] - MAZE_ORIGIN[1]) / CELL) + HALF;
  if (col < 0 || col >= N || row < 0 || row >= N) continue;
  blocked.add(`${col},${row}`);
}
if (blocked.size < 30) {
  console.log(`only ${blocked.size} hedge cells found near the maze origin; is the maze still at (${MAZE_ORIGIN[0]}, ${MAZE_ORIGIN[1]})?`);
  process.exit(1);
}

const world = (col: number, row: number) => [MAZE_ORIGIN[0] + (col - HALF) * CELL, MAZE_ORIGIN[1] + (row - HALF) * CELL];
// the south opening in the ring row
const start = [HALF, N - 1];
const lemon = level.dumplings.find((d) => d.id === "lemon")!;
const goal = [
  Math.round((lemon.pos[0] - MAZE_ORIGIN[0]) / CELL) + HALF,
  Math.round((lemon.pos[2] - MAZE_ORIGIN[1]) / CELL) + HALF,
];

// BFS
const prev = new Map<string, string>();
const q: number[][] = [start];
const seen = new Set<string>([`${start[0]},${start[1]}`]);
while (q.length) {
  const [c, r] = q.shift()!;
  if (c === goal[0] && r === goal[1]) break;
  for (const [dc, dr] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nc = c + dc!;
    const nr = r + dr!;
    const k = `${nc},${nr}`;
    if (nc < 0 || nc >= N || nr < 0 || nr >= N || blocked.has(k) || seen.has(k)) continue;
    seen.add(k);
    prev.set(k, `${c},${r}`);
    q.push([nc, nr]);
  }
}
const path: number[][] = [];
let cur = `${goal[0]},${goal[1]}`;
if (!prev.has(cur)) {
  console.log("no route from S to the lemon dumpling; the maze is sealed");
  process.exit(1);
}
while (cur) {
  const [c, r] = cur.split(",").map(Number);
  path.unshift(world(c!, r!));
  cur = prev.get(cur)!;
  if (cur === `${start[0]},${start[1]}`) {
    path.unshift(world(start[0]!, start[1]!));
    break;
  }
}
console.log(`maze route: ${path.length} cells, ${blocked.size} hedge cells`);

type Stats = {
  frames: number;
  pulledFrames: number;
  tightFrames: number;
  pullEvents: number;
  maxJump: number;
  maxLift: number;
  emergencies: number;
};

function walk(liftLow: boolean, followYaw: boolean): Stats {
  const s: Stats = { frames: 0, pulledFrames: 0, tightFrames: 0, pullEvents: 0, maxJump: 0, maxLift: 0, emergencies: 0 };
  const SPEED = 4.2; // m/s, her run speed order of magnitude
  const DT = 1 / 60;
  let indoor = 0;
  let cameraYaw = level.spawnYaw;
  const desired = new THREE.Vector3();
  const last = new THREE.Vector3();
  let wasPulled = false;
  let first = true;
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, az] = path[i]!;
    const [bx, bz] = path[i + 1]!;
    const segLen = Math.hypot(bx! - ax!, bz! - az!);
    const yaw = Math.atan2(bx! - ax!, bz! - az!);
    if (followYaw) cameraYaw = yaw;
    const steps = Math.ceil(segLen / (SPEED * DT));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const cap = { x: ax! + (bx! - ax!) * t, y: 0, z: az! + (bz! - az!) * t };
      const r = placeCamera({ boxes, cap, cameraYaw, indoor, title: false, snap: first, dt: DT, liftLow }, desired);
      indoor = r.indoor;
      s.frames++;
      const pulled = r.keep < 0.999;
      if (pulled) s.pulledFrames++;
      if (pulled && !wasPulled) s.pullEvents++;
      wasPulled = pulled;
      const d = Math.hypot(desired.x - cap.x, desired.z - cap.z);
      if (d < 2.5) s.tightFrames++;
      if (r.emergency) s.emergencies++;
      s.maxLift = Math.max(s.maxLift, r.lift);
      if (!first) s.maxJump = Math.max(s.maxJump, desired.distanceTo(last));
      last.copy(desired);
      first = false;
    }
  }
  return s;
}

const rows: string[] = [];
for (const followYaw of [false, true]) {
  for (const liftLow of [false, true]) {
    const s = walk(liftLow, followYaw);
    const pct = (n: number) => `${((100 * n) / s.frames).toFixed(0)}%`;
    rows.push(
      `${followYaw ? "camera follows " : "camera fixed   "} lift ${liftLow ? "on " : "off"}  ` +
        `pulled ${pct(s.pulledFrames).padStart(4)}  tight ${pct(s.tightFrames).padStart(4)}  ` +
        `events ${String(s.pullEvents).padStart(3)}  maxJump ${s.maxJump.toFixed(2)}m  ` +
        `maxLift ${s.maxLift.toFixed(2)}m  emergencies ${s.emergencies}`,
    );
  }
}
console.log(rows.join("\n"));
