import { PIECES, type PieceDef } from "./build-pieces";
import { makeBuildStore, YARD_ORIGIN } from "./build-store";
import { HOUSE_ITEMS } from "./house-items";
import { SIDE_SAVES } from "./save";

/**
 * The build yard's store and what it can build with: its own pieces, and
 * every toy and piece of furniture she has for her house (house-items.ts), so
 * a teddy, a slide or a piano won from a gumball can go in the yard too.
 *
 * Here rather than in build-store.ts because the house's items pull in the
 * house's meshes, and build-store.ts is loaded long before those.
 */

/**
 * House items as yard pieces. Already hers wherever they are, so free to put
 * out here: whether she owns one is the hotbar's business (yardPalette), and
 * putting one down never charges for it again.
 */
const FROM_HOUSE: PieceDef[] = HOUSE_ITEMS.map((p) => ({ ...p, price: undefined, prize: undefined, earned: undefined }));

export const YARD_CATALOGUE: PieceDef[] = [...PIECES, ...FROM_HOUSE];
export const YARD_PIECE = new Map(YARD_CATALOGUE.map((p) => [p.id, p]));

/** What she has put in the build yard, saved in its own slot. */
export const useBuild = makeBuildStore(SIDE_SAVES.builds, YARD_CATALOGUE, { origin: YARD_ORIGIN, legacy: [72, -20] });

/** Does she have this house item: free from the start, or bought or won for her house. */
export function ownsHouseItem(p: PieceDef, houseUnlocked: readonly string[]) {
  return (!p.prize && !p.price) || houseUnlocked.includes(p.id);
}

/** The yard's hotbar: its pieces (prizes once won), then every house item she owns. */
export function yardPalette(yardUnlocked: readonly string[], houseUnlocked: readonly string[]): PieceDef[] {
  return [
    ...PIECES.filter((p) => !p.prize || yardUnlocked.includes(p.id)),
    ...HOUSE_ITEMS.filter((p) => ownsHouseItem(p, houseUnlocked)).map((p) => YARD_PIECE.get(p.id)!),
  ];
}
