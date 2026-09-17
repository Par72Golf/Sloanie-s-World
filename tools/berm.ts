/**
 * Berm "reset" hunter. Every stepped berm in the picnic park, through the real
 * collision code (collision.ts) and the real camera placement (camera.ts),
 * stepped the way runtime.ts steps them: a fixed 1/60 physics step, coyote
 * time, jump taps, and the camera eased once per rendered frame.
 *
 * Report 17 Sept 2026: "the green pyramid hedge by the baseball diamond like
 * resets you when you jump on the one side". tools/jump.ts only measures
 * sideways moves, and there were none. The reset was vertical: jumping up a
 * berm's long side (0.55m treads, 0.88m risers), the top of her arc can pass
 * a tier's top with her feet less than 3cm below it. The wall sweeps treat a
 * top that close as floor and let her in, and then the vertical pass saw her
 * rising inside the box and took it for a head bump: it put her head under
 * the tier's BOTTOM, 2.5m down inside the berm. The next step popped her back
 * up. One frame she vanishes into the hill and the camera lurches at her head.
 *
 * Part 1, physics: systematic hops at every face of every berm (from the
 * ground and from each tier, straight and diagonal, walk and juice speed,
 * every jump phase) plus a seeded random fuzz of diagonal runs, strafing along
 * tier edges, stopping, turning, and running off the top. Per physics step it
 * flags:
 *   sideways  moved further sideways than her speed allows
 *   backward  pushed back against the stick
 *   down      put lower than her own fall could take her
 *   up        lifted more than a step-up or a landing
 *
 * Part 2, camera: the same kinds of run at 60, 30 and 20fps (1, 2 and 3
 * physics steps per frame), yaw fixed and yaw following her. Flags a camera
 * that jumps more than 3m in one frame while she moved under 0.5m, and a
 * look-at target (her head) that jumps more than 1m in one frame, which is
 * what the player sees when she is teleported.
 *
 * Note on frame rate: physics is a fixed step, so a slow frame only changes
 * how many steps run between renders and how far the camera eases (its rate
 * is per rendered frame). It cannot change where she ends up.
 *
 * Run: npx jiti tools/berm.ts
 */
import * as THREE from "three";
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";
import { moveAndCollide, type AABB, type Capsule } from "../src/game/collision";
import { placeCamera } from "../src/game/camera";
import { GRAVITY, JUMP, PLAYER_H, PLAYER_W, WALK } from "../src/game/tuning";
import type { BoxProp } from "../src/game/types";

const level = LEVELS[0]!;
const all = collidersFor(level);
const FIXED = 1 / 60;
const BOOST = 1.6;

let seed = 17;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

/* ------------------------------------------------------------ the berms */

const SHADES = new Set(["#6fa85e", "#68a058", "#5f9852", "#58904c"]);
type Berm = { name: string; x: number; z: number; tiers: AABB[]; boxes: AABB[] };
const stacks = new Map<string, BoxProp[]>();
for (const p of level.props) {
  if (p.kind !== "box" || !SHADES.has(p.color)) continue;
  const k = `${p.pos[0].toFixed(3)},${p.pos[2].toFixed(3)}`;
  if (!stacks.has(k)) stacks.set(k, []);
  stacks.get(k)!.push(p);
}
const berms: Berm[] = [];
for (const layers of stacks.values()) {
  if (layers.length < 3) continue;
  layers.sort((a, b) => a.pos[1] - b.pos[1]);
  const [x, , z] = layers[0]!.pos;
  const tiers = layers.map((p) => all.find((b) => Math.abs((b.minX + b.maxX) / 2 - x) < 1e-6 && Math.abs((b.minZ + b.maxZ) / 2 - z) < 1e-6 && Math.abs((b.minY + b.maxY) / 2 - p.pos[1]) < 1e-6)!);
  if (tiers.some((t) => !t)) continue;
  const rotated = layers.some((p) => (p.ry ?? 0) !== 0);
  if (rotated) console.log(`berm at (${x.toFixed(1)}, ${z.toFixed(1)}) is rotated; its colliders ignore that`);
  const base = tiers[0]!;
  // only boxes she could touch from within 14m of the berm; exact, because
  // moveAndCollide only reacts to boxes she overlaps and runs stay in range
  const boxes = all.filter((b) => b.maxX > base.minX - 14 && b.minX < base.maxX + 14 && b.maxZ > base.minZ - 14 && b.minZ < base.maxZ + 14);
  berms.push({ name: `berm (${x.toFixed(0)}, ${z.toFixed(0)})`, x, z, tiers, boxes });
}
if (berms.length < 8) {
  console.log(`only ${berms.length} berms found; has berm() in park.ts changed its colours?`);
  process.exit(1);
}

/* ------------------------------------------------------------ one run */

type Event = { kind: string; mag: number; where: string };
/** on or within 1m of a berm: these fail the tool */
const events: Event[] = [];
const worst = new Map<string, Event>();
/** the same checks tripped by other structures near a berm: reported, not failed */
const elsewhere: Event[] = [];
const worstElsewhere = new Map<string, Event>();
function note(onBerm: boolean, kind: string, mag: number, where: string) {
  const e = { kind, mag, where };
  (onBerm ? events : elsewhere).push(e);
  const map = onBerm ? worst : worstElsewhere;
  const w = map.get(kind);
  if (!w || mag > w.mag) map.set(kind, e);
}
function nearBerm(berm: Berm, x: number, z: number) {
  const b = berm.tiers[0]!;
  return x > b.minX - PLAYER_W - 1 && x < b.maxX + PLAYER_W + 1 && z > b.minZ - PLAYER_W - 1 && z < b.maxZ + PLAYER_W + 1;
}
const f2 = (n: number) => n.toFixed(2);

type Plan = {
  berm: Berm;
  x: number;
  y: number;
  z: number;
  /** stick direction per physics step (world yaw of travel, radians from +x) and whether held */
  dir: (step: number) => { a: number; held: boolean; speed: number };
  /** physics steps on which jump is tapped */
  jumpAt: (step: number) => boolean;
  steps: number;
  label: string;
};

type Cam = { fps: number; follow: boolean };

/**
 * Runs a plan like runtime.ts: frames of `60/fps` physics steps, coyote time,
 * jump on a tap, and (when `cam` is given) the camera placed and eased once
 * per frame.
 */
function run(plan: Plan, cam?: Cam) {
  const { berm } = plan;
  const c: Capsule = { x: plan.x, y: plan.y, z: plan.z, hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
  let velY = 0;
  let grounded = true;
  let coyote = 0;
  for (let i = 0; i < 3; i++) {
    const r = moveAndCollide(c, 0, velY - GRAVITY * FIXED, 0, berm.boxes, FIXED, level.groundY);
    velY = r.vy;
    grounded = r.grounded;
  }

  const perFrame = cam ? Math.round(60 / cam.fps) : 1;
  let yaw = plan.dir(0).a;
  let camYaw = moveYawToCamYaw(yaw);
  const camera = new THREE.Vector3();
  const desired = new THREE.Vector3();
  let indoor = 0;
  let camReady = false;
  let prevCam = new THREE.Vector3();
  let prevLook = new THREE.Vector3();
  let prevDrawn = new THREE.Vector3();

  let step = 0;
  while (step < plan.steps) {
    for (let s = 0; s < perFrame && step < plan.steps; s++, step++) {
      const d = plan.dir(step);
      const speed = d.held ? d.speed : 0;
      const vx = Math.cos(d.a) * speed;
      const vz = Math.sin(d.a) * speed;
      if (d.held) yaw = d.a;

      if (grounded) coyote = 0.12;
      else coyote = Math.max(0, coyote - FIXED);
      if (plan.jumpAt(step) && coyote > 0) {
        velY = JUMP;
        grounded = false;
        coyote = 0;
      }
      velY -= GRAVITY * FIXED;
      const px = c.x;
      const py = c.y;
      const pz = c.z;
      const expectDy = velY * FIXED;
      const r = moveAndCollide(c, vx, velY, vz, berm.boxes, FIXED, level.groundY);
      velY = r.vy;
      grounded = r.grounded;

      const where = `${berm.name}, ${plan.label}${cam ? `, ${cam.fps}fps` : ""}, step ${step}: (${f2(px)}, ${f2(py)}, ${f2(pz)}) -> (${f2(c.x)}, ${f2(c.y)}, ${f2(c.z)})`;
      const onBerm = nearBerm(berm, px, pz) || nearBerm(berm, c.x, c.z);
      const side = Math.hypot(c.x - px, c.z - pz);
      if (side > speed * FIXED + 0.01) note(onBerm, "sideways", side, where);
      if (speed > 0) {
        const along = ((c.x - px) * vx + (c.z - pz) * vz) / speed;
        if (along < -0.02) note(onBerm, "backward", -along, where);
      }
      const dy = c.y - py;
      // a real head bump stops her rising; it never takes her lower than she was
      if (dy < Math.min(expectDy, 0) - 0.05) note(onBerm, "down", Math.min(expectDy, 0) - dy, where);
      if (dy > Math.max(expectDy, 0) + 0.7) note(onBerm, "up", dy - Math.max(expectDy, 0), where);
      if (Math.abs(c.x - berm.x) > 40 || Math.abs(c.z - berm.z) > 40) step = plan.steps;
    }

    if (!cam) continue;
    // the player steering the camera round behind her, as a kid with the right stick would
    if (cam.follow) {
      const want = moveYawToCamYaw(yaw);
      let diff = want - camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      camYaw += THREE.MathUtils.clamp(diff, -1.6 * FIXED * perFrame, 1.6 * FIXED * perFrame);
    }
    const res = placeCamera(
      { boxes: berm.boxes, cap: c, cameraYaw: camYaw, indoor, title: false, snap: !camReady, dt: FIXED },
      desired,
    );
    indoor = res.indoor;
    const look = new THREE.Vector3(c.x, c.y + THREE.MathUtils.lerp(1.25, 1.0, indoor), c.z);
    if (!camReady) camera.copy(desired);
    else {
      const closer = desired.distanceTo(camera) > 0 && desired.distanceToSquared(prevLook) < camera.distanceToSquared(prevLook);
      const k = 1 - Math.exp(-(closer ? 11 : 5.2) * FIXED);
      camera.lerp(desired, k);
    }
    const drawn = new THREE.Vector3(c.x, c.y, c.z);
    if (camReady) {
      const herMove = drawn.distanceTo(prevDrawn);
      const camMove = camera.distanceTo(prevCam);
      const where = `${berm.name}, ${plan.label}, ${cam.fps}fps${cam.follow ? " yaw following" : " yaw fixed"}, step ${step}: her (${f2(c.x)}, ${f2(c.y)}, ${f2(c.z)}) camera ${f2(camera.x)}, ${f2(camera.y)}, ${f2(camera.z)}${res.emergency ? " (on her head)" : ""}`;
      stats.camMax = Math.max(stats.camMax, camMove);
      if (res.emergency) stats.emergency++;
      stats.frames++;
      if (camMove > 3 && herMove < 0.5) note(nearBerm(berm, c.x, c.z), "camera", camMove, where);
      const lookMove = look.distanceTo(prevLook);
      const maxLegit = (WALK * BOOST + JUMP) * FIXED * perFrame + 0.62;
      if (lookMove > Math.max(1, maxLegit)) note(nearBerm(berm, c.x, c.z), "look-at", lookMove, where);
    }
    prevCam = camera.clone();
    prevLook = look;
    prevDrawn = drawn;
    camReady = true;
  }
}

/** Camera yaw that puts the camera behind her when she travels along world angle `a` (from +x). */
function moveYawToCamYaw(a: number) {
  // runtime: forward = (-sin yaw, -cos yaw); travel = (cos a, sin a)
  return Math.atan2(-Math.cos(a), -Math.sin(a));
}

const stats = { runs: 0, frames: 0, emergency: 0, camMax: 0 };

/* ------------------------------------------------------------ plans */

type Face = { nx: number; nz: number; name: string };
const FACES: Face[] = [
  { nx: 0, nz: 1, name: "south face" },
  { nx: 0, nz: -1, name: "north face" },
  { nx: 1, nz: 0, name: "east face" },
  { nx: -1, nz: 0, name: "west face" },
];

/** Hops at a face: start on the ground or on tier `from`, run at the berm, jump on step `jumpStep`. */
function hopPlans(berm: Berm, sample: (i: number) => boolean): Plan[] {
  const plans: Plan[] = [];
  let n = 0;
  for (const face of FACES) {
    for (let from = -1; from < berm.tiers.length - 1; from++) {
      const stand = from < 0 ? null : berm.tiers[from]!;
      const next = berm.tiers[from + 1]!;
      // face coordinate of the next tier's face, and lane extent along the face
      const faceCoord = face.nx > 0 ? next.maxX : face.nx < 0 ? next.minX : face.nz > 0 ? next.maxZ : next.minZ;
      const alongMin = face.nx !== 0 ? next.minZ : next.minX;
      const alongMax = face.nx !== 0 ? next.maxZ : next.maxX;
      const standOut = stand ? (face.nx > 0 ? stand.maxX : face.nx < 0 ? -stand.minX : face.nz > 0 ? stand.maxZ : -stand.minZ) - (face.nx + face.nz) * faceCoord : 6;
      const tread = Math.abs(standOut);
      for (let lane = 0; lane < 5; lane++) {
        const along = alongMin - 1 + ((alongMax - alongMin + 2) * lane) / 4;
        for (const gap of [0.37, 0.6, 1.5, 4]) {
          if (stand && gap > tread + PLAYER_W - 0.05) continue;
          for (const skew of [0, 0.6, -0.6]) {
            for (const speedMul of [1, BOOST]) {
              for (let jumpStep = 0; jumpStep < 24; jumpStep += 4) {
                if (!sample(n++)) continue;
                const out = gap + PLAYER_W;
                const x = face.nx !== 0 ? faceCoord + face.nx * out : along;
                const z = face.nx !== 0 ? along : faceCoord + face.nz * out;
                const inward = Math.atan2(-face.nz, -face.nx) + skew;
                const y = stand ? stand.maxY + 0.002 : 0;
                plans.push({
                  berm,
                  x,
                  y,
                  z,
                  steps: 120,
                  dir: () => ({ a: inward, held: true, speed: WALK * speedMul }),
                  jumpAt: (s) => s === jumpStep || s === jumpStep + 40,
                  label: `${face.name}, from ${stand ? `tier ${from}` : "the ground"}, lane ${lane}, ${gap}m out, skew ${skew}, x${speedMul} speed, jump at ${jumpStep}`,
                });
              }
            }
          }
        }
      }
    }
  }
  return plans;
}

/** Random runs: diagonal, strafing along tiers, stopping, turning, jumping, running off the top. */
function fuzzPlans(berm: Berm, count: number): Plan[] {
  const plans: Plan[] = [];
  const base = berm.tiers[0]!;
  const top = berm.tiers[berm.tiers.length - 1]!;
  for (let t = 0; t < count; t++) {
    const onTop = rand() < 0.35;
    const tier = onTop ? berm.tiers[Math.floor(rand() * berm.tiers.length)]! : null;
    const x = tier ? tier.minX + rand() * (tier.maxX - tier.minX) : base.minX - 6 + rand() * (base.maxX - base.minX + 12);
    const z = tier ? tier.minZ + rand() * (tier.maxZ - tier.minZ) : base.minZ - 6 + rand() * (base.maxZ - base.minZ + 12);
    const y = tier ? top.maxY + 0.5 : 0; // dropped onto whatever tier is under that spot
    const speedMul = [1, BOOST, 0.5, 0.2][Math.floor(rand() * 4)]!;
    const jumpP = [0.01, 0.05, 0.2, 0.6][Math.floor(rand() * 4)]!;
    const segs: { until: number; a: number; held: boolean }[] = [];
    let at = 0;
    const tx = berm.x + (rand() - 0.5) * (base.maxX - base.minX);
    const tz = berm.z + (rand() - 0.5) * (base.maxZ - base.minZ);
    let a = Math.atan2(tz - z, tx - x);
    const strafe = rand() < 0.3;
    if (strafe) a = rand() < 0.5 ? (rand() < 0.5 ? 0 : Math.PI) : rand() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    while (at < 240) {
      const len = 10 + Math.floor(rand() * 60);
      segs.push({ until: at + len, a, held: rand() > 0.1 });
      at += len;
      a += (rand() - 0.5) * (strafe ? 0.3 : 2.4);
    }
    const jumps = new Set<number>();
    for (let s = 0; s < 240; s++) if (rand() < jumpP) jumps.add(s);
    plans.push({
      berm,
      x,
      y,
      z,
      steps: 240,
      dir: (s) => {
        const seg = segs.find((g) => s < g.until) ?? segs[segs.length - 1]!;
        return { a: seg.a, held: seg.held, speed: WALK * speedMul };
      },
      jumpAt: (s) => jumps.has(s),
      label: `fuzz ${t}${strafe ? " strafe" : ""}${onTop ? " on top" : ""}, x${speedMul} speed`,
    });
  }
  return plans;
}

/* ------------------------------------------------------------ go */

const t0 = Date.now();
let physicsRuns = 0;
for (const berm of berms) {
  for (const p of hopPlans(berm, () => true)) {
    run(p);
    physicsRuns++;
  }
  for (const p of fuzzPlans(berm, 1500)) {
    run(p);
    physicsRuns++;
  }
}
const physicsEvents = events.length;
const physicsElsewhere = elsewhere.length;

let camRuns = 0;
for (const berm of berms) {
  const hops = hopPlans(berm, (i) => i % 97 === 0);
  const fuzz = fuzzPlans(berm, 60);
  for (const fps of [60, 30, 20]) {
    for (const follow of [false, true]) {
      for (const p of [...hops, ...fuzz]) {
        run(p, { fps, follow });
        camRuns++;
      }
    }
  }
}

console.log(`${berms.length} berms: ${berms.map((b) => `${b.name} ${b.tiers.length} tiers`).join(", ")}`);
console.log(`physics: ${physicsRuns} runs at 60Hz; camera: ${camRuns} runs at 60/30/20fps, ${stats.frames} frames (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
console.log(`camera: largest move in one frame ${stats.camMax.toFixed(2)}m, ${stats.emergency} frames on her head`);
function table(list: Event[], map: Map<string, Event>) {
  const counts = new Map<string, number>();
  for (const e of list) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  for (const kind of ["sideways", "backward", "down", "up", "camera", "look-at"]) {
    const w = map.get(kind);
    console.log(`  ${kind.padEnd(9)} ${String(counts.get(kind) ?? 0).padStart(6)}${w ? `  worst ${w.mag.toFixed(2)}m: ${w.where}` : ""}`);
  }
}
console.log("on the berms:");
table(events, worst);
if (elsewhere.length) {
  console.log(`other structures within 14m of a berm (${elsewhere.length}, ${physicsElsewhere} in physics; not berm bugs, not failed):`);
  table(elsewhere, worstElsewhere);
}
console.log(events.length ? `${events.length} reset-like events on berms (${physicsEvents} in physics)` : "no reset-like events on berms");
process.exit(events.length ? 1 : 0);
