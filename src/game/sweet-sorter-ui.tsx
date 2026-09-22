import { useEffect } from "react";
import { Boxes, Ticket, Timer } from "lucide-react";
import { sfx } from "./audio";
import { useInput } from "./carnival-games";
import { HearButton } from "./help-cards";
import { Btn, Panel } from "./overlays";
import { speak } from "./speech";
import { SORT_COLOURS, useSorter } from "./sweet-sorter";
import { cn } from "@/lib/utils";

/**
 * Sweet Sorter's screen: a clock, a count, and a swatch of whatever colour she
 * is holding.
 *
 * The swatch is the whole HUD, really. The sweet rides over her head where she
 * cannot see it while she is running at a bin, and "which one am I carrying"
 * is the only question the game asks that the park cannot answer for her.
 */
function Running() {
  const left = useSorter((s) => s.left);
  const score = useSorter((s) => s.score);
  const carrying = useSorter((s) => s.carrying);
  const nearly = left <= 8;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="animate-ui-rise flex items-center gap-2">
        <span
          className={cn(
            "ui-chip gloss gap-1.5 px-3 py-1.5 text-xl tabular-nums text-white sm:text-2xl",
            nearly ? "bg-berry" : "bg-teal",
          )}
        >
          <Timer className="size-5 sm:size-6" strokeWidth={2.6} />
          {Math.ceil(left)}
        </span>
        <span className="ui-chip gloss gap-1.5 bg-sun px-3 py-1.5 text-xl tabular-nums text-ink sm:text-2xl">
          <Boxes className="size-5 sm:size-6" strokeWidth={2.6} />
          {score}
        </span>
        {carrying >= 0 && (
          <span className="ui-chip gloss gap-2 bg-surface px-3 py-1.5 text-lg text-ink sm:text-xl">
            <span
              className="size-6 rounded-full border-[3px] border-edge sm:size-7"
              style={{ backgroundColor: SORT_COLOURS[carrying] }}
            />
            this bin
          </span>
        )}
      </div>
    </div>
  );
}

function Tray() {
  const card = useSorter((s) => s.card)!;
  const close = () => {
    sfx.click();
    useSorter.getState().setCard(null);
  };
  const again = () => useSorter.getState().playAgain();
  useInput((e) => {
    if (e === "b") return close();
    if (e === "a") again();
  });
  useEffect(() => speak(card.line), [card.line]);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
      <Panel className="animate-ui-rise pointer-events-auto flex w-full max-w-xl flex-col overflow-hidden">
        <div className="ui-ribbon flex shrink-0 items-center gap-3 bg-teal px-3 py-2 sm:px-4">
          <span className="chunk-sm grid size-11 shrink-0 place-items-center rounded-full bg-surface text-teal sm:size-12">
            <Boxes className="size-6" strokeWidth={2.5} />
          </span>
          <h2 className="ui-title min-w-0 flex-1 truncate py-1 text-3xl leading-tight">Sweet Sorter</h2>
          <span className="ui-chip bg-sun py-1 text-xl text-ink">
            <Ticket className="size-5" strokeWidth={2.5} /> +{card.tickets}
          </span>
        </div>
        <div className="ui-dots px-3 pb-3 pt-3.5 sm:px-4 sm:pb-4">
          <p className="text-xl font-extrabold leading-snug text-ink lg:text-2xl">{card.line}</p>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2.5">
            <HearButton text={card.line} />
            <Btn variant="sun" onClick={again}>
              <Boxes className="size-5" strokeWidth={2.5} /> Again
            </Btn>
            <Btn variant="secondary" onClick={close}>
              Done
            </Btn>
          </div>
          <p className="mt-2.5 text-center text-sm font-semibold text-ink-soft [@media(max-height:480px)]:hidden">
            A to play again · B to walk away
          </p>
        </div>
      </Panel>
    </div>
  );
}

/** Everything the sorter puts on the screen. */
export function SorterOverlay() {
  const playing = useSorter((s) => s.playing);
  const card = useSorter((s) => s.card);
  return (
    <>
      {playing && <Running />}
      {card && <Tray />}
    </>
  );
}
