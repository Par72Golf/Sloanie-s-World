import { useEffect, useRef, useState } from "react";
import { Candy, Check, Ticket, X } from "lucide-react";
import { sfx } from "./audio";
import { accessory } from "./accessories";
import { SWEET_SHOP } from "./candy-accessories";
import { useInput } from "./carnival-games";
import { gridMove } from "./grid-nav";
import { HearButton } from "./help-cards";
import { ItemThumb } from "./item-thumbs";
import { Btn, Panel } from "./overlays";
import { speak } from "./speech";
import { useGame } from "./store";
import { cn } from "@/lib/utils";

/**
 * The sweet shop's counter.
 *
 * Buying is choosing, not playing, so this is a panel — the same one her house
 * uses to pick furniture. What Dalton asked to be in the park rather than in a
 * menu is the games, and this is a shop.
 *
 * Everything on the shelf goes straight on when she buys it, because a
 * seven-year-old who has just spent fourteen tickets wants to see the hat.
 */
export function SweetShopPanel() {
  const open = useGame((s) => s.sweetShop);
  if (!open) return null;
  return <Counter />;
}

function Counter() {
  const tickets = useGame((s) => s.tickets);
  const found = useGame((s) => s.foundAccessories);
  const tiles = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState(0);

  const close = () => {
    sfx.click();
    useGame.getState().setSweetShop(false);
  };

  const buy = (i: number) => {
    const item = SWEET_SHOP[i]!;
    const def = accessory(item.id);
    if (found.includes(item.id)) {
      sfx.click();
      speak(`You already have the ${def.name.toLowerCase()}.`);
      return;
    }
    if (useGame.getState().buyItem(item.id, item.price)) {
      sfx.win();
      return;
    }
    sfx.wrong();
    speak(`You need ${item.price - tickets} more tickets for the ${def.name.toLowerCase()}.`);
  };

  useInput((e) => {
    if (e === "b") return close();
    if (e === "left" || e === "right" || e === "up" || e === "down") {
      setCursor((c) => gridMove(tiles.current, c, e, SWEET_SHOP.length));
    } else if (e === "a") buy(cursor);
  });

  const sel = SWEET_SHOP[cursor]!;
  const selDef = accessory(sel.id);
  const have = found.includes(sel.id);
  const line = have
    ? `${selDef.name}. You have this one — wear it from your wardrobe any time.`
    : `${selDef.name} costs ${sel.price} tickets. ${tickets >= sel.price ? `You'd have ${tickets - sel.price} left.` : `You need ${sel.price - tickets} more.`}`;
  useEffect(() => speak(`The sweet shop. You have ${tickets} tickets.`), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-3">
      <Panel className="animate-ui-rise pointer-events-auto relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden 2xl:max-w-4xl">
        <div className="ui-ribbon flex shrink-0 items-center gap-3 bg-grape px-3 py-2 sm:px-4 [@media(max-height:480px)]:py-1.5">
          <span className="chunk-sm grid size-11 shrink-0 place-items-center rounded-full bg-surface text-grape sm:size-12 [@media(max-height:480px)]:size-10">
            <Candy className="size-6" strokeWidth={2.5} />
          </span>
          <h2 className="ui-title min-w-0 flex-1 truncate py-1 text-3xl leading-tight [@media(max-height:480px)]:text-2xl">Sweet Shop</h2>
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
        <div className="ui-dots min-h-0 overflow-y-auto px-3 pb-3 pt-3.5 sm:px-4 sm:pb-4 [@media(max-height:480px)]:pb-2 [@media(max-height:480px)]:pt-2.5">
          <div ref={tiles} className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 sm:gap-3">
            {SWEET_SHOP.map((item, i) => {
              const def = accessory(item.id);
              const mine = found.includes(item.id);
              const on = i === cursor;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => (i === cursor ? buy(i) : setCursor(i))}
                  className={cn(
                    "@container press relative flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-[1.1rem] border-[3px] border-edge px-1.5 py-2 text-center shadow-[0_4px_0_var(--color-edge)] lg:min-h-28",
                    mine ? "bg-[#dff5ee]" : "bg-surface",
                    on && "-translate-y-1 bg-[#fff1ee] outline outline-4 outline-offset-2 outline-accent",
                  )}
                >
                  {mine && (
                    <span className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full border-[2.5px] border-edge bg-teal text-white">
                      <Check className="size-4" strokeWidth={3.5} />
                    </span>
                  )}
                  <ItemThumb kind="accessory" id={item.id} className="size-14 shrink-0 @[11rem]:size-[4.5rem] [@media(max-height:520px)]:hidden" />
                  <span className="grid min-w-0 flex-1 justify-items-center gap-1">
                    <span className="text-sm font-extrabold leading-tight text-ink min-[420px]:text-base">{def.name}</span>
                    {mine ? (
                      <span className="ui-chip bg-teal text-sm text-white shadow-none">Yours</span>
                    ) : (
                      <span className="ui-chip bg-sun text-base text-ink shadow-none">
                        <Ticket className="size-4" strokeWidth={2.5} /> {item.price}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2.5 sm:flex-nowrap sm:gap-3">
            <p className="min-w-0 basis-full text-lg font-bold leading-snug sm:flex-1 sm:basis-auto lg:text-xl">{line}</p>
            <HearButton text={line} />
            <Btn onClick={() => buy(cursor)} variant={have ? "secondary" : "sun"} className="min-w-32">
              {have ? <Check className="size-5" strokeWidth={3} /> : <Ticket className="size-5" strokeWidth={2.5} />}
              {have ? "Yours" : "Buy"}
            </Btn>
          </div>
          <p className="mt-2.5 text-center text-sm font-semibold text-ink-soft [@media(max-height:480px)]:hidden">
            Left and right to look · A to buy · B to leave
          </p>
        </div>
      </Panel>
    </div>
  );
}
