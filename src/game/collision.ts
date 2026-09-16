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
      if (rise > 0.0005 && rise <= STEP_UP && overlapXZ(next, b)) {
        c.y = b.maxY + SKIN;
        vy = 0;
      }
    }
  }

  c.x += vx * dt;
  for (const b of boxes) {
    if (b.maxY - c.y <= FLOOR_TOLERANCE) continue;
    if (!overlapZY(c, b)) continue;
    if (c.x + c.hw <= b.minX || c.x - c.hw >= b.maxX) continue;
    if (vx > 0) c.x = b.minX - c.hw - SKIN;
    else if (vx < 0) c.x = b.maxX + c.hw + SKIN;
    else {
      const left = c.x + c.hw - b.minX;
      const right = b.maxX - (c.x - c.hw);
      c.x = left < right ? b.minX - c.hw - SKIN : b.maxX + c.hw + SKIN;
    }
    vx = 0;
  }

  c.z += vz * dt;
  for (const b of boxes) {
    if (b.maxY - c.y <= FLOOR_TOLERANCE) continue;
    if (!overlapXY(c, b)) continue;
    if (c.z + c.hd <= b.minZ || c.z - c.hd >= b.maxZ) continue;
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
      if (rise > 0.0005 && rise <= STEP_UP) {
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
