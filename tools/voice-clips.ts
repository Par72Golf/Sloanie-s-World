/**
 * Sloan's recorded lines, into the game.
 *
 * She reads the voice script (claude.ai artifact "Sloan's Voice Script"),
 * whose lines are numbered in recording order; tools/voice-script.json is that
 * numbering, number to speaker and exact text. Her finished clips are WAVs
 * named by number (001.wav …), trimmed and levelled already. This encodes each
 * one to public/voice/NNN.mp3 and writes src/game/voice-lines.ts, the list of
 * which lines she has recorded, which speech.ts plays in place of the robot
 * voice.
 *
 * Run: npx jiti tools/voice-clips.ts [clips dir]   (default ~/Desktop/Sloan voice/clips)
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const root = join(__dirname, "..");
const dir = process.argv[2] ?? join(homedir(), "Desktop", "Sloan voice", "clips");
const script: { n: number; who: string; text: string }[] = JSON.parse(
  readFileSync(join(root, "tools", "voice-script.json"), "utf8"),
);
const out = join(root, "public", "voice");
mkdirSync(out, { recursive: true });

const lines: [number, string, string][] = [];
for (const f of readdirSync(dir).sort()) {
  const m = /^(\d{3})\.wav$/.exec(f);
  if (!m) continue;
  const n = Number(m[1]);
  const line = script.find((l) => l.n === n);
  if (!line) throw new Error(`${f}: no line ${n} in the script`);
  if (/\{/.test(line.text)) throw new Error(`${f}: line ${n} has a changing word and can't be a fixed clip`);
  const src = join(dir, f);
  const dst = join(out, `${m[1]}.mp3`);
  if (!existsSync(dst) || statSync(dst).mtimeMs < statSync(src).mtimeMs) {
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "80k", dst]);
  }
  lines.push([n, line.who, line.text]);
}

writeFileSync(
  join(root, "src", "game", "voice-lines.ts"),
  `/**
 * The lines Sloan has recorded, by script number: public/voice/NNN.mp3 says
 * exactly this text. Written by tools/voice-clips.ts; don't edit by hand.
 */
export const VOICE_LINES: Record<number, string> = {
${lines.map(([n, who, text]) => `  ${n}: ${JSON.stringify(text)}, // ${who}`).join("\n")}
};
`,
);
console.log(`${lines.length} recorded lines -> public/voice, src/game/voice-lines.ts`);
