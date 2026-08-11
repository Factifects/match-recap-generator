import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { generateVideo, previewScene } from "./generate";
import type { AspectRatio } from "./model/Segment";
import type { TtsProvider } from "./audio/resolveAudio";

async function main() {
  const { values } = parseArgs({
    options: {
      script: { type: "string" },
      audio: { type: "boolean", default: false },
      "aspect-ratio": { type: "string", default: "16:9" },
      "tts-provider": { type: "string", default: "elevenlabs" },
      "edge-voice": { type: "string" },
      concurrency: { type: "string" },
      // 1-indexed, matching how scenes are already numbered everywhere a
      // human sees them (log lines, the diagnostics report) — renders just
      // that one scene (after the same parse/merge pipeline a full render
      // uses, see generate.ts's resolveSegments) instead of the whole
      // video. The actual "fix scene 5, check it in seconds" loop this
      // whole validation pass exists to enable, from the terminal.
      scene: { type: "string" },
      // Bypasses generateVideo's hard-failure gate (see runEnforcementGate
      // in generate.ts) — the scene still renders exactly as authored, this
      // only skips the "don't spend audio/render cost on a scene that's
      // provably broken" check. No effect on --scene (previewScene never
      // gates at all — the point of a scene preview is fixing what
      // validation flagged, so it must never itself be blocked by it).
      force: { type: "boolean", default: false },
      strict: { type: "boolean", default: false },
    },
  });

  const scriptPath = values.script;
  if (!scriptPath) {
    console.error(
      "Usage: npm run generate -- --script <path> [--audio] [--aspect-ratio 16:9|9:16] [--tts-provider elevenlabs|edge] [--edge-voice <voiceId>] [--concurrency <n>] [--scene <n>] [--strict]",
    );
    process.exit(1);
  }

  const aspectRatio = values["aspect-ratio"] as AspectRatio;
  if (aspectRatio !== "16:9" && aspectRatio !== "9:16") {
    console.error(`Invalid --aspect-ratio "${aspectRatio}" — must be "16:9" or "9:16".`);
    process.exit(1);
  }

  const ttsProvider = values["tts-provider"] as TtsProvider;
  if (ttsProvider !== "elevenlabs" && ttsProvider !== "edge") {
    console.error(`Invalid --tts-provider "${ttsProvider}" — must be "elevenlabs" or "edge".`);
    process.exit(1);
  }

  let concurrency: number | undefined;
  if (values.concurrency !== undefined) {
    concurrency = Number(values.concurrency);
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      console.error(`Invalid --concurrency "${values.concurrency}" — must be a positive integer.`);
      process.exit(1);
    }
  }

  let sceneNumber: number | undefined;
  if (values.scene !== undefined) {
    sceneNumber = Number(values.scene);
    if (!Number.isInteger(sceneNumber) || sceneNumber < 1) {
      console.error(`Invalid --scene "${values.scene}" — must be a positive integer (1-indexed).`);
      process.exit(1);
    }
  }

  console.log(`Reading script from ${scriptPath}...`);
  const scriptText = fs.readFileSync(scriptPath, "utf8");
  const scriptName = path.basename(scriptPath, path.extname(scriptPath));
  const orientationSuffix = aspectRatio === "9:16" ? "-9x16" : "-16x9";

  if (sceneNumber !== undefined) {
    const result = await previewScene(scriptText, {
      sceneIndex: sceneNumber - 1,
      withAudio: values.audio,
      ttsProvider,
      edgeVoice: values["edge-voice"],
      aspectRatio,
      outputName: `${scriptName}-${sceneNumber}-preview${orientationSuffix}`,
      onLog: (message) => console.log(message),
    });
    console.log(`Rendered ${result.sceneLabel} (of ${result.totalScenes}) to ${result.outputPath}`);
    return;
  }

  const result = await generateVideo(scriptText, {
    withAudio: values.audio,
    aspectRatio,
    ttsProvider,
    edgeVoice: values["edge-voice"],
    concurrency,
    strict: values.strict,
    force: values.force,
    outputName: `${scriptName}-scenes${orientationSuffix}`,
    onLog: (message) => console.log(message),
  });

  console.log(`Rendered ${result.segmentCount} segments to ${result.outputPath}`);
}

main().catch((err) => {
  console.error("generate failed:", err);
  process.exit(1);
});
