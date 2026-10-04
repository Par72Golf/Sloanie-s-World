import { voiceOutput } from "./audio";
import { VOICE_LINES } from "./voice-lines";

/**
 * Read aloud, for a young reader: HUD messages, hints, what Farmer Joe says
 * and the game panels are spoken with the browser's built-in voice (the Web
 * Speech API, which on a Mac uses the system voices and works offline).
 *
 * Except where Sloan has recorded the line herself (voice-lines.ts, from
 * tools/voice-clips.ts): any sentence or run of sentences that is one of her
 * lines plays her clip instead, and the rest of the text is still read by the
 * browser, in order, so Farmer Joe can say "Thank you again!" in her voice and
 * the next sentence in the robot's.
 *
 * Only one thing is spoken at a time: new text cuts off the old, so a burst of
 * notices doesn't queue up a minute of talking. Switched off from the pause
 * menu (saved). If the browser has no speech support this all does nothing.
 */

let enabled = true;
let voice: SpeechSynthesisVoice | null = null;
let lastText = "";
let lastAt = 0;

const supported = () => typeof window !== "undefined" && "speechSynthesis" in window;

/**
 * Voices ranked for a child listener. Downloaded premium voices (macOS:
 * System Settings > Accessibility > Spoken Content > System voice > Manage
 * Voices, e.g. "Ava (Premium)") and cloud/natural voices sound far better
 * than the defaults, so they come first; the novelty and robot voices are
 * left out entirely.
 */
const NOVELTY =
  /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Fred|Good News|Jester|Junior|Organ|Ralph|Superstar|Trinoids|Whisper|Wobble|Zarvox|Grandma|Grandpa|Rocko|Kathy)\b/i;
function score(v: SpeechSynthesisVoice) {
  const n = v.name;
  let s = 0;
  if (/premium/i.test(n)) s += 100;
  if (/enhanced/i.test(n)) s += 80;
  if (/natural|neural/i.test(n)) s += 90;
  if (/^Google/i.test(n)) s += 55;
  if (/\b(Ava|Zoe|Evan|Allison|Susan|Nicky|Noelle|Joelle|Matilda|Serena|Aria|Jenny)\b/i.test(n)) s += 30;
  if (/\bSamantha\b/i.test(n)) s += 25;
  if (/\b(Karen|Moira|Tessa|Daniel)\b/i.test(n)) s += 15;
  // Eloquence voices (Eddy, Flo, Reed, Sandy, Shelley) are the robotic ones
  if (/\b(Eddy|Flo|Reed|Sandy|Shelley)\b/i.test(n)) s -= 20;
  if (/en[-_]US/i.test(v.lang)) s += 3;
  return s;
}

/** Usable English voices, best first. */
export function rankedVoices(): SpeechSynthesisVoice[] {
  if (!supported()) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => /^en[-_]/i.test(v.lang) && !NOVELTY.test(v.name))
    .sort((a, b) => score(b) - score(a));
}

let preferred = "";
/** Use a voice by name (from the pause menu); empty picks the best one. */
export function setVoiceName(name: string) {
  preferred = name;
  pickVoice();
}
export function currentVoiceName() {
  return voice?.name ?? "";
}

function pickVoice() {
  const ranked = rankedVoices();
  voice = (preferred && ranked.find((v) => v.name === preferred)) || ranked[0] || null;
}
if (supported()) {
  pickVoice();
  window.speechSynthesis.addEventListener?.("voiceschanged", pickVoice);
}

export function setSpeechEnabled(on: boolean) {
  enabled = on;
  if (!on) stopSpeaking();
}

export function stopSpeaking() {
  token++;
  playing?.stop();
  playing = null;
  if (supported()) window.speechSynthesis.cancel();
}

/* ---------------------------------------------------------- her clips */

/** The words of a line and nothing else, so "Go outside" finds her "Go outside!". */
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const CLIP_BY_WORDS = new Map(Object.entries(VOICE_LINES).map(([n, t]) => [words(t), Number(n)]));

const buffers = new Map<number, Promise<AudioBuffer | null>>();
function clipBuffer(n: number) {
  let b = buffers.get(n);
  if (!b) {
    const { ctx } = voiceOutput();
    b = fetch(`${import.meta.env.BASE_URL}voice/${String(n).padStart(3, "0")}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
      .then((a) => ctx.decodeAudioData(a))
      .catch(() => null);
    buffers.set(n, b);
  }
  return b;
}
let warmed = false;
/** Fetch and decode every clip once, the first time anything is said, so none starts late. */
function warm() {
  if (warmed) return;
  warmed = true;
  for (const n of CLIP_BY_WORDS.values()) void clipBuffer(n);
}

type Part = { clip: number; text: string } | { text: string };

/** Split text into her clips and the bits in between, longest match first. */
function parts(text: string): Part[] {
  const sentences = (text.match(/[^.!?…]*[.!?…]+["”’)]*|[^.!?…]+$/g) ?? [text]).map((x) => x.trim()).filter(Boolean);
  const out: Part[] = [];
  let pending: string[] = [];
  const flush = () => {
    if (pending.length) out.push({ text: pending.join(" ") });
    pending = [];
  };
  for (let i = 0; i < sentences.length; ) {
    let hit = 0;
    for (let j = Math.min(sentences.length, i + 6); j > i; j--) {
      const n = CLIP_BY_WORDS.get(words(sentences.slice(i, j).join(" ")));
      if (n) {
        flush();
        out.push({ clip: n, text: sentences.slice(i, j).join(" ") });
        hit = j;
        break;
      }
    }
    if (hit) i = hit;
    else pending.push(sentences[i++]!);
  }
  flush();
  return out;
}

/** Bumped by anything new being said; a queue that sees it change stops. */
let token = 0;
let playing: AudioBufferSourceNode | null = null;

/** Play clip `n`; false if it can't play (not loaded, or audio not started yet). */
async function playClip(n: number, my: number): Promise<boolean> {
  const buf = await clipBuffer(n);
  if (my !== token) return true;
  const { ctx, out } = voiceOutput();
  if (!buf || ctx.state !== "running") return false;
  return new Promise((done) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(out);
    src.onended = () => {
      if (playing === src) playing = null;
      done(true);
    };
    playing = src;
    src.start();
  });
}

function sayTts(text: string, my: number): Promise<void> {
  return new Promise((done) => {
    if (my !== token || !supported() || !text) return done();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "en-US";
    u.rate = 0.95;
    u.pitch = 1.1;
    u.volume = 1;
    // some browsers drop onend now and then; never let the queue hang on it
    const t = window.setTimeout(done, 2500 + text.length * 110);
    u.onend = u.onerror = () => {
      window.clearTimeout(t);
      done();
    };
    window.speechSynthesis.speak(u);
  });
}

async function run(list: Part[], my: number) {
  for (const p of list) {
    if (my !== token) return;
    if ("clip" in p && (await playClip(p.clip, my))) continue;
    await sayTts(p.text, my);
  }
}

/* -------------------------------------------------------- speaking */

/** While her own answer plays (sayOwn), what the game says next waits for it. */
let holdUntil = 0;
let held: [string, boolean] | null = null;
let heldTimer = 0;

/**
 * Speak text now, replacing anything already being said. Repeats within 4s
 * are skipped. `force` is for a "Hear it" button she pressed: it speaks even
 * with read aloud switched off, and even if it was just said.
 */
export function speak(text: string | null | undefined, force = false) {
  if ((!enabled && !force) || !text) return;
  const clean = text.replace(/[·•]/g, ",").replace(/\s+/g, " ").trim();
  if (!clean) return;
  const now = performance.now();
  if (now < holdUntil) {
    held = [clean, force];
    window.clearTimeout(heldTimer);
    heldTimer = window.setTimeout(() => {
      const h = held;
      held = null;
      if (h) speak(h[0], h[1]);
    }, holdUntil - now);
    return;
  }
  if (!force && clean === lastText && now - lastAt < 4000) return;
  lastText = clean;
  lastAt = now;
  warm();
  stopSpeaking();
  const list = parts(clean);
  if (!list.some((p) => "clip" in p)) {
    // nothing of hers in it: the browser voice, exactly as before
    if (supported()) void sayTts(clean, token);
    return;
  }
  void run(list, token);
}

/**
 * Her own answer on a button ("I'll help!", "Ready or not!"), in her voice if
 * she has recorded it, and silent otherwise: the robot never says her lines.
 * Whatever the game says next waits until she has finished.
 */
export function sayOwn(text: string) {
  if (!enabled) return;
  const n = CLIP_BY_WORDS.get(words(text));
  if (!n) return;
  warm();
  stopSpeaking();
  const my = token;
  holdUntil = performance.now() + 1500;
  void clipBuffer(n).then((buf) => {
    if (my !== token) return;
    holdUntil = performance.now() + (buf ? buf.duration * 1000 + 150 : 0);
    if (held) {
      // something was waiting on the guess; now the real length is known
      window.clearTimeout(heldTimer);
      heldTimer = window.setTimeout(() => {
        const h = held;
        held = null;
        if (h) speak(h[0], h[1]);
      }, Math.max(0, holdUntil - performance.now()));
    }
    void playClip(n, my);
  });
}
