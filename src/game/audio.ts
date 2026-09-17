let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function ensure() {
  if (ctx) return ctx;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  ctx = new AC({ latencyHint: "interactive" });
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.22;
  master.connect(ctx.destination);
  return ctx;
}

export function unlockAudio() {
  const c = ensure();
  if (c.state === "suspended") void c.resume();
}

export function setMuted(v: boolean) {
  muted = v;
  if (master) {
    master.gain.setTargetAtTime(v ? 0 : 0.22, ensure().currentTime, 0.03);
  }
  setMusicMuted(v);
  setHumLevel(humLevel);
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain = 0.18,
  at = 0,
  slide?: number,
) {
  const c = ensure();
  if (c.state === "suspended") return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.018);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(master!);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  jump: () => tone(420, 0.12, "square", 0.08, 0, 280),
  collect: () => {
    tone(523, 0.12, "triangle", 0.16);
    tone(659, 0.14, "triangle", 0.14, 0.08);
    tone(784, 0.22, "triangle", 0.14, 0.16);
  },
  correct: () => {
    tone(523, 0.1, "sine", 0.14);
    tone(659, 0.12, "sine", 0.14, 0.08);
    tone(784, 0.18, "sine", 0.16, 0.16);
  },
  wrong: () => tone(220, 0.18, "square", 0.08, 0, 160),
  flee: () => {
    tone(392, 0.12, "triangle", 0.12, 0, 220);
    tone(247, 0.18, "triangle", 0.12, 0.1, 140);
    tone(164, 0.28, "sine", 0.1, 0.2, 90);
  },
  hint: () => {
    tone(880, 0.08, "sine", 0.1);
    tone(1174, 0.12, "sine", 0.08, 0.08);
  },
  win: () => {
    [523, 659, 784, 1046].forEach((f, i) =>
      tone(f, 0.22, "triangle", 0.14, i * 0.12),
    );
  },
  step: () => tone(140 + Math.random() * 30, 0.05, "sine", 0.03),
  click: () => tone(640, 0.05, "square", 0.05),
  // trampoline: a rising boing, higher and longer for a super bounce
  boing: (big = false) => {
    tone(big ? 150 : 190, big ? 0.42 : 0.28, "sine", 0.14, 0, big ? 760 : 520);
    tone(big ? 300 : 380, big ? 0.3 : 0.2, "triangle", 0.05, 0.02, big ? 1200 : 900);
  },
};

/* ---------------------------------------------------------------------------
 * Music bed
 * A gentle, endlessly looping pastoral theme built from scheduled oscillators.
 * No audio files, so nothing to download and nothing to go missing offline.
 * ------------------------------------------------------------------------- */

let musicGain: GainNode | null = null;
let musicTimer: number | null = null;
let musicOn = false;
let nextNoteTime = 0;
let bar = 0;

const MUSIC_LEVEL = 0.5;

// I - V - vi - IV in C, the friendliest progression there is.
const CHORDS: number[][] = [
  [261.63, 329.63, 392.0], // C
  [196.0, 246.94, 392.0], // G
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
];

// C major pentatonic, two octaves
const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99];

function ensureMusicGain() {
  const c = ensure();
  if (!musicGain) {
    musicGain = c.createGain();
    musicGain.gain.value = muted ? 0 : MUSIC_LEVEL;
    musicGain.connect(c.destination);
  }
  return musicGain;
}

function voice(
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType,
  peak: number,
  detune = 0,
) {
  const c = ensure();
  const g = ensureMusicGain();
  const osc = c.createOscillator();
  const env = c.createGain();
  const filt = c.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.setValueAtTime(1900, start);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (detune) osc.detune.setValueAtTime(detune, start);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.22, dur * 0.35));
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(filt);
  filt.connect(env);
  env.connect(g);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

function scheduleBar(at: number) {
  const chord = CHORDS[bar % CHORDS.length];
  const beat = 0.52;
  const barLen = beat * 4;

  // pad: the chord held softly across the bar
  chord.forEach((f, i) => {
    voice(f, at, barLen * 0.98, "triangle", 0.055, i === 1 ? 6 : -4);
  });

  // bass: root on 1 and 3
  voice(chord[0] / 2, at, beat * 1.6, "sine", 0.09);
  voice(chord[0] / 2, at + beat * 2, beat * 1.6, "sine", 0.07);

  // melody: a few pentatonic notes, different every bar
  const notes = 2 + ((Math.random() * 3) | 0);
  for (let i = 0; i < notes; i++) {
    const slot = at + beat * (i + (Math.random() < 0.3 ? 0.5 : 0));
    const f = SCALE[(Math.random() * SCALE.length) | 0];
    voice(f, slot, beat * 0.85, "sine", 0.05);
    if (Math.random() < 0.35) {
      voice(f * 2, slot + 0.03, beat * 0.5, "triangle", 0.018);
    }
  }

  bar++;
  return barLen;
}

export function startMusic() {
  if (musicOn) return;
  const c = ensure();
  if (c.state === "suspended") void c.resume();
  ensureMusicGain();
  musicOn = true;
  nextNoteTime = c.currentTime + 0.15;
  const tick = () => {
    if (!musicOn || !ctx) return;
    while (nextNoteTime < ctx.currentTime + 1.2) {
      nextNoteTime += scheduleBar(nextNoteTime);
    }
  };
  tick();
  musicTimer = window.setInterval(tick, 400);
}

export function stopMusic() {
  musicOn = false;
  if (musicTimer != null) {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }
  if (musicGain && ctx) {
    musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
  }
}

export function setMusicMuted(v: boolean) {
  if (musicGain && ctx) {
    musicGain.gain.setTargetAtTime(v ? 0 : MUSIC_LEVEL, ctx.currentTime, 0.08);
  }
}

/* ---------------------------------------------------------------------------
 * Emmett's humming
 * He has to be audible before he is visible, or the only way to avoid him is
 * to happen to be looking the right way. Volume follows distance, set by the
 * runtime each frame.
 * ------------------------------------------------------------------------- */

let humGain: GainNode | null = null;
let humTimer: number | null = null;
let humOn = false;
let humNext = 0;
let humStep = 0;
let humLevel = 0;

// a scrappy little motif a kid would hum, not a tune
const HUM = [392.0, 440.0, 392.0, 329.63, 349.23, 392.0, 329.63, 0];

function ensureHumGain() {
  const c = ensure();
  if (!humGain) {
    humGain = c.createGain();
    humGain.gain.value = 0;
    humGain.connect(c.destination);
  }
  return humGain;
}

function humNote(freq: number, start: number, dur: number) {
  if (!freq) return;
  const c = ensure();
  const g = ensureHumGain();
  const osc = c.createOscillator();
  const env = c.createGain();
  const filt = c.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.setValueAtTime(900, start);
  osc.type = "sine";
  // wobble, so it sounds hummed rather than played
  osc.frequency.setValueAtTime(freq * (0.99 + Math.random() * 0.02), start);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(0.3, start + 0.06);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(filt);
  filt.connect(env);
  env.connect(g);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

export function startHum() {
  if (humOn) return;
  const c = ensure();
  if (c.state === "suspended") void c.resume();
  ensureHumGain();
  humOn = true;
  humNext = c.currentTime + 0.1;
  const tick = () => {
    if (!humOn || !ctx) return;
    while (humNext < ctx.currentTime + 1) {
      const note = HUM[humStep % HUM.length]!;
      const dur = note ? 0.34 : 0.5;
      humNote(note, humNext, dur);
      humNext += dur + 0.06;
      humStep++;
    }
  };
  tick();
  humTimer = window.setInterval(tick, 350);
}

export function stopHum() {
  humOn = false;
  if (humTimer != null) {
    window.clearInterval(humTimer);
    humTimer = null;
  }
  humLevel = 0;
  if (humGain && ctx) humGain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
}

/** 0 when he is far away or gone, 1 when he is right behind her. */
export function setHumLevel(level: number) {
  humLevel = level;
  if (!humGain || !ctx) return;
  humGain.gain.setTargetAtTime(muted ? 0 : level * 0.22, ctx.currentTime, 0.12);
}

export function humIsOn() {
  return humOn;
}
