import { useState } from "react";
import { LogIn, LogOut, Users } from "lucide-react";
import { sfx } from "./audio";
import { hostRoom, joinRoom, leaveRoom, useNet, type Look } from "./net";
import { Btn } from "./overlays";
import { useGame } from "./store";
import { cn } from "@/lib/utils";

/**
 * Play together (net.ts): host a game and read out the code, or type a
 * friend's code in. A keypad rather than a text box, so it works from the
 * controller, the way the grown-ups' PIN does.
 */

function myLook(): Look {
  const st = useGame.getState();
  return { name: st.playerName.trim() || "Explorer", dress: st.dress, worn: st.worn };
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
