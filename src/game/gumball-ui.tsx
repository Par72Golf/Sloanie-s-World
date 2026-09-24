import { useEffect, useRef } from "react";
import { Gift } from "lucide-react";
import { ModalFrame, PadKey, PanelRibbon, useInput } from "./carnival-games";
import { HearButton } from "./help-cards";
import { prizeLine, useGumball } from "./gumballs";
import { Btn } from "./overlays";
import { speak } from "./speech";

/** What came out of the gumball: a big ball in its colour, and the prize, read aloud. */
export function GumballCardPanel() {
  const card = useGumball((s) => s.card);
  const done = () => useGumball.getState().setCard(null);
  const shownAt = useRef(0);
  useEffect(() => {
    if (card) shownAt.current = performance.now();
  }, [card]);
  useInput((e) => {
    if ((e === "a" || e === "b") && performance.now() - shownAt.current > 800) done();
  }, !!card);
  const line = card ? prizeLine(card.prize) : "";
  const spoken = card ? `${card.daily ? "Your daily surprise! " : ""}${line}` : "";
  useEffect(() => {
    if (spoken) speak(spoken);
  }, [spoken]);
  if (!card) return null;
  const golden = card.prize.kind === "tickets" && card.prize.golden;
  return (
    <ModalFrame className="max-w-md lg:max-w-lg">
      <PanelRibbon color={card.color} Icon={Gift} title={card.daily ? "Daily surprise!" : "Gumball!"} onClose={done} closeLabel="Done" padSkip pattern="gingham" />
      <div className="ui-dots grid justify-items-center gap-4 p-5 sm:p-6">
        <div
          className="animate-ui-pop size-32 rounded-full shadow-[inset_-10px_-14px_0_rgba(0,0,0,0.14),inset_10px_10px_0_rgba(255,255,255,0.45),0_6px_0_rgba(0,0,0,0.18)] sm:size-40"
          style={{ background: card.color, boxShadow: golden ? "0 0 40px 10px #ffd84a" : undefined }}
        />
        <div className="flex w-full items-start gap-3">
          <p className="min-w-[12rem] flex-1 text-center text-2xl font-semibold leading-snug text-ink">{line}</p>
          <HearButton text={spoken} className="press min-h-12 shrink-0" />
        </div>
        <Btn onClick={done} padDefault className="min-h-14 w-full text-2xl">
          Yay!
        </Btn>
        <p className="text-center text-base font-semibold text-ink-soft">
          <PadKey>A</PadKey> to close &middot; {card.daily ? "come back tomorrow for another free one" : "every day's first gumball is free"}
        </p>
      </div>
    </ModalFrame>
  );
}
