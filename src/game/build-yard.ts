import * as THREE from "three";
import { sfx } from "./audio";
import { BUILD_COLORS, LEVEL, PIECE, pieceBoxes, type PieceDef } from "./build-pieces";
import { useBuild, type Placed } from "./build-store";
import type { AABB } from "./collision";
import { mergeStatic } from "./merge";
import { lam, signBoard } from "./meshes";
import { SUGAR } from "./sugar-rush";
import { PLAYER_H, PLAYER_W } from "./tuning";
import { useGame } from "./store";

/**
 * The build yard: a square of Sugar Rush where she builds whatever she likes.
 *
 * She walks about in it as anywhere else, and with the building controls up a
 * see-through copy of the chosen piece sits on the square in front of her,
 * stacked on whatever is already there. Place puts it down, Remove takes the
 * top piece off that square, Undo takes back her last one. Everything she
 * builds is solid, so a tower is something to climb and a house something to
 * walk into, and it is all saved (build-store.ts).
 *
 * Emmett does not come in (sugar-level.ts keeps him out): her builds are not
 * on his map, and nobody wants to be tagged halfway up their own castle.
 */

const Y = SUGAR.buildYard;
export const YARD_CELLS = Y.cells;
const X0 = Y.x - Y.cells / 2;
const Z0 = Y.z - Y.cells / 2;
/** 12m: tall enough for a proper tower, short enough to stay in the camera */
export const MAX_LEVEL = 24;

/** The yard's square in world metres, padded by `pad`. */
export function buildYardRect(pad = 0) {
  return { minX: X0 - pad, maxX: X0 + Y.cells + pad, minZ: Z0 - pad, maxZ: Z0 + Y.cells + pad };
}

/** The pieces' colliders, stacked columns merged, in world metres. */
export function buildColliders(pieces: readonly Placed[]): AABB[] {
  const cols = new Map<string, AABB[]>();
  for (const q of pieces) {
    const def = PIECE.get(q.p);
    if (!def) continue;
    const cx = X0 + q.x + 0.5;
    const cz = Z0 + q.z + 0.5;
    const base = q.y * LEVEL;
    for (const b of pieceBoxes(def, q.r)) {
      const box = { minX: cx + b.x0, maxX: cx + b.x1, minY: base + b.y0, maxY: base + b.y1, minZ: cz + b.z0, maxZ: cz + b.z1 };
      const key = `${box.minX.toFixed(3)},${box.maxX.toFixed(3)},${box.minZ.toFixed(3)},${box.maxZ.toFixed(3)}`;
      (cols.get(key) ?? cols.set(key, []).get(key)!).push(box);
    }
  }
  // a column of blocks is one box, not twenty: every step of her movement
  // tests every box in the park
  const out: AABB[] = [];
  for (const list of cols.values()) {
    list.sort((a, b) => a.minY - b.minY);
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
export function stackTop(pieces: readonly Placed[], x: number, z: number) {
  let top = 0;
  for (const q of pieces) if (q.x === x && q.z === z) top = Math.max(top, q.y + (PIECE.get(q.p)?.h ?? 1));
  return top;
}

/** The square in front of her, or null when that is off the yard. */
export function targetSquare(x: number, z: number, yaw: number): [number, number] | null {
  // her forward is (-sin yaw, -cos yaw)
  const tx = x - Math.sin(yaw) * 1.3;
  const tz = z - Math.cos(yaw) * 1.3;
  const gx = Math.floor(tx - X0);
  const gz = Math.floor(tz - Z0);
  if (gx < 0 || gz < 0 || gx >= Y.cells || gz >= Y.cells) return null;
  return [gx, gz];
}

function gridTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fbe9d2";
  g.fillRect(0, 0, 128, 128);
  // a waffle: each square a metre, so she can see where a piece will go
  g.strokeStyle = "#e9c89e";
  g.lineWidth = 6;
  g.strokeRect(3, 3, 122, 122);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Y.cells, Y.cells);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class BuildYard {
  private group = new THREE.Group();
  private built: THREE.Group | null = null;
  private builtGeos: THREE.BufferGeometry[] = [];
  private spinning: THREE.Object3D[] = [];
  private colliders: AABB[] = [];
  private ghost: THREE.Group | null = null;
  private ghostKey = "";
  private ghostMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.45, depthWrite: false });
  private lastPieces: readonly Placed[] | null = null;
  private t = 0;

  constructor(
    private scene: THREE.Scene,
    private worldColliders: AABB[],
  ) {
    // the floor: a waffle-gridded mat, 4cm up so it clears the lawn and
    // shares a height with nothing else in the park
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(Y.cells, Y.cells),
      new THREE.MeshStandardMaterial({ map: gridTexture(), roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(Y.x, 0.04, Y.z);
    floor.receiveShadow = true;
    this.group.add(floor);
    // an icing kerb round it, low enough to step over, open in the middle of each side
    const kerb = lam("#ff93c4", { flat: true, roughness: 0.35 });
    const half = Y.cells / 2;
    for (const [dx, dz, w, d] of [
      [0, -half, Y.cells, 0.3],
      [0, half, Y.cells, 0.3],
      [-half, 0, 0.3, Y.cells],
      [half, 0, 0.3, Y.cells],
    ] as const) {
      for (const s of [-1, 1]) {
        // two runs per side with a 3m gap between them
        const along = w > d;
        const len = (Y.cells - 3) / 2;
        const m = new THREE.Mesh(new THREE.BoxGeometry(along ? len : w, 0.16, along ? d : len), kerb);
        m.position.set(Y.x + dx + (along ? s * (len / 2 + 1.5) : 0), 0.08, Y.z + dz + (along ? 0 : s * (len / 2 + 1.5)));
        m.receiveShadow = true;
        this.group.add(m);
      }
    }
    const sign = signBoard("Build Yard", 4, 0.8);
    sign.position.set(Y.x, 2.4, Y.z + half + 0.6);
    this.group.add(sign);
    scene.add(this.group);
  }

  dispose() {
    this.setColliders([]);
    this.clearBuilt();
    this.scene.remove(this.group);
    if (this.ghost) this.scene.remove(this.ghost);
    useBuild.getState().setBuilding(false);
    useBuild.getState().setInYard(false);
  }

  private setColliders(next: AABB[]) {
    for (const c of this.colliders) {
      const i = this.worldColliders.indexOf(c);
      if (i >= 0) this.worldColliders.splice(i, 1);
    }
    this.colliders = next;
    this.worldColliders.push(...next);
  }

  private clearBuilt() {
    if (!this.built) return;
    this.scene.remove(this.built);
    for (const geo of this.builtGeos) geo.dispose();
    this.builtGeos = [];
    this.built = null;
  }

  /** Draw every piece again and merge them: after each change, which is a press, not a frame. */
  private rebuild(pieces: readonly Placed[]) {
    this.clearBuilt();
    const g = new THREE.Group();
    this.spinning = [];
    for (const q of pieces) {
      const def = PIECE.get(q.p);
      if (!def) continue;
      const o = def.make(BUILD_COLORS[q.c % BUILD_COLORS.length]!.hex);
      o.position.set(X0 + q.x + 0.5, q.y * LEVEL, Z0 + q.z + 0.5);
      o.rotation.y = (q.r * Math.PI) / 2;
      o.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
        if (m.userData.spin) this.spinning.push(m);
      });
      g.add(o);
    }
    const { geometries } = mergeStatic(g, { live: new Set(this.spinning) });
    this.builtGeos = geometries;
    this.built = g;
    this.scene.add(g);
    this.setColliders(buildColliders(pieces));
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

  update(dt: number, her: { x: number; y: number; z: number; yaw: number }, paused: boolean) {
    if (!(dt > 0)) return;
    this.t += dt;
    const store = useBuild.getState();
    const r = buildYardRect(0.5);
    const inYard = her.x > r.minX && her.x < r.maxX && her.z > r.minZ && her.z < r.maxZ && her.y < MAX_LEVEL * LEVEL + 2;
    store.setInYard(inYard);
    if (!inYard && store.building) store.setBuilding(false);

    if (store.pieces !== this.lastPieces) {
      this.lastPieces = store.pieces;
      this.rebuild(store.pieces);
    }
    for (const s of this.spinning) s.rotation.y = this.t * 1.5;

    const target = store.building && !paused ? targetSquare(her.x, her.z, her.yaw) : null;
    const def = PIECE.get(store.piece);
    if (!target || !def) {
      if (this.ghost) this.ghost.visible = false;
      store.take();
      return;
    }
    const color = BUILD_COLORS[store.color]!.hex;
    const key = `${def.id}|${def.colored ? color : ""}`;
    if (key !== this.ghostKey || !this.ghost) {
      this.ghostKey = key;
      this.makeGhost(def, def.colored ? color : "#ffffff");
    }
    const [gx, gz] = target;
    const top = stackTop(store.pieces, gx, gz);
    const ghost = this.ghost!;
    ghost.visible = true;
    ghost.position.set(X0 + gx + 0.5, top * LEVEL + 0.01, Z0 + gz + 0.5);
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
    const store = useBuild.getState();
    const say = useGame.getState().setEmmettNotice;
    if (top + def.h > MAX_LEVEL) {
      sfx.wrong();
      say("That's as tall as the yard goes!");
      return;
    }
    const q: Placed = { p: def.id, x: gx, z: gz, y: top, c: def.colored ? store.color : 0, r: def.turns ? store.rot : 0 };
    // never build a piece into her
    const inHer = buildColliders([q]).some(
      (b) =>
        her.x + PLAYER_W > b.minX && her.x - PLAYER_W < b.maxX && her.z + PLAYER_W > b.minZ && her.z - PLAYER_W < b.maxZ && her.y + PLAYER_H > b.minY && her.y < b.maxY,
    );
    if (inHer) {
      sfx.wrong();
      say("Step back a little, you're in the way!");
      return;
    }
    sfx.click();
    store.add(q);
  }

  private remove(gx: number, gz: number) {
    const store = useBuild.getState();
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
