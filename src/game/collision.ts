export type AABB = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

export function aabbFromCenter(
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
): AABB {
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  return {
    minX: x - hx,
    maxX: x + hx,
    minY: y - hy,
    maxY: y + hy,
    minZ: z - hz,
    maxZ: z + hz,
  };
}

export type Capsule = {
  x: number;
  y: number;
  z: number;
  hw: number;
  h: number;
  hd: number;
};

function overlapXZ(c: Capsule, b: AABB) {
  return (
    c.x - c.hw < b.maxX &&
    c.x + c.hw > b.minX &&
    c.z - c.hd < b.maxZ &&
    c.z + c.hd > b.minZ
  );
}

function overlapXY(c: Capsule, b: AABB) {
  return (
    c.x - c.hw < b.maxX &&
    c.x + c.hw > b.minX &&
    c.y < b.maxY &&
    c.y + c.h > b.minY
  );
}

function overlapZY(c: Capsule, b: AABB) {
  return (
    c.z - c.hd < b.maxZ &&
    c.z + c.hd > b.minZ &&
    c.y < b.maxY &&
    c.y + c.h > b.minY
  );
}

const SKIN = 0.002;
/**
 * A box whose top is within this of her feet is floor, not wall. The step-up
 * pre-pass used to start at 0.02, and the wall sweeps blocked anything her
 * feet were below, so a rise between 0 and 2cm was a wall she could not see:
 * the walkway crossing near spawn (8cm onto 10cm) and the infield dirt at the
 * ball diamond (3cm onto 5cm) were both invisible walls for exactly this.
 */
const FLOOR_TOLERANCE = 0.03;
const STEP_UP = 0.62;

/**
 * Room for her to stand at height y over the capsule's footprint: nothing
 * overhead cuts into her. The auto step-up checks this, or stepping onto a
 * low pad under an overhang pushes her head into the thing above and the
 * overlap resolution pops her on top of it (found by tools/berm.ts at the
 * play structure near the picnic tables: a 26cm pad under a post, 3.3m pop).
 */
function headroom(c: Capsule, y: number, boxes: AABB[], ignore: AABB) {
  for (const o of boxes) {
    if (o === ignore || !overlapXZ(c, o)) continue;
    if (o.minY < y + c.h && o.maxY > y + FLOOR_TOLERANCE) return false;
  }
  return true;
}

export function moveAndCollide(
  c: Capsule,
  vx: number,
  vy: number,
  vz: number,
  boxes: AABB[],
  dt: number,
  groundY: number,
) {
  let grounded = false;

  if (c.y <= groundY + 0.04) grounded = true;
  for (const b of boxes) {
    if (!overlapXZ(c, b)) continue;
    if (Math.abs(c.y - b.maxY) <= 0.08) grounded = true;
  }
  if (grounded) {
    const next = { ...c, x: c.x + vx * dt, z: c.z + vz * dt };
    for (const b of boxes) {
      const rise = b.maxY - c.y;
      if (rise > 0.0005 && rise <= STEP_UP && overlapXZ(next, b) && headroom(next, b.maxY + SKIN, boxes, b)) {
        c.y = b.maxY + SKIN;
        vy = 0;
      }
    }
  }

  // Each axis sweep only resolves against a box whose face she crossed on
  // that axis this step. Without that, landing beside the long side of a
  // 34m berm made the X sweep "push her out" through the far end, 20m away.
  const prevX = c.x;
  c.x += vx * dt;
  for (const b of boxes) {
    if (b.maxY - c.y <= FLOOR_TOLERANCE) continue;
    if (!overlapZY(c, b)) continue;
    if (c.x + c.hw <= b.minX || c.x - c.hw >= b.maxX) continue;
    const wasInsideX = prevX + c.hw > b.minX && prevX - c.hw < b.maxX;
    if (wasInsideX) continue;
    if (vx > 0) c.x = b.minX - c.hw - SKIN;
    else if (vx < 0) c.x = b.maxX + c.hw + SKIN;
    else {
      const left = c.x + c.hw - b.minX;
      const right = b.maxX - (c.x - c.hw);
      c.x = left < right ? b.minX - c.hw - SKIN : b.maxX + c.hw + SKIN;
    }
    vx = 0;
  }

  const prevZ = c.z;
  c.z += vz * dt;
  for (const b of boxes) {
    if (b.maxY - c.y <= FLOOR_TOLERANCE) continue;
    if (!overlapXY(c, b)) continue;
    if (c.z + c.hd <= b.minZ || c.z - c.hd >= b.maxZ) continue;
    const wasInsideZ = prevZ + c.hd > b.minZ && prevZ - c.hd < b.maxZ;
    if (wasInsideZ) continue;
    if (vz > 0) c.z = b.minZ - c.hd - SKIN;
    else if (vz < 0) c.z = b.maxZ + c.hd + SKIN;
    else {
      const near = c.z + c.hd - b.minZ;
      const far = b.maxZ - (c.z - c.hd);
      c.z = near < far ? b.minZ - c.hd - SKIN : b.maxZ + c.hd + SKIN;
    }
    vz = 0;
  }

  c.y += vy * dt;
  for (const b of boxes) {
    if (!overlapXZ(c, b)) continue;
    if (c.y + c.h <= b.minY || c.y >= b.maxY) continue;
    // Feet within FLOOR_TOLERANCE of the top: the wall sweeps let her in as
    // floor, so it is floor here too, even while she is still rising. Taking
    // it for a head bump put her head under the box's bottom: at the top of a
    // jump up a berm's long side that dropped her 2.5m inside the hill for a
    // step ("the berm resets you"). tools/berm.ts guards this.
    if (vy > 0 && b.maxY - c.y <= FLOOR_TOLERANCE) {
      c.y = b.maxY + SKIN;
      continue;
    }
    if (vy <= 0 && c.y + c.h * 0.5 >= b.maxY) {
      c.y = b.maxY + SKIN;
      vy = 0;
      grounded = true;
    } else if (vy > 0) {
      c.y = b.minY - c.h - SKIN;
      vy = 0;
    } else {
      c.y = b.maxY + SKIN;
      vy = 0;
      grounded = true;
    }
  }

  if (c.y <= groundY) {
    c.y = groundY;
    if (vy < 0) vy = 0;
    grounded = true;
  }

  if (grounded) {
    for (const b of boxes) {
      if (!overlapXZ(c, b)) continue;
      const rise = b.maxY - c.y;
      if (rise > 0.0005 && rise <= STEP_UP && headroom(c, b.maxY + SKIN, boxes, b)) {
        c.y = b.maxY + SKIN;
        vy = 0;
        grounded = true;
      }
    }
  }

  return { vx, vy, vz, grounded };
}

export function inCircle(
  x: number,
  z: number,
  cx: number,
  cz: number,
  r: number,
) {
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz <= r * r;
}
