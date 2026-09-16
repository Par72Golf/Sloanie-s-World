/**
 * No quiz question may use 1 as an operand ("7 + 1" is counting, not adding).
 * Generates questions at every progress level and fails on any operand of 1.
 *
 * Run: npx jiti tools/ones.ts
 */
import { makeQuestion, resetQuizBank } from "../src/game/math-quiz";

let n = 0;
let ones = 0;
let zeros = 0;
const examples: string[] = [];
for (let found = 0; found < 16; found++) {
  for (let i = 0; i < 400; i++) {
    resetQuizBank();
    const q = makeQuestion(0, found);
    n++;
    const parts = q.prompt.split(/\s*[+−-]\s*/).map(Number);
    if (parts.includes(1)) {
      ones++;
      if (examples.length < 5) examples.push(q.prompt);
    }
    if (parts.includes(0) || q.answer <= 0) zeros++;
  }
}
console.log(`${n} questions: ${ones} with an operand of 1, ${zeros} with a zero or non-positive answer`);
if (examples.length) console.log(`  e.g. ${examples.join(", ")}`);
process.exit(ones || zeros ? 1 : 0);
