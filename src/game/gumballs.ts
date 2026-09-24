import * as THREE from "three";
import { create } from "zustand";
import { sfx } from "./audio";
import { PIECE, PRIZE_PIECES } from "./build-pieces";
import { useBuild } from "./build-store";
import { glowMaterial } from "./furniture";
import { sphereGeo } from "./meshes";
import { useGame } from "./store";
import type { LevelDef, ModelProp } from "./types";

/**
 * The park's gumball machines, which she can use.
 *
 * Walk up to the front of one and turn the handle. The first turn every day is
 * free — the Daily Surprise — and after that a turn costs a few tickets. Out
 * of the chute rolls a gumball, and inside it is a prize: tickets, a building
 * piece for the build yard she cannot get anywhere else, or a piece of
 * furniture for her house. Once a day is the whole idea: a reason to come back
 * tomorrow, which is what a game for a seven-year-old needs more than another
 * level.
 */

export const GUMBALL_PRICE = 5;

export type GumballPrize =
  | { kind: "tickets"; n: number; golden?: boolean }
  | { kind: "piece"; id: string; name: string }
  | { kind: "furniture"; id: string; name: string };

export type GumballCard = { prize: GumballPrize; color: string; daily: boolean };

type GumballStore = {
  /** at the front of a machine: "free" when today's turn is still to take */
  near: "free" | "paid" | null;
  setNear: (v: "free" | "paid" | null) => void;
  card: GumballCard | null;
  setCard: (c: GumballCard | null) => void;
};

export const useGumball = create<GumballStore>((set) => ({
  near: null,
  setNear: (near) => set((s) => (s.near === near ? s : { near })),
  card: null,
  setCard: (card) => set({ card }),
}));

/** Today, as the machines count days: the date on her tablet's clock. */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * Furniture that only comes out of a gumball, as ids and names, and whether she
 * owns each already. Supplied by the house (home-store) so this file does not
 * need to know about furniture.
 */
let furniturePrizes: () => { id: string; name: string; owned: boolean }[] = () => [];
let grantFurniture: (id: string) => void = () => {};
export function setFurniturePrizes(list: typeof furniturePrizes, grant: typeof grantFurniture) {
  furniturePrizes = list;
  grantFurniture = grant;
}

const BALL_COLORS = ["#ff93c4", "#6fe3c4", "#ffe36b", "#b98cff", "#7ec8ff", "#ffae5c", "#ff6b6b"];

/** What is in the gumball. Pure apart from the random numbers, so it can be tried headlessly. */
export function rollPrize(daily: boolean, lockedPieces: string[], lockedFurniture: { id: string; name: string }[], rand = Math.random): GumballPrize {
  // one in thirty is the golden gumball
  if (rand() < 1 / 30) return { kind: "tickets", n: daily ? 60 : 40, golden: true };
  const items = [
    ...lockedPieces.map((id) => ({ kind: "piece" as const, id, name: PIECE.get(id)?.name ?? id })),
    ...lockedFurniture.map((f) => ({ kind: "furniture" as const, id: f.id, name: f.name })),
  ];
  // the daily one is more often a thing to keep than a handful of tickets
  if (items.length && rand() < (daily ? 0.55 : 0.3)) return items[Math.floor(rand() * items.length)]!;
  const roll = rand();
  const n = roll < 0.4 ? 3 : roll < 0.7 ? 5 : roll < 0.88 ? 8 : roll < 0.97 ? 12 : 20;
  return { kind: "tickets", n: daily ? Math.max(8, n * 2) : n };
}

/** Everything a prize can be, for the card: "12 tickets", "the Rainbow for your build yard". */
export function prizeLine(p: GumballPrize) {
  if (p.kind === "tickets") return p.golden ? `The GOLDEN gumball! ${p.n} tickets!` : `${p.n} tickets!`;
  if (p.kind === "piece") return `A new building piece: the ${p.name}! Find it in the Build Yard.`;
  return `New furniture: the ${p.name}! It's waiting in your house.`;
}

type Machine = { x: number; z: number; s: number; ry: number; front: [number, number] };
/** a gumball on its way out of the chute */
type Rolling = { mesh: THREE.Mesh; vx: number; vy: number; vz: number; t: number; card: GumballCard };

export class GumballWorld {
  private machines: Machine[];
  private group = new THREE.Group();
  private rolling: Rolling | null = null;

  constructor(
    private scene: THREE.Scene,
    level: LevelDef,
  ) {
    this.machines = level.props
      .filter((p): p is ModelProp => p.kind === "model" && p.id === "gumball-machine")
      .map((p) => {
        const s = p.scale ?? 1;
        const ry = p.ry ?? 0;
        // she stands just off the front of the base, facing the chute
        const d = 1.1 * s + 0.9;
        return { x: p.x, z: p.z, s, ry, front: [p.x + Math.sin(ry) * d, p.z + Math.cos(ry) * d] as [number, number] };
      });
    scene.add(this.group);
  }

  dispose() {
    this.scene.remove(this.group);
    useGumball.getState().setNear(null);
  }

  /** The machine she is standing at, if any. */
  private at(x: number, y: number, z: number) {
    if (y > 2) return null;
    return this.machines.find((m) => Math.hypot(x - m.front[0], z - m.front[1]) < 1.5) ?? null;
  }

  tryInteract(x: number, y: number, z: number): boolean {
    const m = this.at(x, y, z);
    if (!m || this.rolling || useGumball.getState().card) return false;
    const st = useGame.getState();
    const daily = st.gumballDay !== today();
    if (!daily && !st.spendTickets(GUMBALL_PRICE)) {
      sfx.wrong();
      st.setEmmettNotice(`A gumball is ${GUMBALL_PRICE} tickets. Find sweets and stickers, or play the fair, to earn more!`);
      return true;
    }
    if (daily) st.claimGumballDay(today());
    const build = useBuild.getState();
    const prize = rollPrize(
      daily,
      PRIZE_PIECES.filter((id) => !build.unlocked.includes(id)),
      furniturePrizes().filter((f) => !f.owned),
    );
    const color = prize.kind === "tickets" && prize.golden ? "#ffd84a" : BALL_COLORS[Math.floor(Math.random() * BALL_COLORS.length)]!;
    sfx.click();
    // the gumball drops out of the chute and rolls to her feet, then opens
    const ball = new THREE.Mesh(sphereGeo, glowMaterial(color, prize.kind === "tickets" && prize.golden ? 1.2 : 0.35, 0.2));
    ball.scale.setScalar(0.2 * Math.max(1, m.s));
    const out = 0.97 * m.s;
    ball.position.set(m.x + Math.sin(m.ry) * out, 0.6 * m.s, m.z + Math.cos(m.ry) * out);
    this.group.add(ball);
    this.rolling = { mesh: ball, vx: Math.sin(m.ry) * 1.6, vy: 1.2, vz: Math.cos(m.ry) * 1.6, t: 0, card: { prize, color, daily } };
    return true;
  }

  update(dt: number, her: { x: number; y: number; z: number }) {
    if (!(dt > 0)) return;
    const st = useGame.getState();
    const m = this.at(her.x, her.y, her.z);
    useGumball.getState().setNear(m ? (st.gumballDay !== today() ? "free" : "paid") : null);

    const r = this.rolling;
    if (!r) return;
    r.t += dt;
    r.vy -= 9.8 * dt;
    r.mesh.position.x += r.vx * dt;
    r.mesh.position.y += r.vy * dt;
    r.mesh.position.z += r.vz * dt;
    const floor = r.mesh.scale.x;
    if (r.mesh.position.y < floor) {
      r.mesh.position.y = floor;
      r.vy = Math.abs(r.vy) * 0.45;
      r.vx *= 0.8;
      r.vz *= 0.8;
      if (r.vy > 0.6) sfx.click();
    }
    r.mesh.rotation.x += dt * 8;
    if (r.t > 1.3) {
      this.group.remove(r.mesh);
      this.rolling = null;
      this.give(r.card);
    }
  }

  private give(card: GumballCard) {
    const st = useGame.getState();
    const p = card.prize;
    if (p.kind === "tickets") st.addTickets(p.n);
    else if (p.kind === "piece") useBuild.getState().unlock(p.id);
    else grantFurniture(p.id);
    sfx.win();
    useGumball.getState().setCard(card);
  }
}
