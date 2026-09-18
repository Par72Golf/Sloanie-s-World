/**
 * Pet companions, headless.
 *
 * Builds every pet in every coat and runs every mode for 5 seconds at 60fps
 * with speeds 0, 3 and 7, checking:
 *   1. no NaN or infinite value in any child transform
 *   2. group.position and group.rotation.y are never touched by animatePet
 *   3. at rest (follow, speed 0) the bounding box is 0.3..0.8m tall
 *   4. nothing goes below y = -0.03 in any mode (sampled every 5th frame, exact vertices)
 *   5. the happy bounce actually leaves the ground and the bunny actually hops
 *   6. animatePet allocates nothing: no garbage collections over 600k frames per pet
 * and prints triangle counts, sizes and per-mode height ranges.
 *
 * Then walks all three at once behind her through the real collision code
 * (the same follow, line-up and crowding functions the game uses) along the
 * routes Farmer Joe's three rescues take, checking that they keep their
 * spacing, never stand inside each other or inside her, keep up, and are
 * never left stuck on scenery. It also walks her along both trails and into
 * every hiding place, so a quest spot behind a wall fails here.
 *
 * Run: npx jiti tools/pets.ts   (exits 1 on any failure)
 */
import * as THREE from "three";
import { PETS, animatePet, makePet, petNeck, type PetMode, type PetRig } from "../src/game/pets";
import { LEVELS } from "../src/game/levels";
import { collidersFor } from "../src/game/colliders";
import { moveAndCollide, type Capsule } from "../src/game/collision";
import { PLAYER_H, PLAYER_W } from "../src/game/tuning";
import { PET_QUEST } from "../src/game/collectibles";
import {
  LEAD_BACK,
  FEATHER_TRAIL,
  HIDING_SPOTS,
  MAZE_HIDEOUT,
  followHer,
  followLead,
  makeWalker,
  placeWalker,
  separateHerd,
  type Walker,
} from "../src/game/quest";

const MODES: PetMode[] = ["follow", "sit", "lost", "happy", "sniff"];
const SPEEDS = [0, 3, 7];
const DT = 1 / 60;

let failures = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) {
    console.log(`  FAIL ${msg}`);
    failures++;
  }
};

function tris(root: THREE.Object3D) {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    n += (g.index ? g.index.count : g.attributes.position!.count) / 3;
  });
  return n;
}

let lowest = "";
function box(rig: PetRig) {
  rig.group.updateMatrixWorld(true);
  const b = new THREE.Box3();
  const one = new THREE.Box3();
  let lo = Infinity;
  // only visible meshes count; the tongue is hidden when not out
  rig.group.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    one.makeEmpty().expandByObject(m, true);
    if (one.min.y < lo) {
      lo = one.min.y;
      let path = "";
      for (let p: THREE.Object3D | null = m; p && p !== rig.group; p = p.parent) path = `${p.parent ? p.parent.children.indexOf(p) : 0}/${path}`;
      lowest = path;
    }
    b.union(one);
  });
  return b;
}

function finite(rig: PetRig) {
  let bad = "";
  rig.group.traverse((o) => {
    if (bad) return;
    const p = o.position, r = o.rotation, s = o.scale;
    const vals = [p.x, p.y, p.z, r.x, r.y, r.z, s.x, s.y, s.z];
    if (vals.some((v) => !Number.isFinite(v))) bad = o.name || o.type;
  });
  return bad;
}

// allocation check: count garbage collections while one pet runs every mode.
// Anything allocated per frame (objects, closures, or doubles boxed across a
// call V8 did not inline) fills the young generation and forces scavenges.
{
  const { PerformanceObserver, constants } = await import("node:perf_hooks");
  for (const def of PETS) {
    const rig = makePet(def.kind);
    let t = 0;
    const frames = (n: number) => {
      for (let i = 0; i < n; i++) {
        t += DT;
        animatePet(rig, MODES[(i >> 9) % 5]!, (i >> 7) % 8, t, DT);
      }
    };
    frames(30000); // warm up the JIT
    await new Promise((r) => setTimeout(r, 20));
    let gcs = 0;
    // minor GCs (scavenges) only: they are triggered by new allocation, whereas a
    // major GC can be finishing off garbage from earlier work in this process
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if ((e as { detail?: { kind?: number } }).detail?.kind === constants.NODE_PERFORMANCE_GC_MINOR) gcs++;
    });
    obs.observe({ entryTypes: ["gc"] });
    frames(600000);
    await new Promise((r) => setTimeout(r, 50));
    obs.disconnect();
    console.log(`${def.kind}: ${gcs} minor GCs over 600k frames`);
    check(gcs <= 1, `${def.kind}: animatePet allocates (${gcs} minor GCs over 600k frames)`);
  }
}

console.log("pets");
for (const def of PETS) {
  for (const coat of def.colors) {
    const rig = makePet(def.kind, coat);
    const tag = `${def.kind} ${coat}`;
    check(petNeck(rig).parent != null, `${tag}: neck anchor attached`);

    // at rest, as built (makePet poses it in follow at speed 0), before the group moves
    const rest = box(rig);
    const restH = rest.max.y - rest.min.y;
    const restSize = rest.getSize(new THREE.Vector3());
    const header = `${tag.padEnd(16)} tris ${String(tris(rig.group)).padStart(5)}  rest ${restSize.x.toFixed(2)}w x ${restH.toFixed(2)}h x ${restSize.z.toFixed(2)}d  feet ${rest.min.y.toFixed(3)}`;
    console.log(header);
    check(restH >= 0.3 && restH <= 0.8, `${tag}: rest height ${restH.toFixed(3)} outside 0.3..0.8`);
    check(rest.min.y >= -0.03 && rest.min.y <= 0.03, `${tag}: rest feet at ${rest.min.y.toFixed(3)}`);

    // the runtime owns these; put in values that would show any write
    rig.group.position.set(12.5, 3.25, -7.75);
    rig.group.rotation.y = 1.234;

    let t = 10;
    for (const mode of MODES) {
      const parts: string[] = [];
      for (const speed of SPEEDS) {
        let lo = Infinity;
        let hi = -Infinity;
        let maxLift = 0;
        let low = "";
        for (let f = 0; f < 300; f++) {
          animatePet(rig, mode, speed, t, DT);
          t += DT;
          const bad = finite(rig);
          if (bad) {
            check(false, `${tag} ${mode} v${speed} frame ${f}: non-finite transform on ${bad}`);
            break;
          }
          const g = rig.group;
          if (g.position.x !== 12.5 || g.position.y !== 3.25 || g.position.z !== -7.75 || g.rotation.y !== 1.234) {
            check(false, `${tag} ${mode} v${speed}: group transform changed`);
            g.position.set(12.5, 3.25, -7.75);
            g.rotation.y = 1.234;
          }
          if (f % 5 === 0 && f > 30) {
            const b = box(rig);
            if (b.min.y - 3.25 < lo) {
              lo = b.min.y - 3.25;
              low = lowest;
            }
            hi = Math.max(hi, b.max.y - 3.25);
            maxLift = Math.max(maxLift, b.min.y - 3.25);
          }
        }
        check(lo >= -0.03, `${tag} ${mode} v${speed}: lowest point ${lo.toFixed(3)} below -0.03 (mesh at child path ${low})`);
        if (mode === "happy") check(maxLift > 0.06, `${tag} happy: never leaves the ground (max lift ${maxLift.toFixed(3)})`);
        if (mode === "follow" && def.kind === "bunny" && speed > 0) check(maxLift > 0.05, `${tag} follow v${speed}: bunny does not hop (${maxLift.toFixed(3)})`);
        parts.push(`v${speed} ${lo.toFixed(3)}..${hi.toFixed(2)} lift ${maxLift.toFixed(2)}`);
      }
      console.log(`    ${mode.padEnd(6)} ${parts.join("   ")}`);
    }
  }
}

/* ------------------------------------------------------------------ the herd
 *
 * Three pets following her at once. She is driven along a route with the real
 * player capsule and the real collision code; the pets use the same followHer
 * / separateHerd the runtime calls. Every frame we check that no two pets (or
 * a pet and her) are inside one another, that nobody is left behind, and that
 * nobody is wedged against scenery for long.
 */
console.log("\nthree pets following");
{
  const level = LEVELS[0]!;
  const boxes = collidersFor(level);
  const PET_R = 0.44; // two pet capsules side by side
  const HER_R = 0.5;

  /** Drop her onto whatever is under a point. */
  const settle = (c: Capsule) => {
    c.y = 0;
    for (let i = 0; i < 8; i++) moveAndCollide(c, 0, -2, 0, boxes, DT, level.groundY);
  };

  function walkRoute(label: string, route: [number, number][], speed = 5.2) {
    const her: Capsule = { x: route[0]![0], y: 0, z: route[0]![1], hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
    settle(her);
    const pose = { x: her.x, y: her.y, z: her.z, yaw: 0, speed: 0 };
    const herd: Walker[] = PETS.map((d, i) => {
      const w = makeWalker(makePet(d.kind), d.kind);
      placeWalker(w, her.x - 0.4 + i * 0.4, her.y, her.z + 1.2 + i * 0.6);
      return w;
    });

    let worstGap = Infinity;   // closest two pets ever came
    let worstHer = Infinity;   // closest a pet ever came to her
    let worstBehind = 0;       // furthest a pet ever fell behind
    let laggedFrames = 0;      // frames with a pet more than 8m off the back
    let stuckFrames = 0;       // frames a pet was wedged with somewhere to go
    let pops = 0;              // times a pet had to be put back beside her
    let frames = 0;
    let t = 0;
    let leg = 1;
    while (leg < route.length && frames < 60 * 600) {
      const [tx, tz] = route[leg]!;
      const dx = tx - her.x;
      const dz = tz - her.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.6) {
        leg++;
        continue;
      }
      const vx = (dx / d) * speed;
      const vz = (dz / d) * speed;
      const before = { x: her.x, z: her.z };
      moveAndCollide(her, vx, -2, vz, boxes, DT, level.groundY);
      const went = Math.hypot(her.x - before.x, her.z - before.z);
      pose.x = her.x;
      pose.y = her.y;
      pose.z = her.z;
      pose.yaw = Math.atan2(-vx, -vz);
      pose.speed = went / DT;
      // if she is the one stuck, slide along instead of stalling the test
      if (went < speed * DT * 0.2) {
        her.x += vz * DT * 0.6;
        her.z -= vx * DT * 0.6;
      }
      for (let j = 0; j < herd.length; j++) {
        const w = herd[j]!;
        const wasX = w.cap.x;
        const wasZ = w.cap.z;
        const far = Math.hypot(pose.x - w.cap.x, pose.z - w.cap.z);
        w.mode = j === 0 ? followHer(w, pose, LEAD_BACK, 0, DT, boxes, level.groundY) : followLead(w, herd[j - 1]!, pose, DT, boxes, level.groundY);
        if (far > 12 && Math.hypot(w.cap.x - wasX, w.cap.z - wasZ) > 4) pops++;
        if (w.stuck > 0.9) stuckFrames++;
      }
      separateHerd(herd, pose);
      t += DT;
      frames++;
      for (let i = 0; i < herd.length; i++) {
        const a = herd[i]!;
        animatePet(a.rig, a.mode, a.speed, t, DT);
        worstHer = Math.min(worstHer, Math.hypot(a.cap.x - pose.x, a.cap.z - pose.z));
        const off = Math.hypot(a.cap.x - pose.x, a.cap.z - pose.z);
        worstBehind = Math.max(worstBehind, off);
        if (off > 8) laggedFrames++;
        for (let j = i + 1; j < herd.length; j++) {
          const b = herd[j]!;
          worstGap = Math.min(worstGap, Math.hypot(a.cap.x - b.cap.x, a.cap.z - b.cap.z));
        }
        const bad = finite(a.rig);
        if (bad) check(false, `${label}: non-finite transform on ${bad}`);
      }
    }
    const arrived = leg >= route.length;
    console.log(
      `  ${label.padEnd(22)} ${frames} frames  closest pair ${worstGap.toFixed(2)}m  closest to her ${worstHer.toFixed(2)}m  furthest back ${worstBehind.toFixed(1)}m  lagging ${laggedFrames}f  wedged ${stuckFrames}f  pops ${pops}`,
    );
    check(arrived, `${label}: she never finished the route (${leg}/${route.length - 1} legs)`);
    check(worstGap >= PET_R, `${label}: two pets overlapped (${worstGap.toFixed(2)}m apart, need ${PET_R})`);
    check(worstHer >= HER_R, `${label}: a pet stood inside her (${worstHer.toFixed(2)}m, need ${HER_R})`);
    // 18m is where the game gives up and puts a pet back beside her, so any
    // peak under that is a pet catching up; what matters is how long it lags
    check(worstBehind < 18, `${label}: a pet fell ${worstBehind.toFixed(1)}m behind, past the give-up distance`);
    check(laggedFrames < frames * 0.12, `${label}: a pet was more than 8m off the back for ${laggedFrames} of ${frames} frames`);
    check(stuckFrames < frames * 0.1, `${label}: pets wedged on scenery for ${stuckFrames} of ${frames} frames`);
    check(pops <= 2, `${label}: a pet had to be put back beside her ${pops} times`);
  }

  const [fx, , fz] = PET_QUEST.farmer;
  const [hx, , hz] = MAZE_HIDEOUT;
  // the farm, where she starts and ends every rescue
  walkRoute("round the farm", [
    [fx, fz], [-64, -118.2], [-56.3, -139.4], [-40, -122.6], [fx, fz],
  ]);
  // out of the maze with a pet: the real route through the hedges (the cell
  // path from the heart to the blue posts), the tightest corridors in the park
  walkRoute("out of the maze", [
    [hx, hz], [-37.2, -18], [-46.8, -18], [-46.8, -13.2], [-42, -13.2],
    [-42, -10.8], [-42, -6], [-42, -3.6], [-42, -1.2], [-42, 4], [-50, 4],
  ], 4.2);
  // the long walk home from the cave mouth, the chapter 0 escort
  walkRoute("cave mouth to Joe", [
    [71.5, -111.5], [40, -113], [0, -113], [-21, -113.5], [-39, -131.5], [-56, -132.5], [fx, fz],
  ]);
  // the feather trail, end to end
  walkRoute("the feather trail", FEATHER_TRAIL, 5.2);

  // every quest spot is somewhere she can stand, with room around it
  for (const [name, x, z] of [
    ["scarecrow", HIDING_SPOTS[0]!.pos[0], HIDING_SPOTS[0]!.pos[2]],
    ["windmill", HIDING_SPOTS[1]!.pos[0], HIDING_SPOTS[1]!.pos[2]],
    ["haystacks", HIDING_SPOTS[2]!.pos[0], HIDING_SPOTS[2]!.pos[2]],
    ["maze hideout", hx, hz],
    ["farmer", fx, fz],
  ] as [string, number, number][]) {
    const c: Capsule = { x, y: 0, z, hw: PLAYER_W, h: PLAYER_H, hd: PLAYER_W };
    settle(c);
    check(Math.hypot(c.x - x, c.z - z) < 0.2, `${name}: she is pushed out of the spot`);
    let open = 0;
    for (let a = 0; a < 8; a++) {
      const th = (a / 8) * Math.PI * 2;
      const d: Capsule = { ...c };
      for (let i = 0; i < 40; i++) moveAndCollide(d, Math.sin(th) * 4, -2, Math.cos(th) * 4, boxes, DT, level.groundY);
      if (Math.hypot(d.x - c.x, d.z - c.z) > 2) open++;
    }
    console.log(`  ${name.padEnd(22)} stands at y ${c.y.toFixed(2)}, ${open}/8 ways out`);
    check(open >= 2, `${name}: only ${open} of 8 ways out; too tight to reach`);
  }
}

console.log(failures ? `\n${failures} failure(s)` : "\nall pet checks passed");
process.exit(failures ? 1 : 0);
