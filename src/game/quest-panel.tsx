import { useEffect, useState } from "react";
import { Cat, Check, Dog, Heart, Rabbit, X, type LucideIcon } from "lucide-react";
import { sfx } from "./audio";
import { useInput } from "./carnival-games";
import { PET_QUEST } from "./collectibles";
import { Btn, Panel } from "./overlays";
import { PETS, type PetKind } from "./pets";
import { HearButton } from "./help-cards";
import { speak } from "./speech";
import { useGame } from "./store";
import { cn } from "@/lib/utils";

/**
 * The lost pet quest's panels: talking to the farmer, and choosing which of
 * the three rescued pets to keep, its coat and its name. Controller: left and
 * right to choose, A to confirm, B to go back or leave. Keyboard: arrows,
 * Enter or Space, Esc, and typing a name. Touch: tap.
 */

const ICON: Record<PetKind, LucideIcon> = { puppy: Dog, kitten: Cat, bunny: Rabbit };
const NAMES: Record<PetKind, string[]> = {
  puppy: ["Biscuit", "Buddy", "Coco", "Waffles"],
  kitten: ["Mittens", "Luna", "Pip", "Mochi"],
  bunny: ["Clover", "Hops", "Bun Bun", "Daisy"],
};

const closePanel = () => {
  sfx.click();
  useGame.getState().setQuestPanel(null);
};

export function QuestPanel() {
  const panel = useGame((s) => s.questPanel);
  if (!panel) return null;
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-ink/45 p-3">
      <Panel className="relative w-full max-w-xl p-5 sm:p-6">
        <button
          type="button"
          aria-label="Close"
          onClick={closePanel}
          className="absolute right-3 top-3 grid size-10 place-items-center rounded-full border-[3px] border-edge bg-surface"
        >
          <X className="size-5" />
        </button>
        {panel === "farmer" ? <Farmer /> : <Choose />}
      </Panel>
    </div>
  );
}

function Farmer() {
  const quest = useGame((s) => s.quest);
  const hasBag = useGame((s) => s.foundAccessories.includes("backpack"));
  const pet = useGame((s) => s.pet);
  const name = useGame((s) => s.playerName) || "friend";
  const start = () => {
    sfx.correct();
    useGame.getState().setQuestStage("treats");
    useGame.getState().setQuestPanel(null);
    useGame.getState().showHelp("farmer", true);
  };
  const nextTreat = PET_QUEST.treats.find((_, i) => !quest.treats.includes(i));

  let lines: string[];
  let action: { label: string; run: () => void } = { label: "Okay!", run: closePanel };
  if (quest.stage === "none") {
    lines = [
      `Howdy, ${name}! Oh, I'm so glad you're here.`,
      "My puppy, my kitten and my bunny slipped out of the barn and ran off! They must be scared.",
      "They love treats. If you can find 5 pet treats around the park, I bet they'll come to you.",
      hasBag ? "You've got a backpack, so you can carry them. Off you go!" : "You'll need a backpack to carry the treats. I saw one out on the ball field.",
    ];
    action = { label: "I'll help!", run: start };
  } else if (quest.stage === "treats") {
    lines = [
      `You've found ${quest.treats.length} of 5 treats. Keep looking!`,
      nextTreat ? `Here's a tip: ${nextTreat.hint}` : "",
      hasBag ? "" : "Don't forget, you need the backpack to carry them.",
    ].filter(Boolean);
  } else if (quest.stage === "trail" || quest.stage === "escort") {
    lines = [
      "You found all the treats! Wonderful!",
      "I spotted little paw prints leading away from the barn, all the way to the rocky mountain.",
      "Follow the paw prints, find my pets, and bring them home to the farm.",
    ];
  } else if (quest.stage === "choose") {
    lines = ["You brought them all home! Thank you!", "You've been so brave. You can keep one of them."];
    action = {
      label: "Choose a pet!",
      run: () => {
        sfx.correct();
        useGame.getState().setQuestPanel("choose");
      },
    };
  } else {
    lines = [
      pet ? `${pet.name} just adores you!` : "Thank you again!",
      "The others are happy here on the farm. Come and visit any time.",
    ];
  }

  useInput((e) => {
    if (e === "b") return closePanel();
    if (e === "a") action.run();
  });
  const said = lines.join(" ");
  useEffect(() => speak(said), [said]);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3 pr-12">
        <h2 className="font-display text-3xl font-semibold text-[#3f6fa8]">Farmer Joe</h2>
        <HearButton text={said} />
      </div>
      <div className="grid gap-2 rounded-xl bg-surface-2 p-4 text-2xl font-semibold leading-snug">
        {lines.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </div>
      {quest.stage === "treats" && (
        <div className="flex justify-center gap-2">
          {PET_QUEST.treats.map((_, i) => (
            <span
              key={i}
              className={cn(
                "grid size-9 place-items-center rounded-full border-[3px] border-edge",
                quest.treats.includes(i) ? "bg-[#d9a05a] text-white" : "bg-surface",
              )}
            >
              {quest.treats.includes(i) && <Check className="size-5" />}
            </span>
          ))}
        </div>
      )}
      <Btn onClick={action.run} className="min-h-14 text-2xl">
        {action.label}
      </Btn>
    </div>
  );
}

function Choose() {
  const [step, setStep] = useState<"pet" | "coat" | "name">("pet");
  const [kindIdx, setKindIdx] = useState(0);
  const [coatIdx, setCoatIdx] = useState(0);
  const [nameIdx, setNameIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const def = PETS[kindIdx]!;
  const names = NAMES[def.kind];
  const finalName = (typed.trim() || names[nameIdx]!).slice(0, 16);

  const adopt = () => {
    sfx.win();
    const st = useGame.getState();
    st.adoptPet({ kind: def.kind, coat: def.colors[coatIdx] ?? def.colors[0]!, name: finalName });
    st.setQuestPanel(null);
    st.setEmmettNotice(`${finalName} is yours! Your new best friend will follow you everywhere.`);
  };

  const heading =
    step === "pet" ? "Which one will you keep?" : step === "coat" ? `Pick a coat for your ${def.name.toLowerCase()}` : "What's their name?";
  useEffect(() => speak(heading), [heading]);
  useInput((e) => {
    if (e === "b") {
      if (step === "pet") return closePanel();
      setStep(step === "name" ? "coat" : "pet");
      return;
    }
    const n = step === "pet" ? PETS.length : step === "coat" ? def.colors.length : names.length;
    const move = (d: number) => {
      sfx.click();
      if (step === "pet") {
        setKindIdx((i) => (i + d + n) % n);
        setCoatIdx(0);
        setNameIdx(0);
      } else if (step === "coat") setCoatIdx((i) => (i + d + n) % n);
      else {
        setTyped("");
        setNameIdx((i) => (i + d + n) % n);
      }
    };
    if (e === "left" || e === "up") move(-1);
    else if (e === "right" || e === "down") move(1);
    else if (e === "a") {
      sfx.correct();
      if (step === "pet") setStep("coat");
      else if (step === "coat") setStep("name");
      else adopt();
    }
  });

  return (
    <div className="grid gap-4">
      <h2 className="font-display text-3xl font-semibold">
        {step === "pet" ? "Which one will you keep?" : step === "coat" ? `Pick a coat for your ${def.name.toLowerCase()}` : "What's their name?"}
      </h2>
      {step === "pet" && (
        <div className="grid grid-cols-3 gap-3">
          {PETS.map((p, i) => {
            const Icon = ICON[p.kind];
            return (
              <button
                key={p.kind}
                type="button"
                onClick={() => {
                  setKindIdx(i);
                  setCoatIdx(0);
                  setStep("coat");
                }}
                className={cn(
                  "chunk-sm grid justify-items-center gap-2 bg-surface-2 p-3 text-center",
                  i === kindIdx && "outline outline-4 outline-offset-2 outline-accent",
                )}
              >
                <span className="grid size-16 place-items-center rounded-full border-[3px] border-edge" style={{ background: p.colors[0] }}>
                  <Icon className="size-9 text-ink" />
                </span>
                <span className="font-display text-xl font-semibold">{p.name}</span>
                <span className="text-sm text-ink-soft">{p.blurb}</span>
              </button>
            );
          })}
        </div>
      )}
      {step === "coat" && (
        <div className="flex justify-center gap-4">
          {def.colors.map((c, i) => {
            const Icon = ICON[def.kind];
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCoatIdx(i);
                  setStep("name");
                }}
                className={cn(
                  "grid size-24 place-items-center rounded-full border-[3px] border-edge",
                  i === coatIdx && "outline outline-4 outline-offset-4 outline-accent",
                )}
                style={{ background: c }}
                aria-label={`coat ${i + 1}`}
              >
                <Icon className="size-12 text-ink" />
              </button>
            );
          })}
        </div>
      )}
      {step === "name" && (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {names.map((nm, i) => (
              <button
                key={nm}
                type="button"
                onClick={() => {
                  setTyped("");
                  setNameIdx(i);
                }}
                className={cn(
                  "chunk-sm bg-surface-2 px-3 py-2 font-display text-lg font-semibold",
                  !typed && i === nameIdx && "bg-accent text-accent-fg",
                )}
              >
                {nm}
              </button>
            ))}
          </div>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value.slice(0, 16))}
            placeholder="Or type your own name"
            className="rounded-lg border-[3px] border-edge bg-surface px-3 py-2 text-lg"
          />
          <Btn onClick={adopt} className="min-h-14 gap-2 text-2xl">
            <Heart className="size-6" fill="currentColor" /> Adopt {finalName}!
          </Btn>
        </div>
      )}
      <p className="text-center text-xs text-ink-soft">Left and right to choose · A to pick · B to go back</p>
    </div>
  );
}
