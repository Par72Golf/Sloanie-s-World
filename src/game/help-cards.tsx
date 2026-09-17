import { useEffect } from "react";
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
import { speak } from "./speech";
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
    color: "#4f93c4",
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
    color: "#8a4ad0",
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
    color: "#3f6fa8",
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
    color: "#e8455f",
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
      className={cn("chunk-sm flex items-center gap-2 bg-sun px-4 py-2 font-display text-lg font-semibold text-ink", className)}
      aria-label="Hear it"
    >
      <Volume2 className="size-6" /> Hear it
    </button>
  );
}

export function HelpCard() {
  const id = useGame((s) => s.helpCard);
  const close = () => useGame.getState().closeHelpCard();
  useInput((e) => {
    if (!useGame.getState().helpCard) return;
    if (e === "a" || e === "b") close();
  });
  useEffect(() => {
    if (id) speak(cardSpeech(id), true);
  }, [id]);
  if (!id) return null;
  const card = HELP_CARDS[id];
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-ink/55 p-3">
      <Panel className="relative w-full max-w-2xl p-5 sm:p-7">
        <div className="mb-4 flex items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl border-[3px] border-edge text-white" style={{ background: card.color }}>
            <card.Icon className="size-9" />
          </span>
          <h2 className="flex-1 font-display text-4xl font-semibold leading-tight">{card.title}</h2>
          <HearButton text={cardSpeech(id)} />
        </div>
        <ol className="grid gap-3">
          {card.steps.map((s, i) => (
            <li key={i} className="flex items-center gap-4 rounded-xl bg-surface-2 p-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-full border-[3px] border-edge bg-surface font-display text-2xl font-semibold">
                {i + 1}
              </span>
              <s.Icon className="size-9 shrink-0" style={{ color: card.color }} />
              <span className="text-2xl font-semibold leading-snug text-ink">{s.text}</span>
            </li>
          ))}
        </ol>
        <Btn onClick={close} className="mt-5 min-h-16 w-full gap-2 text-3xl">
          <Check className="size-8" /> Got it!
        </Btn>
      </Panel>
    </div>
  );
}
