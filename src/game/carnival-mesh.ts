import * as THREE from "three";
import { makeAccessory, type AccessoryId } from "./accessories";
import { BOOTHS, CAROUSEL, type Booth } from "./carnival";
import { boxGeo, lam, mesh, signBoard } from "./meshes";

/**
 * The carnival's look: striped awnings, signs and the game on each counter,
 * string lights, an entrance arch, and the carousel with its turning deck,
 * bobbing horses, striped canopy and brass-ring arm. No colliders here: the
 * solid parts are props (carnival.ts), and everything drawn over them is
 * sized to enclose them.
 */

export type CarnivalRig = {
  group: THREE.Group;
  /** turns with the ride: deck, horses, poles, canopy */
  spin: THREE.Group;
  horses: THREE.Group[];
  ring: THREE.Mesh;
  gold: THREE.Material;
  silver: THREE.Material;
  bulbs: THREE.Mesh[];
};

const flat = (c: string, roughness = 0.55) => lam(c, { flat: true, roughness });
const cyl = (segments = 24) => new THREE.CylinderGeometry(1, 1, 1, segments);
const sphere = new THREE.SphereGeometry(1, 16, 12);

function stripes(a: string, b: string, count: number, w = 512, h = 128) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  for (let i = 0; i < count; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.fillRect((i * w) / count, 0, w / count + 1, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function booth(b: Booth, parent: THREE.Group) {
  const g = new THREE.Group();
  g.position.set(b.x, 0, b.z);
  parent.add(g);
  const depth = 3;
  const front = -depth / 2;
  // awning: a striped slab sloping down to the front, with a scalloped edge
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(b.w + 0.4, 0.1, depth + 0.8),
    new THREE.MeshStandardMaterial({ map: stripes(b.awning[0], b.awning[1], 10), roughness: 0.7 }),
  );
  awning.position.set(0, 3.15, -0.25);
  awning.rotation.x = -0.22;
  awning.castShadow = true;
  g.add(awning);
  const scallops = 9;
  for (let i = 0; i < scallops; i++) {
    const s = new THREE.Mesh(sphere, flat(i % 2 ? b.awning[1] : b.awning[0]));
    s.scale.set((b.w + 0.4) / scallops / 2 + 0.02, 0.2, 0.06);
    s.position.set(-(b.w + 0.4) / 2 + ((i + 0.5) * (b.w + 0.4)) / scallops, 2.83, front - 0.64);
    g.add(s);
  }
  // front posts (visual, thin) and the name board on top
  for (const s of [-1, 1]) g.add(mesh(boxGeo, "#fff4e8", 0.14, 2.2, 0.14, s * (b.w / 2 - 0.1), 2.0, front - 0.1, false));
  const sign = signBoard(b.name, Math.min(b.w - 0.4, 0.6 + b.name.length * 0.36), 0.75);
  sign.position.set(0, 3.95, front + 0.2);
  // the painted face is +z; booths face south, toward -z
  sign.rotation.y = Math.PI;
  g.add(sign);

  const counterTop = 1.08;
  if (b.game === "rings") {
    // a pyramid of bottles on a back shelf, rings hung on a peg
    g.add(mesh(boxGeo, "#c49a62", b.w - 0.6, 0.1, 0.8, 0, 1.2, 0.8, false));
    const glass = lam("#3fa35c", { flat: true, roughness: 0.12 });
    [[-1.5, 0], [-0.75, 0], [0, 0], [0.75, 0], [1.5, 0], [-1.1, 1], [-0.37, 1], [0.37, 1], [1.1, 1], [-0.37, 2], [0.37, 2]].forEach(
      ([x, row]) => {
        const y = 1.25 + row! * 0.52;
        const body = new THREE.Mesh(cyl(12), glass);
        body.scale.set(0.14, 0.32, 0.14);
        body.position.set(x!, y + 0.16, 0.8 - row! * 0.12);
        g.add(body);
        const neck = new THREE.Mesh(cyl(10), glass);
        neck.scale.set(0.05, 0.16, 0.05);
        neck.position.set(x!, y + 0.4, 0.8 - row! * 0.12);
        g.add(neck);
      },
    );
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 20), flat(["#e8455f", "#ffc53d", "#4f93c4"][i]!, 0.4));
      ring.position.set(-1.9 + i * 0.1, counterTop + 0.05, front + 0.35);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
    }
  } else if (b.game === "ducks") {
    // a water trough on the counter with ducks floating in it
    g.add(mesh(boxGeo, "#4f93c4", b.w - 0.8, 0.3, 0.6, 0, counterTop + 0.15, front + 0.3, false));
    const water = new THREE.Mesh(boxGeo, lam("#8fd8f0", { flat: true, roughness: 0.15 }));
    water.scale.set(b.w - 1.0, 0.02, 0.45);
    water.position.set(0, counterTop + 0.29, front + 0.3);
    g.add(water);
    for (let i = 0; i < 6; i++) {
      const dx = -1.9 + i * 0.76;
      const yellow = flat("#ffd23a", 0.4);
      const body = new THREE.Mesh(sphere, yellow);
      body.scale.set(0.16, 0.11, 0.12);
      body.position.set(dx, counterTop + 0.36, front + 0.3);
      g.add(body);
      const head = new THREE.Mesh(sphere, yellow);
      head.scale.setScalar(0.08);
      head.position.set(dx + 0.1, counterTop + 0.5, front + 0.3);
      g.add(head);
      const beak = new THREE.Mesh(sphere, flat("#ff8a3d"));
      beak.scale.set(0.05, 0.02, 0.03);
      beak.position.set(dx + 0.18, counterTop + 0.49, front + 0.3);
      g.add(beak);
    }
  } else if (b.game === "moles") {
    // six holes in the table, three moles popping up, a mallet
    g.add(mesh(boxGeo, "#8a5a32", b.w - 0.8, 0.12, 0.65, 0, counterTop + 0.06, front + 0.3, false));
    for (let i = 0; i < 6; i++) {
      const hx = -1.75 + i * 0.7;
      const hole = new THREE.Mesh(cyl(16), flat("#1e1a16"));
      hole.scale.set(0.18, 0.02, 0.18);
      hole.position.set(hx, counterTop + 0.13, front + 0.3);
      g.add(hole);
      if (i % 2 === 0) {
        const mole = new THREE.Mesh(sphere, flat("#7a5236"));
        mole.scale.set(0.15, 0.18, 0.15);
        mole.position.set(hx, counterTop + 0.25, front + 0.3);
        g.add(mole);
        const nose = new THREE.Mesh(sphere, flat("#f3c8a8"));
        nose.scale.set(0.06, 0.04, 0.04);
        nose.position.set(hx, counterTop + 0.25, front + 0.43);
        g.add(nose);
        for (const s of [-1, 1]) {
          const eye = new THREE.Mesh(sphere, flat("#1a1a1e"));
          eye.scale.setScalar(0.022);
          eye.position.set(hx + s * 0.05, counterTop + 0.32, front + 0.42);
          g.add(eye);
        }
      }
    }
    const handle = new THREE.Mesh(cyl(8), flat("#c49a62"));
    handle.scale.set(0.035, 0.6, 0.035);
    handle.position.set(2.1, counterTop + 0.3, front + 0.2);
    handle.rotation.z = 0.5;
    g.add(handle);
    const headM = new THREE.Mesh(cyl(12), flat("#e8455f"));
    headM.scale.set(0.12, 0.3, 0.12);
    headM.rotation.z = Math.PI / 2 + 0.5;
    headM.position.set(1.95, counterTop + 0.58, front + 0.2);
    g.add(headM);
  } else if (b.game === "prizes") {
    // shelves of the prizes, and the giant teddy in pride of place
    g.add(mesh(boxGeo, "#c49a62", b.w - 0.6, 0.1, 0.7, 0, 1.25, 0.85, false));
    g.add(mesh(boxGeo, "#c49a62", b.w - 0.6, 0.1, 0.7, 0, 2.05, 0.85, false));
    const show = (id: AccessoryId, x: number, y: number, scale: number) => {
      const { mesh: m } = makeAccessory(id);
      const bb = new THREE.Box3().setFromObject(m);
      const c = bb.getCenter(new THREE.Vector3());
      m.position.sub(c);
      const holder = new THREE.Group();
      holder.add(m);
      holder.scale.setScalar(scale);
      holder.position.set(x, y, 0.8);
      g.add(holder);
    };
    show("balloon", -1.7, 2.55, 0.9);
    show("duckhat", -1.6, 1.55, 2.2);
    show("starglasses", -0.9, 1.45, 2.6);
    show("unicorn", 1.6, 1.55, 2.0);
    show("teddy", 0.35, 2.55, 2.6);
    // ribbon rosette on the counter
    const ros = new THREE.Mesh(cyl(20), flat("#ffc53d", 0.35));
    ros.scale.set(0.22, 0.04, 0.22);
    ros.position.set(0, counterTop + 0.04, front + 0.3);
    g.add(ros);
  }
}

function horse(color: string, mane: string) {
  const h = new THREE.Group();
  const body = new THREE.Mesh(sphere, flat(color, 0.35));
  body.scale.set(0.62, 0.3, 0.26);
  h.add(body);
  const neck = new THREE.Mesh(sphere, flat(color, 0.35));
  neck.scale.set(0.16, 0.34, 0.14);
  neck.position.set(0.5, 0.3, 0);
  neck.rotation.z = -0.5;
  h.add(neck);
  const head = new THREE.Mesh(sphere, flat(color, 0.35));
  head.scale.set(0.28, 0.14, 0.13);
  head.position.set(0.72, 0.55, 0);
  head.rotation.z = -0.35;
  h.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 8), flat(color, 0.35));
    ear.scale.set(0.04, 0.12, 0.04);
    ear.position.set(0.6, 0.72, s * 0.06);
    h.add(ear);
    const eye = new THREE.Mesh(sphere, flat("#1a1a1e"));
    eye.scale.setScalar(0.025);
    eye.position.set(0.82, 0.6, s * 0.11);
    h.add(eye);
  }
  const maneM = new THREE.Mesh(sphere, flat(mane, 0.5));
  maneM.scale.set(0.12, 0.3, 0.06);
  maneM.position.set(0.42, 0.45, 0);
  maneM.rotation.z = -0.5;
  h.add(maneM);
  const tail = new THREE.Mesh(sphere, flat(mane, 0.5));
  tail.scale.set(0.08, 0.28, 0.06);
  tail.position.set(-0.66, -0.05, 0);
  tail.rotation.z = 0.6;
  h.add(tail);
  // legs in a gallop
  for (const [x, s, a] of [
    [0.38, 1, -0.6],
    [0.38, -1, -0.3],
    [-0.38, 1, 0.5],
    [-0.38, -1, 0.3],
  ] as const) {
    const leg = new THREE.Mesh(cyl(8), flat(color, 0.35));
    leg.scale.set(0.05, 0.5, 0.05);
    leg.position.set(x + Math.sin(a) * 0.2, -0.38, s * 0.12);
    leg.rotation.z = a;
    h.add(leg);
  }
  const saddle = new THREE.Mesh(sphere, flat("#e8455f", 0.4));
  saddle.scale.set(0.22, 0.08, 0.28);
  saddle.position.set(-0.05, 0.27, 0);
  h.add(saddle);
  return h;
}

export function makeCarnival(): CarnivalRig {
  const group = new THREE.Group();
  for (const b of BOOTHS) booth(b, group);

  // string lights across the front of the booths, on two slim poles
  const bulbs: THREE.Mesh[] = [];
  const bulbCols = ["#ffd23a", "#ff6a8a", "#6ad0ff", "#8af07a"];
  const x0 = BOOTHS[0]!.x - BOOTHS[0]!.w / 2 - 0.6;
  const x1 = BOOTHS[BOOTHS.length - 1]!.x + BOOTHS[BOOTHS.length - 1]!.w / 2 + 0.6;
  const lz = BOOTHS[0]!.z - 1.5 - 1.6;
  for (const x of [x0, x1]) group.add(mesh(boxGeo, "#8a5a32", 0.16, 4.6, 0.16, x, 2.3, lz, false));
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const y = 4.5 - Math.sin(t * Math.PI) * 0.7;
    const bulb = new THREE.Mesh(
      sphere,
      new THREE.MeshStandardMaterial({ color: bulbCols[i % 4], emissive: new THREE.Color(bulbCols[i % 4]), emissiveIntensity: 1.2 }),
    );
    bulb.scale.setScalar(0.09);
    bulb.position.set(x, y - 0.1, lz);
    group.add(bulb);
    bulbs.push(bulb);
  }

  // entrance arch south of the carousel gate
  const ax = CAROUSEL.x;
  const az = CAROUSEL.z - CAROUSEL.fence - 4.2;
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(cyl(12), flat(s < 0 ? "#e8455f" : "#4f93c4", 0.4));
    post.scale.set(0.12, 4.2, 0.12);
    post.position.set(ax + s * 3.2, 2.1, az);
    group.add(post);
    const ball = new THREE.Mesh(sphere, flat("#ffc53d", 0.3));
    ball.scale.setScalar(0.24);
    ball.position.set(ax + s * 3.2, 4.35, az);
    group.add(ball);
  }
  const arch = signBoard("CARNIVAL", 5.6, 1.0);
  arch.position.set(ax, 3.8, az);
  // painted face toward the south, where she walks up from
  arch.rotation.y = Math.PI;
  group.add(arch);

  // ---- carousel --------------------------------------------------------------
  const c = CAROUSEL;
  const base = new THREE.Mesh(cyl(48), flat("#f3eadc", 0.5));
  base.scale.set(c.radius + 0.3, 0.44, c.radius + 0.3);
  base.position.set(c.x, 0.22, c.z);
  base.receiveShadow = true;
  group.add(base);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 48, 1, true), new THREE.MeshStandardMaterial({ map: stripes("#e8455f", "#ffc53d", 24), roughness: 0.6 }));
  skirt.scale.set(c.radius + 0.32, 0.3, c.radius + 0.32);
  skirt.position.set(c.x, 0.2, c.z);
  group.add(skirt);
  const column = new THREE.Mesh(cyl(24), new THREE.MeshStandardMaterial({ map: stripes("#ffc53d", "#fff4e8", 16), roughness: 0.3 }));
  column.scale.set(0.78, 4.7, 0.78);
  column.position.set(c.x, 2.35, c.z);
  group.add(column);

  const spin = new THREE.Group();
  spin.position.set(c.x, 0, c.z);
  group.add(spin);
  const deck = new THREE.Mesh(
    new THREE.CircleGeometry(c.radius, 48),
    new THREE.MeshStandardMaterial({ map: stripes("#c49a62", "#d8b07a", 32, 512, 512), roughness: 0.7 }),
  );
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = 0.45;
  spin.add(deck);
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(c.radius + 1, 1.9, 32, 1, true),
    new THREE.MeshStandardMaterial({ map: stripes("#e8455f", "#fff4e8", 16), roughness: 0.6, side: THREE.DoubleSide }),
  );
  canopy.position.y = 5.65;
  canopy.castShadow = true;
  spin.add(canopy);
  const scallopCount = 24;
  for (let i = 0; i < scallopCount; i++) {
    const a = (i / scallopCount) * Math.PI * 2;
    const s = new THREE.Mesh(sphere, flat(i % 2 ? "#ffc53d" : "#4f93c4"));
    s.scale.set(0.5, 0.26, 0.08);
    s.position.set(Math.cos(a) * (c.radius + 1), 4.6, Math.sin(a) * (c.radius + 1));
    s.rotation.y = -a + Math.PI / 2;
    spin.add(s);
  }
  const flagPole = mesh(boxGeo, "#c8a040", 0.08, 1.0, 0.08, 0, 7.0, 0, false);
  spin.add(flagPole);
  spin.add(mesh(boxGeo, "#e8455f", 0.6, 0.35, 0.04, 0.3, 7.3, 0, false));
  // lights round the canopy rim
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.1;
    const bulb = new THREE.Mesh(
      sphere,
      new THREE.MeshStandardMaterial({ color: bulbCols[i % 4], emissive: new THREE.Color(bulbCols[i % 4]), emissiveIntensity: 1.2 }),
    );
    bulb.scale.setScalar(0.1);
    bulb.position.set(Math.cos(a) * (c.radius + 0.95), 4.72, Math.sin(a) * (c.radius + 0.95));
    spin.add(bulb);
    bulbs.push(bulb);
  }

  const horses: THREE.Group[] = [];
  const coats = [
    ["#fff4f8", "#f06aa8"],
    ["#f5d6a8", "#8a5a32"],
    ["#d8e8ff", "#4f93c4"],
    ["#fff4f8", "#b98ce0"],
    ["#e8d0f0", "#ffc53d"],
    ["#fdf0c8", "#e8455f"],
  ];
  for (let i = 0; i < c.horses; i++) {
    const a = (i / c.horses) * Math.PI * 2;
    const pole = new THREE.Mesh(cyl(10), flat("#ffd76a", 0.25));
    pole.scale.set(0.045, 4.2, 0.045);
    pole.position.set(Math.cos(a) * c.seatRadius, 2.55, Math.sin(a) * c.seatRadius);
    spin.add(pole);
    const holder = new THREE.Group();
    holder.position.set(Math.cos(a) * c.seatRadius, 1.35, Math.sin(a) * c.seatRadius);
    // nose along the direction of travel (increasing angle)
    holder.rotation.y = -a - Math.PI / 2;
    const [coat, mane] = coats[i % coats.length]!;
    holder.add(horse(coat!, mane!));
    holder.userData.angle = a;
    spin.add(holder);
    horses.push(holder);
  }

  // brass-ring arm, reaching in from the post outside the east fence
  const armX = c.x + c.fence + 0.8;
  group.add(mesh(boxGeo, "#c8a040", armX - (c.x + c.seatRadius + 0.5), 0.12, 0.12, (armX + c.x + c.seatRadius + 0.5) / 2, 2.75, c.z, false));
  const gold = new THREE.MeshStandardMaterial({ color: "#ffd23a", emissive: new THREE.Color("#ffb400"), emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.25 });
  const silver = new THREE.MeshStandardMaterial({ color: "#d8dde4", metalness: 0.7, roughness: 0.25 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 10, 24), silver);
  ring.position.set(c.x + c.seatRadius + 0.5, 2.45, c.z);
  ring.rotation.y = Math.PI / 2;
  group.add(ring);

  return { group, spin, horses, ring, gold, silver, bulbs };
}
