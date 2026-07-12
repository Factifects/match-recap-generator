import fs from "node:fs";
import path from "node:path";
import { parseSceneScript } from "../src/script/parseSceneScript";

const files = [
  "analyses/why-morocco-lost-part2.txt",
  "analyses/this-week-in-football-2026-07-11.txt",
  "analyses/england-norway-quarterfinal-2026-07-12.txt",
  "C:\\Users\\OMOLOL~1\\AppData\\Local\\Temp\\claude\\c--Users-Omololu-Aniyikaye-Desktop-test-projects-match-recap-generator\\6be342e0-f186-46e6-9bdc-ddc3ff5403cc\\scratchpad\\phase3-portrait-test.txt",
];

const outDir =
  "C:\\Users\\OMOLOL~1\\AppData\\Local\\Temp\\claude\\c--Users-Omololu-Aniyikaye-Desktop-test-projects-match-recap-generator\\6be342e0-f186-46e6-9bdc-ddc3ff5403cc\\scratchpad\\parse-snapshots";
fs.mkdirSync(outDir, { recursive: true });

const label = process.argv[2] ?? "before";

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const segments = parseSceneScript(text);
  const name = path.basename(file, ".txt");
  fs.writeFileSync(path.join(outDir, `${name}-${label}.json`), JSON.stringify(segments, null, 2));
  console.log(`Snapshotted ${name} (${segments.length} segments) -> ${name}-${label}.json`);
}
