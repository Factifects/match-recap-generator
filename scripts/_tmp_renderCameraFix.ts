import path from "node:path";
import fs from "node:fs";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderStill } from "@remotion/renderer";
import { parseSceneScript } from "../src/script/parseSceneScript";

async function main() {
  const scriptText = fs.readFileSync("analyses/england-norway-quarterfinal-2026-07-12.txt", "utf8");
  const allSegments = parseSceneScript(scriptText);
  const tacticalBoardSegment = allSegments[4];
  if (tacticalBoardSegment.type !== "statement" || tacticalBoardSegment.visual?.kind !== "tactical-board") {
    throw new Error(`Expected scene 5 to be tactical-board, got ${JSON.stringify(tacticalBoardSegment)}`);
  }
  console.log("Resolved camera stages:", JSON.stringify(tacticalBoardSegment.camera));
  const segments = [tacticalBoardSegment];

  const entryPoint = path.join(__dirname, "..", "src", "video", "index.ts");
  const bundleLocation = await bundle({ entryPoint });

  const outDir =
    "C:\\Users\\OMOLOL~1\\AppData\\Local\\Temp\\claude\\c--Users-Omololu-Aniyikaye-Desktop-test-projects-match-recap-generator\\6be342e0-f186-46e6-9bdc-ddc3ff5403cc\\scratchpad\\camera-fix";
  fs.mkdirSync(outDir, { recursive: true });

  for (const aspectRatio of ["16:9", "9:16"] as const) {
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "AnalysisVideo",
      inputProps: { segments, aspectRatio },
    });
    const suffix = aspectRatio === "16:9" ? "landscape" : "portrait";
    for (const frame of [10, 60, 120, 200, 280]) {
      await renderStill({
        composition,
        serveUrl: bundleLocation,
        output: path.join(outDir, `${suffix}-frame${frame}.png`),
        frame,
        inputProps: { segments, aspectRatio },
      });
      console.log(`Rendered ${suffix}-frame${frame}.png`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
