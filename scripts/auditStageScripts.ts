import fs from "node:fs";
import path from "node:path";
import { parseSceneScript } from "../src/script/parseSceneScript";
import { diagnoseStageScenes, diagnoseSceneMedia } from "../src/script/validateStage";
import { mergeStageContinuity } from "../src/script/mergeStageContinuity";

// Runs the stage diagnostics over every script in analyses/ without generating
// audio or rendering — the cheap pass, for seeing what a new static check
// actually catches across the whole back catalogue rather than on one script.

const dir = path.join(process.cwd(), "analyses");
const only = process.argv[2];

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).sort()) {
  if (only && !file.includes(only)) continue;
  let segments;
  let media: ReturnType<typeof diagnoseSceneMedia> = [];
  try {
    // The same fold generate.ts applies before diagnosing: a `Continue Stage:`
    // passage becomes ONE segment whose objects and packets are the union of
    // the scenes in it. Diagnosing the unmerged parse would report every
    // inherited entity as missing.
    const parsed = parseSceneScript(fs.readFileSync(path.join(dir, file), "utf8"));
    // Medium rotation is judged on the AUTHORED scenes; everything else on the
    // merged ones — the same split generate.ts uses.
    media = diagnoseSceneMedia(parsed);
    segments = mergeStageContinuity(parsed).segments;
  } catch (error) {
    console.log(`\n${file}\n  PARSE FAILED: ${(error as Error).message.split("\n")[0]}`);
    continue;
  }
  // A scene whose Data failed validation falls back to a plain caption and then
  // has NOTHING for the stage checks to look at — which reads as a clean audit
  // when it is the opposite. Report that first and loudly.
  const fellBack = segments.filter((s) => (s as { visual?: unknown }).visual === undefined).length;
  const found = [...media, ...diagnoseStageScenes(segments, file)];
  if (found.length === 0 && fellBack === 0) continue;
  if (fellBack > 0) {
    console.log(`\n${file}`);
    console.log(`  [PARSE FALLBACK] ${fellBack} of ${segments.length} scenes lost their Data block and render as captions. Fix these before reading anything below.`);
    for (const d of found) console.log(`  [${d.category}] ${d.sceneLabel}: ${d.message}`);
    continue;
  }
  console.log(`\n${file}`);
  for (const d of found) console.log(`  [${d.category}] ${d.sceneLabel}: ${d.message}`);
}
