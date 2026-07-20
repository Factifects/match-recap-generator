import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { parseSceneScript } from "../src/script/parseSceneScript";
import { resolveSegmentAudio } from "../src/audio/resolveAudio";
import { FPS } from "../src/video/theme";
import type { AspectRatio } from "../src/model/Segment";

async function main() {
  const scriptText = fs.readFileSync(
    path.join(__dirname, "..", "analyses", "inside-a-computer-chip-2026-07-20.txt"),
    "utf-8",
  );
  let segments = parseSceneScript(scriptText);
  console.log(`Parsed ${segments.length} segments OK.`);
  segments = await resolveSegmentAudio(segments, { provider: "edge" });

  const starts: number[] = [];
  let acc = 0;
  for (const s of segments) {
    starts.push(acc);
    acc += Math.ceil(s.durationSeconds * FPS);
  }

  const outDir = path.join(__dirname, "..", "output", "verifyChip");
  fs.mkdirSync(outDir, { recursive: true });

  const bundleLocation = await bundle(path.join(__dirname, "..", "src", "video", "index.ts"));

  for (const aspectRatio of ["16:9", "9:16"] as AspectRatio[]) {
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "AnalysisVideo",
      inputProps: { segments, aspectRatio },
    });

    for (let idx = 0; idx < segments.length; idx++) {
      const seg = segments[idx];
      const durFrames = Math.ceil(seg.durationSeconds * FPS);
      const sampleFrames = new Set<number>();
      sampleFrames.add(starts[idx] + Math.max(1, durFrames - 8));
      const phaseCount = (seg.visual as any)?.phases?.length ?? 0;
      for (let p = 0; p <= phaseCount; p++) {
        const f = starts[idx] + p * 90 + 45;
        if (f < starts[idx] + durFrames) sampleFrames.add(f);
      }

      for (const rawFrame of sampleFrames) {
        const frame = Math.min(rawFrame, composition.durationInFrames - 1);
        const suffix = aspectRatio === "9:16" ? "9x16" : "16x9";
        const outPath = path.join(outDir, `scene${idx + 1}-f${frame}-${suffix}.png`);
        await renderStill({
          serveUrl: bundleLocation,
          composition,
          output: outPath,
          frame,
          inputProps: { segments, aspectRatio },
        });
      }
    }
    console.log(`done ${aspectRatio}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
