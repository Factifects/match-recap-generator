import path from "node:path";
import fs from "node:fs";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { parseSceneScript } from "../src/script/parseSceneScript";
import { autoFixGeometry } from "../src/script/validateGeometry";

const CANVAS_PHASE_DURATION_FRAMES = 90;

async function main() {
  const scriptText = fs.readFileSync("analyses/cpu-gpu-processes-threads-2026-07-20.txt", "utf8");
  const { segments } = autoFixGeometry(parseSceneScript(scriptText));
  console.log(`Parsed ${segments.length} segments OK.`);

  const bundleLocation = await bundle({ entryPoint: path.join(process.cwd(), "src", "video", "index.ts") });

  for (const aspectRatio of ["16:9", "9:16"] as const) {
    const inputProps = { segments, aspectRatio, backgroundMusicPath: undefined, audioClips: [] };
    const composition = await selectComposition({ serveUrl: bundleLocation, id: "AnalysisVideo", inputProps });
    const fps = composition.fps;

    let frameCursor = 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i] as { durationSeconds: number; visual?: { kind: string } };
      const durationFrames = Math.round(seg.durationSeconds * fps);
      const kind = seg.visual?.kind ?? "text";
      const endFrame = frameCursor + Math.max(0, durationFrames - 8);
      await renderStill({
        composition,
        serveUrl: bundleLocation,
        output: path.join(process.cwd(), "output", "verifyCpuGpu2", `${aspectRatio.replace(":", "x")}-scene${i}-${kind}-end.png`),
        inputProps,
        frame: endFrame,
      });
      const midPhaseFrame = frameCursor + CANVAS_PHASE_DURATION_FRAMES + 45;
      if (midPhaseFrame < frameCursor + durationFrames) {
        await renderStill({
          composition,
          serveUrl: bundleLocation,
          output: path.join(process.cwd(), "output", "verifyCpuGpu2", `${aspectRatio.replace(":", "x")}-scene${i}-${kind}-phase1.png`),
          inputProps,
          frame: midPhaseFrame,
        });
      }
      frameCursor += durationFrames;
    }
    console.log(`done ${aspectRatio}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
