import * as THREE from "three";
import type { AABB } from "./collision";
import type { LevelDef, WaterZone } from "./types";

/**
 * Ground detail: instanced grass blades and flowers.
 * Everything here is procedural, no asset files.
 */

const BLADE_H = 0.62;

/**
 * OutlineEffect looks for outlineParameters on the MATERIAL's userData, not the
 * object's. Setting it on the mesh silently does nothing, which is how the sky
 * ended up wearing a brown outline shell.
 */
export function noOutline(obj: THREE.Mesh | THREE.InstancedMesh | THREE.Object3D) {
  const mat = (obj as THREE.Mesh).material;
  if (!mat) return;
  const list = Array.isArray(mat) ? mat : [mat];
  for (const m of list) m.userData.outlineParameters = { visible: false };
}

export type ScatterMask = {
  rects: { minX: number; maxX: number; minZ: number; maxZ: number }[];
  circles: { x: number; z: number; r: number }[];
  /**
   * Spatial index: cell key -> indices into rects (>= 0) and circles (encoded
   * as -1 - i). Without it every one of 150k blade candidates was tested
   * against ~2000 shapes, which was most of the park's load time.
   */
  grid: Map<number, number[]>;
};

const MASK_CELL = 8;
function maskKey(ix: number, iz: number) {
  return (ix + 2048) * 4096 + (iz + 2048);
}

export type GrassField = {
  group: THREE.Group;
  update: (t: number) => void;
  dispose: () => void;
};

/** Tapered, slightly curved blade with its pivot at the base. */
function bladeGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(0.075, BLADE_H, 1, 4);
  geo.translate(0, BLADE_H / 2, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp(y / BLADE_H, 0, 1);
    // taper toward the tip
    pos.setX(i, x * (1 - t * 0.88));
    // gentle forward curve so blades aren't dead flat
    pos.setZ(i, pos.getZ(i) + t * t * 0.1);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  // white base colour attribute so vertexColors + instanceColor both work
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3).fill(1);
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

function flowerGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.055, 6, 5);
  geo.scale(1, 0.7, 1);
  geo.translate(0, 0.3, 0);
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3).fill(1);
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

function inMask(mask: ScatterMask, x: number, z: number): boolean {
  const list = mask.grid.get(maskKey(Math.floor(x / MASK_CELL), Math.floor(z / MASK_CELL)));
  if (!list) return false;
  for (const i of list) {
    if (i >= 0) {
      const r = mask.rects[i]!;
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return true;
    } else {
      const c = mask.circles[-1 - i]!;
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz < c.r * c.r) return true;
    }
  }
  return false;
}

function indexMask(rects: ScatterMask["rects"], circles: ScatterMask["circles"]): Map<number, number[]> {
  const grid = new Map<number, number[]>();
  const add = (minX: number, maxX: number, minZ: number, maxZ: number, id: number) => {
    for (let ix = Math.floor(minX / MASK_CELL); ix <= Math.floor(maxX / MASK_CELL); ix++) {
      for (let iz = Math.floor(minZ / MASK_CELL); iz <= Math.floor(maxZ / MASK_CELL); iz++) {
        const k = maskKey(ix, iz);
        const l = grid.get(k);
        if (l) l.push(id);
        else grid.set(k, [id]);
      }
    }
  };
  rects.forEach((r, i) => add(r.minX, r.maxX, r.minZ, r.maxZ, i));
  circles.forEach((c, i) => add(c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r, -1 - i));
  return grid;
}

/** Build the exclusion mask from flat props, colliders and water. */
export function scatterMask(level: LevelDef, colliders: AABB[], water: WaterZone[]): ScatterMask {
  const rects: ScatterMask["rects"] = [];
  const circles: ScatterMask["circles"] = [];

  // Any paved surface or ground-level prop. Grass must not grow through decks,
  // paths, court surfaces or fountain basins, and those are not all boxes.
  const pad = 0.35;
  for (const p of level.props) {
    if (p.kind === "box") {
      const isSurface = p.size[1] <= 0.6;
      if (!isSurface && p.pos[1] > 1.2) continue;
      const hx = Math.abs(p.size[0]) / 2 + pad;
      const hz = Math.abs(p.size[2]) / 2 + pad;
      // rotated props get a conservative square bound
      const ry = p.ry ?? 0;
      const r = ry !== 0 ? Math.max(hx, hz) : 0;
      rects.push({
        minX: p.pos[0] - (r || hx),
        maxX: p.pos[0] + (r || hx),
        minZ: p.pos[2] - (r || hz),
        maxZ: p.pos[2] + (r || hz),
      });
    } else if (p.kind === "cyl") {
      // discs, basins and pads, whether or not they collide
      circles.push({ x: p.pos[0], z: p.pos[2], r: p.r + pad });
    } else if (p.kind === "house") {
      const hx = (p.w ?? 6) / 2 + pad;
      const hz = (p.d ?? 5) / 2 + pad;
      rects.push({ minX: p.x - hx, maxX: p.x + hx, minZ: p.z - hz, maxZ: p.z + hz });
    }
  }

  for (const c of colliders) {
    rects.push({
      minX: c.minX - 0.2,
      maxX: c.maxX + 0.2,
      minZ: c.minZ - 0.2,
      maxZ: c.maxZ + 0.2,
    });
  }

  for (const w of water) {
    circles.push({ x: w.x, z: w.z, r: w.r + 0.6 });
  }

  return { rects, circles, grid: indexMask(rects, circles) };
}

export function makeGrassField(
  level: LevelDef,
  mask: ScatterMask,
  opts?: { blades?: number; flowers?: number },
): GrassField {
  const group = new THREE.Group();
  const b = level.bounds;
  const spanX = b.maxX - b.minX;
  const spanZ = b.maxZ - b.minZ;

  // density has to follow the footprint or a bigger park just looks balder
  const area = spanX * spanZ;
  // caps raised for the 320m park; one instanced draw call either way
  const bladeTarget = opts?.blades ?? Math.round(THREE.MathUtils.clamp(area * 2.0, 30000, 150000));
  const flowerTarget = opts?.flowers ?? Math.round(THREE.MathUtils.clamp(area * 0.08, 900, 5000));

  const uniforms = { uTime: { value: 0 } };

  const bladeMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.86,
    metalness: 0,
    side: THREE.DoubleSide,
    vertexColors: true,
  });

  bladeMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         #ifdef USE_INSTANCING
           float ix = instanceMatrix[3][0];
           float iz = instanceMatrix[3][2];
         #else
           float ix = 0.0;
           float iz = 0.0;
         #endif
         float bend = pow(clamp(transformed.y / ${BLADE_H.toFixed(3)}, 0.0, 1.0), 1.55);
         float gust = sin(uTime * 0.37 + ix * 0.055 + iz * 0.041) * 0.5 + 0.5;
         float sway = sin(uTime * 1.7 + ix * 0.42 + iz * 0.31);
         float cross = cos(uTime * 1.24 + iz * 0.37);
         transformed.x += sway * bend * (0.055 + gust * 0.135);
         transformed.z += cross * bend * (0.03 + gust * 0.05);`,
      );
  };
  // force a unique program so the injection is not shared with other standard materials
  bladeMat.customProgramCacheKey = () => "sloanie-grass-wind";

  const bladeGeo = bladeGeometry();
  const blades = new THREE.InstancedMesh(bladeGeo, bladeMat, bladeTarget);
  blades.castShadow = false;
  blades.receiveShadow = true;
  noOutline(blades);

  const flowerGeo = flowerGeometry();
  const flowerMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.7,
    metalness: 0,
    vertexColors: true,
  });
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, flowerTarget);
  flowers.castShadow = false;
  flowers.receiveShadow = true;
  noOutline(flowers);

  const base = new THREE.Color(level.grass || "#4fa056");
  const dark = base.clone().multiplyScalar(0.62);
  const light = base.clone().lerp(new THREE.Color("#e8f6a8"), 0.45);

  const flowerPalette = ["#f6d75e", "#e8697d", "#f2f2f2", "#b98ce0", "#f59b4a"].map(
    (h) => new THREE.Color(h),
  );

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();

  let placed = 0;
  let attempts = 0;
  const maxAttempts = bladeTarget * 6;
  while (placed < bladeTarget && attempts < maxAttempts) {
    attempts++;
    const x = b.minX + Math.random() * spanX;
    const z = b.minZ + Math.random() * spanZ;
    if (inMask(mask, x, z)) continue;

    // clump: most blades sit in tufts so the field is not uniform noise
    const tuft = Math.random() < 0.72;
    const jx = tuft ? (Math.random() - 0.5) * 0.5 : 0;
    const jz = tuft ? (Math.random() - 0.5) * 0.5 : 0;

    euler.set(
      (Math.random() - 0.5) * 0.22,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.22,
    );
    q.setFromEuler(euler);
    pos.set(x + jx, level.groundY ?? 0, z + jz);
    const s = 0.62 + Math.random() * 0.75;
    scl.set(0.8 + Math.random() * 0.5, s, 1);
    m.compose(pos, q, scl);
    blades.setMatrixAt(placed, m);

    const mix = Math.random();
    col.copy(mix > 0.72 ? light : mix > 0.3 ? base : dark);
    col.offsetHSL(0, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.07);
    blades.setColorAt(placed, col);
    placed++;
  }
  blades.count = placed;
  blades.instanceMatrix.needsUpdate = true;
  if (blades.instanceColor) blades.instanceColor.needsUpdate = true;

  let fplaced = 0;
  attempts = 0;
  while (fplaced < flowerTarget && attempts < flowerTarget * 12) {
    attempts++;
    const x = b.minX + Math.random() * spanX;
    const z = b.minZ + Math.random() * spanZ;
    if (inMask(mask, x, z)) continue;
    euler.set(0, Math.random() * Math.PI * 2, 0);
    q.setFromEuler(euler);
    pos.set(x, level.groundY ?? 0, z);
    const s = 0.75 + Math.random() * 0.6;
    scl.set(s, s, s);
    m.compose(pos, q, scl);
    flowers.setMatrixAt(fplaced, m);
    flowers.setColorAt(fplaced, flowerPalette[(Math.random() * flowerPalette.length) | 0]);
    fplaced++;
  }
  flowers.count = fplaced;
  flowers.instanceMatrix.needsUpdate = true;
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;

  // InstancedMesh culling uses the source geometry bounds, which are tiny.
  // Give both meshes a sphere that actually covers the field.
  const radius = Math.max(spanX, spanZ);
  const centre = new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  blades.boundingSphere = new THREE.Sphere(centre.clone(), radius);
  flowers.boundingSphere = new THREE.Sphere(centre.clone(), radius);
  bladeGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, BLADE_H / 2, 0), BLADE_H);
  flowerGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.3, 0), 0.4);

  group.add(blades, flowers);

  return {
    group,
    update: (t: number) => {
      uniforms.uTime.value = t;
    },
    dispose: () => {
      bladeGeo.dispose();
      flowerGeo.dispose();
      bladeMat.dispose();
      flowerMat.dispose();
      blades.dispose();
      flowers.dispose();
    },
  };
}

/**
 * Derive a normal map from an existing canvas texture using a Sobel filter on
 * luminance. Gives painted surfaces real relief under the directional light.
 */
export function normalFromTexture(src: THREE.Texture, strength = 2.2): THREE.Texture | null {
  const img = src.image as HTMLCanvasElement | undefined;
  if (!img || !img.width) return null;

  const w = img.width;
  const h = img.height;
  const read = document.createElement("canvas");
  read.width = w;
  read.height = h;
  const rg = read.getContext("2d");
  if (!rg) return null;
  rg.drawImage(img, 0, 0);
  const data = rg.getImageData(0, 0, w, h).data;

  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
  }

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const og = out.getContext("2d");
  if (!og) return null;
  const outData = og.createImageData(w, h);

  const at = (x: number, y: number) => lum[((y + h) % h) * w + ((x + w) % w)];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      let nx = dx * strength;
      let ny = dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      const i = (y * w + x) * 4;
      outData.data[i] = (nx * 0.5 + 0.5) * 255;
      outData.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      outData.data[i + 2] = (nz / len) * 0.5 * 255 + 127.5;
      outData.data[i + 3] = 255;
    }
  }
  og.putImageData(outData, 0, 0);

  const tex = new THREE.CanvasTexture(out);
  tex.wrapS = src.wrapS;
  tex.wrapT = src.wrapT;
  tex.repeat.copy(src.repeat);
  tex.anisotropy = src.anisotropy;
  tex.needsUpdate = true;
  return tex;
}
