/**
 * Read aloud, for a young reader: HUD messages, hints, what Farmer Joe says
 * and the game panels are spoken with the browser's built-in voice (the Web
 * Speech API, which on a Mac uses the system voices and works offline).
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
  if (supported()) window.speechSynthesis.cancel();
}

/**
 * Speak text now, replacing anything already being said. Repeats within 4s
 * are skipped. `force` is for a "Hear it" button she pressed: it speaks even
 * with read aloud switched off, and even if it was just said.
 */
export function speak(text: string | null | undefined, force = false) {
  if ((!enabled && !force) || !supported() || !text) return;
  const clean = text.replace(/[·•]/g, ",").replace(/\s+/g, " ").trim();
  if (!clean) return;
  const now = performance.now();
  if (!force && clean === lastText && now - lastAt < 4000) return;
  lastText = clean;
  lastAt = now;
  const u = new SpeechSynthesisUtterance(clean);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "en-US";
  u.rate = 0.95;
  u.pitch = 1.1;
  u.volume = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
