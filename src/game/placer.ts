import * as THREE from "three";
import { sfx } from "./audio";
import { BUILD_COLORS, LEVEL, pieceBoxes, type PieceDef } from "./build-pieces";
import { MAX_PIECES, type BuildStoreHook, type Placed } from "./build-store";
import type { AABB } from "./collision";
import { mergeStatic } from "./merge";
import { useGame } from "./store";
import { PLAYER_H, PLAYER_W } from "./tuning";

/**
 * Putting pieces down on a one-metre grid: the build yard (build-yard.ts) and
 * the things she arranges round her house (house-items.ts) are both this.
 *
 * With the controls up, a see-through copy of the chosen piece sits on the
 * square in front of her, stacked on whatever of hers is already there. Place
 * puts it down, Remove takes the top one off that square, Undo takes back her
 * last. Everything placed is solid and saved.
 */

export type PlaceArea = {
  /** world position of the grid's corner square's corner, and the floor height */
  x0: number;
  z0: number;
  y0: number;
  cols: number;
  rows: number;
  /** how many half-metre levels a stack may reach */
  maxLevel: number;
  /** may a piece stand on this square at all */
  fits: (gx: number, gz: number) => boolean;
  catalogue: Map<string, PieceDef>;
  store: BuildStoreHook;
};

/** Where the piece in square (x, z) at level y is, in world metres. */
function origin(a: PlaceArea, q: { x: number; z: number; y: number }) {
  return { x: a.x0 + q.x + 0.5, y: a.y0 + q.y * LEVEL, z: a.z0 + q.z + 0.5 };
}

/** The pieces' colliders in world metres, each stacked column merged into one box. */
export function areaColliders(a: PlaceArea, pieces: readonly Placed[]): AABB[] {
  const cols = new Map<string, AABB[]>();
  for (const q of pieces) {
    const def = a.catalogue.get(q.p);
    if (!def) continue;
    const o = origin(a, q);
    for (const b of pieceBoxes(def, q.r)) {
      const box = { minX: o.x + b.x0, maxX: o.x + b.x1, minY: o.y + b.y0, maxY: o.y + b.y1, minZ: o.z + b.z0, maxZ: o.z + b.z1 };
      const key = `${box.minX.toFixed(3)},${box.maxX.toFixed(3)},${box.minZ.toFixed(3)},${box.maxZ.toFixed(3)}`;
      (cols.get(key) ?? cols.set(key, []).get(key)!).push(box);
    }
  }
  // a column of blocks is one box, not twenty: every step of her movement
  // tests every box in the park
  const out: AABB[] = [];
  for (const list of cols.values()) {
    list.sort((p, q) => p.minY - q.minY);
    let cur = { ...list[0]! };
    for (const b of list.slice(1)) {
      if (b.minY <= cur.maxY + 1e-6) cur.maxY = Math.max(cur.maxY, b.maxY);
      else {
        out.push(cur);
        cur = { ...b };
      }
    }
    out.push(cur);
  }
  return out;
}

/** The level the next piece in a square stacks at. */
export function stackTop(a: PlaceArea, pieces: readonly Placed[], x: number, z: number) {
  let top = 0;
  for (const q of pieces) if (q.x === x && q.z === z) top = Math.max(top, q.y + (a.catalogue.get(q.p)?.h ?? 1));
  return top;
}

/** The square in front of her, or null when that is not somewhere a piece can go. */
export function targetSquare(a: PlaceArea, x: number, z: number, yaw: number): [number, number] | null {
  // her forward is (-sin yaw, -cos yaw)
  const gx = Math.floor(x - Math.sin(yaw) * 1.3 - a.x0);
  const gz = Math.floor(z - Math.cos(yaw) * 1.3 - a.z0);
  if (gx < 0 || gz < 0 || gx >= a.cols || gz >= a.rows || !a.fits(gx, gz)) return null;
  return [gx, gz];
}

/** squares per side of a redraw chunk */
const CHUNK = 6;
type Chunk = { sig: string; group: THREE.Group; geos: THREE.BufferGeometry[]; spinning: THREE.Object3D[] };

export class Placer {
  /**
   * The drawing is kept in chunks of CHUNK x CHUNK squares, each merged on its
   * own, and a press redraws only the chunk it changed. Merging the whole build
   * again on every press cost 300ms at twelve hundred pieces — a hitch on each
   * Place, and worse on a tablet.
   */
  private chunks = new Map<string, Chunk>();
  private colliders: AABB[] = [];
  private ghost: THREE.Group | null = null;
  private ghostKey = "";
  private ghostMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.45, depthWrite: false });
  private lastPieces: readonly Placed[] | null = null;
  private t = 0;

  constructor(
    private scene: THREE.Scene,
    private worldColliders: AABB[],
    private area: PlaceArea,
  ) {}

  dispose() {
    this.setColliders([]);
    for (const key of [...this.chunks.keys()]) this.dropChunk(key);
    if (this.ghost) this.scene.remove(this.ghost);
  }

  private setColliders(next: AABB[]) {
    // out of the park's list in one pass, in place: other code holds the array,
    // and an indexOf per box was millions of steps a press for a big build
    const drop = new Set(this.colliders);
    const all = this.worldColliders;
    let w = 0;
    for (let i = 0; i < all.length; i++) if (!drop.has(all[i]!)) all[w++] = all[i]!;
    all.length = w;
    this.colliders = next;
    this.worldColliders.push(...next);
  }

  private dropChunk(key: string) {
    const c = this.chunks.get(key);
    if (!c) return;
    this.scene.remove(c.group);
    for (const geo of c.geos) geo.dispose();
    this.chunks.delete(key);
  }

  /** Redraw the chunks whose pieces changed, after a press; the colliders all at once. */
  private rebuild(pieces: readonly Placed[]) {
    const byChunk = new Map<string, Placed[]>();
    for (const q of pieces) {
      const key = `${Math.floor(q.x / CHUNK)},${Math.floor(q.z / CHUNK)}`;
      (byChunk.get(key) ?? byChunk.set(key, []).get(key)!).push(q);
    }
    for (const key of [...this.chunks.keys()]) if (!byChunk.has(key)) this.dropChunk(key);
    for (const [key, list] of byChunk) {
      const sig = list.map((q) => `${q.p},${q.x},${q.z},${q.y},${q.c},${q.r}`).join(";");
      if (this.chunks.get(key)?.sig === sig) continue;
      this.dropChunk(key);
      this.chunks.set(key, { sig, ...this.drawChunk(list) });
    }
    this.setColliders(areaColliders(this.area, pieces));
  }

  private drawChunk(pieces: readonly Placed[]) {
    const g = new THREE.Group();
    const spinning: THREE.Object3D[] = [];
    for (const q of pieces) {
      const def = this.area.catalogue.get(q.p);
      if (!def) continue;
      const o = def.make(BUILD_COLORS[q.c % BUILD_COLORS.length]!.hex);
      const at = origin(this.area, q);
      o.position.set(at.x, at.y, at.z);
      o.rotation.y = (q.r * Math.PI) / 2;
      o.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
        if (m.userData.spin) spinning.push(m);
      });
      g.add(o);
    }
    const { geometries } = mergeStatic(g, { live: new Set(spinning) });
    this.scene.add(g);
    return { group: g, geos: geometries, spinning };
  }

  private makeGhost(def: PieceDef, color: string) {
    if (this.ghost) this.scene.remove(this.ghost);
    const g = def.make(color);
    g.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = this.ghostMat;
      mesh.castShadow = false;
    });
    this.ghostMat.color.set(color);
    this.ghost = g;
    this.scene.add(g);
  }

  /** Every frame: redraw after a change, and while `active`, the ghost and her presses. */
  update(dt: number, her: { x: number; y: number; z: number; yaw: number }, active: boolean) {
    if (!(dt > 0)) return;
    this.t += dt;
    const store = this.area.store.getState();
    if (store.pieces !== this.lastPieces) {
      this.lastPieces = store.pieces;
      this.rebuild(store.pieces);
    }
    for (const c of this.chunks.values()) for (const s of c.spinning) s.rotation.y = this.t * 1.5;

    const target = active ? targetSquare(this.area, her.x, her.z, her.yaw) : null;
    const def = this.area.catalogue.get(store.piece);
    if (!target || !def) {
      if (this.ghost) this.ghost.visible = false;
      const ask = store.take();
      if (ask && active) {
        sfx.wrong();
        useGame.getState().setEmmettNotice("Turn to face an empty spot, then press Place.");
      }
      return;
    }
    const color = BUILD_COLORS[store.color]!.hex;
    const key = `${def.id}|${def.colored ? color : ""}`;
    if (key !== this.ghostKey || !this.ghost) {
      this.ghostKey = key;
      this.makeGhost(def, def.colored ? color : "#ffffff");
    }
    const [gx, gz] = target;
    const top = stackTop(this.area, store.pieces, gx, gz);
    const ghost = this.ghost!;
    ghost.visible = true;
    const at = origin(this.area, { x: gx, z: gz, y: top });
    ghost.position.set(at.x, at.y + 0.01, at.z);
    ghost.rotation.y = (store.rot * Math.PI) / 2;
    this.ghostMat.opacity = 0.35 + Math.sin(this.t * 5) * 0.12;

    const ask = store.take();
    if (ask === "place") this.place(def, gx, gz, top, her);
    else if (ask === "remove") this.remove(gx, gz);
    else if (ask === "undo") {
      sfx.click();
      store.undo();
    }
  }

  private place(def: PieceDef, gx: number, gz: number, top: number, her: { x: number; y: number; z: number }) {
    const store = this.area.store.getState();
    const game = useGame.getState();
    const say = game.setEmmettNotice;
    if (top + def.h > this.area.maxLevel) {
      sfx.wrong();
      say("That's as tall as it goes!");
      return;
    }
    const q: Placed = { p: def.id, x: gx, z: gz, y: top, c: def.colored ? store.color : 0, r: def.turns ? store.rot : 0 };
    const boxes = areaColliders(this.area, [q]);
    // never into her, and never into a wall, a bed or anything else solid
    const inHer = boxes.some(
      (b) =>
        her.x + PLAYER_W > b.minX && her.x - PLAYER_W < b.maxX && her.z + PLAYER_W > b.minZ && her.z - PLAYER_W < b.maxZ && her.y + PLAYER_H > b.minY && her.y < b.maxY,
    );
    if (inHer) {
      sfx.wrong();
      say("Step back a little, you're in the way!");
      return;
    }
    const e = 0.02;
    const clash = boxes.some((b) =>
      this.worldColliders.some(
        (w) =>
          w.maxY > this.area.y0 + e &&
          b.minX + e < w.maxX &&
          b.maxX - e > w.minX &&
          b.minY + e < w.maxY &&
          b.maxY - e > w.minY &&
          b.minZ + e < w.maxZ &&
          b.maxZ - e > w.minZ,
      ),
    );
    if (clash) {
      sfx.wrong();
      say("There's no room for it there!");
      return;
    }
    if (store.pieces.length >= MAX_PIECES) {
      sfx.wrong();
      say(`That's ${MAX_PIECES} pieces — it's full! Take some away to build something new.`);
      return;
    }
    // a piece that is sold: the first one is bought as she puts it down
    if (def.price && !store.unlocked.includes(def.id)) {
      if (!game.spendTickets(def.price)) {
        sfx.wrong();
        say(`The ${def.name.toLowerCase()} is ${def.price} tickets. Find sweets and stickers to earn more!`);
        return;
      }
      store.unlock(def.id);
      sfx.win();
      say(`You bought the ${def.name.toLowerCase()}! Now you can put out as many as you like.`);
    } else sfx.click();
    store.add(q);
  }

  private remove(gx: number, gz: number) {
    const store = this.area.store.getState();
    let best = -1;
    let bestY = -1;
    store.pieces.forEach((q, i) => {
      if (q.x === gx && q.z === gz && q.y > bestY) {
        bestY = q.y;
        best = i;
      }
    });
    if (best < 0) return;
    sfx.boing();
    store.removeAt(best);
  }
}
