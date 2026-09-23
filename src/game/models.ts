import * as THREE from "three";
import { makeFountain, makeGazebo, makeSlide, makeTreehouse } from "./meshes";
import type { AABB } from "./collision";
import type { ModelProp } from "./types";

/**
 * Named procedural models a level can place with a `model` prop.
 *
 * Before this, every composite mesh in the park (the slide, the gazebo, the
 * fountain, the treehouse) was drawn by a hand-written line in world-build.ts
 * under `level.id === "picnic"`, with its collider hand-copied into
 * colliders.ts. Two files to keep in step, per model, per park. Here a model
 * is registered once with its factory and the boxes it is solid at, and both
 * the mesh and the collider come from that one entry.
 *
 * Boxes are in the model's own frame, feet on y 0, the way the factory draws
 * it. `makeModel` stamps them onto `group.userData.boxes` so anything holding
 * the group can see what it is solid at; `modelBoxes` reads them without
 * building anything, which is what colliders.ts and the headless tools need —
 * the mesh factories touch `document` for their textures and cannot run in
 * node at all.
 */

/** A solid box in the model's own frame, feet on y 0. */
export type ModelBox = AABB & {
  /** what the collider is called in tools output; the model id when absent */
  label?: string;
};

/** Built fresh each time: the caller owns the group and what it holds. */
export type ModelFactory = (variant: number, scale: number) => THREE.Group;

const FACTORIES = new Map<string, ModelFactory>();
const BOXES = new Map<string, readonly ModelBox[]>();

/**
 * Register a model. Call it at module scope from anywhere the level's own
 * module imports — a park's scenery file is the natural home for its own
 * models. Registration is a map write, so it cannot pull colliders.ts or
 * world-build.ts into a cycle.
 */
export function registerModel(id: string, boxes: readonly ModelBox[], factory: ModelFactory) {
  FACTORIES.set(id, factory);
  BOXES.set(id, boxes);
}

/** What `id` is solid at, in its own frame. Unknown ids are not solid. */
export function modelBoxes(id: string): readonly ModelBox[] {
  return BOXES.get(id) ?? [];
}

/** Every registered model id, for the tools that sweep all of them. */
export function modelIds(): string[] {
  return [...FACTORIES.keys()];
}

/** The factory itself, whose own `userData.boxes` makeModel replaces. */
export function modelFactory(id: string): ModelFactory | undefined {
  return FACTORIES.get(id);
}

/**
 * The model's group, already carrying its boxes. An unregistered id draws
 * nothing rather than throwing: a missing model should leave a hole in the
 * park, not take the whole park down.
 */
export function makeModel(id: string, variant = 0, scale = 1): THREE.Group {
  const f = FACTORIES.get(id);
  if (!f) {
    console.warn(`[models] no model registered as "${id}"`);
    return new THREE.Group();
  }
  const g = f(variant, scale);
  g.userData.boxes = modelBoxes(id);
  return g;
}

/**
 * World AABBs for a placed model. A quarter turn is applied exactly, snapped
 * off cos/sin so a box that should be axis-aligned is, the way the tractor's
 * collider has always been; any other angle gets the bounding box of the
 * turned footprint, which is conservative — it never lets her through
 * something solid, but it is wider than the model at 45 degrees.
 */
export function modelColliders(p: ModelProp): (AABB & { label: string })[] {
  const s = p.scale ?? 1;
  const ry = p.ry ?? 0;
  const quarter = Math.abs(ry % (Math.PI / 2)) < 1e-6;
  const cos = quarter ? Math.round(Math.cos(ry)) : Math.cos(ry);
  const sin = quarter ? Math.round(Math.sin(ry)) : Math.sin(ry);
  const y0 = p.y ?? 0;
  return modelBoxes(p.id).map((b) => {
    // the same turn three.js applies for rotation.y: (lx, lz) -> (lx c + lz s, -lx s + lz c)
    const xs: number[] = [];
    const zs: number[] = [];
    for (const lx of [b.minX * s, b.maxX * s]) {
      for (const lz of [b.minZ * s, b.maxZ * s]) {
        xs.push(lx * cos + lz * sin);
        zs.push(-lx * sin + lz * cos);
      }
    }
    return {
      minX: p.x + Math.min(...xs),
      maxX: p.x + Math.max(...xs),
      minY: y0 + b.minY * s,
      maxY: y0 + b.maxY * s,
      minZ: p.z + Math.min(...zs),
      maxZ: p.z + Math.max(...zs),
      label: b.label ?? p.id,
    };
  });
}

/**
 * The park's composite landmarks. Their boxes are exactly the ones
 * colliders.ts used to carry by hand for the picnic park, so moving them here
 * moves nothing. The gazebo has none on purpose: it is a roof on thin posts
 * she is meant to walk in and out of.
 */
const box = (w: number, minY: number, maxY: number, d: number, label?: string): ModelBox => ({
  minX: -w / 2,
  maxX: w / 2,
  minY,
  maxY,
  minZ: -d / 2,
  maxZ: d / 2,
  label,
});

registerModel("slide", [box(2.2, 0, 2.6, 2.2, "slide")], () => makeSlide());
registerModel("gazebo", [], () => makeGazebo());
registerModel("fountain", [box(6.6, 0, 0.8, 6.6, "fountain")], () => makeFountain());
registerModel(
  "treehouse",
  [box(1.4, 0, 3.6, 1.4, "treehouse trunk"), box(5.2, 3.47, 3.63, 5.2, "treehouse deck")],
  () => makeTreehouse(),
);
