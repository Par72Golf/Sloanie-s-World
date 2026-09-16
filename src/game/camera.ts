import * as THREE from "three";
import type { AABB } from "./collision";

/**
 * Third-person camera placement, as a pure function so tools/camera.ts can
 * walk a route headlessly and count how often the camera misbehaves.
 *
 * Two regimes:
 *  - outdoors: a 7.4m boom at 3.9m, pulled in along the eye-to-camera ray when
 *    something solid is in the way
 *  - indoors (a collider above her within 7m): a 3.6m boom at 1.75m, clamped
 *    under the ceiling, because the long boom does not fit in any interior
 *
 * Low obstacles are the third case, and the one the maze exposed. A 1.7m hedge
 * a metre behind her does cut the eye-to-camera line, but pulling the camera
 * into her back for it is wrong: the camera should look over it. So when the
 * blocker's top is below `LOW_TOP` above her feet, the boom is lifted just
 * enough to clear it (capped at `LIFT_MAX`), and only if the view is still
 * blocked after that does it pull in.
 */

export const CAM = {
  dist: 7.4,
  height: 3.9,
  indoorDist: 3.6,
  indoorHeight: 1.75,
  titleDist: 4.6,
  titleHeight: 1.7,
  /** obstacles whose top is under this (above her feet) are looked over, not pulled in for */
  LOW_TOP: 2.4,
  /** how far above her feet the camera may be lifted to see over something */
  LIFT_MAX: 6.4,
  /** vertical clearance kept between the sight line and a low obstacle's top */
  LIFT_MARGIN: 0.4,
} as const;

export type CameraInput = {
  boxes: AABB[];
  cap: { x: number; y: number; z: number };
  cameraYaw: number;
  /** current indoor blend, 0..1 */
  indoor: number;
  title: boolean;
  snap: boolean;
  dt: number;
  /** look over low obstacles instead of pulling in; off reproduces the pre-v2.9 camera */
  liftLow?: boolean;
};

export type CameraResult = {
  indoor: number;
  ceiling: number;
  /** fraction of the boom kept after occlusion, 1 = untouched */
  keep: number;
  /** metres the camera was lifted to see over a low obstacle */
  lift: number;
  /** true when the fallback "camera on her head" position was used */
  emergency: boolean;
};

function blockerAt(boxes: AABB[], x: number, y: number, z: number, pad: number): AABB | null {
  for (const b of boxes) {
    if (
      x > b.minX - pad &&
      x < b.maxX + pad &&
      y > b.minY &&
      y < b.maxY &&
      z > b.minZ - pad &&
      z < b.maxZ + pad
    ) {
      return b;
    }
  }
  return null;
}

const STEPS = 16;

/** Writes the desired camera position into `desired` and returns the bookkeeping. */
export function placeCamera(inp: CameraInput, desired: THREE.Vector3): CameraResult {
  const { boxes, cap, title } = inp;
  const liftLow = inp.liftLow ?? true;

  // ---- is she under a roof? ------------------------------------------
  let ceiling = Infinity;
  if (!title) {
    for (const b of boxes) {
      if (b.minY < cap.y + 1.7) continue;
      if (cap.x < b.minX - 1.2 || cap.x > b.maxX + 1.2) continue;
      if (cap.z < b.minZ - 1.2 || cap.z > b.maxZ + 1.2) continue;
      ceiling = Math.min(ceiling, b.minY);
    }
  }
  const wantIndoor = ceiling < cap.y + 7 ? 1 : 0;
  const blend = inp.snap ? 1 : 1 - Math.exp(-3.4 * inp.dt);
  let indoor = inp.indoor + (wantIndoor - inp.indoor) * blend;
  if (indoor < 0.001) indoor = 0;
  if (indoor > 0.999) indoor = 1;

  const cfX = -Math.sin(inp.cameraYaw);
  const cfZ = -Math.cos(inp.cameraYaw);
  const dist = title ? CAM.titleDist : THREE.MathUtils.lerp(CAM.dist, CAM.indoorDist, indoor);
  const height = title ? CAM.titleHeight : THREE.MathUtils.lerp(CAM.height, CAM.indoorHeight, indoor);

  desired.set(cap.x - cfX * dist, cap.y + height, cap.z - cfZ * dist);

  let keep = 1;
  let lift = 0;
  let emergency = false;

  if (!title) {
    if (ceiling < Infinity) {
      desired.y = Math.min(desired.y, ceiling - 0.45);
      desired.y = Math.max(desired.y, cap.y + 0.9);
    }

    const eyeY = cap.y + 1.2;

    // March from her eyes to the camera and find the first solid thing.
    const march = (): { i: number; box: AABB } | null => {
      for (let i = 1; i <= STEPS; i++) {
        const t = i / STEPS;
        const x = cap.x + (desired.x - cap.x) * t;
        const y = eyeY + (desired.y - eyeY) * t;
        const z = cap.z + (desired.z - cap.z) * t;
        const box = blockerAt(boxes, x, y, z, 0.3);
        if (box) return { i, box };
      }
      return null;
    };

    let hit = march();

    // Low blocker outdoors: lift the boom so the sight line clears its top,
    // then look again. Lifting never applies indoors; the ceiling clamp wins.
    if (hit && liftLow && indoor < 0.5 && hit.box.maxY <= cap.y + CAM.LOW_TOP) {
      const t = hit.i / STEPS;
      const needY = eyeY + (hit.box.maxY + CAM.LIFT_MARGIN - eyeY) / t;
      const capY = cap.y + CAM.LIFT_MAX;
      const newY = Math.min(capY, Math.max(desired.y, needY));
      lift = newY - desired.y;
      desired.y = newY;
      hit = march();
    }

    if (hit) {
      const u = Math.max(0.16, (hit.i - 1) / STEPS);
      keep = u;
      desired.set(
        cap.x + (desired.x - cap.x) * u,
        eyeY + (desired.y - eyeY) * u,
        cap.z + (desired.z - cap.z) * u,
      );
    }

    if (blockerAt(boxes, desired.x, desired.y, desired.z, 0.1)) {
      desired.set(cap.x, cap.y + 1.9, cap.z);
      emergency = true;
      keep = 0;
    }
  }

  return { indoor, ceiling, keep, lift, emergency };
}
