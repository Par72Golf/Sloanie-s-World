import { useEffect, useState } from "react";
import { LogIn, LogOut, Users } from "lucide-react";
import { sfx } from "./audio";
import { hostRoom, joinRoom, leaveRoom, remotes, useNet, type Look } from "./net";
import { Btn } from "./overlays";
import { useGame } from "./store";
import { useAvatar } from "./avatar";
import { AVATARS } from "./meshes";
import { cn } from "@/lib/utils";

/**
 * Play together (net.ts): host a game and read out the code, or type a
 * friend's code in. A keypad rather than a text box, so it works from the
 * controller, the way the grown-ups' PIN does.
 */

function myLook(): Look {
  const st = useGame.getState();
  return { name: st.playerName.trim() || "Explorer", dress: st.dress, worn: st.worn, avatar: useAvatar.getState().avatar };
}

function Digits({ value, length = 4, big }: { value: string; length?: number; big?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      {Array.from({ length }, (_, i) => (
        <span
          key={i}
          className={cn(
            "grid place-items-center rounded-xl border-[3px] border-edge font-display font-extrabold",
            big ? "size-16 text-4xl" : "size-12 text-2xl",
            value.length > i ? "bg-teal text-white" : "bg-surface-2 text-ink",
          )}
        >
          {value[i] ?? ""}
        </span>
      ))}
    </div>
  );
}

/** Girl, boy or grown-up: who this player is drawn as, here and on everyone else's screen. */
export function AvatarPicker() {
  const avatar = useAvatar((s) => s.avatar);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-base font-semibold text-ink-soft">You are:</span>
      {AVATARS.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => {
            sfx.click();
            useAvatar.getState().setAvatar(a.id);
          }}
          className={cn(
            "press rounded-full border-[3px] px-3 py-1 font-display text-lg font-semibold",
            a.id === avatar ? "border-edge bg-teal text-white" : "border-line bg-surface text-ink",
          )}
        >
          {a.name}
        </button>
      ))}
    </div>
  );
}

export function PlayTogether() {
  const status = useNet((s) => s.status);
  const code = useNet((s) => s.code);
  const names = useNet((s) => s.names);
  const error = useNet((s) => s.error);
  const [joining, setJoining] = useState(false);
  const [entry, setEntry] = useState("");

  const stop = () => {
    sfx.click();
    setEntry("");
    setJoining(false);
    leaveRoom();
  };

  if (status === "hosting" || status === "starting") {
    return (
      <div className="grid justify-items-start gap-3">
        <p className="text-base font-semibold text-ink 2xl:text-xl">Your game's code. Friends type it in to join:</p>
        <Digits value={status === "hosting" ? code : ""} big />
        <p className="text-base font-semibold text-ink-soft">
          {status === "starting"
            ? "Starting…"
            : names.length
              ? `Playing with ${names.join(", ")}.`
              : "Waiting for friends…"}
        </p>
        <p className="text-sm text-ink-soft">Everyone builds in your Build Yard. Up to four can play.</p>
        <Btn variant="secondary" onClick={stop}>
          <LogOut className="size-5" /> Stop playing together
        </Btn>
      </div>
    );
  }

  if (status === "joining" || status === "joined") {
    return (
      <div className="grid justify-items-start gap-3">
        <p className="text-base font-semibold text-ink 2xl:text-xl">
          {status === "joining" ? `Joining game ${code}…` : names.length ? `Playing with ${names.join(", ")}!` : "Joined!"}
        </p>
        {status === "joined" && (
          <p className="text-sm text-ink-soft">You're building in their Build Yard. Yours is safe and comes back when you leave.</p>
        )}
        <Btn variant="secondary" onClick={stop}>
          <LogOut className="size-5" /> {status === "joining" ? "Cancel" : "Leave the game"}
        </Btn>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="grid justify-items-start gap-3">
        <p className="text-base font-semibold text-berry 2xl:text-xl">{error}</p>
        <Btn onClick={stop}>Try again</Btn>
      </div>
    );
  }

  if (joining) {
    const press = (d: string) => {
      sfx.click();
      setEntry((e) => (e.length < 4 ? e + d : e));
    };
    return (
      <div className="grid justify-items-start gap-3">
        <p className="text-base font-semibold text-ink 2xl:text-xl">Type your friend's code:</p>
        <Digits value={entry} />
        <div className="grid w-full max-w-[16rem] grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"].map((d, i) =>
            d === "" ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => (d === "←" ? (sfx.click(), setEntry((e) => e.slice(0, -1))) : press(d))}
                className="chunk-sm press grid h-12 place-items-center rounded-xl bg-surface text-xl font-extrabold text-ink"
              >
                {d}
              </button>
            ),
          )}
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Btn
            disabled={entry.length < 4}
            onClick={() => {
              sfx.click();
              joinRoom(entry, myLook());
            }}
          >
            <LogIn className="size-5" /> Join
          </Btn>
          <Btn variant="ghost" onClick={stop}>
            Back
          </Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="grid justify-items-start gap-3">
      <p className="text-base font-semibold text-ink 2xl:text-xl">
        Play in the same park as your friends, each on your own screen, and build together in the Build Yard.
      </p>
      <AvatarPicker />
      <div className="flex flex-wrap gap-2.5">
        <Btn
          onClick={() => {
            sfx.click();
            hostRoom(myLook());
          }}
        >
          <Users className="size-5" /> Host a game
        </Btn>
        <Btn
          variant="secondary"
          onClick={() => {
            sfx.click();
            setJoining(true);
          }}
        >
          <LogIn className="size-5" /> Join a game
        </Btn>
      </div>
      <p className="text-sm text-ink-soft">Your sweets, stickers, tickets and house stay your own.</p>
    </div>
  );
}

/**
 * The race, while playing together: everyone in this park and how many
 * they have found, most first. Each player hunts for herself, so it is
 * a race whether anyone means it to be or not; this makes it one.
 */
export function TogetherScores() {
  const status = useNet((s) => s.status);
  const level = useGame((s) => s.levelIndex);
  const mine = useGame((s) => (s.collected[s.levelIndex] ?? []).length);
  const name = useGame((s) => s.playerName.trim() || "Explorer");
  const [, tick] = useState(0);
  const live = status === "hosting" || status === "joined";
  // the others' counts arrive with their positions, outside React
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => tick((n) => n + 1), 700);
    return () => window.clearInterval(t);
  }, [live]);
  if (!live) return null;
  const rows = [{ name, found: mine, me: true }];
  for (const r of remotes.values()) {
    if (r.look && r.pose && r.pose.level === level) rows.push({ name: r.look.name || "A friend", found: r.pose.found ?? 0, me: false });
  }
  if (rows.length < 2) return null;
  rows.sort((a, b) => b.found - a.found);
  return (
    <div className="pointer-events-none flex max-w-full flex-wrap gap-1.5">
      {rows.map((r, i) => (
        <span
          key={r.name + i}
          className={cn(
            "ui-chip px-3 py-0.5 text-base font-bold",
            r.me ? "bg-teal text-white" : "bg-surface text-ink",
          )}
        >
          {i === 0 && r.found > 0 ? "👑 " : ""}
          {r.name} {r.found}
        </span>
      ))}
    </div>
  );
}
