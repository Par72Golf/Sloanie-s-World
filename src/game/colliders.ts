import { aabbFromCenter, type AABB } from "./collision";
import { TRAMPOLINE_TOP } from "./tuning";
import type { BoxProp, LevelDef, Prop } from "./types";

/**
 * The solidity rule and every collider the engine builds, in one pure module.
 *
 * world-build.ts uses this for the real game and the tools use it for their
 * checks, so the two can never disagree about what is solid. Before this the
 * layout checker kept its own copy and had drifted: it made tree trunks twice
 * as wide as the game does and treated thin handrails as walls the game lets
 * her walk through.
 *
 * Everything is solid except liquid, spray, and props the author marked
 * non-colliding that are also under 0.35m in both horizontal dimensions
 * (handrails, trim, tape). Colliders ignore rotation on purpose: addBox has
 * always pushed an axis-aligned box at the unrotated size.
 */

const SPRAY = new Set(["#cdeefb", "#e8f8ff", "#d6f2ff", "#f7f3e4"]);

/**
 * Actual liquid surfaces, listed explicitly. This used to be a colour-channel
 * heuristic and it turned every hedge into a walk-through wall. Keep the list.
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

/** Boxes too small to matter are not built at all. */
export function boxIsBuilt(p: BoxProp) {
  return !(p.size[0] < 0.15 && p.size[1] < 0.15);
}

export function boxIsSolid(p: BoxProp) {
  return isSolidProp(p.color) && !(p.collide === false && Math.min(p.size[0], p.size[2]) <= 0.35);
}

export type LabelledAABB = AABB & { label: string; index: number };

/** Every collider for a level, in the order world-build adds them. */
export function collidersFor(level: LevelDef): LabelledAABB[] {
  const out: LabelledAABB[] = [];
  const push = (b: AABB, label: string, index: number) => out.push({ ...b, label, index });

  level.props.forEach((p: Prop, i: number) => {
    if (p.kind === "box") {
      if (!boxIsBuilt(p) || !boxIsSolid(p)) return;
      push(aabbFromCenter(p.pos[0], p.pos[1], p.pos[2], p.size[0], p.size[1], p.size[2]), `box ${p.color}`, i);
    } else if (p.kind === "cyl") {
      if (!isSolidProp(p.color)) return;
      push(aabbFromCenter(p.pos[0], p.pos[1], p.pos[2], p.r * 1.6, p.h, p.r * 1.6), `cyl ${p.color}`, i);
    } else if (p.kind === "tree") {
      const s = p.scale ?? 1;
      push(aabbFromCenter(p.x, 1.1 * s, p.z, 0.45 * s, 2.2 * s, 0.45 * s), "tree", i);
    } else if (p.kind === "house") {
      const w = p.w ?? 6;
      const d = p.d ?? 5;
      const rotated = p.ry != null && Math.abs(Math.abs(p.ry) - Math.PI / 2) < 0.2;
      push(aabbFromCenter(p.x, 2.1, p.z, rotated ? d : w, 4.2, rotated ? w : d), "house", i);
    } else if (p.kind === "lollipop") {
      push(aabbFromCenter(p.x, 1.2, p.z, 0.3, 2.4, 0.3), "lollipop", i);
    } else if (p.kind === "tent") {
      push(aabbFromCenter(p.x, 1.0, p.z, 2.6, 2.0, 2.6), "tent", i);
    } else if (p.kind === "trampoline") {
      push(aabbFromCenter(p.x, TRAMPOLINE_TOP / 2, p.z, p.w, TRAMPOLINE_TOP, p.d), "trampoline", i);
    } else if (p.kind === "tyre") {
      push(aabbFromCenter(p.x, 0.14, p.z, p.r * 2, 0.28, p.r * 2), "tyre", i);
    } else if (p.kind === "tractor") {
      // body and wheels as one block; the cab roof is out of reach anyway
      const turned = Math.abs(Math.abs(p.ry ?? 0) - Math.PI / 2) < 0.2;
      push(aabbFromCenter(p.x, 0.8, p.z, turned ? 2.5 : 3.9, 1.6, turned ? 3.9 : 2.5), "tractor", i);
    }
  });

  if (level.splash) {
    // the little slide at the splash pad (composite mesh, see world-build)
    push(aabbFromCenter(level.splash.x + 10, 1.3, level.splash.z - 7, 2.2, 2.6, 2.2), "splash slide", -1);
  }
  if (level.campfire) {
    // stones and flames: low enough to see, high enough not to step over
    push(aabbFromCenter(level.campfire.x, 0.45, level.campfire.z, 2.8, 0.9, 2.8), "campfire", -1);
  }

  // the ferris wheel: foot pads, fence and boarding platform; nothing that moves
  if (level.ride) {
    const { x, z } = level.ride;
    for (const dz of [-2.2, 2.2]) for (const s of [-1, 1]) push(aabbFromCenter(x + s * 3.6, 0.25, z + dz, 0.9, 0.5, 0.9), "wheel foot", -1);
    push(aabbFromCenter(x, 0.45, z - 3.2, 14.4, 0.9, 0.12), "wheel fence", -1);
    push(aabbFromCenter(x - 7.2, 0.45, z, 0.12, 0.9, 6.4), "wheel fence", -1);
    push(aabbFromCenter(x + 7.2, 0.45, z, 0.12, 0.9, 6.4), "wheel fence", -1);
    push(aabbFromCenter(x - 4.5, 0.45, z + 3.2, 5.4, 0.9, 0.12), "wheel fence", -1);
    push(aabbFromCenter(x + 4.5, 0.45, z + 3.2, 5.4, 0.9, 0.12), "wheel fence", -1);
    push(aabbFromCenter(x, 0.3, z + 4.0, 3.2, 0.6, 1.6), "wheel platform", -1);
    push(aabbFromCenter(x, 0.15, z + 5.2, 3.2, 0.3, 0.8), "wheel step", -1);
  }

  // composite meshes the builder places by hand
  if (level.id === "picnic") {
    push(aabbFromCenter(22, 1.3, 8, 2.2, 2.6, 2.2), "slide", -1);
    push(aabbFromCenter(0, 0.4, -42, 6.6, 0.8, 6.6), "fountain", -1);
    push(aabbFromCenter(54.2, 1.8, -53, 1.4, 3.6, 1.4), "treehouse trunk", -1);
    push(aabbFromCenter(54.2, 3.55, -53, 5.2, 0.16, 5.2), "treehouse deck", -1);
  }
  if (level.id === "village") {
    push(aabbFromCenter(0, 0.7, 0, 4.2, 1.4, 4.2), "fountain", -1);
  }
  return out;
}
