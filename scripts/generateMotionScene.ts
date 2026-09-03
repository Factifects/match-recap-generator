import { parseArgs } from "node:util";
import { authorMotionScene } from "../src/ai/authorMotion";
import { describeProviders, selectProvider } from "../src/ai/selectProvider";

// ---------------------------------------------------------------------------
// Generate ONE bespoke motion component, without authoring a whole script.
//
// `npm run author` already reaches this path whenever the outline picks
// `Scene Type: motion`, but that costs a full outline plus every other scene
// before the interesting part runs. This exists to exercise the generation ->
// gate -> compile -> repair loop directly, which is what you want while
// iterating on the prompt, trying a new provider, or checking whether a model
// is actually capable of writing animation code.
//
//   npx tsx scripts/generateMotionScene.ts \
//     --id gps-downlink-only \
//     --narration "..." \
//     --intent "..." \
//     [--llm cerebras] [--model <id>] [--aspect-ratio 9:16]
//
// On success the component lands in src/video/generated/ and is immediately
// renderable from a script with:
//   **Data:** {"kind": "motion", "component": "<id>"}
// ---------------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    options: {
      id: { type: "string" },
      narration: { type: "string" },
      intent: { type: "string" },
      "aspect-ratio": { type: "string", default: "9:16" },
      llm: { type: "string" },
      model: { type: "string" },
    },
  });

  if (!values.id || !values.narration || !values.intent) {
    console.error(
      'Usage: npx tsx scripts/generateMotionScene.ts --id <kebab-id> --narration "..." --intent "what the animation must demonstrate" [--llm <provider>] [--model <id>] [--aspect-ratio 9:16|16:9]',
    );
    console.error("\nProviders:\n" + describeProviders());
    process.exit(1);
  }

  const aspectRatio = values["aspect-ratio"] === "16:9" ? "16:9" : "9:16";
  const provider = selectProvider(values.llm, { model: values.model });
  console.log(`Generating with ${provider.id}/${provider.model}...`);

  const result = await authorMotionScene(provider, {
    id: values.id,
    aspectRatio,
    onLog: (message) => console.log(message),
    scene: {
      sceneType: "motion",
      act: "reveal",
      narration: values.narration,
      visualIntent: values.intent,
    },
  });

  console.log(`\nWrote ${result.filePath} (${result.repairRounds} repair round(s)).`);
  console.log(`Use it in a script with:\n  **Data:** {"kind": "motion", "component": "${result.id}"}`);
}

main().catch((err) => {
  console.error("motion generation failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
