import { useEffect } from "react";
import { Candy, Ticket, Timer } from "lucide-react";
import { sfx } from "./audio";
import { useInput } from "./carnival-games";
import { HearButton } from "./help-cards";
import { Btn, Panel } from "./overlays";
import { speak } from "./speech";
import { useWhack } from "./whack-a-gummy";
import { cn } from "@/lib/utils";

/**
 * Whack-a-Gummy's screen: a clock and a count while she is running, and a
 * little tray at the end.
 *
 * Deliberately almost nothing. She is running round a box in the park, and
 * every pixel of panel is a pixel of park she cannot see — so the round itself
 * gets two chips in the corner and no more, and the only real panel is the one
 * that appears when the clock runs out.
 */
function Running() {
  const left = useWhack((s) => s.left);
  const score = useWhack((s) => s.score);
  const nearly = left <= 5;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="animate-ui-rise flex items-center gap-2">
        <span
          className={cn(
            "ui-chip gloss gap-1.5 px-3 py-1.5 text-xl tabular-nums text-white sm:text-2xl",
            nearly ? "bg-berry" : "bg-grape",
          )}
        >
          <Timer className="size-5 sm:size-6" strokeWidth={2.6} />
          {Math.ceil(left)}
        </span>
        <span className="ui-chip gloss gap-1.5 bg-sun px-3 py-1.5 text-xl tabular-nums text-ink sm:text-2xl">
          <Candy className="size-5 sm:size-6" strokeWidth={2.6} />
          {score}
        </span>
      </div>
    </div>
  );
}

function Tray() {
  const card = useWhack((s) => s.card)!;
  const onAgain = () => useWhack.getState().playAgain();
  const close = () => {
    sfx.click();
    useWhack.getState().setCard(null);
  };
  useInput((e) => {
    if (e === "b") return close();
    if (e === "a") {
      close();
      onAgain();
    }
  });
  useEffect(() => speak(card.line), [card.line]);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
      <Panel className="animate-ui-rise pointer-events-auto flex w-full max-w-xl flex-col overflow-hidden">
        <div className="ui-ribbon flex shrink-0 items-center gap-3 bg-grape px-3 py-2 sm:px-4">
          <span className="chunk-sm grid size-11 shrink-0 place-items-center rounded-full bg-surface text-grape sm:size-12">
            <Candy className="size-6" strokeWidth={2.5} />
          </span>
          <h2 className="ui-title min-w-0 flex-1 truncate py-1 text-3xl leading-tight">Whack-a-Gummy</h2>
          <span className="ui-chip bg-sun py-1 text-xl text-ink">
            <Ticket className="size-5" strokeWidth={2.5} /> +{card.tickets}
          </span>
        </div>
        <div className="ui-dots px-3 pb-3 pt-3.5 sm:px-4 sm:pb-4">
          <p className="text-xl font-extrabold leading-snug text-ink lg:text-2xl">{card.line}</p>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2.5">
            <HearButton text={card.line} />
            <Btn
              variant="sun"
              onClick={() => {
                close();
                onAgain();
              }}
            >
              <Candy className="size-5" strokeWidth={2.5} /> Again
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

/** Everything the gummy box puts on the screen. */
export function WhackOverlay() {
  const playing = useWhack((s) => s.playing);
  const card = useWhack((s) => s.card);
  return (
    <>
      {playing && <Running />}
      {card && <Tray />}
    </>
  );
}
