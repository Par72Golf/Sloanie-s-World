import { useEffect, useRef, useState } from "react";
import { Check, Hammer, Lock, Ticket, X } from "lucide-react";
import { sfx } from "./audio";
import { useInput } from "./carnival-games";
import { HOUSE_STAGES } from "./candy-house";
import { HearButton } from "./help-cards";
import { useHome } from "./home-store";
import { Btn, Panel } from "./overlays";
import { speak } from "./speech";
import { useGame } from "./store";
import { cn } from "@/lib/utils";

/**
 * The builder's board outside her gingerbread house.
 *
 * She asked to be able to upgrade the outside of her house in stages with
 * tickets, so this shows every stage at once — the one she has, the one she is
 * saving for, and the one after that — because half the fun of saving up is
 * seeing what is coming. Only the very next stage can be bought: the house is
 * built up, not skipped through.
 */

export function HouseUpgradePanel() {
  const open = useHome((s) => s.upgrading);
  if (!open) return null;
  return <Build />;
}

function Build() {
  const stage = useHome((s) => s.stage);
  const tickets = useGame((s) => s.tickets);
  const next = HOUSE_STAGES.find((s) => s.stage === stage + 1);
  const [cursor, setCursor] = useState(Math.min(2, stage));
  const built = useRef(false);

  const close = () => {
    sfx.click();
    useHome.getState().setUpgrading(false);
  };

  const build = () => {
    if (!next) {
      sfx.click();
      close();
      return;
    }
    if (!useGame.getState().spendTickets(next.price)) {
      sfx.wrong();
      speak(`You need ${next.price - tickets} more tickets to build the ${next.name.toLowerCase()}.`);
      return;
    }
    sfx.win();
    built.current = true;
    useHome.getState().setStage(next.stage);
    useGame.getState().setEmmettNotice(`Your house is now a ${next.name.toLowerCase()} — go inside and see the ${next.room.toLowerCase()}!`);
    speak(`You built the ${next.name.toLowerCase()}! There is a new room inside: the ${next.room.toLowerCase()}.`);
    useHome.getState().setUpgrading(false);
  };

  useInput((e) => {
    if (e === "b") return close();
    if (e === "left") setCursor((c) => Math.max(0, c - 1));
    else if (e === "right") setCursor((c) => Math.min(HOUSE_STAGES.length - 1, c + 1));
    else if (e === "a") build();
  });

  const line = next
    ? `${next.name} costs ${next.price} tickets. ${tickets >= next.price ? "Press A to build it!" : `You need ${next.price - tickets} more.`}`
    : "Your rainbow palace is finished. Every room is open!";
  useEffect(() => speak(line), [line]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-3">
      <Panel className="animate-ui-rise pointer-events-auto relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden 2xl:max-w-4xl">
        <div className="ui-ribbon flex shrink-0 items-center gap-3 bg-sky px-3 py-2 sm:px-4 [@media(max-height:480px)]:py-1.5">
          <span className="chunk-sm grid size-11 shrink-0 place-items-center rounded-full bg-surface text-sky sm:size-12 [@media(max-height:480px)]:size-10">
            <Hammer className="size-6" strokeWidth={2.5} />
          </span>
          <h2 className="ui-title min-w-0 flex-1 truncate py-1 text-3xl leading-tight [@media(max-height:480px)]:text-2xl">Build your house</h2>
          <span className="ui-chip bg-sun py-1 text-xl text-ink">
            <Ticket className="size-5" strokeWidth={2.5} /> {tickets}
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="chunk-sm press grid size-11 shrink-0 place-items-center rounded-full bg-surface text-ink sm:size-12"
          >
            <X className="size-6" strokeWidth={3} />
          </button>
        </div>
        <div className="ui-dots min-h-0 overflow-y-auto px-3 pb-3 pt-3.5 sm:px-4 sm:pb-4">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
            {HOUSE_STAGES.map((s, i) => {
              const have = s.stage <= stage;
              const isNext = s.stage === stage + 1;
              const on = i === cursor;
              return (
                <button
                  key={s.stage}
                  type="button"
                  onClick={() => (isNext ? build() : setCursor(i))}
                  className={cn(
                    "press relative flex min-h-28 flex-col items-center justify-start gap-1.5 rounded-[1.1rem] border-[3px] border-edge px-2 py-2.5 text-center shadow-[0_4px_0_var(--color-edge)]",
                    have ? "bg-[#dff5ee]" : isNext ? "bg-surface" : "bg-surface-3",
                    on && "-translate-y-1 bg-[#fff1ee] outline outline-4 outline-offset-2 outline-accent",
                  )}
                >
                  {have && (
                    <span className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full border-[2.5px] border-edge bg-teal text-white">
                      <Check className="size-4" strokeWidth={3.5} />
                    </span>
                  )}
                  <span className={cn("text-base font-extrabold leading-tight lg:text-lg", have || isNext ? "text-ink" : "text-ink-soft")}>{s.name}</span>
                  <span className="text-sm font-semibold leading-snug text-ink-soft [@media(max-height:560px)]:hidden">{s.adds}</span>
                  {have ? (
                    <span className="ui-chip bg-teal text-sm text-white shadow-none">Built</span>
                  ) : isNext ? (
                    <span className="ui-chip bg-sun text-base text-ink shadow-none">
                      <Ticket className="size-4" strokeWidth={2.5} /> {s.price}
                    </span>
                  ) : (
                    <span className="ui-chip bg-surface text-sm text-ink-soft shadow-none">
                      <Lock className="size-3.5" strokeWidth={3} /> Next one first
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2.5 sm:flex-nowrap sm:gap-3">
            <p className="min-w-0 basis-full text-lg font-bold leading-snug sm:flex-1 sm:basis-auto lg:text-xl">{line}</p>
            <HearButton text={line} />
            <Btn onClick={build} variant={next && tickets >= next.price ? "sun" : "secondary"} className="min-w-32">
              {next ? <Hammer className="size-5" strokeWidth={2.5} /> : <Check className="size-5" strokeWidth={3} />}
              {next ? "Build" : "Done"}
            </Btn>
          </div>
          <p className="mt-2.5 text-center text-sm font-semibold text-ink-soft [@media(max-height:480px)]:hidden">
            A to build · B to close
          </p>
        </div>
      </Panel>
    </div>
  );
}
