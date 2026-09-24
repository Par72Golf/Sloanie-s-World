import { Check, RotateCw, Trash2, Undo2 } from "lucide-react";
import { sfx } from "./audio";
import { BUILD_COLORS, PIECES, type PieceDef } from "./build-pieces";
import { useBuild, type BuildStoreHook } from "./build-store";
import { Btn } from "./overlays";
import { cn } from "@/lib/utils";

/**
 * The placing controls, up while she is building in the yard or arranging
 * things round her house (the same controls over a different store and
 * catalogue).
 *
 * Big, few and all on screen at once, because she builds on a tablet: the
 * pieces along the top, the colours under them, and Place / Remove / Turn /
 * Undo / Done down the right where her thumb is. Collect on a keyboard or pad
 * places too. She walks with the stick as always; the see-through piece in
 * front of her is where Place puts it.
 */
export function BuildHud({ store = useBuild, catalogue = PIECES }: { store?: BuildStoreHook; catalogue?: PieceDef[] }) {
  const building = store((s) => s.building);
  const unlocked = store((s) => s.unlocked);
  const piece = store((s) => s.piece);
  const color = store((s) => s.color);
  const count = store((s) => s.pieces.length);
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
      <div className="pointer-events-auto absolute inset-x-0 top-[max(9.5rem,env(safe-area-inset-top))] z-20 mx-auto flex w-fit max-w-[94vw] flex-col items-center gap-2">
        <div className="ui-glass flex max-w-full gap-1.5 overflow-x-auto p-1.5">
          {palette.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-label={p.name}
              onClick={tap(() => st.select(p.id))}
              className={cn(
                "relative grid size-14 shrink-0 place-items-center rounded-xl text-3xl transition-transform 2xl:size-16",
                p.id === piece ? "scale-105 bg-accent shadow-[0_3px_0_rgba(0,0,0,0.2)]" : "bg-surface-2",
                p.prize && "ring-2 ring-sun",
              )}
            >
              {p.icon}
              {forSale(p) && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-sun px-1.5 text-xs font-bold text-ink">{p.price}</span>
              )}
            </button>
          ))}
        </div>
        {def?.colored && (
          <div className="ui-glass flex gap-1.5 p-1.5">
            {BUILD_COLORS.map((c, i) => (
              <button
                key={c.id}
                type="button"
                aria-label={c.name}
                onClick={tap(() => st.setColor(i))}
                className={cn("size-10 rounded-full border-4 2xl:size-12", i === color ? "border-ink" : "border-white/70")}
                style={{ background: c.hex }}
              />
            ))}
          </div>
        )}
        <p className="ui-chip bg-surface px-3 py-1 text-base font-semibold text-ink">
          {def?.name ?? ""}
          {def && forSale(def) ? ` · ${def.price} tickets` : ""} &middot; {count} placed
        </p>
      </div>

      <div className="pointer-events-auto absolute right-[max(0.75rem,env(safe-area-inset-right))] top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2">
        <Btn onClick={() => st.ask("place")} className="min-h-16 min-w-32 text-2xl">
          Place
        </Btn>
        <Btn variant="secondary" onClick={() => st.ask("remove")} className="min-h-12 gap-2 text-lg">
          <Trash2 className="size-5" /> Remove
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
