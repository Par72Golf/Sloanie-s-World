import { useGame } from "../src/game/store";
const g = () => useGame.getState();
const seen = new Map<number, number>();
let prev = g().layout;
let repeats = 0;
for (let i = 0; i < 300; i++) {
  useGame.setState({ collected: [[], [], []] });
  g().startLevel(0);
  const L = g().layout;
  if (L === prev) repeats++;
  seen.set(L, (seen.get(L) ?? 0) + 1);
  prev = L;
}
console.log("layout distribution over 300 fresh starts:", [...seen].sort((a, b) => a[0] - b[0]));
console.log("times the same layout repeated back to back:", repeats);

// resuming a part-finished park must not reshuffle under her
useGame.setState({ collected: [["peachy"], [], []] });
const before = g().layout;
g().startLevel(0);
console.log("layout changed on resume:", g().layout !== before);
