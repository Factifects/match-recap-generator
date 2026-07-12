import { generateSpeechEdge } from "../src/audio/edgeTts";

const SAMPLE_TEXT =
  "Forty-five minutes gone, and the scoreline still didn't match what had happened. France had dominated territory, chances, and expected goals, and had nothing to show for it.";

const VOICES = ["en-US-GuyNeural", "en-US-AriaNeural", "en-GB-RyanNeural"];

async function main() {
  for (const voice of VOICES) {
    console.log(`Generating with ${voice}...`);
    const result = await generateSpeechEdge(SAMPLE_TEXT, voice);
    console.log(`  -> ${result.audioFilePath} (${result.durationSeconds.toFixed(1)}s)`);
  }
}

main().catch((err) => {
  console.error("tryEdgeTts failed:", err);
  process.exit(1);
});
