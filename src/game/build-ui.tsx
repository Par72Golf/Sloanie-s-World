import { useEffect, useRef, useState } from "react";
import { Check, Hammer, RotateCw, Trash2, Undo2 } from "lucide-react";
import { sfx } from "./audio";
import { BUILD_COLORS, PIECES, type PieceDef } from "./build-pieces";
import { useBuild, type BuildStoreHook } from "./build-store";
import { activePad } from "./input";
import { Btn } from "./overlays";
import { cn } from "@/lib/utils";

/**
 * The placing controls, up while she is building in the yard or arranging
 * things round her house (the same controls over a different store and
 * catalogue), laid out the way Minecraft's are, because that is the game the
 * kids know.
 *
 * A crosshair in the middle: what it is on is what LT builds against and RT
 * breaks. The hotbar along the bottom, the chosen piece raised and named, with
 * the colours above it; LB and RB step along it, the D-pad picks the colour.
 * On a tablet without a controller the same things are big buttons: tap a
 * piece, tap a colour, and Place / Break down the right where a thumb is.
 */
export function BuildHud({ store = useBuild, catalogue = PIECES }: { store?: BuildStoreHook; catalogue?: PieceDef[] }) {
  const building = store((s) => s.building);
  const unlocked = store((s) => s.unlocked);
  const piece = store((s) => s.piece);
  const color = store((s) => s.color);
  const count = store((s) => s.pieces.length);
  const selected = useRef<HTMLButtonElement | null>(null);
  const [pad, setPad] = useState(false);
  // keep the chosen piece in view as LB and RB walk the hotbar
  useEffect(() => {
    selected.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [piece, building]);
  // the controller guide only when a controller is there
  useEffect(() => {
    if (!building) return;
    const t = window.setInterval(() => setPad(!!activePad()), 1000);
    setPad(!!activePad());
    return () => window.clearInterval(t);
  }, [building]);
  if (!building) return null;
  const st = store.getState();
  // prizes appear once won; things with a price are shown with it until bought
  const palette = catalogue.filter((p) => !p.prize || unlocked.includes(p.id));
  const def = catalogue.find((p) => p.id === piece);
  const forSale = (p: PieceDef) => !!p.price && !unlocked.includes(p.id);
  const tap = (fn: () => void) => () => {
    sfx.click();
    fn();
  };
  return (
    <>
      {/* the crosshair */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2" aria-hidden>
        <div className="relative size-7">
          <span className="absolute left-1/2 top-0 h-7 w-[3px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_1.5px_rgb(42_34_48/0.7)]" />
          <span className="absolute left-0 top-1/2 h-[3px] w-7 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_1.5px_rgb(42_34_48/0.7)]" />
        </div>
      </div>

      {/* the hotbar, the colours above it, the piece's name above those */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mx-auto flex w-fit max-w-[min(68vw,56rem)] flex-col items-center gap-1.5 px-2">
        <p className="ui-chip bg-surface px-3 py-0.5 text-base font-semibold text-ink 2xl:text-lg">
          {def?.name ?? ""}
          {def && forSale(def) ? ` · ${def.price} tickets` : ""} &middot; {count} placed
        </p>
        {def?.colored && (
          <div className="ui-glass flex gap-1.5 p-1">
            {BUILD_COLORS.map((c, i) => (
              <button
                key={c.id}
                type="button"
                aria-label={c.name}
                onClick={tap(() => st.setColor(i))}
                className={cn("size-8 rounded-full border-[3px] 2xl:size-10", i === color ? "scale-110 border-ink" : "border-white/70")}
                style={{ background: c.hex }}
              />
            ))}
          </div>
        )}
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border-[3px] border-[#3a2f3e] bg-[#3a2f3e]/80 p-1 [scrollbar-width:none]">
          {palette.map((p) => (
            <button
              key={p.id}
              ref={p.id === piece ? selected : undefined}
              type="button"
              aria-label={p.name}
              onClick={tap(() => st.select(p.id))}
              className={cn(
                "relative grid size-12 shrink-0 place-items-center rounded-lg border-[3px] text-2xl transition-transform sm:size-14 sm:text-3xl",
                p.id === piece ? "-translate-y-1 border-white bg-white/35" : "border-transparent bg-white/10",
              )}
            >
              {p.icon}
              {forSale(p) && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-sun px-1.5 text-[0.7rem] font-bold text-ink">{p.price}</span>
              )}
              {p.prize && <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-sun" />}
            </button>
          ))}
        </div>
        {pad && (
          <p className="rounded-full bg-[#3a2f3e]/80 px-3 py-0.5 text-center text-xs font-semibold text-white sm:text-sm">
            LT place · RT break · LB / RB piece · D-pad colour & turn · A A fly · B done
          </p>
        )}
      </div>

      {/* big buttons for a tablet with no controller */}
      <div className="pointer-events-auto absolute right-[max(0.75rem,env(safe-area-inset-right))] top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2">
        <Btn onClick={() => st.ask("place")} className="min-h-14 min-w-28 gap-2 text-xl">
          <Hammer className="size-5" /> Place
        </Btn>
        <Btn variant="secondary" onClick={() => st.ask("remove")} className="min-h-12 gap-2 text-lg">
          <Trash2 className="size-5" /> Break
        </Btn>
        {def?.turns && (
          <Btn variant="secondary" onClick={tap(() => st.turn())} className="min-h-12 gap-2 text-lg">
            <RotateCw className="size-5" /> Turn
          </Btn>
        )}
        <Btn variant="secondary" onClick={() => st.ask("undo")} className="min-h-12 gap-2 text-lg">
          <Undo2 className="size-5" /> Undo
        </Btn>
        <Btn variant="sun" onClick={tap(() => st.setBuilding(false))} className="min-h-12 gap-2 text-lg">
          <Check className="size-5" /> Done
        </Btn>
      </div>
    </>
  );
}
