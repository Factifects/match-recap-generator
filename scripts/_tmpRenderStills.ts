import path from "node:path";
import fs from "node:fs";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { parseSceneScript } from "../src/script/parseSceneScript";

async function main() {
  const scriptPath = process.argv[2];
  const framesArg = process.argv[3];
  const outDir = process.argv[4];
  const frames = framesArg.split(",").map(Number);

  const scriptText = fs.readFileSync(scriptPath, "utf8");
  const segments = parseSceneScript(scriptText);
  console.log(`Parsed ${segments.length} segments`);

  const entryPoint = path.join(__dirname, "..", "src", "video", "index.ts");
  const bundleLocation = await bundle({ entryPoint });

  const inputProps = { segments, aspectRatio: "16:9" as const, backgroundMusicPath: undefined };

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "AnalysisVideo",
    inputProps,
  });
  console.log(`Composition duration: ${composition.durationInFrames} frames`);

  fs.mkdirSync(outDir, { recursive: true });
  for (const frame of frames) {
    const outPath = path.join(outDir, `frame-${frame}.png`);
    await renderStill({
      composition,
      serveUrl: bundleLocation,
      output: outPath,
      inputProps,
      frame,
    });
    console.log(`Rendered frame ${frame} -> ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
