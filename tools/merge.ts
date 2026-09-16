/**
 * Proves the static-mesh merge (src/game/merge.ts) is geometry-preserving.
 *
 * Builds a synthetic park-like scene in Node (no canvas, no WebGL: plain
 * materials instead of lam()'s textured ones), runs mergeStatic, and checks:
 *   1. triangle count is conserved exactly
 *   2. the world-space bounding box is unchanged
 *   3. a sample of vertices from the original meshes, transformed to world
 *      space, are found in the merged geometry (so transforms were baked right,
 *      including rotation and nested groups)
 *   4. live subtrees, clouds, transparent and instanced meshes were left alone
 *
 * Run: npx jiti tools/merge.ts
 */
import * as THREE from "three";
import { mergeStatic } from "../src/game/merge";
import { beveledBox } from "../src/game/beveled";

const root = new THREE.Group();
const mats = [
  new THREE.MeshStandardMaterial({ color: "#c49a62" }),
  new THREE.MeshStandardMaterial({ color: "#6e9e58" }),
  new THREE.MeshStandardMaterial({ color: "#d45a4a" }),
];
const glass = new THREE.MeshStandardMaterial({ color: "#cdeefb", transparent: true, opacity: 0.5 });

let seed = 7;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

// 600 boxes spread over 240m, some rotated, some inside nested groups
const originals: THREE.Mesh[] = [];
for (let i = 0; i < 600; i++) {
  const sx = 0.3 + rand() * 4;
  const sy = 0.3 + rand() * 3;
  const sz = 0.3 + rand() * 4;
  const m = new THREE.Mesh(beveledBox(sx, sy, sz), mats[i % 3]!);
  m.position.set((rand() - 0.5) * 240, sy / 2, (rand() - 0.5) * 240);
  m.rotation.y = i % 5 === 0 ? rand() * Math.PI : 0;
  m.castShadow = i % 4 !== 0;
  m.receiveShadow = true;
  if (i % 7 === 0) {
    const g = new THREE.Group();
    g.position.set(3, 0, -2);
    g.rotation.y = 0.4;
    g.add(m);
    root.add(g);
  } else {
    root.add(m);
  }
  originals.push(m);
}
// transparent: must be kept
const t = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glass);
t.position.set(5, 0.5, 5);
root.add(t);
const t2 = t.clone();
t2.position.set(6, 0.5, 5);
root.add(t2);
// instanced: must be kept
const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.1, 0.5), mats[1]!, 50);
root.add(inst);
// live subtree (a dumpling): must be kept intact
const dumpling = new THREE.Group();
dumpling.add(new THREE.Mesh(new THREE.SphereGeometry(0.5), mats[2]!));
dumpling.add(new THREE.Mesh(new THREE.SphereGeometry(0.2), mats[2]!));
dumpling.position.set(10, 1, 10);
root.add(dumpling);
// cloud: must be kept intact
const cloud = new THREE.Group();
cloud.userData.cloudDrift = true;
for (let i = 0; i < 4; i++) cloud.add(new THREE.Mesh(new THREE.SphereGeometry(1), mats[0]!));
root.add(cloud);

root.updateMatrixWorld(true);
// precise=true walks vertices; the default uses each mesh's local box, which
// is loose for rotated meshes and would differ from the baked result
const before = new THREE.Box3().setFromObject(root, true);
const beforeTris = countTris(root);
const beforeMeshes = countMeshes(root);

// sample vertices from originals in world space before the merge
const samples: THREE.Vector3[] = [];
for (let i = 0; i < originals.length; i += 37) {
  const m = originals[i]!;
  const pos = m.geometry.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3().fromBufferAttribute(pos, 0).applyMatrix4(m.matrixWorld);
  samples.push(v);
}

const { report, geometries } = mergeStatic(root, { cell: 80, live: new Set([dumpling]) });

root.updateMatrixWorld(true);
const after = new THREE.Box3().setFromObject(root, true);
const afterTris = countTris(root);
const afterMeshes = countMeshes(root);

let fails = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) fails++;
};

console.log("report:", report);
console.log(`meshes ${beforeMeshes} -> ${afterMeshes}, merged geometries ${geometries.length}`);
check(report.trianglesIn === report.trianglesOut, `triangles in merged buckets conserved (${report.trianglesIn})`);
check(beforeTris === afterTris, `scene triangles conserved (${beforeTris} -> ${afterTris})`);
check(before.min.distanceTo(after.min) < 1e-4 && before.max.distanceTo(after.max) < 1e-4, "bounding box unchanged");
check(afterMeshes < beforeMeshes / 4, `draw units cut by >4x (${beforeMeshes} -> ${afterMeshes})`);

// every sampled world-space vertex must exist in some merged geometry
let found = 0;
for (const s of samples) {
  let hit = false;
  for (const g of geometries) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count && !hit; i++) {
      if (
        Math.abs(pos.getX(i) - s.x) < 1e-4 &&
        Math.abs(pos.getY(i) - s.y) < 1e-4 &&
        Math.abs(pos.getZ(i) - s.z) < 1e-4
      )
        hit = true;
    }
    if (hit) break;
  }
  if (hit) found++;
}
check(found === samples.length, `sampled vertices found at their world positions (${found}/${samples.length})`);

check(t.parent === root && t2.parent === root, "transparent meshes kept");
check(inst.parent === root, "instanced mesh kept");
check(dumpling.children.length === 2 && dumpling.parent === root, "live subtree untouched");
check(cloud.children.length === 4, "cloud untouched");

if (fails) {
  console.log(`\n${fails} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");

function countTris(o: THREE.Object3D) {
  let n = 0;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    const per = Math.floor((g.index ? g.index.count : g.attributes.position.count) / 3);
    n += per * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
  });
  return n;
}
function countMeshes(o: THREE.Object3D) {
  let n = 0;
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) n++;
  });
  return n;
}
