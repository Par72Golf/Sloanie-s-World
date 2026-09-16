import * as THREE from "three";
import { aabbFromCenter, type AABB } from "./collision";
import { applyFinish, type FinishRig } from "./finishes";
import type { FaceRig } from "./meshes";
import { makeGrassField, normalFromTexture, scatterMask, type GrassField } from "./scenery";
import {
  boxGeo,
  cylGeo,
  grassTexture,
  lam,
  makeCloud,
  makeDumpling,
  makeCaveMouth,
  makeFountain,
  makeGazebo,
  makePondEdge,
  makeTreehouse,
  makeHouse,
  makeLollipop,
  makeSlide,
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
};

function addBox(
  parent: THREE.Group,
  colliders: AABB[],
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
    boxGeo,
    lam(color, opacity < 1 ? { transparent: true, opacity, repeat } : { repeat }),
  );
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = collide;
  m.receiveShadow = true;
  parent.add(m);
  if (collide) colliders.push(aabbFromCenter(x, y, z, sx, sy, sz));
  return m;
}

/**
 * Everything is solid. She should never walk through a prop, and the collision
 * pass already puts her on top of whatever she hits, with a 0.62m step-up for
 * kerbs and ledges. The only exceptions are things with no surface to stand on:
 * water and the splash-pad spray.
 */
const SPRAY = new Set(["#cdeefb", "#e8f8ff", "#d6f2ff", "#f7f3e4"]);

/**
 * Actual liquid surfaces, listed explicitly.
 *
 * This used to be a prefix match on "#5aa"/"#6cb"/"#9fd", which caught
 * "#5aaa62", the green of the maze and garden hedges, and turned them into
 * walk-through walls. Guessing liquid from a colour channel is no better: the
 * dugout roof and the fence posts are blue too. So: a list.
 */
const LIQUID = new Set(["#5aa8c8", "#6cb8d4", "#9fd4ea", "#6cb4d4", "#5aa0bc", "#7ec4de"]);

export function isWaterColor(color: string) {
  return LIQUID.has(color.toLowerCase());
}

/** Everything is solid except liquid and spray, which have nothing to stand on. */
export function isSolidProp(color: string) {
  const c = color.toLowerCase();
  return !SPRAY.has(c) && !LIQUID.has(c);
}

export function buildWorld(level: LevelDef): BuiltWorld {
  const group = new THREE.Group();
  const colliders: AABB[] = [];
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
      if (p.size[0] < 0.15 && p.size[1] < 0.15) continue;
      addBox(
        group,
        colliders,
        p.pos[0],
        p.pos[1],
        p.pos[2],
        p.size[0],
        p.size[1],
        p.size[2],
        p.color,
        isSolidProp(p.color),
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
      if (isSolidProp(p.color)) {
        colliders.push(aabbFromCenter(p.pos[0], p.pos[1], p.pos[2], p.r * 1.6, p.h, p.r * 1.6));
      }
    } else if (p.kind === "tree") {
      const t = makeTree(p.variant ?? 0, p.scale ?? 1);
      t.position.set(p.x, 0, p.z);
      group.add(t);
      const s = p.scale ?? 1;
      colliders.push(aabbFromCenter(p.x, 1.1 * s, p.z, 0.45 * s, 2.2 * s, 0.45 * s));
    } else if (p.kind === "house") {
      const h = makeHouse(p.body, p.roof, p.w ?? 6, p.d ?? 5);
      h.position.set(p.x, 0, p.z);
      h.rotation.y = p.ry ?? 0;
      group.add(h);
      const w = p.w ?? 6;
      const d = p.d ?? 5;
      const rotated = p.ry != null && Math.abs(Math.abs(p.ry) - Math.PI / 2) < 0.2;
      colliders.push(
        aabbFromCenter(p.x, 2.1, p.z, rotated ? d : w, 4.2, rotated ? w : d),
      );
    } else if (p.kind === "cloud") {
      const c = makeCloud(p.scale ?? 1);
      c.position.set(p.pos[0], p.pos[1], p.pos[2]);
      group.add(c);
    } else if (p.kind === "lollipop") {
      const l = makeLollipop(p.candy);
      l.position.set(p.x, 0, p.z);
      group.add(l);
      colliders.push(aabbFromCenter(p.x, 1.2, p.z, 0.3, 2.4, 0.3));
    }
  }

  if (level.id === "picnic") {
    const slide = makeSlide();
    slide.position.set(22, 0, 8);
    group.add(slide);
    colliders.push(aabbFromCenter(22, 1.3, 8, 2.2, 2.6, 2.2));
    const gazebo = makeGazebo();
    gazebo.position.set(8, 0, -6);
    group.add(gazebo);

    // fountain standing in the big pond
    const fountain = makeFountain();
    fountain.position.set(0, 0, -42);
    group.add(fountain);
    colliders.push(aabbFromCenter(0, 0.4, -42, 6.6, 0.8, 6.6));

    // banks, cattails and lily pads for both ponds
    for (const w of level.water ?? []) {
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
    colliders.push(aabbFromCenter(54.2, 1.8, -53, 1.4, 3.6, 1.4));
    colliders.push(aabbFromCenter(54.2, 3.55, -53, 5.2, 0.16, 5.2));

    // dark mouth set into the gap through the lookout hill
    // Turned to face south, out of the hill. Without this the hollow pointed
    // away from the hillside and the mouth opened into solid ground.
    const cave = makeCaveMouth(6, 4, 8);
    cave.position.set(-13, 0, 58.6);
    cave.rotation.y = Math.PI;
    group.add(cave);
    // two fills: one at the mouth so the way out is always visible from
    // inside, one deeper in so the chamber reads as a space
    const caveGlow = new THREE.PointLight("#8fd8e8", 0.7, 22);
    caveGlow.position.set(-13, 2.4, 64);
    group.add(caveGlow);
    const mouthGlow = new THREE.PointLight("#ffeec4", 0.9, 16);
    mouthGlow.position.set(-13, 2.6, 59.6);
    group.add(mouthGlow);
  }
  if (level.id === "village") {
    const f = makeFountain();
    f.position.set(0, 0, 0);
    group.add(f);
    colliders.push(aabbFromCenter(0, 0.7, 0, 4.2, 1.4, 4.2));
  }

  const dumplings: DumplingHandle[] = level.dumplings.map((def, i) => {
    const live = {
      ...def,
      pos: [def.pos[0], def.pos[1], def.pos[2]] as [number, number, number],
    };
    const g = makeDumpling(live.color, live.accent);
    const finish = applyFinish(g, live.finish ?? "plain", live.color, live.accent);
    g.position.set(live.pos[0], live.pos[1], live.pos[2]);
    g.name = live.id;
    group.add(g);
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

  let grassField: GrassField | null = null;
  if (!level.islands) {
    const mask = scatterMask(level, colliders, level.water ?? []);
    grassField = makeGrassField(level, mask);
    group.add(grassField.group);
  }

  return {
    group,
    colliders,
    dumplings,
    water: level.water ?? [],
    ground,
    textures,
    waterMats,
    grassField,
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
  world.grassField?.dispose();
  world.ground.geometry.dispose();
  (world.ground.material as THREE.Material).dispose();
  for (const t of world.textures) t.dispose();
  for (const m of world.waterMats) m.dispose();
}
