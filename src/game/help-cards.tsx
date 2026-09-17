import { useEffect, useRef } from "react";
import {
  Backpack,
  Check,
  Dog,
  FerrisWheel,
  Footprints,
  Gift,
  Home,
  Mountain,
  Shirt,
  Sparkles,
  Sticker,
  Ticket,
  Tractor,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { useInput } from "./carnival-games";
import { Btn, Panel } from "./overlays";
import { speak, stopSpeaking } from "./speech";
import { useGame } from "./store";
import { cn } from "@/lib/utils";

/**
 * Instruction cards: big, few words, one idea per step, with a picture on
 * each step and a speaker button to hear the card again. Each pops up once,
 * the first time she meets the idea, and can be reopened from the pause menu.
 * While a card is open the game waits.
 */

export type HelpId = "backpack" | "stickers" | "farmer" | "carnival";

type Card = { title: string; color: string; Icon: LucideIcon; steps: { Icon: LucideIcon; text: string }[] };

export const HELP_CARDS: Record<HelpId, Card> = {
  backpack: {
    title: "Your backpack",
    color: "#2f7fd6",
    Icon: Backpack,
    steps: [
      { Icon: Backpack, text: "Now you can carry things you find!" },
      { Icon: Gift, text: "Before the backpack, nothing could be picked up. Go back for things you saw." },
      { Icon: Shirt, text: "Open your backpack to wear or hold your things. Press J, the Back button, or tap the book." },
      { Icon: Ticket, text: "Your tickets live in your backpack too." },
    ],
  },
  stickers: {
    title: "Sticker book",
    color: "#7b5cf0",
    Icon: Sticker,
    steps: [
      { Icon: Sticker, text: "There are 30 stickers hidden all over the park." },
      { Icon: Sparkles, text: "Walk into a floating sticker to put it in your book." },
      { Icon: Mountain, text: "Look everywhere: the farm, the woods, the cave, the pool and the carnival!" },
      { Icon: Backpack, text: "See your stickers in your backpack, on the Stickers page." },
    ],
  },
  farmer: {
    title: "Farmer Joe's lost pets",
    color: "#22b37a",
    Icon: Tractor,
    steps: [
      { Icon: Backpack, text: "Get the backpack from the ball field, so you can carry treats." },
      { Icon: Gift, text: "Find 5 glowing pet treats around the park." },
      { Icon: Footprints, text: "Follow the paw prints from the farm." },
      { Icon: Mountain, text: "Find the pets hiding in the mountain cave. Give them the treats." },
      { Icon: Home, text: "Lead them home to the farm." },
      { Icon: Dog, text: "Pick one to keep as your very own pet!" },
    ],
  },
  carnival: {
    title: "The carnival",
    color: "#ff6a55",
    Icon: FerrisWheel,
    steps: [
      { Icon: Sparkles, text: "Walk up to a booth and press Collect to play." },
      { Icon: Gift, text: "Win a game to win its prize." },
      { Icon: Ticket, text: "Every game gives you tickets, even if you don't win." },
      { Icon: Shirt, text: "Spend tickets at the prize booth on things to wear and hold." },
      { Icon: FerrisWheel, text: "Ride the carousel and grab the gold ring!" },
    ],
  },
};

export function cardSpeech(id: HelpId) {
  const c = HELP_CARDS[id];
  return `${c.title}. ${c.steps.map((s) => s.text).join(" ")}`;
}

/** A large speaker button that reads its text aloud. */
export function HearButton({ text, className }: { text: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => speak(text, true)}
      className={cn(
        "chunk-sm gloss press inline-flex min-h-12 shrink-0 items-center gap-2 bg-sun py-1.5 pl-1.5 pr-4 font-display text-lg font-semibold text-ink",
        className,
      )}
      aria-label="Hear it"
    >
      <span className="grid size-9 place-items-center rounded-full border-[2.5px] border-edge bg-surface">
        <Volume2 className="size-5" strokeWidth={2.5} />
      </span>
      Hear it
    </button>
  );
}

export function HelpCard() {
  const id = useGame((s) => s.helpCard);
  const close = () => {
    stopSpeaking();
    useGame.getState().closeHelpCard();
  };
  // cards pop up mid-play, often while she is mashing A to jump: a moment's
  // pause before A or B can close one, so it is not gone before it is seen
  const openedAt = useRef(0);
  useInput((e) => {
    if (!useGame.getState().helpCard || performance.now() - openedAt.current < 700) return;
    if (e === "a" || e === "b") close();
  }, id != null);
  useEffect(() => {
    if (!id) return;
    openedAt.current = performance.now();
    speak(cardSpeech(id));
  }, [id]);
  if (!id) return null;
  const card = HELP_CARDS[id];
  return (
    <div className="ui-backdrop animate-ui-fade pointer-events-auto absolute inset-0 z-40 flex overflow-y-auto pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))]">
      <Panel className="animate-ui-pop relative m-auto w-full max-w-3xl overflow-hidden lg:max-w-4xl 2xl:max-w-5xl">
        <div
          className="ui-ribbon flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6"
          style={{ backgroundColor: card.color }}
        >
          <span
            className="chunk-sm grid size-14 shrink-0 place-items-center rounded-full bg-surface sm:size-16"
            style={{ color: card.color }}
          >
            <card.Icon className="size-8 sm:size-9" strokeWidth={2.4} />
          </span>
          <h2 className="ui-title min-w-[11rem] flex-1 text-3xl leading-tight sm:text-4xl 2xl:text-5xl">{card.title}</h2>
          <HearButton text={cardSpeech(id)} className="ml-auto" />
        </div>
        <div className="ui-dots px-4 pb-5 pt-4 sm:px-6">
          <ol className="grid gap-2.5 2xl:gap-3.5">
            {card.steps.map((s, i) => (
              <li
                key={i}
                className="animate-ui-rise flex items-center gap-3 rounded-[1.1rem] border-[3px] border-edge bg-surface p-2 pr-4 shadow-[0_4px_0_var(--color-edge)] sm:gap-4 sm:pr-5 2xl:p-3"
                style={{ animationDelay: `${80 + i * 60}ms` }}
              >
                <span
                  className="gloss grid size-11 shrink-0 place-items-center rounded-full border-[3px] border-edge font-display text-2xl font-bold text-white [text-shadow:0_2px_0_rgb(0_0_0/0.2)] sm:size-12"
                  style={{ backgroundColor: card.color }}
                >
                  {i + 1}
                </span>
                <span
                  className="hidden size-12 shrink-0 place-items-center rounded-[0.8rem] min-[440px]:grid"
                  style={{ backgroundColor: `${card.color}1f`, color: card.color }}
                >
                  <s.Icon className="size-7 sm:size-8" strokeWidth={2.4} />
                </span>
                <span className="text-lg font-bold leading-snug text-ink sm:text-xl 2xl:text-3xl">{s.text}</span>
              </li>
            ))}
          </ol>
          <Btn onClick={close} className="mt-4 min-h-16 w-full gap-3 text-2xl sm:text-3xl 2xl:mt-6 2xl:min-h-20">
            <Check className="size-8" strokeWidth={3} /> Got it!
          </Btn>
        </div>
      </Panel>
    </div>
  );
}
