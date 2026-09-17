import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Lock, Paintbrush, Ticket, X } from "lucide-react";
import { sfx } from "./audio";
import { useInput } from "./carnival-games";
import { FURNITURE, SPOTS, type FurnitureDef } from "./furniture";
import { HearButton } from "./help-cards";
import { useHome } from "./home-store";
import { Btn, Panel } from "./overlays";
import { speak } from "./speech";
import { useGame } from "./store";
import { cn } from "@/lib/utils";

/**
 * Decorate one spot in her house. Every option for the spot is listed; moving
 * through them shows each one in the room straight away (the panel sits at
 * the bottom so the room stays visible). A to keep it, B to put back what was
 * there. Options she doesn't own show their ticket price and can be bought
 * right here; reward pieces say how to earn them.
 */

const HOW_TO_EARN: Record<string, string> = {
  crown: "Find all 16 dumplings to earn this.",
  stickers30: "Collect all 30 stickers to earn this.",
  pet: "Adopt a pet to earn this.",
};

export function HomePanel() {
  const spot = useHome((s) => s.panel);
  if (!spot) return null;
  return <Decorate key={spot} />;
}

function Decorate() {
  const spot = useHome((s) => s.panel)!;
  const placed = useHome((s) => s.placed);
  const owned = useHome((s) => s.owned);
  const tickets = useGame((s) => s.tickets);
  const options = FURNITURE.filter((f) => f.spot === spot);
  const original = useRef(placed[spot]);
  const [cursor, setCursor] = useState(Math.max(0, options.findIndex((f) => f.id === placed[spot])));
  const spotName = SPOTS.find((s) => s.id === spot)?.name ?? spot;
  const owns = (f: FurnitureDef) => f.source === "starter" || owned.includes(f.id);

  // preview: whatever is under the cursor goes into the room if she owns it
  const preview = (i: number) => {
    const f = options[i]!;
    setCursor(i);
    if (owns(f)) useHome.getState().place(spot, f.id);
    else useHome.getState().place(spot, original.current);
  };

  const close = (keep: boolean) => {
    const home = useHome.getState();
    if (!keep) home.place(spot, original.current);
    else if (!owns(options[cursor]!)) home.place(spot, original.current);
    sfx.click();
    home.setPanel(null);
  };

  const choose = () => {
    const f = options[cursor]!;
    if (owns(f)) {
      sfx.correct();
      original.current = f.id;
      close(true);
      return;
    }
    if (f.source !== "shop" || f.price == null) {
      sfx.wrong();
      speak(HOW_TO_EARN[f.source] ?? "You can't buy this one.");
      return;
    }
    if (!useGame.getState().spendTickets(f.price)) {
      sfx.wrong();
      speak(`You need ${f.price - tickets} more tickets for the ${f.name.toLowerCase()}.`);
      return;
    }
    sfx.win();
    useHome.getState().grant(f.id);
    useHome.getState().place(spot, f.id);
    original.current = f.id;
    useGame.getState().setEmmettNotice(`You bought the ${f.name.toLowerCase()}!`);
  };

  useInput((e) => {
    if (e === "b") return close(false);
    const n = options.length;
    if (e === "left" || e === "up") preview((cursor + n - 1) % n);
    else if (e === "right" || e === "down") preview((cursor + 1) % n);
    else if (e === "a") choose();
  });

  useEffect(() => speak(`Choose your ${spotName.toLowerCase()}.`), [spotName]);

  const sel = options[cursor]!;
  const selOwned = owns(sel);
  const line = selOwned
    ? `${sel.name}. ${sel.id === original.current ? "That's what you have now." : "Press A to keep it."}`
    : sel.source === "shop"
      ? `${sel.name} costs ${sel.price} tickets. ${tickets >= (sel.price ?? 0) ? `You'd have ${tickets - (sel.price ?? 0)} left.` : `You need ${(sel.price ?? 0) - tickets} more.`}`
      : `${sel.name}. ${HOW_TO_EARN[sel.source] ?? ""}`;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-3">
      <Panel className="animate-ui-rise pointer-events-auto relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden 2xl:max-w-4xl">
        <div className="ui-ribbon flex shrink-0 items-center gap-3 bg-sky px-3 py-2 sm:px-4 [@media(max-height:480px)]:py-1.5">
          <span className="chunk-sm grid size-11 shrink-0 place-items-center rounded-full bg-surface text-sky sm:size-12 [@media(max-height:480px)]:size-10">
            <Paintbrush className="size-6" strokeWidth={2.5} />
          </span>
          <h2 className="ui-title min-w-0 flex-1 truncate py-1 text-3xl leading-tight [@media(max-height:480px)]:text-2xl">{spotName}</h2>
          <span className="ui-chip bg-sun py-1 text-xl text-ink">
            <Ticket className="size-5" strokeWidth={2.5} /> {tickets}
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={() => close(false)}
            className="chunk-sm press grid size-11 shrink-0 place-items-center rounded-full bg-surface text-ink sm:size-12"
          >
            <X className="size-6" strokeWidth={3} />
          </button>
        </div>
        <div className="ui-dots min-h-0 overflow-y-auto px-3 pb-3 pt-3.5 sm:px-4 sm:pb-4 [@media(max-height:480px)]:pb-2 [@media(max-height:480px)]:pt-2.5">
          <div
            className="grid grid-cols-3 gap-2.5 sm:grid-cols-[repeat(var(--n),minmax(0,1fr))] sm:gap-3"
            style={{ "--n": options.length } as CSSProperties}
          >
            {options.map((f, i) => {
              const have = owns(f);
              const current = f.id === original.current;
              const on = i === cursor;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => (i === cursor ? choose() : preview(i))}
                  className={cn(
                    "press relative grid min-h-24 content-between lg:min-h-28 justify-items-center gap-1.5 rounded-[1.1rem] border-[3px] border-edge px-1.5 pb-2 pt-2.5 text-center shadow-[0_4px_0_var(--color-edge)] [@media(max-height:480px)]:min-h-[4.5rem] [@media(max-height:480px)]:pt-1.5",
                    current ? "bg-[#dff5ee]" : have ? "bg-surface" : f.source === "shop" ? "bg-surface-2" : "bg-surface-3",
                    on && "-translate-y-1 bg-[#fff1ee] outline outline-4 outline-offset-2 outline-accent",
                  )}
                >
                  {current && (
                    <span className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full border-[2.5px] border-edge bg-teal text-white">
                      <Check className="size-4" strokeWidth={3.5} />
                    </span>
                  )}
                  <span
                    className={cn(
                      "self-center text-sm font-extrabold leading-tight min-[420px]:text-base lg:text-lg",
                      !have && f.source !== "shop" ? "text-ink-soft" : "text-ink",
                    )}
                  >
                    {f.name}
                  </span>
                  {current ? (
                    <span className="ui-chip bg-teal text-sm text-white shadow-none">In room</span>
                  ) : have ? (
                    <span className="ui-chip bg-surface text-sm text-teal-deep shadow-none">Yours</span>
                  ) : f.source === "shop" ? (
                    <span className="ui-chip bg-sun text-base text-ink shadow-none">
                      <Ticket className="size-4" strokeWidth={2.5} /> {f.price}
                    </span>
                  ) : (
                    <span className="ui-chip bg-surface text-sm text-ink-soft shadow-none">
                      <Lock className="size-3.5" strokeWidth={3} /> Earn it
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2.5 sm:flex-nowrap sm:gap-3">
            <p className="min-w-0 basis-full text-lg font-bold leading-snug sm:flex-1 sm:basis-auto lg:text-xl">{line}</p>
            <HearButton text={line} />
            <Btn
              onClick={choose}
              variant={selOwned ? "primary" : sel.source === "shop" ? "sun" : "secondary"}
              className="min-w-32"
            >
              {selOwned ? <Check className="size-5" strokeWidth={3} /> : sel.source === "shop" ? <Ticket className="size-5" strokeWidth={2.5} /> : <Lock className="size-5" strokeWidth={2.5} />}
              {selOwned ? "Keep" : sel.source === "shop" ? "Buy" : "Locked"}
            </Btn>
          </div>
          <p className="mt-2.5 text-center text-sm font-semibold text-ink-soft [@media(max-height:480px)]:hidden">
            Left and right to look · A to keep or buy · B to put it back
          </p>
        </div>
      </Panel>
    </div>
  );
}
