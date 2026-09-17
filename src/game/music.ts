/* ---------------------------------------------------------------------------
 * Sloan's iPod
 * Five procedural music channels, synthesised with Web Audio like everything
 * else in the game. A look-ahead scheduler (a 25ms interval placing notes
 * ~120ms ahead on the AudioContext clock) steps through a 16-bar song per
 * channel. Channels play through audio.ts's master (so mute works) and fade the
 * park's music bed out while they play.
 * ------------------------------------------------------------------------- */

import { duckMusicBed, ipodOutput } from "./audio";

export type ChannelId = "pop" | "rock" | "hiphop" | "latin" | "calm";

export const CHANNELS: { id: ChannelId; name: string; color: string; bpm: number }[] = [
  { id: "pop", name: "Pop Party", color: "#ff5fa2", bpm: 120 },
  { id: "rock", name: "Rock Out", color: "#ff7a1a", bpm: 130 },
  { id: "hiphop", name: "Hip Hop", color: "#8e6cff", bpm: 90 },
  { id: "latin", name: "Latin Fiesta", color: "#ffc21a", bpm: 102 },
  { id: "calm", name: "Sleepy Time", color: "#6fc3ff", bpm: 70 },
];

const LOOKAHEAD = 0.12; // seconds of notes placed ahead of the audio clock
// when the timer is being throttled (hidden tab: ~1 tick a second) look further ahead so it doesn't stutter
const LOOKAHEAD_THROTTLED = 1.5;
const TICK_MS = 25;
const FADE = 0.4; // crossfade seconds

/* ---------------------------------------------------------------------------
 * Notes and chords
 * ------------------------------------------------------------------------- */

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#4" -> 61 */
function midi(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + PC[m[1]!]! + acc;
}

function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** A note in a bar: start step, midi note, length in steps. */
type Ev = readonly [step: number, note: number, len: number];

/** "E5:2 G5:2 -:4" -> events. Lengths are in steps (16ths). */
function line(s: string): Ev[] {
  const out: Ev[] = [];
  let step = 0;
  for (const tok of s.trim().split(/\s+/)) {
    if (!tok) continue;
    const [n, l] = tok.split(":");
    const len = Number(l);
    if (!(len > 0)) throw new Error(`bad token ${tok}`);
    if (n !== "-") out.push([step, midi(n!), len]);
    step += len;
  }
  return out;
}

/** One line per bar; each bar's events indexed by start step for fast lookup. */
function tune(bars: string[]): Map<number, Ev>[] {
  return bars.map((b) => {
    const m = new Map<number, Ev>();
    for (const e of line(b)) m.set(e[0], e);
    return m;
  });
}

const QUALITY: Record<string, number[]> = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
};

type Chord = { root: number; tones: number[] };

function chord(name: string): Chord {
  const m = /^([A-G])(#|b)?(.*)$/.exec(name);
  const q = m ? QUALITY[m[3]!] : undefined;
  if (!m || !q) throw new Error(`bad chord ${name}`);
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return { root: (PC[m[1]!]! + acc + 12) % 12, tones: q };
}

function chords(s: string): Chord[] {
  return s.trim().split(/\s+/).map(chord);
}

/** The root placed in [low, low+12). */
function rootIn(c: Chord, low: number): number {
  return low + ((c.root - low) % 12 + 12) % 12;
}

/** Chord tones (triad, or with 7th) each folded into [low, low+12), ascending. */
function voicing(c: Chord, low: number, triad = false): number[] {
  const tones = triad ? c.tones.slice(0, 3) : c.tones;
  return tones.map((iv) => rootIn({ root: (c.root + iv) % 12, tones: [] }, low)).sort((a, b) => a - b);
}

/* ---------------------------------------------------------------------------
 * The synth kit: one per playing channel. All notes feed `sum`, which goes
 * through a gentle compressor (so nothing clips) and a fade gain for the
 * crossfade, then out to audio.ts's iPod bus.
 * ------------------------------------------------------------------------- */

let noiseBuf: AudioBuffer | null = null;
let noiseCtx: AudioContext | null = null;
let shapeCurve: Float32Array<ArrayBuffer> | null = null;

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noiseBuf && noiseCtx === c) return noiseBuf;
  const len = Math.floor(c.sampleRate * 2);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  noiseCtx = c;
  return buf;
}

function distortionCurve(): Float32Array<ArrayBuffer> {
  if (shapeCurve) return shapeCurve;
  const n = 2048;
  const k = 4;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  shapeCurve = curve;
  return curve;
}

/** Disconnect a note's nodes once its source has finished. */
function cleanup(src: AudioScheduledSourceNode, nodes: AudioNode[]) {
  src.onended = () => {
    try {
      src.disconnect();
      for (const n of nodes) n.disconnect();
    } catch {
      /* already gone */
    }
  };
}

/** Linear attack to `peak`, hold, exponential release. Returns when it is silent. */
function envelope(g: GainNode, t: number, peak: number, attack: number, hold: number, release: number): number {
  const p = Math.max(0.0002, peak);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(p, t + attack);
  if (hold > 0) g.gain.setValueAtTime(p, t + attack + hold);
  const end = t + attack + hold + release;
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  return end;
}

class Kit {
  readonly c: AudioContext;
  readonly sum: GainNode;
  readonly comp: DynamicsCompressorNode;
  readonly fade: GainNode;
  private extra: AudioNode[] = [];
  private guitarIn: GainNode | null = null;
  private leadIn: GainNode | null = null;

  constructor(c: AudioContext, out: AudioNode, level: number) {
    this.c = c;
    this.sum = c.createGain();
    this.sum.gain.value = level;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.knee.value = 8;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.15;
    this.fade = c.createGain();
    this.fade.gain.value = 0;
    this.sum.connect(this.comp);
    this.comp.connect(this.fade);
    this.fade.connect(out);
  }

  dispose() {
    for (const n of [this.sum, this.comp, this.fade, ...this.extra]) {
      try {
        n.disconnect();
      } catch {
        /* fine */
      }
    }
    this.extra = [];
  }

  private osc(type: OscillatorType, freq: number, t: number): OscillatorNode {
    const o = this.c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    return o;
  }

  private noise(t: number, dur: number): AudioBufferSourceNode {
    const s = this.c.createBufferSource();
    s.buffer = noiseBuffer(this.c);
    s.start(t, Math.random() * 1.5, dur + 0.05);
    return s;
  }

  private filter(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = this.c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  /** Noise through a filter with a quick envelope: hats, shakers, snare wires. */
  private noiseHit(t: number, vel: number, type: BiquadFilterType, freq: number, q: number, attack: number, decay: number, dest: AudioNode = this.sum) {
    const src = this.noise(t, attack + decay);
    const f = this.filter(type, freq, q);
    const g = this.c.createGain();
    envelope(g, t, vel, attack, 0, decay);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    cleanup(src, [f, g]);
  }

  /** A single enveloped oscillator, optionally filtered and pitch-swept. */
  tone(t: number, type: OscillatorType, freq: number, vel: number, attack: number, hold: number, release: number, opts: { to?: number; sweep?: number; lp?: number; detune?: number; dest?: AudioNode } = {}) {
    const o = this.osc(type, freq, t);
    if (opts.detune) o.detune.setValueAtTime(opts.detune, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + (opts.sweep ?? 0.05));
    const g = this.c.createGain();
    const end = envelope(g, t, vel, attack, hold, release);
    const nodes: AudioNode[] = [g];
    if (opts.lp) {
      const f = this.filter("lowpass", opts.lp);
      o.connect(f);
      f.connect(g);
      nodes.push(f);
    } else {
      o.connect(g);
    }
    g.connect(opts.dest ?? this.sum);
    o.start(t);
    o.stop(end + 0.02);
    cleanup(o, nodes);
  }

  /* ---- drums ---- */

  kick(t: number, vel: number, decay = 0.32, from = 160, to = 48) {
    this.tone(t, "sine", from, vel * 0.9, 0.002, 0.02, decay, { to, sweep: 0.07 });
    // a little click so it reads on small speakers
    this.tone(t, "triangle", from * 2.2, vel * 0.18, 0.001, 0, 0.02, { to: from, sweep: 0.02 });
  }

  snare(t: number, vel: number, decay = 0.16, body = 190) {
    this.tone(t, "triangle", body, vel * 0.35, 0.002, 0, 0.07, { to: body * 0.75, sweep: 0.06 });
    this.noiseHit(t, vel * 0.45, "highpass", 1400, 0.7, 0.002, decay);
  }

  clap(t: number, vel: number) {
    const src = this.noise(t, 0.25);
    const f = this.filter("bandpass", 1300, 1.1);
    const g = this.c.createGain();
    const p = Math.max(0.0002, vel * 0.9);
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < 3; i++) {
      const s = t + i * 0.011;
      g.gain.setValueAtTime(p, s);
      g.gain.exponentialRampToValueAtTime(p * 0.15, s + 0.009);
    }
    g.gain.setValueAtTime(p * 0.8, t + 0.034);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    src.connect(f);
    f.connect(g);
    g.connect(this.sum);
    cleanup(src, [f, g]);
  }

  hat(t: number, vel: number, open = false) {
    this.noiseHit(t, vel * 0.3, "highpass", 7500, 0.8, 0.001, open ? 0.22 : 0.035);
  }

  shaker(t: number, vel: number) {
    this.noiseHit(t, vel * 0.3, "bandpass", 6000, 0.9, 0.012, 0.05);
  }

  crash(t: number, vel: number) {
    this.noiseHit(t, vel * 0.22, "highpass", 5000, 0.6, 0.002, 1.3);
  }

  tom(t: number, vel: number, freq: number) {
    this.tone(t, "sine", freq * 1.5, vel * 0.7, 0.002, 0.02, 0.26, { to: freq, sweep: 0.05 });
    this.noiseHit(t, vel * 0.08, "lowpass", 2500, 0.7, 0.001, 0.05);
  }

  rim(t: number, vel: number) {
    this.tone(t, "triangle", 820, vel * 0.3, 0.001, 0, 0.035);
    this.noiseHit(t, vel * 0.3, "highpass", 2800, 0.8, 0.001, 0.05);
  }

  clave(t: number, vel: number) {
    this.tone(t, "sine", 2350, vel * 0.35, 0.001, 0, 0.06);
  }

  /** Congas and bongos: a pitched thump that settles onto its note; slaps add a crack. */
  conga(t: number, vel: number, freq: number, kind: "open" | "mute" | "slap") {
    const decay = kind === "open" ? 0.28 : kind === "mute" ? 0.07 : 0.1;
    this.tone(t, "sine", freq * 1.35, vel * 0.6, 0.002, 0, decay, { to: freq, sweep: 0.025 });
    if (kind === "slap") this.noiseHit(t, vel * 0.3, "bandpass", 2200, 1.2, 0.001, 0.05);
  }

  /* ---- pitched voices ---- */

  bass(t: number, note: number, dur: number, vel: number, kind: "pluck" | "saw" | "round") {
    const f = mtof(note);
    if (kind === "saw") {
      this.tone(t, "sawtooth", f, vel * 0.35, 0.004, dur * 0.7, dur * 0.3 + 0.05, { lp: 650 });
      this.tone(t, "sine", f, vel * 0.3, 0.004, dur * 0.7, dur * 0.3 + 0.05);
    } else if (kind === "round") {
      // hip hop: deep sine plus a soft triangle an octave up so laptops can hear it
      this.tone(t, "sine", f, vel * 0.45, 0.01, dur * 0.8, dur * 0.3 + 0.08);
      this.tone(t, "triangle", f * 2, vel * 0.12, 0.01, dur * 0.5, dur * 0.3, { lp: 700 });
    } else {
      // upright-ish tumbao bass
      this.tone(t, "triangle", f, vel * 0.45, 0.004, 0.02, dur * 0.9 + 0.1, { lp: 900 });
      this.tone(t, "sine", f, vel * 0.35, 0.004, 0.02, dur + 0.1);
    }
  }

  /** Bright detuned-saw stab for pop chords. */
  synth(t: number, note: number, dur: number, vel: number) {
    const f = mtof(note);
    this.tone(t, "sawtooth", f, vel * 0.5, 0.004, dur * 0.4, dur * 0.6 + 0.06, { lp: 2400, detune: 8 });
    this.tone(t, "sawtooth", f, vel * 0.5, 0.004, dur * 0.4, dur * 0.6 + 0.06, { lp: 2400, detune: -8 });
  }

  /** Soft sustained pad. */
  pad(t: number, note: number, dur: number, vel: number, lp = 1000) {
    const f = mtof(note);
    this.tone(t, "triangle", f, vel, Math.min(0.5, dur * 0.3), dur * 0.6, dur * 0.4 + 0.5, { lp, detune: 5 });
    this.tone(t, "sawtooth", f, vel * 0.25, Math.min(0.5, dur * 0.3), dur * 0.6, dur * 0.4 + 0.5, { lp: lp * 0.7, detune: -6 });
  }

  /** Pop lead: triangle body with a little square edge. */
  lead(t: number, note: number, dur: number, vel: number) {
    const f = mtof(note);
    this.tone(t, "triangle", f, vel * 0.7, 0.008, dur * 0.6, dur * 0.4 + 0.08);
    this.tone(t, "square", f, vel * 0.12, 0.008, dur * 0.5, dur * 0.4 + 0.05, { lp: 3000 });
  }

  /** Electric piano for hip hop keys: sine with a bell-ish overtone. */
  epiano(t: number, note: number, dur: number, vel: number) {
    const f = mtof(note);
    this.tone(t, "sine", f, vel, 0.006, dur * 0.3, dur * 0.7 + 0.4);
    this.tone(t, "triangle", f, vel * 0.25, 0.006, 0, dur * 0.5 + 0.2, { lp: 1600, detune: 7 });
    this.tone(t, "sine", f * 3, vel * 0.12, 0.002, 0, 0.18);
  }

  /** Montuno piano: percussive triangle with a quick bright overtone. */
  piano(t: number, note: number, dur: number, vel: number) {
    const f = mtof(note);
    this.tone(t, "triangle", f, vel, 0.003, 0, dur + 0.25);
    this.tone(t, "sine", f * 2, vel * 0.35, 0.002, 0, 0.12);
  }

  /** Soft vibraphone/bell for melodies over hip hop. */
  bell(t: number, note: number, dur: number, vel: number) {
    const f = mtof(note);
    this.tone(t, "sine", f, vel, 0.005, dur * 0.4, dur * 0.6 + 0.5);
    this.tone(t, "sine", f * 4, vel * 0.08, 0.002, 0, 0.25);
  }

  /** Brass stab for the latin horn line. */
  horn(t: number, note: number, dur: number, vel: number) {
    const f = mtof(note);
    this.tone(t, "sawtooth", f, vel * 0.45, 0.03, dur * 0.6, dur * 0.3 + 0.06, { lp: 1800, detune: 5 });
    this.tone(t, "square", f, vel * 0.18, 0.03, dur * 0.6, dur * 0.3 + 0.06, { lp: 1200, detune: -5 });
  }

  /** Music box: sine with a fast-fading high tine. */
  musicbox(t: number, note: number, dur: number, vel: number) {
    const f = mtof(note);
    this.tone(t, "sine", f, vel, 0.004, 0, Math.max(1.0, dur * 1.2));
    this.tone(t, "sine", f * 3, vel * 0.18, 0.002, 0, 0.2);
  }

  /** Harp / soft pluck. */
  harp(t: number, note: number, vel: number) {
    this.tone(t, "triangle", mtof(note), vel, 0.006, 0, 1.1, { lp: 1800 });
  }

  /* ---- distorted guitar ---- */

  private distBus(drive: number, tone: number, level: number): GainNode {
    const inp = this.c.createGain();
    inp.gain.value = drive;
    const shaper = this.c.createWaveShaper();
    shaper.curve = distortionCurve();
    shaper.oversample = "2x";
    const cab = this.filter("lowpass", tone, 0.8);
    const mid = this.c.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 900;
    mid.gain.value = 3;
    mid.Q.value = 0.8;
    const out = this.c.createGain();
    out.gain.value = level;
    inp.connect(shaper);
    shaper.connect(cab);
    cab.connect(mid);
    mid.connect(out);
    out.connect(this.sum);
    this.extra.push(inp, shaper, cab, mid, out);
    return inp;
  }

  /** Power chord (root, fifth, octave). Muted chugs are short and darker going into the drive. */
  powerChord(t: number, root: number, dur: number, vel: number, muted: boolean) {
    if (!this.guitarIn) this.guitarIn = this.distBus(3, 3200, 0.16);
    const dest = this.guitarIn;
    const lp = muted ? 700 : 2600;
    const release = muted ? 0.06 : 0.25;
    const hold = muted ? Math.min(dur, 0.06) : dur * 0.85;
    for (const [iv, det] of [[0, -6], [0, 6], [7, 0], [12, 3]] as const) {
      this.tone(t, "sawtooth", mtof(root + iv), vel * 0.22, 0.003, hold, release, { lp, detune: det, dest });
    }
  }

  /** Single-note lead guitar through a softer drive. */
  leadGuitar(t: number, note: number, dur: number, vel: number) {
    if (!this.leadIn) this.leadIn = this.distBus(2, 2600, 0.11);
    this.tone(t, "sawtooth", mtof(note), vel * 0.4, 0.01, dur * 0.8, dur * 0.2 + 0.12, { lp: 2200, dest: this.leadIn, detune: 4 });
    this.tone(t, "square", mtof(note), vel * 0.2, 0.01, dur * 0.8, dur * 0.2 + 0.12, { lp: 1500, dest: this.leadIn, detune: -4 });
  }
}

/* ---------------------------------------------------------------------------
 * Channel definitions (below): each is a 16-bar song played step by step.
 * ------------------------------------------------------------------------- */

/** Everything a channel needs to place the notes of one step. */
type StepInfo = {
  k: Kit;
  t: number; // audio time of this step, swing applied
  bar: number; // 0..15 within the song
  step: number; // 0..stepsPerBar-1
  loop: number; // how many times the song has come round
  sps: number; // seconds per step (16th note)
};

type ChannelDef = {
  id: ChannelId;
  stepsPerBar: number; // 16 for 4/4, 12 for 3/4
  bars: number;
  swing: number; // fraction of a step to delay odd 16ths
  level: number; // gain into the compressor, to balance channels
  play: (s: StepInfo) => void;
};

/* ---- Pop Party: 120 bpm, C major, four on the floor ---- */

const POP_CHORDS = chords("C G Am F C G Am F F G Em Am F G C G");
const POP_HOOK = tune([
  "E5:2 G5:2 G5:2 A5:2 G5:4 E5:2 C5:2",
  "D5:4 D5:2 E5:2 D5:4 B4:4",
  "C5:2 E5:2 E5:2 A5:2 G5:4 E5:2 D5:2",
  "C5:6 D5:2 C5:8",
  "E5:2 G5:2 G5:2 A5:2 G5:4 E5:2 C5:2",
  "D5:4 D5:2 E5:2 D5:4 B4:4",
  "C5:2 E5:2 E5:2 A5:2 G5:4 E5:2 D5:2",
  "A4:2 C5:2 F5:4 E5:4 -:4",
  "A5:4 G5:2 F5:2 A5:8",
  "G5:4 F5:2 E5:2 D5:8",
  "E5:4 G5:4 B5:4 G5:4",
  "A5:6 G5:2 E5:8",
  "A5:4 G5:2 F5:2 C6:8",
  "B5:4 A5:2 G5:2 D5:8",
  "E5:2 G5:2 C6:12",
  "D5:4 -:4 G5:2 A5:2 B5:4",
]);
const POP_STABS = new Set([0, 3, 6, 10, 12]);
const POP_ARP = [0, 1, 2, 1];

const pop: ChannelDef = {
  id: "pop",
  stepsPerBar: 16,
  bars: 16,
  swing: 0,
  level: 0.31,
  play({ k, t, bar, step, loop, sps }) {
    const ch = POP_CHORDS[bar]!;
    const B = bar >= 8;
    const fill = bar === 7 || bar === 15;
    const roll = fill && step >= 12;
    // every other time round, the first two bars drop the kick for a lift
    const drop = loop % 2 === 1 && bar < 2;

    if (step === 0 && (bar === 0 || bar === 8)) k.crash(t, 0.9);
    if (step % 4 === 0 && !drop && !roll) k.kick(t, 1);
    if ((step === 4 || step === 12) && !roll) k.clap(t, 0.55);
    if (roll) k.snare(t, 0.3 + (step - 12) * 0.12, 0.1, 220);
    if (step % 4 === 2) k.hat(t, 0.8, true);
    else if (B && step % 2 === 1) k.hat(t, 0.35);

    // octave-bouncing bass on 8ths
    if (step % 2 === 0 && !(roll && step === 14)) {
      const r = rootIn(ch, 36);
      k.bass(t, step % 4 === 2 ? r + 12 : r, sps * 1.6, step % 4 === 0 ? 0.7 : 0.55, "saw");
    }

    // chords: stabs in the verse, a held pad plus lighter stabs in the chorus
    const v = voicing(ch, 60, true);
    if (!B && POP_STABS.has(step)) for (const n of v) k.synth(t, n, sps * 1.5, 0.12);
    if (B) {
      if (step === 0) for (const n of v) k.pad(t, n, sps * 15, 0.07, 1400);
      if (step === 6 || step === 10 || step === 14) for (const n of v) k.synth(t, n + 12, sps, 0.07);
    }

    // melody, or on alternate passes a sparkly arpeggio for the first four bars
    if (loop % 2 === 1 && bar < 4) {
      if (step % 2 === 0) k.musicbox(t, voicing(ch, 72, true)[POP_ARP[(step / 2) % 4]!]!, sps * 2, 0.1);
    } else {
      const e = POP_HOOK[bar]!.get(step);
      if (e) k.lead(t, e[1], e[2] * sps * 0.92, 0.2);
    }
  },
};

/* ---- Rock Out: 130 bpm, E, driving eighths ---- */

const ROCK_CHORDS = chords("E E C D E E C D G D Em C G D C D");
const ROCK_LEAD_B = tune([
  "", "", "", "", "", "", "", "",
  "B4:4 D5:4 B4:2 A4:2 G4:4",
  "A4:4 F#4:4 D4:8",
  "G4:2 A4:2 B4:4 E5:8",
  "D5:4 C5:2 B4:2 G4:8",
  "B4:4 D5:4 G5:8",
  "F#5:4 E5:2 D5:2 A4:8",
  "G5:4 E5:4 C5:4 E5:4",
  "D5:8 -:8",
]);
const ROCK_LEAD_A = tune([
  "E5:6 D5:2 B4:8", "", "C5:4 B4:4 G4:8", "A4:8 F#4:8",
  "E5:6 D5:2 B4:8", "", "C5:4 B4:4 G4:8", "D5:8 -:8",
]);
const ROCK_ACCENT = new Set([0, 6, 12]);

const rock: ChannelDef = {
  id: "rock",
  stepsPerBar: 16,
  bars: 16,
  swing: 0,
  level: 0.245,
  play({ k, t, bar, step, loop, sps }) {
    const ch = ROCK_CHORDS[bar]!;
    const B = bar >= 8;
    const fill = (bar === 7 || bar === 15) && step >= 8;
    const root = rootIn(ch, 40);

    // drums
    if (step === 0 && (bar === 0 || bar === 8)) k.crash(t, 1);
    if (fill) {
      if (step === 8) k.kick(t, 0.9);
      if (step === 8 || step === 9) k.snare(t, 0.6, 0.12);
      else if (step < 12) k.tom(t, 0.7, 210);
      else if (step < 14) k.tom(t, 0.75, 150);
      else k.tom(t, 0.85, 105);
    } else {
      const kicks = B ? step === 0 || step === 6 || step === 8 : step === 0 || step === 8 || step === 10;
      if (kicks) k.kick(t, 1, 0.26);
      if (step === 4 || step === 12) k.snare(t, 0.9);
      if (B) {
        if (step % 4 === 0) k.hat(t, 0.7, true);
      } else if (step % 2 === 0) k.hat(t, step % 4 === 0 ? 0.8 : 0.5);
    }

    // guitar and bass
    if (bar === 7 || bar === 15) {
      // one big ringing chord, then the drums take the fill
      if (step === 0) k.powerChord(t, root, sps * 7, 1, false);
    } else if (!B) {
      if (step % 2 === 0) {
        const accent = ROCK_ACCENT.has(step);
        k.powerChord(t, root, accent ? sps * 2 : sps, accent ? 1 : 0.75, !accent);
      }
    } else if (step === 0 || step === 6 || step === 10) {
      k.powerChord(t, root, sps * (step === 6 ? 4 : 6), 1, false);
    } else if (step === 14) {
      k.powerChord(t, root, sps, 0.7, true);
    }
    if (step % 2 === 0 && !(fill && step > 8)) {
      k.bass(t, rootIn(ch, 36), sps * 1.7, 0.75, "saw");
    }

    // lead: always in the chorus, and over the verse on alternate passes
    const lead = B ? ROCK_LEAD_B[bar]! : loop % 2 === 1 ? ROCK_LEAD_A[bar]! : undefined;
    const e = lead?.get(step);
    if (e) k.leadGuitar(t, e[1], e[2] * sps * 0.95, 0.9);
  },
};

/* ---- Hip Hop: 90 bpm, swung boom-bap with jazzy keys ---- */

const HH_CHORDS = chords("Cmaj7 Am7 Dm7 G7 Cmaj7 Am7 Dm7 G7 Fmaj7 Em7 Dm7 G7 Fmaj7 Em7 Am7 G7");
const HH_TUNE = tune([
  "E5:4 G5:4 B5:8",
  "A5:4 G5:2 E5:2 C5:8",
  "D5:4 F5:4 A5:4 C6:4",
  "B5:8 -:8",
  "E5:4 G5:4 B5:8",
  "A5:4 G5:2 E5:2 C5:8",
  "D5:4 F5:4 A5:4 C6:4",
  "G5:4 F5:4 D5:8",
  "-:4 A5:2 G5:2 E5:4 C5:4",
  "D5:6 E5:2 G5:8",
  "-:4 F5:2 E5:2 D5:4 A4:4",
  "B4:8 -:8",
  "-:4 A5:2 G5:2 E5:4 C6:4",
  "B5:6 G5:2 E5:8",
  "-:4 C5:2 D5:2 E5:4 G5:4",
  "F5:4 D5:4 B4:8",
]);

const hiphop: ChannelDef = {
  id: "hiphop",
  stepsPerBar: 16,
  bars: 16,
  swing: 0.3,
  level: 0.33,
  play({ k, t, bar, step, loop, sps }) {
    const ch = HH_CHORDS[bar]!;
    const B = bar >= 8;
    const fill = bar === 7 || bar === 15;
    const odd = bar % 2 === 1;

    // drums: boom ... bap, boom-boom bap
    const kicks = odd ? step === 0 || step === 8 || step === 10 : step === 0 || step === 7 || step === 10;
    if (kicks && !(fill && step >= 8)) k.kick(t, 1, 0.45, 130, 42);
    if (step === 4 || step === 12) k.snare(t, 1, 0.2, 180);
    if (odd && step === 7) k.snare(t, 0.2, 0.08, 200);
    if (fill && (step === 14 || step === 15)) k.snare(t, step === 15 ? 0.7 : 0.4, 0.12, 200);
    if (step % 2 === 0) {
      if (step === 14 && bar % 4 === 3) k.hat(t, 0.55, true);
      else k.hat(t, step % 4 === 0 ? 0.7 : 0.45);
    } else if (step === 3 || step === 11) k.hat(t, 0.25);

    // deep bass following the kick
    const r = rootIn(ch, 36);
    if (step === 0) k.bass(t, r, sps * 6, 0.9, "round");
    if (step === 7 && !odd) k.bass(t, r, sps * 3, 0.7, "round");
    if (step === 10) k.bass(t, odd ? r + 7 : r + 12, sps * 4, 0.7, "round");

    // mellow keys: a long chord and a lazy restab
    const v = voicing(ch, 55);
    if (step === 0) for (const n of v) k.epiano(t, n, sps * 9, 0.07);
    if (step === 11) for (const n of v) k.epiano(t, n, sps * 4, 0.05);

    // vibes melody in the chorus, and over the verse on alternate passes
    if (B || loop % 2 === 1) {
      const e = HH_TUNE[bar]!.get(step);
      if (e) k.bell(t, e[1], e[2] * sps, 0.12);
    }
  },
};

/* ---- Latin Fiesta: 102 bpm, clave, congas, tumbao and montuno ---- */

const LAT_CHORDS = chords("C F G F C F G F Am Dm G C Am Dm G7 C");
const LAT_HORN = tune([
  "", "", "", "", "", "", "", "",
  "E5:2 E5:2 -:2 E5:2 D5:2 C5:2 -:4",
  "D5:2 D5:2 -:2 F5:2 E5:2 D5:2 -:4",
  "B4:2 D5:2 -:2 G5:2 F5:2 D5:2 -:4",
  "E5:6 C5:2 -:8",
  "E5:2 E5:2 -:2 E5:2 D5:2 C5:2 -:4",
  "D5:2 D5:2 -:2 F5:2 E5:2 D5:2 -:4",
  "B4:2 D5:2 F5:2 G5:2 A5:2 B5:2 -:4",
  "C6:6 G5:2 -:8",
]);
// son clave 3-2 over two bars
const CLAVE = [new Set([0, 6, 12]), new Set([4, 8])];
// montuno: chord-tone index (0 root, 1 third, 2 fifth) by step, two-bar cycle
const MONTUNO: Map<number, number>[] = [
  new Map([[0, 0], [2, 2], [3, 1], [6, 2], [8, 0], [10, 2], [11, 1], [14, 2]]),
  new Map([[0, 1], [2, 2], [4, 0], [6, 1], [7, 2], [10, 0], [12, 1], [14, 2]]),
];

const latin: ChannelDef = {
  id: "latin",
  stepsPerBar: 16,
  bars: 16,
  swing: 0.06,
  level: 0.58,
  play({ k, t, bar, step, loop, sps }) {
    const ch = LAT_CHORDS[bar]!;
    const next = LAT_CHORDS[(bar + 1) % LAT_CHORDS.length]!;
    const B = bar >= 8;
    const fill = (bar === 7 || bar === 15) && step >= 8;
    const two = bar % 2;

    if (step === 0 && (bar === 0 || bar === 8)) k.crash(t, 0.6);
    if (CLAVE[two]!.has(step)) k.clave(t, 0.8);
    k.shaker(t, step % 2 === 0 ? 0.55 : 0.25);

    // conga tumbao, bongo martillo in the chorus, timbale-ish fill
    if (fill) {
      k.conga(t, 0.35 + (step - 8) * 0.06, step % 2 === 0 ? 330 : 247, "open");
    } else {
      if (step === 0 || step === 8) k.conga(t, 0.35, 200, "mute");
      if (step === 4) k.conga(t, 0.6, 262, "slap");
      if (step === 12) k.conga(t, 0.7, 262, "open");
      if (step === 14) k.conga(t, 0.65, two ? 196 : 262, "open");
      if (B && step % 2 === 0) k.conga(t, step % 8 === 0 ? 0.35 : 0.2, step % 8 === 0 ? 520 : 440, step % 8 === 0 ? "open" : "mute");
    }

    // reggaeton dembow under the chorus
    if (B && !fill) {
      if (step % 4 === 0) k.kick(t, 0.8, 0.3, 120, 45);
      if (step === 3 || step === 6 || step === 11 || step === 14) k.rim(t, 0.6);
    }

    // tumbao bass: fifth on "2 and", next chord's root on "4", ringing over the bar line
    if (loop === 0 && bar === 0 && step === 0) k.bass(t, rootIn(ch, 36), sps * 6, 0.9, "pluck");
    if (step === 6) k.bass(t, rootIn({ root: (ch.root + 7) % 12, tones: [] }, 36), sps * 5, 0.85, "pluck");
    if (step === 12) k.bass(t, rootIn(next, 36), sps * 8, 0.95, "pluck");

    // piano montuno in octaves
    const idx = MONTUNO[two]!.get(step);
    if (idx !== undefined) {
      const n = voicing(ch, 60, true)[idx]!;
      k.piano(t, n, sps * 1.5, 0.09);
      k.piano(t, n + 12, sps * 1.5, 0.06);
    }

    // horns: the hook in the chorus, punchy hits in the verse on alternate passes
    if (B) {
      const e = LAT_HORN[bar]!.get(step);
      if (e) k.horn(t, e[1], e[2] * sps * 0.85, 0.16);
    } else if (loop % 2 === 1 && (step === 6 || step === 14) && !fill) {
      for (const n of voicing(ch, 67, true)) k.horn(t, n, sps * 1.2, 0.09);
    }
  },
};

/* ---- Sleepy Time: 70 bpm, 3/4 lullaby on a music box ---- */

const CALM_CHORDS = chords("C Am F G C Am Dm G F G Em Am F G C C");
const CALM_TUNE = tune([
  "E5:4 G5:4 C6:4",
  "B5:6 A5:2 E5:4",
  "F5:4 A5:4 C6:4",
  "B5:8 G5:4",
  "E5:4 G5:4 C6:4",
  "D6:6 C6:2 A5:4",
  "F5:4 A5:4 D6:4",
  "G5:12",
  "A5:6 G5:2 F5:4",
  "G5:6 F5:2 D5:4",
  "E5:4 G5:4 B5:4",
  "A5:12",
  "A5:4 C6:4 A5:4",
  "B5:4 D6:4 B5:4",
  "C6:6 G5:2 E5:4",
  "C5:12",
]);
const CALM_ARP = [0, 1, 2, 3, 2, 1];

const calm: ChannelDef = {
  id: "calm",
  stepsPerBar: 12,
  bars: 16,
  swing: 0,
  level: 0.4,
  play({ k, t, bar, step, loop, sps }) {
    const ch = CALM_CHORDS[bar]!;
    const B = bar >= 8;
    const barLen = sps * 12;

    if (step === 0) {
      for (const n of voicing(ch, 55, true)) k.pad(t, n, barLen * 0.95, 0.045, 800);
      k.bass(t, rootIn(ch, 36), barLen * 0.8, 0.5, "round");
    }
    // harp arpeggio on eighths
    if (step % 2 === 0) {
      const v = voicing(ch, 60, true);
      const tones = [...v, v[0]! + 12];
      k.harp(t, tones[CALM_ARP[step / 2]!]!, step === 0 ? 0.07 : 0.045);
    }
    if (B && (step === 4 || step === 8)) k.shaker(t, 0.12);

    // the tune: music box, an octave lower and softer every other pass
    const e = CALM_TUNE[bar]!.get(step);
    if (e) {
      if (loop % 2 === 0) k.musicbox(t, e[1], e[2] * sps, 0.13);
      else k.bell(t, e[1] - 12, e[2] * sps, 0.12);
    }
  },
};

const DEFS: Record<ChannelId, ChannelDef> = { pop, rock, hiphop, latin, calm };

/* ---------------------------------------------------------------------------
 * The scheduler
 * ------------------------------------------------------------------------- */

class Player {
  readonly def: ChannelDef;
  readonly kit: Kit;
  readonly sps: number;
  startTime = -1; // audio time of step 0; -1 until the context is running
  stepIdx = 0;
  private failed = false;
  private lastNow = -1;

  constructor(def: ChannelDef, c: AudioContext, out: AudioNode) {
    this.def = def;
    this.kit = new Kit(c, out, def.level);
    this.sps = 60 / bpmOf(def.id) / 4;
  }

  /** Place every step that starts before `horizon`. */
  schedule(now: number) {
    if (this.startTime < 0) {
      this.startTime = now + 0.06;
      const g = this.kit.fade.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(0, now);
      g.linearRampToValueAtTime(1, this.startTime + FADE * 0.6);
    }
    const { def, sps } = this;
    let at = this.startTime + this.stepIdx * sps;
    // throttled timer (hidden tab): skip what we missed, keep the grid
    if (at < now - 0.03) {
      this.stepIdx += Math.ceil((now - at) / sps);
      at = this.startTime + this.stepIdx * sps;
    }
    const late = this.lastNow >= 0 && now - this.lastNow > 0.2;
    this.lastNow = now;
    const horizon = now + (late ? LOOKAHEAD_THROTTLED : LOOKAHEAD);
    const barSteps = def.stepsPerBar;
    const songSteps = barSteps * def.bars;
    while (at < horizon) {
      const i = this.stepIdx;
      const step = i % barSteps;
      const t = at + (step % 2 === 1 ? def.swing * sps : 0);
      if (!this.failed) {
        try {
          def.play({
            k: this.kit,
            t,
            bar: Math.floor(i / barSteps) % def.bars,
            step,
            loop: Math.floor(i / songSteps),
            sps,
          });
        } catch (e) {
          // never let a bad note kill the game loop; go quiet instead
          this.failed = true;
          console.warn("[music] channel stopped:", e);
        }
      }
      this.stepIdx++;
      at = this.startTime + this.stepIdx * sps;
    }
  }

  /** Fade out, then let go of the graph once the last notes have rung out. */
  retire() {
    const c = this.kit.c;
    const now = c.currentTime;
    const g = this.kit.fade.gain;
    try {
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + FADE);
    } catch {
      /* ignore */
    }
    window.setTimeout(() => this.kit.dispose(), (FADE + LOOKAHEAD) * 1000 + 250);
  }
}

function bpmOf(id: ChannelId): number {
  return CHANNELS.find((ch) => ch.id === id)!.bpm;
}

let active: Player | null = null;
let timer: number | null = null;

function tick() {
  const p = active;
  if (!p) return;
  const c = p.kit.c;
  // before the first tap the context is suspended: wait, and start once it runs
  if (c.state !== "running") return;
  p.schedule(c.currentTime);
}

function startTimer() {
  if (timer == null) timer = window.setInterval(tick, TICK_MS);
}

function stopTimer() {
  if (timer != null) {
    window.clearInterval(timer);
    timer = null;
  }
}

/** Switch the iPod to a channel, or null to turn it off and let the normal park music return. Crossfade ~0.4s. Safe to call repeatedly with the same id (no restart). */
export function setChannel(id: ChannelId | null): void {
  try {
    const want: ChannelId | null = id && Object.prototype.hasOwnProperty.call(DEFS, id) ? id : null;
    const have = active ? active.def.id : null;
    if (want === have) {
      if (active && active.kit.c.state === "suspended") void active.kit.c.resume().catch(() => {});
      return;
    }
    if (active) {
      active.retire();
      active = null;
    }
    if (!want) {
      stopTimer();
      duckMusicBed(false, FADE);
      return;
    }
    const { ctx, out } = ipodOutput();
    active = new Player(DEFS[want], ctx, out);
    duckMusicBed(true, FADE);
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    startTimer();
    tick();
  } catch (e) {
    console.warn("[music] setChannel failed:", e);
  }
}

export function currentChannel(): ChannelId | null {
  return active ? active.def.id : null;
}

/** Beat clock of the playing channel, for syncing dance moves: seconds per beat and the current beat position (float, 0 at channel start), or null when off. */
export function beatInfo(): { secondsPerBeat: number; beat: number } | null {
  const p = active;
  if (!p) return null;
  const secondsPerBeat = p.sps * 4;
  if (p.startTime < 0) return { secondsPerBeat, beat: 0 };
  return { secondsPerBeat, beat: Math.max(0, (p.kit.c.currentTime - p.startTime) / secondsPerBeat) };
}
