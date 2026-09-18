import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Static-mesh merging.
 *
 * The park is ~3000 small meshes. The GPU does not mind, but issuing ~1500 draw
 * calls a frame from JavaScript does: on 16 Sept 2026 the CPU submit time alone
 * was 20-30ms at 1080p, and removing every blade of grass or every shadow barely
 * moved it. So after the world is built, every mesh that never moves is baked
 * into its world transform and merged with its neighbours that share the same
 * material, the same shadow flags and the same spatial cell. One draw call
 * replaces dozens.
 *
 * Cells keep frustum culling useful: a single 240m mesh would be drawn every
 * frame from every angle, and the shadow camera would have to render it too.
 *
 * What is never merged:
 *  - anything under a subtree the caller marks as live (dumplings, beams)
 *  - anything under a group with userData.cloudDrift (the drifting clouds)
 *  - instanced meshes (grass, flowers, tufts are already one call each)
 *  - transparent materials (merging breaks per-object depth sorting)
 *  - shader materials (water)
 *  - a mesh that is alone in its bucket (nothing to gain, and it keeps its
 *    own bounding sphere for culling)
 */

export type MergeReport = {
  /** Meshes examined. */
  candidates: number;
  /** Meshes that were removed and folded into a merged mesh. */
  merged: number;
  /** Merged meshes created. */
  created: number;
  /** Meshes left in place (singletons, transparent, live). */
  kept: number;
  /** Triangles across all merged input, for the conservation check. */
  trianglesIn: number;
  trianglesOut: number;
};

type Bucket = {
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  meshes: THREE.Mesh[];
};

function attributeSignature(g: THREE.BufferGeometry) {
  return `${g.index ? "i" : "n"}:${Object.keys(g.attributes).sort().join(",")}`;
}

function triangleCount(g: THREE.BufferGeometry) {
  const n = g.index ? g.index.count : g.attributes.position?.count ?? 0;
  return Math.floor(n / 3);
}

export function mergeStatic(
  root: THREE.Object3D,
  opts: { live?: Set<THREE.Object3D>; cell?: number; cellAbove?: number } = {},
): { report: MergeReport; geometries: THREE.BufferGeometry[] } {
  const cell = opts.cell ?? 80;
  // A material used only a handful of times gets one mesh for the whole park.
  // Splitting those by cell produced hundreds of singleton buckets that could
  // not merge at all. Only materials with many meshes are worth culling by cell.
  const cellAbove = opts.cellAbove ?? 40;
  const live = opts.live ?? new Set<THREE.Object3D>();
  root.updateMatrixWorld(true);

  const buckets = new Map<string, Bucket>();
  const perMaterial = new Map<string, number>();
  const report: MergeReport = {
    candidates: 0,
    merged: 0,
    created: 0,
    kept: 0,
    trianglesIn: 0,
    trianglesOut: 0,
  };

  // Collect first, mutate after; never reparent while traversing.
  const skipped = new Set<THREE.Object3D>();
  const wp = new THREE.Vector3();
  const eligible: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o === root) return;
    const parent = o.parent;
    if (
      live.has(o) ||
      o.userData.cloudDrift ||
      (parent && skipped.has(parent))
    ) {
      skipped.add(o);
      return;
    }
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
    report.candidates++;
    const mat = m.material;
    if (Array.isArray(mat) || !(mat as THREE.MeshStandardMaterial).isMeshStandardMaterial || mat.transparent) {
      report.kept++;
      return;
    }
    if (!m.geometry.attributes.position) {
      report.kept++;
      return;
    }
    eligible.push(m);
    perMaterial.set(mat.uuid, (perMaterial.get(mat.uuid) ?? 0) + 1);
  });

  for (const m of eligible) {
    const mat = m.material as THREE.Material;
    let cellKey = "";
    if ((perMaterial.get(mat.uuid) ?? 0) > cellAbove) {
      m.getWorldPosition(wp);
      cellKey = `${Math.floor(wp.x / cell)},${Math.floor(wp.z / cell)}`;
    }
    const key = `${mat.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${attributeSignature(m.geometry)}|${cellKey}`;
    let b = buckets.get(key);
    if (!b) {
      b = { material: mat, castShadow: m.castShadow, receiveShadow: m.receiveShadow, meshes: [] };
      buckets.set(key, b);
    }
    b.meshes.push(m);
  }

  const geometries: THREE.BufferGeometry[] = [];
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) {
      report.kept += b.meshes.length;
      continue;
    }
    const parts: THREE.BufferGeometry[] = [];
    for (const m of b.meshes) {
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      // applyMatrix4 handles normals; drop anything mergeGeometries would choke on
      for (const name of Object.keys(g.attributes)) {
        if (name === "position" || name === "normal" || name === "uv") continue;
        g.deleteAttribute(name);
      }
      g.morphAttributes = {};
      /*
       * A bucket fails as a whole if one member is missing an attribute the
       * others have, so fill the gaps rather than losing the batch: a new prop
       * built from a helper without uvs used to knock its whole cell out of
       * the merge (and print a three.js error on every load).
       */
      if (!g.attributes.normal) g.computeVertexNormals();
      // mergeGeometries also refuses a mix of indexed and non-indexed members
      if (!g.attributes.uv) {
        const n = g.attributes.position!.count;
        g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      }
      parts.push(g);
      report.trianglesIn += triangleCount(g);
    }
    const anyIndexed = parts.some((p) => p.index);
    const ready = anyIndexed && parts.some((p) => !p.index) ? parts.map((p) => (p.index ? p.toNonIndexed() : p)) : parts;
    const mergedGeo = mergeGeometries(ready, false);
    if (!mergedGeo) {
      console.warn(
        "[merge] bucket failed:",
        ready.map((p) => `${Object.keys(p.attributes).sort().join("+")}${p.index ? "/idx" : ""}`).join(" | "),
        b.meshes.slice(0, 3).map((m) => m.name || m.type).join(","),
      );
    }
    for (const p of parts) p.dispose();
    if (!mergedGeo) {
      // attribute mismatch inside a bucket; leave these meshes as they were
      report.kept += b.meshes.length;
      continue;
    }
    mergedGeo.computeBoundingSphere();
    mergedGeo.computeBoundingBox();
    report.trianglesOut += triangleCount(mergedGeo);
    geometries.push(mergedGeo);

    for (const m of b.meshes) m.removeFromParent();
    const merged = new THREE.Mesh(mergedGeo, b.material);
    merged.castShadow = b.castShadow;
    merged.receiveShadow = b.receiveShadow;
    merged.name = "merged";
    merged.userData.outlineParameters = { visible: false };
    root.add(merged);
    report.merged += b.meshes.length;
    report.created++;
  }

  return { report, geometries };
}
