import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { authorScript } from "./ai/authorScript";
import { describeProviders, selectProvider } from "./ai/selectProvider";
import { generateVideo } from "./generate";
import type { AspectRatio } from "./model/Segment";

// ---------------------------------------------------------------------------
// `npm run author -- --topic "..."` — the whole loop from one sentence.
//
// Kept as its own entry point rather than a flag on cli.ts. `generate` takes a
// script that already exists and is a pure, offline, deterministic pipeline;
// this one calls a paid/rate-limited external service and writes a new file
// into `analyses/`. Those are different enough operations that folding them
// into one command would make the safe one feel risky.
// ---------------------------------------------------------------------------

function slugify(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

async function main() {
  const { values } = parseArgs({
    options: {
      topic: { type: "string" },
      "aspect-ratio": { type: "string", default: "9:16" },
      /** Which model authors. Defaults to the free tier — see selectProvider. */
      llm: { type: "string" },
      model: { type: "string" },
      scenes: { type: "string" },
      out: { type: "string" },
      /** Chains straight into a real render once the script is authored.
       * Off by default: the point of the review step is that a human looks at
       * the script before it costs render time, and this project's own
       * doctrine says a scene is never done on validation alone. */
      /** Renders probe frames per scene and has a model look at them. Costs a
       * render per scene, so it is opt-in. */
      critique: { type: "boolean", default: false },
      render: { type: "boolean", default: false },
      audio: { type: "boolean", default: false },
    },
  });

  const topic = values.topic;
  if (!topic) {
    console.error(
      'Usage: npm run author -- --topic "why your phone battery dies faster in winter" [--aspect-ratio 9:16|16:9] [--llm <provider>] [--model <id>] [--scenes <n>] [--out <path>] [--critique] [--render] [--audio]',
    );
    console.error("\nProviders:\n" + describeProviders());
    process.exit(1);
  }

  const aspectRatio = values["aspect-ratio"] as AspectRatio;
  if (aspectRatio !== "16:9" && aspectRatio !== "9:16") {
    console.error(`Invalid --aspect-ratio "${aspectRatio}" — must be "16:9" or "9:16".`);
    process.exit(1);
  }

  let targetSceneCount: number | undefined;
  if (values.scenes !== undefined) {
    targetSceneCount = Number(values.scenes);
    if (!Number.isInteger(targetSceneCount) || targetSceneCount < 3) {
      console.error(`Invalid --scenes "${values.scenes}" — must be an integer of at least 3.`);
      process.exit(1);
    }
  }

  const provider = selectProvider(values.llm, { model: values.model });

  const result = await authorScript(provider, {
    topic,
    aspectRatio,
    targetSceneCount,
    critique: values.critique,
    onLog: (message) => console.log(message),
  });

  const date = new Date().toISOString().slice(0, 10);
  const outPath = values.out ?? path.join("analyses", `${slugify(topic)}-${date}.txt`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, result.scriptText, "utf8");
  console.log(`\nWrote ${outPath}`);

  if (result.critiques) {
    console.log("\nVisual critique:");
    result.critiques.forEach((critique, index) => {
      if (!critique) {
        console.log(`  Scene ${index + 1}: not reviewed`);
        return;
      }
      console.log(
        `  Scene ${index + 1}: ${critique.verdict}${critique.looksEmpty ? " (LOOKS EMPTY)" : ""} — readable ${critique.readable}/10, mechanism ${critique.demonstratesMechanism}/10, text ${critique.textLegible}/10, progression ${critique.progression}/10`,
      );
      critique.problems.forEach((problem) => console.log(`      - ${problem}`));
    });
  }

  if (result.diagnostics.length > 0) {
    console.log(`\nDiagnostics (${result.diagnostics.length}):`);
    for (const d of result.diagnostics) {
      console.log(`  [${d.severity === "hard" ? "HARD" : "soft"} L${d.level} ${d.category}] ${d.sceneLabel}: ${d.message}`);
    }
  }

  if (!values.render) {
    console.log(`\nReview it, then render:\n  npm run generate -- --script ${outPath} --aspect-ratio ${aspectRatio}${values.audio ? " --audio" : ""}`);
    return;
  }

  const scriptName = path.basename(outPath, path.extname(outPath));
  const rendered = await generateVideo(result.scriptText, {
    withAudio: values.audio,
    aspectRatio,
    outputName: `${scriptName}-scenes${aspectRatio === "9:16" ? "-9x16" : "-16x9"}`,
    onLog: (message) => console.log(message),
  });
  console.log(`Rendered ${rendered.segmentCount} segments to ${rendered.outputPath}`);
}

main().catch((err) => {
  console.error("author failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
