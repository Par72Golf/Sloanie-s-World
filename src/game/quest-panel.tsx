import { useEffect, useState } from "react";
import { Bone, Cat, Check, Dog, Heart, PawPrint, Rabbit, Tractor, type LucideIcon } from "lucide-react";
import { sfx } from "./audio";
import { ModalFrame, PadKey, PanelRibbon, useInput } from "./carnival-games";
import { PET_QUEST } from "./collectibles";
import { Btn } from "./overlays";
import { PETS, type PetKind } from "./pets";
import { HIDING_PLACE_NAMES, petsLeft } from "./quest";
import { HearButton } from "./help-cards";
import { speak } from "./speech";
import { useGame } from "./store";
import { cn } from "@/lib/utils";

/**
 * Farmer Joe's panels: talking to him through all three rescues, picking
 * which pet to go looking for, and giving the one she has just brought back
 * a coat and a name. Controller: left and right to choose, A to confirm, B to
 * go back or leave. Keyboard: arrows, Enter or Space, Esc, and typing a name.
 * Touch: tap.
 *
 * Chapter 0 lets her pick which of the three rescued pets to keep, so the
 * chooser runs pet, coat, name. Chapters 1 and 2 are about one pet she
 * already knows, so it runs coat, name.
 */

const ICON: Record<PetKind, LucideIcon> = { puppy: Dog, kitten: Cat, bunny: Rabbit };
/** Each pet's own colour on the chooser: warm puppy, sky kitten, grape bunny. */
const TINT: Record<PetKind, string> = { puppy: "#f0a91c", kitten: "#3a9ad9", bunny: "#7b5cf0" };
const LEAF = "#22b37a";
/** Dark coats get a white face so the icon still reads. */
const darkCoat = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 110;
};
const TEAL = "#14a3a6";
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
    <ModalFrame className={panel === "farmer" ? "max-w-xl lg:max-w-2xl 2xl:max-w-3xl" : "max-w-xl sm:max-w-2xl 2xl:max-w-3xl"}>
      {panel === "farmer" ? <Farmer /> : panel === "pick" ? <Pick /> : <Choose />}
    </ModalFrame>
  );
}

/** A pet kind as Joe says it: "my puppy", "her", by name once she is hers. */
const kindName = (k: string) => (k === "puppy" ? "puppy" : k === "kitten" ? "kitten" : "bunny");

function Farmer() {
  const quest = useGame((s) => s.quest);
  const hasBag = useGame((s) => s.foundAccessories.includes("backpack"));
  const pets = useGame((s) => s.pets);
  const name = useGame((s) => s.playerName) || "friend";
  const chapter = quest.chapter;
  const left = petsLeft(pets);
  const seeking = quest.seek ? kindName(quest.seek) : left[0] ? kindName(left[0]) : "pet";
  const start = () => {
    sfx.correct();
    useGame.getState().setQuestStage("treats");
    useGame.getState().setQuestPanel(null);
    useGame.getState().showHelp("farmer", true);
  };
  const choose = {
    label: chapter === 0 ? "Choose a pet!" : "She's mine?!",
    run: () => {
      sfx.correct();
      useGame.getState().setQuestPanel("choose");
    },
  };
  const nextTreat = PET_QUEST.treats.find((_, i) => !quest.treats.includes(i));
  const places = `${HIDING_PLACE_NAMES[0]}, ${HIDING_PLACE_NAMES[1]} and ${HIDING_PLACE_NAMES[2]}`;

  let lines: string[];
  let action: { label: string; run: () => void } = { label: "Okay!", run: closePanel };
  if (quest.stage === "done") {
    lines = [
      pets.length ? `${pets.map((p) => p.name).join(", ")} — all three of them, and they all adore you!` : "Thank you again!",
      "You brought every one of them back to me. Come and visit any time.",
    ];
  } else if (chapter === 0) {
    // the treat hunt
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
    } else if (quest.stage === "choose") {
      lines = ["You brought them all back to me! Thank you!", "You've been so brave. You can keep one of them."];
      action = choose;
    } else {
      lines = [
        "You found all the treats! Wonderful!",
        "I spotted little paw prints leading away from the barn, all the way to the rocky mountain.",
        "Follow the paw prints, find my pets, and walk them back here to me.",
      ];
    }
  } else if (chapter === 1) {
    // the feather trail
    if (quest.stage === "none") {
      lines = [
        `Oh no, ${name} — not again!`,
        "One of the two still here pushed the barn door open and dragged my feather pillow right out of the yard.",
        "There are little white feathers all across the grass. Which one shall we go and look for?",
      ];
      action = {
        label: "Let's look!",
        run: () => {
          sfx.correct();
          useGame.getState().setQuestPanel("pick");
        },
      };
    } else if (quest.stage === "choose") {
      lines = ["You brought her all the way back to me!", `This ${seeking} clearly loves you. You keep her too.`];
      action = choose;
    } else {
      lines = [
        `Follow the white feathers, ${name}. They start right here by my tractor.`,
        "They go all the way to the flower maze — I reckon she's hiding right in the middle of it.",
        "Take one of those treats in with you, then bring her back here to me.",
      ];
    }
  } else {
    // hide and seek on the farm
    if (quest.stage === "none") {
      lines = [
        `My ${seeking} is the very last one, and she isn't lost at all — she's playing hide and seek!`,
        `She's somewhere right here on the farm. There are three good hiding places: ${places}.`,
        "Go and look in all three. She'll pop out when you find her!",
      ];
      action = {
        label: "Ready or not!",
        run: () => {
          sfx.correct();
          const kind = left[0];
          if (kind) useGame.getState().startChapter(kind, "seek");
          useGame.getState().setQuestPanel(null);
        },
      };
    } else if (quest.stage === "choose") {
      lines = ["That's all three of them safe and sound!", `You've earned her, ${name}. This one's yours as well.`];
      action = choose;
    } else if (quest.stage === "escort") {
      lines = ["There she is! Well done!", "Bring her right over to me."];
    } else {
      lines = [
        `Keep looking! She's behind one of the three: ${places}.`,
        `You've looked in ${quest.treats.length} of 3 so far.`,
      ];
    }
  }

  useInput((e) => {
    if (e === "b") return closePanel();
    if (e === "a") action.run();
  });
  const said = lines.join(" ");
  useEffect(() => speak(said), [said]);

  return (
    <>
      <PanelRibbon color={LEAF} Icon={Tractor} title="Farmer Joe" onClose={closePanel} closeLabel="Close" pattern="gingham" />
      <div className="ui-dots grid gap-4 p-4 sm:gap-5 sm:p-6 [@media(max-height:760px)]:sm:py-4 [@media(max-height:500px)]:py-3">
        {/* his words, as a speech bubble pointing up at his name */}
        <div className="animate-ui-rise relative mt-1 rounded-2xl border-[3px] border-edge bg-[#effaf4] p-4 shadow-[0_4px_0_#1d2452] sm:p-5">
          <span
            aria-hidden
            className="absolute -top-[11px] left-8 size-5 rotate-45 border-l-[3px] border-t-[3px] border-edge bg-[#effaf4]"
          />
          <div className="relative grid gap-2.5 text-xl font-semibold leading-snug text-ink sm:text-2xl">
            {lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
        {quest.stage === "treats" && chapter === 0 && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {PET_QUEST.treats.map((_, i) => {
              const got = quest.treats.includes(i);
              return (
                <span
                  key={i}
                  className={cn(
                    "relative grid size-12 place-items-center rounded-full border-[3px]",
                    got ? "gloss border-edge bg-[#d9a05a] text-white shadow-[0_3px_0_#1d2452]" : "border-dashed border-muted bg-surface text-muted",
                  )}
                >
                  <Bone className="size-6" strokeWidth={2.5} />
                  {got && (
                    <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-edge bg-teal text-white">
                      <Check className="size-3" strokeWidth={4} />
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        )}
          <HearButton text={said} className="press ml-auto min-h-12" />
        </div>
        <Btn onClick={action.run} variant={quest.stage === "none" || quest.stage === "choose" ? "primary" : "go"} className="min-h-16 w-full text-2xl sm:text-3xl">
          {action.label}
        </Btn>
      </div>
    </>
  );
}

/**
 * Which pet to go looking for, at the start of the feather trail. Only the
 * ones still at the farm are offered, so she cannot pick one that is already
 * hers. The same cards as the chooser, so it reads as one idea.
 */
function Pick() {
  const pets = useGame((s) => s.pets);
  const options = petsLeft(pets);
  const [idx, setIdx] = useState(0);
  const def = PETS.find((p) => p.kind === options[Math.min(idx, options.length - 1)]) ?? PETS[0]!;
  const go = (kind: PetKind) => {
    sfx.correct();
    const st = useGame.getState();
    st.startChapter(kind, "trail");
    st.setQuestPanel(null);
    st.setEmmettNotice("Off she went! Follow the white feathers from the farm.");
  };
  const heading = "Who shall we look for?";
  useEffect(() => speak(heading), [heading]);
  useInput((e) => {
    if (e === "b") return closePanel();
    const n = options.length;
    if (!n) return;
    if (e === "left" || e === "up") {
      sfx.click();
      setIdx((i) => (i - 1 + n) % n);
    } else if (e === "right" || e === "down") {
      sfx.click();
      setIdx((i) => (i + 1) % n);
    } else if (e === "a") go(def.kind);
  });
  return (
    <>
      <PanelRibbon color={TEAL} Icon={PawPrint} title={heading} onClose={closePanel} closeLabel="Close" pattern="gingham" />
      <div className="ui-dots grid gap-4 p-4 sm:gap-5 sm:p-6 [@media(max-height:760px)]:sm:py-4 [@media(max-height:500px)]:py-3">
        <PetCards
          kinds={options}
          at={Math.min(idx, options.length - 1)}
          onPick={(i) => {
            setIdx(i);
            go(options[i]!);
          }}
        />
        <p className="text-center text-lg font-semibold leading-snug text-ink-soft">
          Left and right to choose &middot; <PadKey>A</PadKey> to pick &middot; <PadKey>B</PadKey> to go back
        </p>
      </div>
    </>
  );
}

/** The row of pet portraits, shared by the "who shall we look for" and "which will you keep" panels. */
function PetCards({ kinds, at, onPick }: { kinds: PetKind[]; at: number; onPick: (i: number) => void }) {
  return (
    <div className={cn("grid gap-3 sm:gap-4", kinds.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      {kinds.map((kind, i) => {
        const p = PETS.find((q) => q.kind === kind)!;
        const Icon = ICON[p.kind];
        const on = i === at;
        return (
          <button
            key={p.kind}
            type="button"
            onClick={() => onPick(i)}
            className={cn(
              "press animate-ui-rise relative flex items-center gap-4 overflow-hidden rounded-2xl border-[3px] border-edge bg-surface p-3 text-left shadow-[0_5px_0_#1d2452] sm:grid sm:justify-items-center sm:gap-2 sm:p-4 sm:pt-5 sm:text-center",
              on && "outline outline-4 outline-offset-2 outline-accent",
            )}
            style={{ animationDelay: `${i * 70}ms` }}
          >
            {/* a sunburst in the pet's colour behind its portrait */}
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-full sm:h-28"
              style={{
                backgroundColor: `${TINT[p.kind]}22`,
                backgroundImage: `repeating-conic-gradient(from 0deg at 50% 100%, ${TINT[p.kind]}2e 0 9deg, transparent 9deg 22deg)`,
              }}
            />
            <span
              className="gloss relative grid size-20 shrink-0 place-items-center rounded-full border-[3px] border-edge shadow-[0_4px_0_#1d2452] sm:size-24"
              style={{ background: p.colors[0] }}
            >
              <Icon className="size-11 text-ink sm:size-12" strokeWidth={2.25} />
            </span>
            <span className="relative grid min-w-0 gap-1 sm:justify-items-center">
              <span className="ui-chip w-fit px-3 text-2xl text-white" style={{ backgroundColor: TINT[p.kind] }}>
                {p.name}
              </span>
              <span className="text-lg font-semibold leading-snug text-ink-soft">{p.blurb}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Choose() {
  const pets = useGame((s) => s.pets);
  const seek = useGame((s) => s.quest.seek);
  // chapter 0 lets her pick from everyone she rescued; later chapters are
  // about the one pet she went out for, so there is nothing to pick
  const options = seek ? [seek as PetKind] : petsLeft(pets);
  const single = options.length <= 1;
  const [step, setStep] = useState<"pet" | "coat" | "name">(single ? "coat" : "pet");
  const [kindIdx, setKindIdx] = useState(0);
  const [coatIdx, setCoatIdx] = useState(0);
  const [nameIdx, setNameIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const at = Math.min(kindIdx, Math.max(0, options.length - 1));
  const def = PETS.find((p) => p.kind === options[at]) ?? PETS[0]!;
  const names = NAMES[def.kind];
  const finalName = (typed.trim() || names[nameIdx]!).slice(0, 16);

  const adopt = () => {
    sfx.win();
    const st = useGame.getState();
    st.adoptPet({ kind: def.kind, coat: def.colors[coatIdx] ?? def.colors[0]!, name: finalName });
    st.setQuestPanel(null);
    // read the list back: `st` is the snapshot from before the adopt
    const now = useGame.getState().pets;
    const others =
      now.length > 1
        ? ` ${now.slice(0, -1).map((p) => p.name).join(", ")} and ${now[now.length - 1]!.name} will follow you everywhere!`
        : " Your new best friend will follow you everywhere.";
    st.setEmmettNotice(`${finalName} is yours!${others}`);
  };

  const heading =
    step === "pet" ? "Which one will you keep?" : step === "coat" ? `Pick a coat for your ${def.name.toLowerCase()}` : "What's their name?";
  useEffect(() => speak(heading), [heading]);
  useInput((e) => {
    if (e === "b") {
      if (step === "pet" || (single && step === "coat")) return closePanel();
      setStep(step === "name" ? "coat" : "pet");
      return;
    }
    const n = step === "pet" ? options.length : step === "coat" ? def.colors.length : names.length;
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

  const steps = (single ? (["coat", "name"] as const) : (["pet", "coat", "name"] as const)) as readonly ("pet" | "coat" | "name")[];
  const tint = TINT[def.kind];
  return (
    <>
      <PanelRibbon
        color={TEAL}
        Icon={PawPrint}
        title={step === "pet" ? "Which one will you keep?" : step === "coat" ? `Pick a coat for your ${def.name.toLowerCase()}` : "What's their name?"}
        onClose={closePanel}
        closeLabel="Close"
        pattern="gingham"
      />
      <div className="ui-dots grid gap-4 p-4 sm:gap-5 sm:p-6 [@media(max-height:760px)]:sm:py-4 [@media(max-height:500px)]:py-3">
        {/* where she is: pet, coat, name */}
        <div className="flex items-center justify-center gap-2" aria-hidden>
          {steps.map((st, i) => {
            const at = steps.indexOf(step);
            return (
              <span key={st} className="flex items-center gap-2">
                {i > 0 && <span className={cn("h-1 w-6 rounded-full sm:w-10", i <= at ? "bg-teal" : "bg-line")} />}
                <span
                  className={cn(
                    "ui-chip px-3 text-base sm:text-lg",
                    i === at ? "bg-teal text-white" : i < at ? "bg-[#e3f6ef] text-teal-deep" : "border-line bg-surface text-muted shadow-none",
                  )}
                >
                  {i < at && <Check className="size-4" strokeWidth={3.5} />}
                  {st === "pet" ? "Pet" : st === "coat" ? "Coat" : "Name"}
                </span>
              </span>
            );
          })}
        </div>
        {step === "pet" && (
          <PetCards
            kinds={options}
            at={at}
            onPick={(k) => {
              setKindIdx(k);
              setCoatIdx(0);
              setStep("coat");
            }}
          />
        )}
        {step === "coat" && (
          <div
            className="flex flex-wrap justify-center gap-4 rounded-2xl border-[3px] border-edge p-4 sm:gap-6 sm:p-6"
            style={{ backgroundColor: `${tint}1f` }}
          >
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
                    "press gloss grid size-20 place-items-center rounded-full border-[3px] border-edge shadow-[0_5px_0_#1d2452] sm:size-28",
                    i === coatIdx && "outline outline-4 outline-offset-4 outline-accent",
                  )}
                  style={{ background: c }}
                  aria-label={`coat ${i + 1}`}
                >
                  <Icon className={cn("size-10 sm:size-14", darkCoat(c) ? "text-white" : "text-ink")} strokeWidth={2.25} />
                </button>
              );
            })}
          </div>
        )}
        {step === "name" && (
          <div className="grid gap-3 sm:gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {names.map((nm, i) => (
                <button
                  key={nm}
                  type="button"
                  onClick={() => {
                    setTyped("");
                    setNameIdx(i);
                  }}
                  className={cn(
                    "chunk-sm press min-h-14 bg-surface px-3 py-2 font-display text-xl font-semibold",
                    !typed && i === nameIdx && "gloss bg-teal text-white",
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
              className="min-h-14 rounded-2xl border-[3px] border-edge bg-surface px-4 py-2 font-display text-xl shadow-[inset_0_3px_0_rgb(29_36_82/0.08)] placeholder:text-muted"
            />
            <Btn onClick={adopt} className="min-h-16 gap-3 text-2xl sm:text-3xl">
              <Heart className="size-7" fill="currentColor" /> Adopt {finalName}!
            </Btn>
          </div>
        )}
        <p className="text-center text-lg font-semibold leading-snug text-ink-soft">
          Left and right to choose · <PadKey>A</PadKey> to pick · <PadKey>B</PadKey> to go back
        </p>
      </div>
    </>
  );
}
