import { EMMETT_BASE } from "./emmett-base";
import { makeMonsterTruck, makeTruckYard, type TruckRig } from "./monster-truck";
import { makeCarnival, type CarnivalRig } from "./carnival-mesh";
import * as THREE from "three";
import type { AABB } from "./collision";
import { beveledBox } from "./beveled";
import { applyFinish, type FinishRig } from "./finishes";
import type { FaceRig } from "./meshes";
import { makeGrassField, normalFromTexture, scatterMask, type GrassField } from "./scenery";
import { mergeStatic, type MergeReport } from "./merge";
import { boxIsBuilt, boxIsSolid, collidersFor, isSolidProp, isWaterColor } from "./colliders";
import {
  boxGeo,
  cylGeo,
  grassTexture,
  lam,
  makeCloud,
  makeDumpling,
  makeFerrisWheel,
  type FerrisWheel,
  makeTent,
  makeTractor,
  makeTrampoline,
  makeTyre,
  makeCampfire,
  type Campfire,
  makeSprayArches,
  type SprayArches,
  makeMountainCave,
  makeFountain,
  makeGazebo,
  makePondEdge,
  makeTreehouse,
  makeHouse,
  makeLollipop,
  makeSlide,
  makeSplashPad,
  type SplashRig,
  makeTree,
  makeWaterMaterial,
  pathTexture,
  sphereGeo,
} from "./meshes";
import type { DumplingDef, LevelDef, WaterZone } from "./types";

export type DumplingHandle = {
  def: DumplingDef;
  group: THREE.Group;
  spark: THREE.PointLight;
  finish: FinishRig;
  face: FaceRig | null;
  beam: THREE.Mesh;
  phase: number;
};

export type BuiltWorld = {
  group: THREE.Group;
  colliders: AABB[];
  dumplings: DumplingHandle[];
  water: WaterZone[];
  ground: THREE.Mesh;
  textures: THREE.Texture[];
  waterMats: THREE.ShaderMaterial[];
  grassField: GrassField | null;
  /** Geometries created by the static merge, owned by this world. */
  merged: THREE.BufferGeometry[];
  mergeReport: MergeReport;
  ride: FerrisWheel | null;
  /** Trampoline mats, as footprints; their top is TRAMPOLINE_TOP. */
  bouncers: { minX: number; maxX: number; minZ: number; maxZ: number }[];
  spray: SprayArches | null;
  splash: SplashRig | null;
  carnival: CarnivalRig | null;
  truck: TruckRig | null;
  campfire: Campfire | null;
};

function addBox(
  parent: THREE.Group,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  color: string,
  collide: boolean,
  ry = 0,
  opacity = 1,
) {
  // tile the texture with the size of the face so big slabs do not smear
  const repeat = Math.max(1, Math.min(8, Math.round(Math.max(sx, sz, sy) / 2.6)));
  const m = new THREE.Mesh(
    beveledBox(sx, sy, sz),
    lam(color, opacity < 1 ? { transparent: true, opacity, repeat } : { repeat }),
  );
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = collide;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// The solidity rule and the collider list live in colliders.ts so the tools
// check exactly what the game builds. Re-exported for the callers that import
// them from here.
export { isSolidProp, isWaterColor } from "./colliders";

export function buildWorld(level: LevelDef): BuiltWorld {
  const t0 = performance.now();
  const marks: [string, number][] = [];
  const mark = (name: string) => marks.push([name, Math.round(performance.now() - t0)]);
  const group = new THREE.Group();
  // Every collider comes from the pure builder; the mesh code below only
  // decides what to draw (and whether it casts a shadow).
  const colliders: AABB[] = collidersFor(level).map(({ label: _l, index: _i, ...b }) => b);
  const bouncers: BuiltWorld["bouncers"] = [];
  const textures: THREE.Texture[] = [];
  const waterMats: THREE.ShaderMaterial[] = [];
  const grass = grassTexture();
  const path = pathTexture();
  textures.push(grass, path);

  const groundSize = Math.max(
    level.bounds.maxX - level.bounds.minX,
    level.bounds.maxZ - level.bounds.minZ,
  ) + 8;

  const groundNormal = normalFromTexture(grass, 1.8);
  if (groundNormal) textures.push(groundNormal);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    new THREE.MeshStandardMaterial({
      map: grass,
      normalMap: groundNormal ?? undefined,
      normalScale: new THREE.Vector2(0.55, 0.55),
      color: level.grass,
      roughness: 0.92,
      metalness: 0,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = level.islands ? -80 : -0.02;
  ground.receiveShadow = true;
  if (!level.islands) group.add(ground);

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(4.2, 20, 16),
    new THREE.MeshBasicMaterial({ color: "#fff4c2" }),
  );
  sun.position.set(70, 62, -48);
  group.add(sun);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(7.2, 16, 12),
    new THREE.MeshBasicMaterial({ color: "#ffe7a0", transparent: true, opacity: 0.22, depthWrite: false }),
  );
  glow.position.copy(sun.position);
  group.add(glow);

  for (const p of level.props) {
    if (p.kind === "box") {
      if (!boxIsBuilt(p)) continue;
      addBox(
        group,
        p.pos[0],
        p.pos[1],
        p.pos[2],
        p.size[0],
        p.size[1],
        p.size[2],
        p.color,
        // solid props cast shadows; the rule itself is in colliders.ts
        boxIsSolid(p),
        p.ry ?? 0,
        p.opacity ?? 1,
      );
    } else if (p.kind === "cyl") {
      const isWater = isWaterColor(p.color);
      const mat = isWater
        ? makeWaterMaterial(p.color)
        : lam(p.color, { transparent: true, opacity: 0.92 });
      if (isWater) waterMats.push(mat as THREE.ShaderMaterial);
      const m = new THREE.Mesh(cylGeo, mat);
      m.scale.set(p.r, p.h, p.r);
      m.position.set(p.pos[0], p.pos[1], p.pos[2]);
      m.receiveShadow = !isWater;
      m.castShadow = false;
      group.add(m);
    } else if (p.kind === "tree") {
      const t = makeTree(p.variant ?? 0, p.scale ?? 1);
      t.position.set(p.x, 0, p.z);
      group.add(t);
    } else if (p.kind === "house") {
      const h = makeHouse(p.body, p.roof, p.w ?? 6, p.d ?? 5);
      h.position.set(p.x, 0, p.z);
      h.rotation.y = p.ry ?? 0;
      group.add(h);
    } else if (p.kind === "cloud") {
      const c = makeCloud(p.scale ?? 1);
      c.position.set(p.pos[0], p.pos[1], p.pos[2]);
      group.add(c);
    } else if (p.kind === "lollipop") {
      const l = makeLollipop(p.candy);
      l.position.set(p.x, 0, p.z);
      group.add(l);
    } else if (p.kind === "tent") {
      const t = makeTent(p.color);
      t.position.set(p.x, 0, p.z);
      group.add(t);
    } else if (p.kind === "trampoline") {
      const t = makeTrampoline(p.w, p.d);
      t.position.set(p.x, 0, p.z);
      group.add(t);
      bouncers.push({ minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2 });
    } else if (p.kind === "tyre") {
      const t = makeTyre(p.r);
      t.position.set(p.x, 0, p.z);
      group.add(t);
    } else if (p.kind === "tractor") {
      const t = makeTractor();
      t.position.set(p.x, 0, p.z);
      t.rotation.y = p.ry ?? 0;
      group.add(t);
    }
  }

  // Animated set pieces: the splash pad spray and the campfire. Both are kept
  // out of the merge so the runtime can move them.
  let spray: SprayArches | null = null;
  let splash: SplashRig | null = null;
  if (level.splash) {
    splash = makeSplashPad();
    splash.group.position.set(level.splash.x, 0, level.splash.z);
    group.add(splash.group);
    spray = makeSprayArches();
    spray.group.position.set(level.splash.x, 0, level.splash.z);
    group.add(spray.group);
    const slide = makeSlide();
    slide.position.set(level.splash.x + 10, 0, level.splash.z - 7);
    group.add(slide);
  }
  let campfire: Campfire | null = null;
  if (level.campfire) {
    campfire = makeCampfire();
    campfire.group.position.set(level.campfire.x, 0, level.campfire.z);
    group.add(campfire.group);
  }

  let ride: FerrisWheel | null = null;
  if (level.ride) {
    ride = makeFerrisWheel();
    ride.group.position.set(level.ride.x, 0, level.ride.z);
    ride.origin.set(level.ride.x, 0, level.ride.z);
    group.add(ride.group);
  }

  // Composite meshes. Their colliders are listed in colliders.ts; keep the
  // positions here in step with that file.
  if (level.id === "picnic") {
    const slide = makeSlide();
    slide.position.set(22, 0, 8);
    group.add(slide);
    const gazebo = makeGazebo();
    gazebo.position.set(8, 0, -6);
    group.add(gazebo);

    // fountain standing in the big pond
    const fountain = makeFountain();
    fountain.position.set(0, 0, -42);
    group.add(fountain);

    // banks, cattails and lily pads for both ponds
    for (const w of level.water ?? []) {
      if (w.pool) continue;
      const edge = makePondEdge(w.r);
      edge.position.set(w.x, 0, w.z);
      group.add(edge);
    }

    // a treehouse that looks like one, at the top of the existing stairs
    const th = makeTreehouse();
    th.position.set(54.2, 0, -53);
    // turned so the open front and the rope ladder face the stairs
    th.rotation.y = Math.PI;
    group.add(th);

  }
  let carnival: CarnivalRig | null = null;
  if (level.carnival) {
    carnival = makeCarnival();
    group.add(carnival.group);
  }
  let truck: TruckRig | null = null;
  if (level.emmettBase) {
    const yard = makeTruckYard();
    truck = makeMonsterTruck();
    for (const g of [yard, truck.group]) {
      g.position.set(EMMETT_BASE.x, 0, EMMETT_BASE.z);
      g.rotation.y = EMMETT_BASE.yaw;
      group.add(g);
    }
  }
  if (level.caveZone) {
    // the mountain's boulders, entrance and everything inside the tunnels
    group.add(makeMountainCave());
  }
  if (level.id === "village") {
    const f = makeFountain();
    f.position.set(0, 0, 0);
    group.add(f);
  }

  // Layout 0 is the authored spot; 1 and 2 come from each dumpling's alts.
  // Picked per run so finding them once does not solve the park forever.
  const layout = level.layout ?? 0;
  const dumplings: DumplingHandle[] = level.dumplings.map((def, i) => {
    const alt = layout > 0 ? def.alts?.[layout - 1] : undefined;
    const src = alt ? { ...def, pos: alt.pos, region: alt.region, hint: alt.hint } : def;
    const live = {
      ...src,
      pos: [src.pos[0], src.pos[1], src.pos[2]] as [number, number, number],
    };
    const g = makeDumpling(live.color, live.accent);
    const finish = applyFinish(g, live.finish ?? "plain", live.color, live.accent);
    g.position.set(live.pos[0], live.pos[1], live.pos[2]);
    g.name = live.id;
    group.add(g);
    // Never set .visible on this light. The runtime dims it with intensity;
    // hiding a light changes the light count and recompiles every shader.
    const spark = new THREE.PointLight(live.accent, 0.9 + finish.sparkBoost, 6 + finish.sparkBoost * 2);
    spark.position.copy(g.position);
    spark.position.y += 0.7;
    group.add(spark);
    const beamGeo = new THREE.CylinderGeometry(0.1, 0.22, 5.5, 8, 1, true);
    const beam = new THREE.Mesh(
      beamGeo,
      lam(live.accent, { transparent: true, opacity: 0.28, emissive: live.accent, roughness: 0.3 }),
    );
    beam.position.set(live.pos[0], live.pos[1] + 2.8, live.pos[2]);
    beam.userData.outlineParameters = { visible: false };
    group.add(beam);
    return {
      def: live,
      group: g,
      spark,
      beam,
      phase: i * 0.7,
      finish,
      face: (g.userData.face as FaceRig) ?? null,
    };
  });

  if (!level.islands) {
    const colors = ["#d45a4a", "#e8c46a", "#d47a96", "#4f93c4", "#fff6ee", "#c46b8a"];
    const count = 220;
    const dummy = new THREE.Object3D();
    const flower = new THREE.InstancedMesh(sphereGeo, lam("#d45a4a", { roughness: 0.5 }), count);
    flower.castShadow = false;
    flower.receiveShadow = true;
    const stem = new THREE.InstancedMesh(cylGeo, lam("#3f9a6b", { roughness: 0.8 }), count);
    stem.castShadow = false;
    let seed = 91;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const spanX = level.bounds.maxX - level.bounds.minX - 10;
    const spanZ = level.bounds.maxZ - level.bounds.minZ - 10;
    for (let i = 0; i < count; i++) {
      const x = (rand() - 0.5) * spanX;
      const z = (rand() - 0.5) * spanZ;
      dummy.position.set(x, 0.18, z);
      const s = 0.11 + rand() * 0.12;
      dummy.scale.set(s, s * 0.7, s);
      dummy.updateMatrix();
      flower.setMatrixAt(i, dummy.matrix);
      flower.setColorAt?.(i, new THREE.Color(colors[i % colors.length]!));
      dummy.position.set(x, 0.1, z);
      dummy.scale.set(0.03, 0.2, 0.03);
      dummy.updateMatrix();
      stem.setMatrixAt(i, dummy.matrix);
    }
    flower.instanceMatrix.needsUpdate = true;
    if (flower.instanceColor) flower.instanceColor.needsUpdate = true;
    stem.instanceMatrix.needsUpdate = true;
    group.add(stem, flower);

    const tuftGeo = new THREE.ConeGeometry(0.12, 0.38, 4);
    const tufts = new THREE.InstancedMesh(tuftGeo, lam("#4e9a46", { roughness: 0.9 }), 280);
    tufts.castShadow = false;
    tufts.receiveShadow = true;
    seed = 211;
    for (let i = 0; i < 280; i++) {
      dummy.position.set((rand() - 0.5) * spanX, 0.16, (rand() - 0.5) * spanZ);
      dummy.rotation.set(0, rand() * Math.PI * 2, (rand() - 0.5) * 0.25);
      const s = 0.7 + rand() * 0.8;
      dummy.scale.set(s, s * (0.8 + rand() * 0.5), s);
      dummy.updateMatrix();
      tufts.setMatrixAt(i, dummy.matrix);
    }
    tufts.instanceMatrix.needsUpdate = true;
    group.add(tufts);
  }

  for (const w of level.water ?? []) {
    if (w.pool) continue;
    const foam = new THREE.Mesh(
      cylGeo,
      lam("#eef8ff", { transparent: true, opacity: 0.45, roughness: 0.3 }),
    );
    foam.scale.set(w.r + 0.45, 0.04, w.r + 0.45);
    foam.position.set(w.x, 0.12, w.z);
    foam.castShadow = false;
    foam.receiveShadow = false;
    group.add(foam);
  }

  mark("props");
  let grassField: GrassField | null = null;
  if (!level.islands) {
    const mask = scatterMask(level, colliders, level.water ?? []);
    mark("scatter mask");
    grassField = makeGrassField(level, mask);
    group.add(grassField.group);
    mark("grass");
  }

  // Everything that moves at runtime is excluded from the merge by handle, so
  // the exclusion list cannot drift out of step with what animateWorld touches.
  const live = new Set<THREE.Object3D>();
  for (const d of dumplings) {
    live.add(d.group);
    live.add(d.beam);
  }
  if (ride) live.add(ride.group);
  if (spray) live.add(spray.group);
  if (splash) live.add(splash.group);
  if (carnival) {
    live.add(carnival.spin);
    live.add(carnival.ring);
  }
  if (campfire) live.add(campfire.group);
  if (truck) live.add(truck.group);
  // ?nomerge=1 keeps the original per-prop meshes, for A/B measurement with
  // the probes on window.__gameTest.
  const noMerge =
    typeof location !== "undefined" && new URLSearchParams(location.search).has("nomerge");
  const { report: mergeReport, geometries: merged } = noMerge
    ? {
        report: { candidates: 0, merged: 0, created: 0, kept: 0, trianglesIn: 0, trianglesOut: 0 },
        geometries: [],
      }
    : mergeStatic(group, { live });
  mark("merge");
  console.info(`[build] ${level.id}: ${marks.map(([n, ms]) => `${n} ${ms}ms`).join(", ")}`);

  return {
    group,
    colliders,
    dumplings,
    water: level.water ?? [],
    ground,
    textures,
    waterMats,
    grassField,
    merged,
    mergeReport,
    ride,
    bouncers,
    spray,
    splash,
    carnival,
    truck,
    campfire,
  };
}

export function disposeWorld(world: BuiltWorld) {
  world.group.removeFromParent();
  world.group.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.geometry && m.geometry !== boxGeo && m.geometry !== cylGeo) {
      if (m.geometry.type === "PlaneGeometry" || m.geometry.type === "SphereGeometry" || m.geometry.type === "CylinderGeometry") {
        if (m.geometry !== boxGeo) {
          /* shared geos skipped in meshes; plane is unique */
        }
      }
    }
  });
  for (const d of world.dumplings) for (const m of d.finish.materials) m.dispose();
  for (const g of world.merged) g.dispose();
  world.grassField?.dispose();
  world.ground.geometry.dispose();
  (world.ground.material as THREE.Material).dispose();
  for (const t of world.textures) t.dispose();
  for (const m of world.waterMats) m.dispose();
}
