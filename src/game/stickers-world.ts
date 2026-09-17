import * as THREE from "three";
import { sfx } from "./audio";
import { STICKER_BOOK, STICKER_SPOTS } from "./collectibles";
import { lam } from "./meshes";
import { STICKER_ART, stickerTexture, type StickerId } from "./sticker-art";
import { useGame } from "./store";

/**
 * Stickers floating around the park, and the sticker book near the start.
 * Stickers can only be kept once she has the book: walking into one before
 * that says where the book is and leaves the sticker where it is. Collected
 * stickers are gone for good (saved in the store).
 */

const PICK_R = 1.7;

export class StickerWorld {
  group = new THREE.Group();
  private book: THREE.Group;
  private stickers: { id: StickerId; name: string; sprite: THREE.Sprite; ring: THREE.Mesh; base: THREE.Vector3; warned: boolean; phase: number }[] = [];
  private bookWarned = false;

  constructor(private scene: THREE.Scene) {
    // the book: a chunky purple book on a glowing ring
    this.book = new THREE.Group();
    const item = new THREE.Group();
    const cover = lam("#8a4ad0", { flat: true, roughness: 0.5 });
    const pages = lam("#fff8ec", { flat: true, roughness: 0.8 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.06), cover);
    back.position.z = -0.08;
    item.add(back);
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.06), cover);
    front.position.z = 0.08;
    item.add(front);
    const leaves = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.74, 0.12), pages);
    leaves.position.x = 0.02;
    item.add(leaves);
    const star = new THREE.Mesh(new THREE.CircleGeometry(0.16, 5), lam("#ffc53d", { flat: true, roughness: 0.3 }));
    star.position.z = 0.115;
    item.add(star);
    item.position.y = 1.05;
    this.book.add(item);
    this.book.add(glowRing("#d8b8ff", "#a070ff"));
    this.book.userData.item = item;
    this.book.position.set(STICKER_BOOK.pos[0], STICKER_BOOK.pos[1] - 0.9, STICKER_BOOK.pos[2]);
    this.group.add(this.book);

    const names = new Map(STICKER_ART.map((s) => [s.id, s.name]));
    STICKER_SPOTS.forEach((spot, i) => {
      const id = spot.id as StickerId;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: stickerTexture(id), transparent: true, depthWrite: false }));
      sprite.scale.set(0.9, 0.9, 1);
      const base = new THREE.Vector3(spot.pos[0], spot.pos[1], spot.pos[2]);
      sprite.position.copy(base);
      this.group.add(sprite);
      const ring = glowRing("#fff4b0", "#ffd84a", 0.36);
      ring.position.set(spot.pos[0], spot.pos[1] - 0.82, spot.pos[2]);
      this.group.add(ring);
      this.stickers.push({ id, name: names.get(id) ?? id, sprite, ring, base, warned: false, phase: i * 0.7 });
    });
    scene.add(this.group);
  }

  dispose() {
    this.scene.remove(this.group);
  }

  update(dt: number, t: number, her: { x: number; y: number; z: number; paused: boolean }) {
    const st = useGame.getState();
    // the book
    this.book.visible = !st.stickerBook;
    if (!st.stickerBook) {
      const item = this.book.userData.item as THREE.Object3D;
      item.rotation.y += dt * 1.3;
      item.position.y = 1.05 + Math.sin(t * 2) * 0.1;
      const d = Math.hypot(her.x - this.book.position.x, her.z - this.book.position.z);
      if (d < PICK_R && !her.paused) {
        sfx.win();
        st.findStickerBook();
      }
    }
    // stickers
    for (const s of this.stickers) {
      const have = st.stickers.includes(s.id);
      s.sprite.visible = !have;
      s.ring.visible = !have;
      if (have) continue;
      s.sprite.position.y = s.base.y + Math.sin(t * 2.2 + s.phase) * 0.12;
      s.sprite.material.rotation = Math.sin(t * 1.4 + s.phase) * 0.15;
      const d = Math.hypot(her.x - s.base.x, her.z - s.base.z);
      if (d < PICK_R && Math.abs(her.y + 0.9 - s.base.y) < 2.2 && !her.paused) {
        if (!st.stickerBook) {
          if (!s.warned && !this.bookWarned) {
            this.bookWarned = true;
            s.warned = true;
            sfx.wrong();
            st.setEmmettNotice(`A ${s.name.toLowerCase()} sticker! You need a sticker book to keep it. There's one near the start.`);
          }
          continue;
        }
        sfx.collect();
        st.findSticker(s.id, s.name);
      } else if (d > PICK_R + 2) {
        s.warned = false;
        if (d > 30) this.bookWarned = false;
      }
    }
  }
}

function glowRing(color: string, glow: string, r = 0.5) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(r, 0.05, 8, 28),
    new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(glow), emissiveIntensity: 1.3, roughness: 0.4 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  return ring;
}
