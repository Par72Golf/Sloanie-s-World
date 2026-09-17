/**
 * Controller and arrow-key movement through a grid of tiles as it is actually
 * laid out, so it follows responsive column counts. Tiles are grouped into
 * rows by their offsetTop (transforms such as a lifted selected tile are
 * ignored). Left and right move within the row, up and down go to the
 * nearest tile by x in the row above or below, and every edge clamps.
 */
export type GridDir = "left" | "right" | "up" | "down";

export function gridMove(container: Element | null | undefined, index: number, dir: GridDir, count?: number): number {
  const all = container ? Array.from(container.children) : [];
  const tiles = all.slice(0, count ?? all.length) as HTMLElement[];
  const n = tiles.length;
  if (!n) return index;
  const cur = Math.max(0, Math.min(index, n - 1));

  // rows in reading order, each a list of tile indices sorted by x
  const rows: number[][] = [];
  const tops: number[] = [];
  tiles.forEach((t, i) => {
    const top = t.offsetTop;
    let r = tops.findIndex((y) => Math.abs(y - top) < 6);
    if (r < 0) {
      tops.push(top);
      rows.push([]);
      r = rows.length - 1;
    }
    rows[r]!.push(i);
  });
  const order = tops.map((y, i) => [y, i] as const).sort((a, b) => a[0] - b[0]).map(([, i]) => rows[i]!);
  const centre = (i: number) => tiles[i]!.offsetLeft + tiles[i]!.offsetWidth / 2;
  for (const row of order) row.sort((a, b) => centre(a) - centre(b));

  const r = order.findIndex((row) => row.includes(cur));
  const row = order[r]!;
  const c = row.indexOf(cur);
  if (dir === "left") return row[Math.max(0, c - 1)]!;
  if (dir === "right") return row[Math.min(row.length - 1, c + 1)]!;
  const target = order[dir === "up" ? r - 1 : r + 1];
  if (!target) return cur;
  const x = centre(cur);
  return target.reduce((best, i) => (Math.abs(centre(i) - x) < Math.abs(centre(best) - x) ? i : best), target[0]!);
}
