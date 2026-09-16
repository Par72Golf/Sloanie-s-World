import { makeQuestion, resetQuizBank } from "../src/game/math-quiz";
resetQuizBank();
const pos = [0, 0, 0];
const byFound = new Map<number, number[]>();
for (let found = 0; found < 12; found++) byFound.set(found, [0, 0, 0]);
for (let i = 0; i < 6000; i++) {
  const found = i % 12;
  const q = makeQuestion(0, found);
  const idx = q.choices.indexOf(q.answer);
  if (idx < 0) { console.log("ANSWER NOT IN CHOICES", q); break; }
  pos[idx]!++;
  byFound.get(found)![idx]!++;
}
console.log("answer position over 6000 questions:", pos.map((n) => `${((n / 6000) * 100).toFixed(1)}%`).join("  "));
// is the answer ever the largest or smallest of the three?
let biggest = 0, smallest = 0, middle = 0;
resetQuizBank();
for (let i = 0; i < 6000; i++) {
  const q = makeQuestion(0, i % 12);
  const sorted = [...q.choices].sort((a, b) => a - b);
  if (q.answer === sorted[2]) biggest++;
  else if (q.answer === sorted[0]) smallest++;
  else middle++;
}
console.log(`answer is largest ${(biggest / 60).toFixed(1)}%  middle ${(middle / 60).toFixed(1)}%  smallest ${(smallest / 60).toFixed(1)}%`);
