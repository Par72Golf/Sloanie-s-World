import { LEVELS } from "../src/game/levels";
for (const l of LEVELS) {
  const withAlts = l.dumplings.filter((d) => (d.alts?.length ?? 0) > 0).length;
  const withFinish = l.dumplings.filter((d) => d.finish && d.finish !== "plain").length;
  console.log(
    `${l.id.padEnd(9)} props ${String(l.props.length).padStart(4)}  dumplings ${l.dumplings.length}` +
      `  juice ${(l.juice?.length ?? 0)}  rehideSpots ${(l.rehideSpots?.length ?? 0)}` +
      `  keepOut ${(l.emmettKeepOut?.length ?? 0)}  alts ${withAlts}  finishes ${withFinish}` +
      `  bounds ${l.bounds.maxX - l.bounds.minX}m`,
  );
}
