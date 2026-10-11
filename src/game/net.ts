import Peer, { type DataConnection } from "peerjs";
import { create } from "zustand";
import type { Worn } from "./accessories";
import type { Placed } from "./build-store";
import type { Avatar } from "./meshes";
import type { DressId } from "./types";

/**
 * Playing together: two to four kids, each on their own device, in the same
 * park at the same time. They see each other run about and they share the
 * Build Yard; everything else (sweets, stickers, tickets, the house) stays
 * each kid's own.
 *
 * The devices talk to each other directly (WebRTC, through PeerJS), so there
 * is no game server to run and nothing to sign up for. PeerJS's free public
 * broker only introduces them: one kid hosts and is given a four-digit code,
 * the others type it in, and from then on the data goes device to device.
 * Nothing is saved anywhere but on the devices themselves.
 *
 * The host is the hub. Each guest connects to the host alone; whatever a
 * guest says, the host passes on to the rest, stamped with who said it. The
 * shared yard is the host's own yard: a guest sees it, builds in it, and
 * their own yard is kept safe at home until they leave (yard-store.ts).
 */

export type Pose = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** running (for the legs) and on the ground (for the jump pose) */
  moving: boolean;
  ground: boolean;
  speed: number;
  /** which park she is in: someone in the other park is not drawn */
  level: number;
  /** sweets (or dumplings) she has found in that park: the race */
  found?: number;
};

export type Look = { name: string; dress: DressId; worn: Worn; avatar?: Avatar };

type Msg =
  | { t: "look"; look: Look; from?: string }
  | { t: "pose"; p: Pose; from?: string }
  | { t: "bye"; from: string }
  | { t: "full" }
  | { t: "yard"; pieces: Placed[] }
  | { t: "add"; q: Placed; from?: string }
  | { t: "del"; q: Placed; from?: string };

/** Another kid in the room, as this device last heard of them. */
export type Remote = { look: Look | null; pose: Pose | null; heardAt: number };

/** Everyone else in the room, by id. Read every frame, so not in a React store. */
export const remotes = new Map<string, Remote>();

export type NetStatus = "off" | "starting" | "hosting" | "joining" | "joined" | "error";

type NetStore = {
  status: NetStatus;
  code: string;
  /** names of everyone else, for the panel */
  names: string[];
  error: string;
};

export const useNet = create<NetStore>(() => ({ status: "off", code: "", names: [], error: "" }));

const MAX_GUESTS = 3;
const PREFIX = "sloanies-world-room-";

let peer: Peer | null = null;
/** host: one per guest. guest: the one to the host. */
const links = new Map<string, DataConnection>();
let myLook: Look | null = null;
let hostId = "";

/** What the yard sync (yard-store.ts) is told: the host's yard arrives, a piece comes or goes. */
type YardHooks = {
  /** the host's whole yard, for a guest who has just joined */
  adopt: (pieces: Placed[]) => void;
  add: (q: Placed) => void;
  del: (q: Placed) => void;
  /** a guest left the room: back to their own yard */
  leave: () => void;
  /** the host, asked for the yard by a new guest */
  current: () => Placed[];
};
let yard: YardHooks | null = null;
export function setYardHooks(h: YardHooks) {
  yard = h;
}

const refreshNames = () =>
  useNet.setState({
    names: [...remotes.values()].map((r) => r.look?.name || "A friend").sort(),
  });

function send(c: DataConnection, m: Msg) {
  if (c.open) c.send(m);
}

/** Host: to every guest but `except`. Guest: to the host. */
function broadcast(m: Msg, except?: string) {
  for (const [id, c] of links) if (id !== except) send(c, m);
}

function heard(from: string, m: Msg) {
  if (m.t === "look" || m.t === "pose") {
    const r = remotes.get(from) ?? { look: null, pose: null, heardAt: 0 };
    if (m.t === "look") r.look = m.look;
    else r.pose = m.p;
    r.heardAt = performance.now();
    const isNew = !remotes.has(from);
    remotes.set(from, r);
    if (m.t === "look" || isNew) refreshNames();
  } else if (m.t === "bye") {
    remotes.delete(from);
    refreshNames();
  } else if (m.t === "add") yard?.add(m.q);
  else if (m.t === "del") yard?.del(m.q);
}

function friendlyError(type: string) {
  if (type === "peer-unavailable") return "No game with that code. Check the number and try again.";
  if (type === "network" || type === "server-error" || type === "socket-error" || type === "socket-closed")
    return "Couldn't reach the internet to start. Check the Wi-Fi and try again.";
  if (type === "browser-incompatible") return "This browser can't play together.";
  return "Something went wrong. Try again.";
}

function reset() {
  for (const c of links.values()) c.close();
  links.clear();
  remotes.clear();
  peer?.destroy();
  peer = null;
  hostId = "";
}

/** Start a room on this device and get its code. */
export function hostRoom(look: Look) {
  leaveRoom();
  myLook = look;
  const code = String(1000 + Math.floor(Math.random() * 9000));
  useNet.setState({ status: "starting", code, names: [], error: "" });
  const p = new Peer(PREFIX + code);
  peer = p;
  p.on("open", () => useNet.setState({ status: "hosting" }));
  p.on("error", (e) => {
    // the code is taken by another game somewhere: pick another
    if (e.type === "unavailable-id") return hostRoom(look);
    useNet.setState({ status: "error", error: friendlyError(e.type) });
  });
  p.on("connection", (c) => {
    if (links.size >= MAX_GUESTS) {
      c.on("open", () => {
        send(c, { t: "full" });
        setTimeout(() => c.close(), 300);
      });
      return;
    }
    c.on("open", () => {
      links.set(c.peer, c);
      // the newcomer gets the host's look, everyone already here, and the yard
      if (myLook) send(c, { t: "look", look: myLook });
      for (const [id, r] of remotes) {
        if (r.look) send(c, { t: "look", look: r.look, from: id });
        if (r.pose) send(c, { t: "pose", p: r.pose, from: id });
      }
      send(c, { t: "yard", pieces: yard?.current() ?? [] });
    });
    c.on("data", (raw) => {
      const m = raw as Msg;
      heard(c.peer, m);
      if (m.t === "look" || m.t === "pose" || m.t === "add" || m.t === "del") broadcast({ ...m, from: c.peer }, c.peer);
    });
    const gone = () => {
      if (!links.has(c.peer)) return;
      links.delete(c.peer);
      remotes.delete(c.peer);
      refreshNames();
      broadcast({ t: "bye", from: c.peer });
    };
    c.on("close", gone);
    c.on("error", gone);
  });
}

/** Join the room with this code. */
export function joinRoom(code: string, look: Look) {
  leaveRoom();
  myLook = look;
  useNet.setState({ status: "joining", code, names: [], error: "" });
  const p = new Peer();
  peer = p;
  p.on("error", (e) => useNet.setState({ status: "error", error: friendlyError(e.type) }));
  p.on("open", () => {
    const c = p.connect(PREFIX + code, { reliable: true });
    c.on("open", () => {
      hostId = c.peer;
      links.set(c.peer, c);
      if (myLook) send(c, { t: "look", look: myLook });
      useNet.setState({ status: "joined" });
    });
    c.on("data", (raw) => {
      const m = raw as Msg;
      if (m.t === "full") {
        useNet.setState({ status: "error", error: "That game is full: four is the most." });
        return;
      }
      if (m.t === "yard") return yard?.adopt(m.pieces);
      // the host's own words come without a sender; everyone else's are stamped
      heard(m.t === "bye" ? m.from : (m.from ?? c.peer), m);
    });
    c.on("close", () => {
      if (useNet.getState().status !== "joined") return;
      reset();
      yard?.leave();
      useNet.setState({ status: "error", names: [], error: "The game ended." });
    });
  });
}

/** Leave the room, or close it if hosting. */
export function leaveRoom() {
  const wasGuest = useNet.getState().status === "joined" || !!hostId;
  reset();
  if (wasGuest) yard?.leave();
  useNet.setState({ status: "off", code: "", names: [], error: "" });
}

export const inRoom = () => {
  const s = useNet.getState().status;
  return s === "hosting" || s === "joined";
};

/** This device's position, a dozen times a second (runtime.ts). */
export function sendPose(p: Pose) {
  if (links.size) broadcast({ t: "pose", p });
}

/** This device's name and outfit, whenever they change. */
export function sendLook(look: Look) {
  myLook = look;
  if (links.size) broadcast({ t: "look", look });
}

/** A piece she put down or took away in the shared yard. */
export function sendYard(op: "add" | "del", q: Placed) {
  if (links.size) broadcast(op === "add" ? { t: "add", q } : { t: "del", q });
}
