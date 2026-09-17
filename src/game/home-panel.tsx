import { useEffect, useRef, useState } from "react";
import { Check, Lock, Ticket, X } from "lucide-react";
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
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center p-3">
      <Panel className="pointer-events-auto relative w-full max-w-2xl p-4 sm:p-5">
        <button
          type="button"
          aria-label="Close"
          onClick={() => close(false)}
          className="absolute right-3 top-3 grid size-10 place-items-center rounded-full border-[3px] border-edge bg-surface"
        >
          <X className="size-5" />
        </button>
        <div className="mb-3 flex items-center gap-3 pr-12">
          <h2 className="font-display text-3xl font-semibold">{spotName}</h2>
          <span className="flex items-center gap-1 rounded-full bg-sun px-3 py-0.5 font-display text-lg font-semibold">
            <Ticket className="size-4" /> {tickets}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {options.map((f, i) => {
            const have = owns(f);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => (i === cursor ? choose() : preview(i))}
                className={cn(
                  "chunk-sm grid min-h-20 content-center justify-items-center gap-1 p-2 text-center",
                  have ? "bg-surface" : "bg-surface-2",
                  f.id === original.current && "bg-[#e8f8e8]",
                  i === cursor && "outline outline-4 outline-offset-2 outline-accent",
                )}
              >
                <span className="text-sm font-bold leading-tight">{f.name}</span>
                {f.id === original.current ? (
                  <Check className="size-5 text-ok" />
                ) : have ? (
                  <span className="text-xs font-semibold text-ink-soft">Yours</span>
                ) : f.source === "shop" ? (
                  <span className="flex items-center gap-1 font-display text-base font-semibold">
                    <Ticket className="size-4" /> {f.price}
                  </span>
                ) : (
                  <Lock className="size-4 text-ink-soft" />
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <p className="flex-1 text-lg font-semibold leading-snug">{line}</p>
          <HearButton text={line} />
          <Btn onClick={choose} className="min-w-28">
            {selOwned ? "Keep" : sel.source === "shop" ? "Buy" : "Locked"}
          </Btn>
        </div>
        <p className="mt-2 text-center text-xs text-ink-soft">Left and right to look · A to keep or buy · B to put it back</p>
      </Panel>
    </div>
  );
}

