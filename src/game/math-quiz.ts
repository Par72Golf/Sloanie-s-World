import type { QuizQ } from "./types";

const used = new Set<string>();

export function resetQuizBank() {
  used.clear();
}

function shuffle<T>(arr: T[]) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Distractor offsets. The old set was always [answer+1, answer-1], which put
 * the correct answer in the middle of the three 99.7% of the time. Sorting the
 * three numbers and picking the middle one beat the quiz outright.
 *
 * These patterns straddle, sit above, and sit below in roughly equal measure.
 */
const OFFSET_PATTERNS: number[][] = [
  [1, 2],
  [2, 3],
  [1, 3],
  [-1, -2],
  [-2, -3],
  [-1, -3],
  [2, 4],
  [-2, -4],
  [1, -1],
  [2, -1],
  [-2, 1],
];

function uniqueChoices(answer: number, extras: number[]) {
  const set = new Set<number>([answer]);
  const add = (n: number) => {
    if (n !== answer && n >= 0 && n <= 20 && !set.has(n) && set.size < 3) set.add(n);
  };

  // lead with an offset pattern so the answer is not reliably in the middle
  const pattern = OFFSET_PATTERNS[Math.floor(Math.random() * OFFSET_PATTERNS.length)]!;
  for (const off of pattern) add(answer + off);

  // then the operand-based near misses, which are the instructive ones
  if (Math.random() < 0.45) for (const n of extras) add(n);

  let guard = 0;
  while (set.size < 3 && guard++ < 40) {
    const n = answer + (Math.random() < 0.5 ? 1 : -1) * (1 + Math.floor(Math.random() * 4));
    add(n);
  }
  // near the ends of the range there may be nowhere left to go
  guard = 0;
  while (set.size < 3 && guard++ < 40) add(Math.floor(Math.random() * 21));

  return shuffle(Array.from(set)).slice(0, 3);
}

// No operand is ever 1: "7 + 1" is counting, not adding, and it was the most
// common early question. Both numbers start at 2.
const MIN_OPERAND = 2;

function addWithin(minA: number, maxA: number, maxSum: number, dots: boolean): QuizQ {
  const a = Math.max(MIN_OPERAND, minA) + Math.floor(Math.random() * (maxA - Math.max(MIN_OPERAND, minA) + 1));
  const maxB = Math.min(9, maxSum - a);
  const b = MIN_OPERAND + Math.floor(Math.random() * Math.max(1, maxB - MIN_OPERAND + 1));
  const answer = a + b;
  return {
    prompt: `${a} + ${b}`,
    answer,
    choices: uniqueChoices(answer, [answer + 1, answer - 1, a, b, Math.abs(a - b)]),
    visual: dots ? [a, b] : undefined,
  };
}

function subWithin(minA: number, maxA: number): QuizQ {
  const a = minA + Math.floor(Math.random() * (maxA - minA + 1));
  // b from 2 up to 9, never leaving an answer below 1
  const b = MIN_OPERAND + Math.floor(Math.random() * Math.max(1, Math.min(9, a - 1) - MIN_OPERAND + 1));
  const answer = a - b;
  return {
    prompt: `${a} − ${b}`,
    answer,
    choices: uniqueChoices(answer, [answer + 1, answer - 1, a + b, b, a]),
  };
}

function generate(found: number): QuizQ {
  if (found < 4) return addWithin(2, 8, 10, true);
  if (found < 8) {
    return Math.random() < 0.65 ? addWithin(4, 9, 18, false) : subWithin(6, 12);
  }
  return Math.random() < 0.55 ? addWithin(6, 11, 20, false) : subWithin(8, 18);
}

export function makeQuestion(_levelIndex: number, found: number): QuizQ {
  for (let i = 0; i < 48; i++) {
    const q = generate(found);
    if (!used.has(q.prompt)) {
      used.add(q.prompt);
      return q;
    }
  }
  used.clear();
  const q = generate(found);
  used.add(q.prompt);
  return q;
}

export function tempFromDist(d: number): import("./types").TempBand {
  if (d < 2.6) return "burning";
  if (d < 5.5) return "hot";
  if (d < 10) return "warm";
  if (d < 16) return "lukewarm";
  if (d < 26) return "chilly";
  if (d < 40) return "cold";
  return "freezing";
}
