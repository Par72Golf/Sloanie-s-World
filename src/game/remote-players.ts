import * as THREE from "three";
import { applyWorn } from "./accessories";
import { animateGirl, makeGirl } from "./meshes";
import { remotes, type Look } from "./net";
import { DRESS, HAIR } from "./types";

/**
 * The other kids in the room (net.ts), drawn as the same girl Sloan is, in
 * their own dress and things, with their name over their head.
 *
 * Their position arrives a dozen times a second; in between they glide
 * toward the last one heard, so they run smoothly rather than hop. They are
 * not solid: running through a friend is better than getting stuck on one.
 */

type Avatar = {
  root: THREE.Group;
  girl: THREE.Group;
  tag: THREE.Sprite;
  lookKey: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  t: number;
};

const SKIN = "#e8b489";
/** how quickly a drawn friend closes on where she was last heard to be */
const FOLLOW = 12;
/** not heard from in this long and she is taken away (a closed laptop) */
const STALE_MS = 8000;

function nameTag(name: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.font = "bold 64px Fredoka, Nunito, system-ui, sans-serif";
  const w = Math.min(500, g.measureText(name).width + 64);
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.beginPath();
  g.roundRect((512 - w) / 2, 16, w, 96, 48);
  g.fill();
  g.fillStyle = "#3a2f3e";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(name, 256, 66, 460);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.position.y = 2.5;
  sprite.renderOrder = 10;
  return sprite;
}

const keyOf = (l: Look) => `${l.name}|${l.dress}|${l.avatar ?? "girl"}|${JSON.stringify(l.worn)}`;

export class RemotePlayers {
  private avatars = new Map<string, Avatar>();

  constructor(private scene: THREE.Scene) {}

  private build(look: Look): Pick<Avatar, "girl" | "tag"> {
    const girl = makeGirl(SKIN, HAIR.brown, DRESS[look.dress] ?? DRESS.coral, look.avatar ?? "girl");
    applyWorn(girl, look.worn);
    return { girl, tag: nameTag(look.name || "A friend") };
  }

  private drop(id: string) {
    const a = this.avatars.get(id);
    if (!a) return;
    this.scene.remove(a.root);
    (a.tag.material as THREE.SpriteMaterial).map?.dispose();
    a.tag.material.dispose();
    this.avatars.delete(id);
  }

  update(dt: number, clock: number, level: number) {
    const now = performance.now();
    for (const id of this.avatars.keys()) {
      const r = remotes.get(id);
      if (!r || now - r.heardAt > STALE_MS) this.drop(id);
    }
    for (const [id, r] of remotes) {
      if (!r.look || !r.pose || now - r.heardAt > STALE_MS) continue;
      let a = this.avatars.get(id);
      const key = keyOf(r.look);
      if (!a) {
        const { girl, tag } = this.build(r.look);
        const root = new THREE.Group();
        root.add(girl, tag);
        this.scene.add(root);
        a = { root, girl, tag, lookKey: key, x: r.pose.x, y: r.pose.y, z: r.pose.z, yaw: r.pose.yaw, t: 0 };
        this.avatars.set(id, a);
      } else if (a.lookKey !== key) {
        // a new dress or a new hat: rebuild her
        a.root.remove(a.girl, a.tag);
        (a.tag.material as THREE.SpriteMaterial).map?.dispose();
        a.tag.material.dispose();
        const { girl, tag } = this.build(r.look);
        a.girl = girl;
        a.tag = tag;
        a.root.add(girl, tag);
        a.lookKey = key;
      }
      const p = r.pose;
      a.root.visible = p.level === level;
      if (!a.root.visible) continue;
      // a long way off (a teleport, a respawn): jump there rather than fly
      const far = Math.hypot(p.x - a.x, p.z - a.z) > 12;
      const k = far ? 1 : 1 - Math.exp(-FOLLOW * dt);
      a.x += (p.x - a.x) * k;
      a.y += (p.y - a.y) * k;
      a.z += (p.z - a.z) * k;
      let dy = p.yaw - a.yaw;
      dy -= Math.PI * 2 * Math.round(dy / (Math.PI * 2));
      a.yaw += dy * k;
      a.root.position.set(a.x, a.y, a.z);
      a.girl.rotation.y = a.yaw;
      animateGirl(a.girl, p.moving, p.ground, clock, dt, { speed01: Math.min(1.6, p.speed / 6.4) });
    }
  }

  dispose() {
    for (const id of [...this.avatars.keys()]) this.drop(id);
  }
}
