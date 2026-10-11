import { create } from "zustand";
import { sfx } from "./audio";
import { LEVELS } from "./levels";
import { broadcastRace, claimSweet, isHost, myId, remotes, setRaceHooks, type RaceResult } from "./net";
import { setFindHook, useGame } from "./store";

/**
 * The race, while playing together: everyone hunts the same fresh park.
 *
 * The host starts it. Every device switches to the host's park and puts all
 * of its sweets back out, whatever anyone had found before (the store keeps
 * what each of them really found, saves only that, and puts it back after).
 * It is one hunt with one set of sweets, an egg hunt: a sweet someone grabs
 * is gone for everyone. The host is the referee. A guest's find is a claim,
 * the host gives it to whoever claimed it first and tells everyone, and when
 * the last one is gone the host reads out the results. Then it is back to
 * free play, everyone in their own park with their own progress.
 */

/** Sweet id to the id of whoever has it. */
const taken = new Map<string, string>();

type RaceView = {
  on: boolean;
  level: number;
  /** how many each player has, for the scoreboard; bumped on every find */
  version: number;
  /** the last race's results, until she closes the card */
  results: RaceResult[] | null;
};
export const useRace = create<RaceView>(() => ({ on: false, level: 0, version: 0, results: null }));

/** Tickets at the end: the winner, and everyone for taking part. */
export const RACE_WIN = 10;
export const RACE_PLAYED = 3;

let refresh: (() => void) | null = null;
/** runtime.ts: puts the park's sweets back the way the store says, quietly. */
export function setRaceRefresh(f: () => void) {
  refresh = f;
}

/** Someone else has this one: hide it without a celebration (runtime.ts). */
export function goneToSomeoneElse(id: string) {
  const by = taken.get(id);
  return by != null && by !== myId();
}

function nameOf(id: string) {
  if (id === myId()) return useGame.getState().playerName.trim() || "Explorer";
  return remotes.get(id)?.look?.name || "A friend";
}

/** Everyone in the room and how many they have, most first. */
export function raceScores(): RaceResult[] {
  const n = new Map<string, number>();
  n.set(myId(), 0);
  for (const id of remotes.keys()) n.set(id, 0);
  for (const by of taken.values()) n.set(by, (n.get(by) ?? 0) + 1);
  return [...n].map(([id, k]) => ({ id, name: nameOf(id), n: k })).sort((a, b) => b.n - a.n);
}

function begin(level: number, already: [string, string][]) {
  taken.clear();
  for (const [id, by] of already) taken.set(id, by);
  const st = useGame.getState();
  if (st.race) return useRace.setState({ on: true, level, version: useRace.getState().version + 1 });
  if (st.levelIndex !== level || st.phase !== "playing") st.startLevel(level);
  const now = useGame.getState();
  const real = (now.collected[level] ?? []).slice();
  useGame.setState({
    race: { level, real },
    // the fresh park: her own finds in this race are all she has here
    collected: now.collected.map((row, i) => (i === level ? [...taken].filter(([, by]) => by === myId()).map(([id]) => id) : row)),
    // a race is not a timed run: nothing goes on the best times board
    runValid: false,
    emmettNotice: "Race! Find as many sweets as you can. A sweet someone grabs is gone for everyone!",
  });
  useRace.setState({ on: true, level, version: useRace.getState().version + 1, results: null });
  sfx.boing();
  refresh?.();
}

function finish(results: RaceResult[] | null) {
  const st = useGame.getState();
  if (st.race) {
    const { level, real } = st.race;
    useGame.setState({ race: null, collected: st.collected.map((row, i) => (i === level ? real : row)) });
  }
  taken.clear();
  useRace.setState({ on: false, version: useRace.getState().version + 1, results });
  refresh?.();
  if (!results) return;
  const me = myId();
  const top = results[0]?.n ?? 0;
  const won = top > 0 && results.some((r) => r.id === me && r.n === top);
  useGame.getState().addTickets(RACE_PLAYED + (won ? RACE_WIN : 0));
  useGame.getState().setEmmettNotice(won ? `You won the race! +${RACE_PLAYED + RACE_WIN} tickets!` : `Race over! +${RACE_PLAYED} tickets for playing.`);
  if (won) sfx.win();
  else sfx.correct();
}

/** Host: someone (maybe the host) found one. First claim wins it. */
function award(id: string, by: string) {
  if (taken.has(id) || !useRace.getState().on) return;
  taken.set(id, by);
  broadcastRace({ t: "taken", id, by });
  useRace.setState({ version: useRace.getState().version + 1 });
  const total = LEVELS[useRace.getState().level]?.dumplings.length ?? 0;
  if (taken.size >= total) {
    const results = raceScores();
    broadcastRace({ t: "raceEnd", results });
    finish(results);
  }
}

/** Host: start a race in the park she is in. */
export function startRace() {
  if (!isHost()) return;
  const level = useGame.getState().levelIndex;
  broadcastRace({ t: "race", level, taken: [] });
  begin(level, []);
}

/** Host: call it off; everyone back to free play, no results. */
export function stopRace() {
  if (!isHost() || !useRace.getState().on) return;
  const results = raceScores();
  broadcastRace({ t: "raceEnd", results });
  finish(results);
}

export function closeResults() {
  useRace.setState({ results: null });
}

setFindHook((id) => {
  if (!useRace.getState().on) return;
  if (isHost()) award(id, myId());
  else {
    // counted at once on her own screen; the host's word settles a tie
    taken.set(id, myId());
    useRace.setState({ version: useRace.getState().version + 1 });
    claimSweet(id);
  }
});

setRaceHooks({
  start: (level, already) => begin(level, already),
  claim: (id, by) => award(id, by),
  taken: (id, by) => {
    taken.set(id, by);
    useRace.setState({ version: useRace.getState().version + 1 });
  },
  end: (results) => finish(results),
  current: () => (useRace.getState().on ? { level: useRace.getState().level, taken: [...taken] } : null),
  stop: () => {
    if (useRace.getState().on || useGame.getState().race) finish(null);
  },
});
