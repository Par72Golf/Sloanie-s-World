// exercise the leaderboard logic without a browser
import { useGame } from "../src/game/store";

const g = () => useGame.getState();
const run = (name: string, seconds: number, hints = 0) => {
  useGame.setState({
    playerName: name,
    levelIndex: 0,
    collected: [[], [], []],
    runSeconds: 0,
    runActive: false,
  });
  g().startLevel(0);
  useGame.setState({ runSeconds: seconds, hintsUsedThisRun: hints });
  g().completeLevel();
  return g().lastRun;
};

console.log("Sloan 312s ->", run("Sloan", 312));
console.log("Emmett 480s ->", run("Emmett", 480, 3));
console.log("Sloan 260s (faster) ->", run("Sloan", 260, 1));
console.log("Sloan 400s (slower) ->", run("Sloan", 400));
console.log("\nboard:");
for (const r of g().leaderboard[0] ?? []) {
  console.log(`  ${r.name.padEnd(8)} ${r.seconds}s  hints ${r.hintsUsed}`);
}

// a run resumed from a partly finished park must not post a time
useGame.setState({ collected: [["peachy"], [], []], playerName: "Cheater" });
g().startLevel(0);
useGame.setState({ runSeconds: 5 });
g().completeLevel();
console.log("\nresumed run posted:", g().lastRun);
console.log("board size after resumed run:", (g().leaderboard[0] ?? []).length);
