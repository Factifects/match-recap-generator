import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { generateVideo } from "./generate";
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
    },
  });

  const scriptPath = values.script;
  if (!scriptPath) {
    console.error(
      "Usage: npm run generate -- --script <path> [--audio] [--aspect-ratio 16:9|9:16] [--tts-provider elevenlabs|edge] [--edge-voice <voiceId>] [--concurrency <n>]",
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

  console.log(`Reading script from ${scriptPath}...`);
  const scriptText = fs.readFileSync(scriptPath, "utf8");
  const scriptName = path.basename(scriptPath, path.extname(scriptPath));
  const orientationSuffix = aspectRatio === "9:16" ? "-9x16" : "-16x9";

  const result = await generateVideo(scriptText, {
    withAudio: values.audio,
    aspectRatio,
    ttsProvider,
    edgeVoice: values["edge-voice"],
    concurrency,
    outputName: `${scriptName}-scenes${orientationSuffix}`,
    onLog: (message) => console.log(message),
  });

  console.log(`Rendered ${result.segmentCount} segments to ${result.outputPath}`);
}

main().catch((err) => {
  console.error("generate failed:", err);
  process.exit(1);
});
