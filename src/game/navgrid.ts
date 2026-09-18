import type { AABB } from "./collision";

/**
 * A coarse navigation grid for the characters who have to get across the park
 * on their own, which today means Emmett on his trike.
 *
 * Why this exists: his old steering was "point at her and sidestep when stuck".
 * That was fine when the park was lawns and a few berms. After the arrival
 * plaza, the walkways, the kite field, the duck pond, the flower garden, the
 * story circle, the fairground green, the zoo, the bowls club, the mini golf
 * and the lava course went in, a straight line from his yard to her is almost
 * never clear, and a local sidestep cannot see round a 30m building. He wedged,
 * circled, and only ever got home because of a 30 second teleport failsafe.
 *
 * The grid is built once per world from the real colliders (the same ones
 * collision.ts uses, so it can never disagree with what is solid) and cached on
 * the collider array, so rebuilding the world rebuilds it and nothing else
 * does. Everything after that is allocation-free: the A* scratch is a handful
 * of typed arrays sized to the grid, reused every search and cleared by a
 * generation stamp instead of a fill.
 *
 * Sizing: 1.5m cells over the 320m park is 214 x 214 = 45,796 cells, about
 * 1.2MB of scratch. A cell is free when a rider's box at the cell centre is
 * clear, which is the same test the rider's own steering does, so a path
 * through free cells is a path he can actually ride.
 */

export type NavRect = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Cell size in metres. 1.5m is finer than a trike and coarse enough to search fast. */
export const NAV_CELL = 1.5;

/**
 * Boxes below this are kerbs and slabs he rides over; boxes starting above
 * head height are roofs he rides under. Emmett's own steering uses the same
 * two numbers, and they have to stay in step or he will plan through a wall.
 */
const RIDE_OVER = 0.6;
const RIDE_UNDER = 1.6;

/** Step costs, in hundredths so they fit in a byte. Lawn is dearer than a path. */
const COST_PATH = 100;
const COST_OPEN = 145;
/** Added to any cell with a blocked neighbour, so he does not shave corners. */
const COST_WALL = 85;
const COST_MIN = COST_PATH / 100;

/** Give up and use the best node found so far rather than stall a frame. */
const MAX_EXPAND = 20000;
/** Longest raw cell path we will reconstruct. The park's diagonal is ~300 cells. */
const MAX_RAW = 4096;

const SQRT2 = Math.SQRT2;

export type PathStats = { expanded: number; ms: number; truncated: boolean };

export class NavGrid {
  readonly cell: number;
  readonly minX: number;
  readonly minZ: number;
  readonly nx: number;
  readonly nz: number;
  readonly cells: number;
  /** milliseconds the build took, for the tools */
  readonly buildMs: number;

  /** 1 where a rider's box at the cell centre hits something */
  private solid: Uint8Array;
  /** step cost in hundredths */
  private cost: Uint8Array;
  /** connected component of each free cell, -1 for blocked */
  private comp: Int32Array;
  /** how many free cells each component has */
  private compSize: Int32Array;
  readonly components: number;

  // ---- A* scratch, allocated once and reused
  private g: Float32Array;
  private from: Int32Array;
  private stamp: Int32Array;
  /** 1 open, 2 closed; only meaningful when stamp[i] === gen */
  private state: Uint8Array;
  private gen = 0;
  private hCell: Int32Array;
  private hKey: Float32Array;
  private heapPos: Int32Array;
  private heapN = 0;
  private raw: Int32Array;
  /** scratch for the component flood fill, reused as the ring-search queue */
  private queue: Int32Array;

  readonly stats: PathStats = { expanded: 0, ms: 0, truncated: false };
  /**
   * Where the last search actually aimed. When the target is somewhere he
   * cannot get to (she is in the maze, up the lookout, inside the carousel
   * fence) the goal snaps to the nearest cell he *can* reach and `goalSnapped`
   * says so, which is how the rider knows to wait there instead of grinding
   * against the fence between them.
   */
  goalX = 0;
  goalZ = 0;
  goalSnapped = false;

  constructor(
    bounds: NavRect,
    colliders: readonly AABB[],
    keepOut: readonly NavRect[],
    radius: number,
    margin: number,
    cell: number,
    /** ground worth preferring, such as the walkway network: cheaper to ride */
    prefer: readonly NavRect[] = [],
  ) {
    const t0 = now();
    this.cell = cell;
    this.minX = bounds.minX;
    this.minZ = bounds.minZ;
    this.nx = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell));
    this.nz = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cell));
    const n = this.nx * this.nz;
    this.cells = n;
    this.solid = new Uint8Array(n);
    this.cost = new Uint8Array(n);
    this.comp = new Int32Array(n);
    this.g = new Float32Array(n);
    this.from = new Int32Array(n);
    this.stamp = new Int32Array(n);
    this.state = new Uint8Array(n);
    this.hCell = new Int32Array(n);
    this.hKey = new Float32Array(n);
    this.heapPos = new Int32Array(n);
    this.raw = new Int32Array(MAX_RAW);
    this.queue = new Int32Array(n);
    this.cost.fill(COST_OPEN);

    // the park edge: his own steering clamps him this far inside the bounds
    const inMinX = bounds.minX + margin;
    const inMaxX = bounds.maxX - margin;
    const inMinZ = bounds.minZ + margin;
    const inMaxZ = bounds.maxZ - margin;
    for (let iz = 0; iz < this.nz; iz++) {
      const z = this.minZ + (iz + 0.5) * cell;
      const row = iz * this.nx;
      const outZ = z < inMinZ || z > inMaxZ;
      for (let ix = 0; ix < this.nx; ix++) {
        const x = this.minX + (ix + 0.5) * cell;
        if (outZ || x < inMinX || x > inMaxX) this.solid[row + ix] = 1;
      }
    }

    // Solids. A cell is blocked when a box of half-width `radius` at the cell
    // centre would overlap the collider, which is exactly the collider grown
    // by `radius` on each side, so this is a plain rasterise.
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i]!;
      // kerbs, slabs and painted decks are flat enough to ride straight over;
      // anything starting above head height he rides under
      if (b.maxY < RIDE_OVER || b.minY > RIDE_UNDER) continue;
      this.mark(b, radius, this.solid, 1);
    }
    for (let i = 0; i < keepOut.length; i++) this.mark(keepOut[i]!, radius, this.solid, 1);

    // The walkway network is passed in as rects rather than sniffed out of the
    // colliders, because world-build.ts strips their labels before the runtime
    // sees them: sniffing would give the tools a different park to the game.
    for (let i = 0; i < prefer.length; i++) this.mark(prefer[i]!, 0, this.cost, COST_PATH);

    // wall-hugging penalty, so a planned route leaves him room to steer
    for (let iz = 0; iz < this.nz; iz++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const i = iz * this.nx + ix;
        if (this.solid[i]) continue;
        if (this.anySolidAround(ix, iz)) this.cost[i] = Math.min(255, this.cost[i]! + COST_WALL);
      }
    }

    // Connected components. With these he can always be given a goal he can
    // actually reach: if she is up the lookout or inside the maze, the goal
    // snaps to the nearest cell in his own component instead of no path at all.
    this.comp.fill(-1);
    const sizes: number[] = [];
    let next = 0;
    for (let s = 0; s < n; s++) {
      if (this.solid[s] || this.comp[s]! >= 0) continue;
      const id = next++;
      let head = 0;
      let tail = 0;
      this.queue[tail++] = s;
      this.comp[s] = id;
      let count = 0;
      while (head < tail) {
        const c = this.queue[head++]!;
        count++;
        const cx = c % this.nx;
        const cz = (c - cx) / this.nx;
        for (let k = 0; k < 4; k++) {
          const nxi = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
          const nzi = cz + (k === 2 ? 1 : k === 3 ? -1 : 0);
          if (nxi < 0 || nzi < 0 || nxi >= this.nx || nzi >= this.nz) continue;
          const j = nzi * this.nx + nxi;
          if (this.solid[j] || this.comp[j]! >= 0) continue;
          this.comp[j] = id;
          this.queue[tail++] = j;
        }
      }
      sizes.push(count);
    }
    this.components = next;
    this.compSize = Int32Array.from(sizes);
    this.buildMs = now() - t0;
  }

  /** Rasterise a rect grown by `pad` into `into`, writing `value` at every cell centre inside. */
  private mark(r: NavRect, pad: number, into: Uint8Array, value: number) {
    const c = this.cell;
    let x0 = Math.ceil((r.minX - pad - this.minX) / c - 0.5);
    let x1 = Math.floor((r.maxX + pad - this.minX) / c - 0.5);
    let z0 = Math.ceil((r.minZ - pad - this.minZ) / c - 0.5);
    let z1 = Math.floor((r.maxZ + pad - this.minZ) / c - 0.5);
    if (x0 < 0) x0 = 0;
    if (z0 < 0) z0 = 0;
    if (x1 > this.nx - 1) x1 = this.nx - 1;
    if (z1 > this.nz - 1) z1 = this.nz - 1;
    for (let iz = z0; iz <= z1; iz++) {
      const row = iz * this.nx;
      for (let ix = x0; ix <= x1; ix++) into[row + ix] = value;
    }
  }

  private anySolidAround(ix: number, iz: number) {
    for (let dz = -1; dz <= 1; dz++) {
      const zz = iz + dz;
      if (zz < 0 || zz >= this.nz) return true;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = ix + dx;
        if (xx < 0 || xx >= this.nx) return true;
        if (this.solid[zz * this.nx + xx]) return true;
      }
    }
    return false;
  }

  /* ------------------------------------------------------------ queries */

  cellAt(x: number, z: number): number {
    const ix = Math.floor((x - this.minX) / this.cell);
    const iz = Math.floor((z - this.minZ) / this.cell);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return -1;
    return iz * this.nx + ix;
  }

  cellX(i: number) {
    return this.minX + ((i % this.nx) + 0.5) * this.cell;
  }

  cellZ(i: number) {
    return this.minZ + (Math.floor(i / this.nx) + 0.5) * this.cell;
  }

  /** True where a rider cannot stand. Outside the grid counts as blocked. */
  blockedAt(x: number, z: number) {
    const i = this.cellAt(x, z);
    return i < 0 || this.solid[i] === 1;
  }

  componentAt(x: number, z: number) {
    const i = this.cellAt(x, z);
    return i < 0 ? -1 : this.comp[i]!;
  }

  /** Free cells in the biggest component: the park proper, for tools and spot-picking. */
  get mainComponent() {
    let best = -1;
    let size = -1;
    for (let i = 0; i < this.compSize.length; i++) {
      if (this.compSize[i]! > size) {
        size = this.compSize[i]!;
        best = i;
      }
    }
    return best;
  }

  componentCells(id: number) {
    return id >= 0 && id < this.compSize.length ? this.compSize[id]! : 0;
  }

  /**
   * Nearest free cell to (x, z), searched ring by ring. With `want` >= 0 only
   * cells in that component count, which is how a goal he cannot reach becomes
   * the closest place he can.
   */
  nearestFree(x: number, z: number, want = -1, maxRings = 60): number {
    const ix0 = Math.floor((x - this.minX) / this.cell);
    const iz0 = Math.floor((z - this.minZ) / this.cell);
    const ok = (ix: number, iz: number) => {
      if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return -1;
      const i = iz * this.nx + ix;
      if (this.solid[i]) return -1;
      if (want >= 0 && this.comp[i] !== want) return -1;
      return i;
    };
    const first = ok(ix0, iz0);
    if (first >= 0) return first;
    for (let r = 1; r <= maxRings; r++) {
      let best = -1;
      let bestD = Infinity;
      for (let d = -r; d <= r; d++) {
        const cand = [
          ok(ix0 + d, iz0 - r),
          ok(ix0 + d, iz0 + r),
          ok(ix0 - r, iz0 + d),
          ok(ix0 + r, iz0 + d),
        ];
        for (let k = 0; k < 4; k++) {
          const i = cand[k]!;
          if (i < 0) continue;
          const dx = this.cellX(i) - x;
          const dz = this.cellZ(i) - z;
          const dd = dx * dx + dz * dz;
          if (dd < bestD) {
            bestD = dd;
            best = i;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** Straight ride from a to b with nothing in the way. Samples every half cell. */
  lineClear(x0: number, z0: number, x1: number, z1: number) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const d = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.ceil(d / (this.cell * 0.5));
    if (steps <= 0) return !this.blockedAt(x0, z0);
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      if (this.blockedAt(x0 + dx * t, z0 + dz * t)) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------- the heap */

  private heapPush(cell: number, key: number) {
    let pos = this.heapN++;
    this.hCell[pos] = cell;
    this.hKey[pos] = key;
    this.heapPos[cell] = pos;
    while (pos > 0) {
      const parent = (pos - 1) >> 1;
      if (this.hKey[parent]! <= this.hKey[pos]!) break;
      this.swapHeap(pos, parent);
      pos = parent;
    }
  }

  private heapLower(cell: number, key: number) {
    let pos = this.heapPos[cell]!;
    this.hKey[pos] = key;
    while (pos > 0) {
      const parent = (pos - 1) >> 1;
      if (this.hKey[parent]! <= this.hKey[pos]!) break;
      this.swapHeap(pos, parent);
      pos = parent;
    }
  }

  private heapPop() {
    const top = this.hCell[0]!;
    const last = --this.heapN;
    if (last > 0) {
      this.hCell[0] = this.hCell[last]!;
      this.hKey[0] = this.hKey[last]!;
      this.heapPos[this.hCell[0]!] = 0;
      let pos = 0;
      for (;;) {
        const l = pos * 2 + 1;
        const r = l + 1;
        let small = pos;
        if (l < last && this.hKey[l]! < this.hKey[small]!) small = l;
        if (r < last && this.hKey[r]! < this.hKey[small]!) small = r;
        if (small === pos) break;
        this.swapHeap(pos, small);
        pos = small;
      }
    }
    return top;
  }

  private swapHeap(a: number, b: number) {
    const ca = this.hCell[a]!;
    const cb = this.hCell[b]!;
    const ka = this.hKey[a]!;
    this.hCell[a] = cb;
    this.hCell[b] = ca;
    this.hKey[a] = this.hKey[b]!;
    this.hKey[b] = ka;
    this.heapPos[cb] = a;
    this.heapPos[ca] = b;
  }

  /* -------------------------------------------------------------- the search */

  /**
   * A* from (sx, sz) to (gx, gz), written into `out` as world waypoints
   * [x, z, x, z, ...] with the corners pulled straight. Returns how many
   * waypoints were written (so `n * 2` numbers). 0 means he should just steer
   * at the target himself.
   *
   * Nothing here allocates: every array is grid-sized and reused, and the
   * visited marks are a generation stamp rather than a fill.
   */
  findPath(sx: number, sz: number, gx: number, gz: number, out: Float32Array): number {
    const t0 = now();
    this.stats.expanded = 0;
    this.stats.truncated = false;
    this.stats.ms = 0;

    this.goalX = gx;
    this.goalZ = gz;
    this.goalSnapped = false;
    let start = this.cellAt(sx, sz);
    if (start < 0 || this.solid[start]) start = this.nearestFree(sx, sz, -1, 8);
    if (start < 0) return 0;
    const want = this.comp[start]!;
    let goal = this.cellAt(gx, gz);
    if (goal < 0 || this.solid[goal] || this.comp[goal] !== want) {
      goal = this.nearestFree(gx, gz, want, 80);
      this.goalSnapped = true;
    }
    if (goal < 0) return 0;
    if (this.goalSnapped) {
      this.goalX = this.cellX(goal);
      this.goalZ = this.cellZ(goal);
    }
    if (goal === start) {
      this.stats.ms = now() - t0;
      return 0;
    }

    const cellSize = this.cell;
    const gxCell = goal % this.nx;
    const gzCell = (goal - gxCell) / this.nx;
    const h = (i: number) => {
      const ix = i % this.nx;
      const iz = (i - ix) / this.nx;
      const dx = Math.abs(ix - gxCell);
      const dz = Math.abs(iz - gzCell);
      // octile distance, the tight admissible heuristic for 8-way movement
      return (dx + dz + (SQRT2 - 2) * Math.min(dx, dz)) * cellSize * COST_MIN;
    };

    const gen = ++this.gen;
    this.heapN = 0;
    this.g[start] = 0;
    this.from[start] = -1;
    this.stamp[start] = gen;
    this.state[start] = 1;
    this.heapPush(start, h(start));

    let best = start;
    let bestH = h(start);
    let found = false;
    let expanded = 0;

    while (this.heapN > 0) {
      const cur = this.heapPop();
      if (cur === goal) {
        found = true;
        break;
      }
      this.state[cur] = 2;
      expanded++;
      if (expanded > MAX_EXPAND) {
        this.stats.truncated = true;
        break;
      }
      const cx = cur % this.nx;
      const cz = (cur - cx) / this.nx;
      const gCur = this.g[cur]!;
      for (let k = 0; k < 8; k++) {
        const dx = NB_X[k]!;
        const dz = NB_Z[k]!;
        const ix = cx + dx;
        const iz = cz + dz;
        if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) continue;
        const j = iz * this.nx + ix;
        if (this.solid[j]) continue;
        if (dx !== 0 && dz !== 0) {
          // no squeezing through a diagonal gap between two solids
          if (this.solid[cz * this.nx + ix] || this.solid[iz * this.nx + cx]) continue;
        }
        const step = (dx !== 0 && dz !== 0 ? SQRT2 : 1) * cellSize * (this.cost[j]! / 100);
        const ng = gCur + step;
        if (this.stamp[j] !== gen) {
          this.stamp[j] = gen;
          this.state[j] = 1;
          this.g[j] = ng;
          this.from[j] = cur;
          const hj = h(j);
          if (hj < bestH) {
            bestH = hj;
            best = j;
          }
          this.heapPush(j, ng + hj);
        } else if (this.state[j] === 1 && ng < this.g[j]!) {
          this.g[j] = ng;
          this.from[j] = cur;
          this.heapLower(j, ng + h(j));
        }
      }
    }

    const end = found ? goal : best;
    // reconstruct backwards, then walk it forwards while pulling the string
    let len = 0;
    for (let c = end; c >= 0 && len < MAX_RAW; c = this.from[c]!) {
      this.raw[len++] = c;
      if (c === start) break;
    }
    // raw[0] is the end, raw[len-1] is the start
    let count = 0;
    let fromX = sx;
    let fromZ = sz;
    let i = len - 1; // the start
    const cap = out.length >> 1;
    while (i > 0 && count < cap) {
      // farthest cell still in plain sight, within a bounded window
      let take = i - 1;
      const floor = Math.max(0, i - SMOOTH_WINDOW);
      for (let j = floor; j < i - 1; j++) {
        const c = this.raw[j]!;
        if (this.lineClear(fromX, fromZ, this.cellX(c), this.cellZ(c))) {
          take = j;
          break;
        }
      }
      const c = this.raw[take]!;
      fromX = this.cellX(c);
      fromZ = this.cellZ(c);
      out[count * 2] = fromX;
      out[count * 2 + 1] = fromZ;
      count++;
      i = take;
    }
    // aim at the real goal on the last leg when it is in sight
    if (found && !this.goalSnapped && count > 0 && count < cap && this.lineClear(fromX, fromZ, gx, gz)) {
      out[count * 2] = gx;
      out[count * 2 + 1] = gz;
      count++;
    }
    this.stats.expanded = expanded;
    this.stats.ms = now() - t0;
    return count;
  }
}

const SMOOTH_WINDOW = 24;
const NB_X = [1, -1, 0, 0, 1, 1, -1, -1];
const NB_Z = [0, 0, 1, -1, 1, -1, 1, -1];

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Run one long search the moment the grid is built.
 *
 * The first A* of the session costs ten to twenty times what every later one
 * does: the JIT has not compiled the inner loop and the scratch arrays have
 * not been touched, so it measured 40ms in the browser against 2ms warm. Doing
 * it here puts that one-off next to the world build, where nothing is moving,
 * instead of into the frame where he first pedals out of his yard.
 */
function warm(grid: NavGrid) {
  const main = grid.mainComponent;
  if (main < 0) return;
  const a = grid.nearestFree(grid.minX, grid.minZ, main, 400);
  const b = grid.nearestFree(grid.minX + grid.nx * grid.cell, grid.minZ + grid.nz * grid.cell, main, 400);
  if (a < 0 || b < 0) return;
  grid.findPath(grid.cellX(a), grid.cellZ(a), grid.cellX(b), grid.cellZ(b), new Float32Array(256));
  grid.stats.expanded = 0;
  grid.stats.ms = 0;
  grid.stats.truncated = false;
}

/**
 * One grid per world. The key is the collider array the world built, so a
 * rebuilt world gets a fresh grid and everything else shares one. The tools
 * build a level's colliders once and run Emmett over and over, so this keeps
 * them honest about the per-frame cost too.
 */
type Cached = {
  grid: NavGrid;
  keepOut: readonly NavRect[];
  prefer: readonly NavRect[];
  radius: number;
  margin: number;
  cell: number;
};
const cache = new WeakMap<object, Cached>();

export function navGridFor(
  bounds: NavRect,
  colliders: readonly AABB[],
  keepOut: readonly NavRect[],
  radius: number,
  margin: number,
  prefer: readonly NavRect[] = [],
  cell = NAV_CELL,
): NavGrid {
  const key = colliders as unknown as object;
  const hit = cache.get(key);
  if (
    hit &&
    hit.keepOut === keepOut &&
    hit.prefer === prefer &&
    hit.radius === radius &&
    hit.margin === margin &&
    hit.cell === cell
  ) {
    return hit.grid;
  }
  const grid = new NavGrid(bounds, colliders, keepOut, radius, margin, cell, prefer);
  warm(grid);
  cache.set(key, { grid, keepOut, prefer, radius, margin, cell });
  return grid;
}
