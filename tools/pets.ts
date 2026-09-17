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
 * Run: npx jiti tools/pets.ts   (exits 1 on any failure)
 */
import * as THREE from "three";
import { PETS, animatePet, makePet, petNeck, type PetMode, type PetRig } from "../src/game/pets";

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

console.log(failures ? `\n${failures} failure(s)` : "\nall pet checks passed");
process.exit(failures ? 1 : 0);
