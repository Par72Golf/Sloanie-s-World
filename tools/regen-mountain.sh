#!/bin/sh
# Read the ice cream mountain's own boxes back into sugar-model-boxes.ts, less
# the rail, rim and slide boxes that sugar-models.ts adds from their functions.
# Run after changing the mountain's shape; tools/model-boxes.ts fails until you do.
set -e
cd "$(dirname "$0")/.."
T=$(mktemp -d)
DUMP=ice-cream-mountain npx jiti tools/model-boxes.ts 2>/dev/null > "$T/all"
cat > "$T/extras.ts" <<'TS'
import { mountainRailBoxes, mountainRimBoxes, mountainSlideBoxes } from "../src/game/candy-builds";
const r2 = (n: number) => Math.round(n * 100) / 100;
for (const b of [...mountainRailBoxes(), ...mountainRimBoxes(), ...mountainSlideBoxes()]) console.log(`  [${[b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ].map(r2).join(", ")}],`);
TS
cp "$T/extras.ts" tools/.extras.tmp.ts
npx jiti tools/.extras.tmp.ts 2>/dev/null > "$T/extras"
rm tools/.extras.tmp.ts
grep -vxFf "$T/extras" "$T/all" > "$T/base"
python3 - "$T/base" <<'PY'
import re, sys
p = "src/game/sugar-model-boxes.ts"
s = open(p).read()
new = open(sys.argv[1]).read()
s = re.sub(r"(export const MOUNTAIN: Row\[\] = \[\n)(.*?)(\];)", lambda m: m.group(1) + new + m.group(3), s, flags=re.S)
open(p, "w").write(s)
PY
echo "MOUNTAIN: $(wc -l < "$T/base" | tr -d ' ') rows"
