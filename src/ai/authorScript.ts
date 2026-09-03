import path from "node:path";
import { parseSceneScript } from "../script/parseSceneScript";
import { autoFixGeometry } from "../script/validateGeometry";
import { diagnoseScenes } from "../script/validateScene";
import { sortDiagnostics, type SceneDiagnostic } from "../script/sceneDiagnostics";
import { authorOutline, type Outline } from "./authorOutline";
import { authorScene, type AuthoredScene } from "./authorScene";
import { authorMotionScene } from "./authorMotion";
import { isValidComponentId } from "./generatedComponentStore";
import { loadExemplarCorpus, mediumsWithinBudget } from "./mediumCatalog";
import { ENGINE_DOCTRINE } from "./doctrine";
import { estimateTokens } from "./provider";
import { cleanUpProbeFrames, critiqueScene, type Critique } from "./critiqueScene";
import { isVisionCapable, selectVisionProvider } from "./selectProvider";
import type { LlmProvider } from "./provider";

// ---------------------------------------------------------------------------
// The closed loop: a topic in, a validated script out.
//
// This is the piece the project has never had. Everything downstream of a
// script — parse, narration fit, geometry checks, render — has existed and
// worked for months; the script itself was written by hand every time. That
// made the human the bottleneck AND the only quality gate.
//
// Tier 2 of the repair loop is here. Once every scene is individually schema-
// valid, the script is assembled and run through the same parse-and-diagnose
// path the generator UI uses (`POST /parse` in server.ts): parseSceneScript ->
// autoFixGeometry -> diagnoseScenes. Any HARD diagnostic is routed back to the
// specific scene that caused it and that scene alone is re-authored. Soft
// diagnostics are reported and never block, matching this project's standing
// position that diagnostics are advisory — the author renders and looks.
//
// The important property: the model is never trusted. It is measured, by the
// exact checks that already govern hand-written scripts.
// ---------------------------------------------------------------------------

const MAX_DIAGNOSTIC_REPAIR_ROUNDS = 2;

export interface AuthorScriptOptions {
  topic: string;
  aspectRatio: "16:9" | "9:16";
  targetSceneCount?: number;
  allowedMediums?: string[];
  analysesDir?: string;
  /** Renders probe frames per scene and has a multimodal model look at them —
   * the only check that can tell a valid-but-empty scene from a good one.
   *
   * OFF by default, and that is a deliberate cost decision rather than a lack
   * of confidence: it is the only gate that spends a render, on a machine
   * where rendering is the expensive, thermally-limited operation. Everything
   * cheaper runs first and unconditionally. */
  critique?: boolean;
  /** Where probe frames are written before being read and deleted. */
  critiqueOutDir?: string;
  onLog?: (message: string) => void;
}

export interface AuthorScriptResult {
  scriptText: string;
  outline: Outline;
  scenes: AuthoredScene[];
  /** Whatever remained after the repair rounds — soft findings always, and
   * hard ones if they proved unfixable. Returned rather than thrown so a
   * script with a stubborn soft warning still reaches the review queue, which
   * is where a human decides whether it matters. */
  diagnostics: SceneDiagnostic[];
  /** Per-scene visual verdicts, when `critique` was requested. Indexed by
   * scene, sparse where a critique could not be produced. */
  critiques?: (Critique | undefined)[];
  provider: string;
  model: string;
}

/** Turns a scene's position and topic into a stable, filesystem-safe registry
 * id for a generated component. Prefixed with the scene number so two scenes in
 * one script can't collide, and slugged from the topic so the generated
 * directory stays readable rather than becoming a wall of UUIDs. */
export function motionComponentId(topic: string, sceneIndex: number): string {
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 4)
    .join("-");
  const id = `s${sceneIndex + 1}-${slug || "scene"}`;
  // The id doubles as a filename and an exported symbol, so it must satisfy the
  // store's pattern; a topic of pure punctuation would otherwise produce one
  // that cannot be written.
  return isValidComponentId(id) ? id : `s${sceneIndex + 1}-generated`;
}

/** Serializes authored scenes into the `### SCENE N` format parseSceneScript
 * consumes. Matches the layout of the hand-written scripts in `analyses/`
 * exactly — blank line between every field, `---` between scenes — so a
 * generated script is editable by hand afterwards with no format shift, and
 * diffs against a hand-written one stay readable. */
export function serializeScript(title: string, scenes: AuthoredScene[], topic: string, provider: string, model: string): string {
  const header = [
    `# ${title}`,
    `#`,
    `# Authored by ${provider}/${model} from the prompt:`,
    `#   "${topic}"`,
    `#`,
    `# Every scene below was validated against its medium's Zod schema and the`,
    `# project's scene diagnostics before this file was written.`,
    "",
    "---",
    "",
  ].join("\n");

  const blocks = scenes.map((scene, index) =>
    [
      `### SCENE ${index + 1}`,
      "",
      `**Scene Type:** ${scene.sceneType}`,
      "",
      `**Narration:** ${scene.narration}`,
      "",
      `**Duration:** ${scene.durationSeconds} seconds`,
      "",
      `**Data:** ${JSON.stringify(scene.data)}`,
      "",
      "---",
      "",
    ].join("\n"),
  );

  return header + blocks.join("\n");
}

/** Runs the project's own parse + diagnostics over an assembled script — the
 * identical sequence `POST /parse` uses, so what the review UI would report is
 * exactly what the repair loop sees. Deliberately calls the shared functions
 * rather than reimplementing the checks: a second copy of this logic would
 * drift, and then the pipeline would be repairing against rules the renderer
 * no longer applies. */
export function diagnoseScript(scriptText: string): SceneDiagnostic[] {
  const segments = parseSceneScript(scriptText);
  const { diagnostics: geometryDiagnostics } = autoFixGeometry(segments);
  return sortDiagnostics([...geometryDiagnostics, ...diagnoseScenes(segments)]);
}

/** Everything a scene-authoring call spends BESIDES the medium's schema.
 *
 * Derived rather than hardcoded, because the dominant term is the doctrine
 * prompt and that grows: it doubled the moment the visual direction was written
 * into it, which silently understated a hardcoded reserve by ~1600 tokens and
 * would have offered the outline two mediums whose scene calls could never fit.
 * A constant here is a number that goes stale the next time anyone edits the
 * doctrine — and the failure it produces is a 413 no retry can clear.
 */
function sceneCallReserveTokens(): number {
  const OUTPUT_REQUEST = 2_600; // must match authorScene's constrained budget
  const BRIEF = 400; // narration + intent + aspect ratio
  const SLACK = 300; // estimator error, since estimateTokens is approximate
  return estimateTokens(ENGINE_DOCTRINE) + OUTPUT_REQUEST + BRIEF + SLACK;
}

export async function authorScript(provider: LlmProvider, options: AuthorScriptOptions): Promise<AuthorScriptResult> {
  const { topic, aspectRatio, targetSceneCount, allowedMediums, analysesDir = "analyses", onLog = () => {} } = options;

  onLog(`Authoring with ${provider.id}/${provider.model}.`);
  const corpus = loadExemplarCorpus(analysesDir);
  onLog(`Loaded ${corpus.length} exemplar scenes from ${analysesDir}/.`);

  // A medium whose schema cannot fit the provider's per-request ceiling is
  // removed BEFORE the outline chooses, not discovered at scene-authoring time
  // as a 413 that no retry can clear. On an unconstrained provider this filters
  // nothing and the full set is offered.
  const affordable = mediumsWithinBudget(provider.promptBudgetTokens, sceneCallReserveTokens()).map((m) => m.kind);
  const offered = allowedMediums ?? affordable;
  if (!allowedMediums && affordable.length < 30) {
    onLog(
      `  ${provider.id} caps a request at ${provider.promptBudgetTokens} tokens — offering ${affordable.length} mediums whose schemas fit.`,
    );
  }

  const outline = await authorOutline(provider, { topic, aspectRatio, allowedMediums: offered, targetSceneCount, onLog });

  // Authored in order, not in parallel. Each scene is given the previous
  // scene's narration so the script builds rather than restarting, and the
  // free tiers this defaults to rate-limit hard enough that a fan-out mostly
  // buys 429s. Ordering is the cheaper correctness win.
  const scenes: AuthoredScene[] = [];
  for (const [index, outlineScene] of outline.scenes.entries()) {
    onLog(`Scene ${index + 1}/${outline.scenes.length} (${outlineScene.sceneType})...`);

    // `motion` is not a medium with a schema to fill — it is a request to WRITE
    // one. It therefore takes a different path entirely: the model emits a
    // Remotion component, which is gated, compiled and repaired, and the scene's
    // Data ends up carrying only the registry id of what was produced. The two
    // paths converge here because everything downstream — serialization, the
    // parser, the diagnostics, the renderer — treats it as just another scene.
    if (outlineScene.sceneType.toLowerCase() === "motion") {
      const id = motionComponentId(topic, index);
      const motion = await authorMotionScene(provider, { scene: outlineScene, id, aspectRatio, onLog });
      scenes.push({
        sceneType: "motion",
        narration: motion.narration,
        durationSeconds: motion.durationSeconds,
        data: { kind: "motion", component: id, title: outlineScene.visualIntent.slice(0, 120) },
        repairRounds: motion.repairRounds,
      });
      continue;
    }

    scenes.push(
      await authorScene(provider, {
        scene: outlineScene,
        aspectRatio,
        corpus,
        previousNarration: index > 0 ? outline.scenes[index - 1].narration : undefined,
        onLog,
      }),
    );
  }

  let scriptText = serializeScript(outline.title, scenes, topic, provider.id, provider.model);
  let diagnostics = diagnoseScript(scriptText);

  for (let round = 1; round <= MAX_DIAGNOSTIC_REPAIR_ROUNDS; round++) {
    const hard = diagnostics.filter((d) => d.severity === "hard");
    if (hard.length === 0) break;

    // Group by scene so a scene with four problems is re-authored once with
    // all four in hand, rather than four times against one each — which would
    // let a fix for the first reintroduce the second.
    const bySceneIndex = new Map<number, string[]>();
    for (const d of hard) {
      const bucket = bySceneIndex.get(d.sceneIndex) ?? [];
      bucket.push(`[${d.category}] ${d.message}`);
      bySceneIndex.set(d.sceneIndex, bucket);
    }

    onLog(
      `Diagnostic repair round ${round}: ${hard.length} hard finding${hard.length === 1 ? "" : "s"} across ${bySceneIndex.size} scene${bySceneIndex.size === 1 ? "" : "s"}.`,
    );

    for (const [sceneIndex, messages] of bySceneIndex) {
      // A diagnostic's sceneIndex addresses the SEGMENT array, which a
      // continuity merge can make shorter than the authored scene list. When
      // they've diverged there is no safe mapping back to one authored scene,
      // so the finding is reported and left rather than guessed at — repairing
      // the wrong scene is worse than repairing none.
      const outlineScene = outline.scenes[sceneIndex];
      if (!outlineScene || sceneIndex >= scenes.length) {
        onLog(`  scene index ${sceneIndex} has no authored counterpart (merged passage) — leaving these findings for review.`);
        continue;
      }
      if (outlineScene.sceneType.toLowerCase() === "motion") {
        // A generated component's problems are not expressible as a schema
        // repair, and its real quality gate is the rendered frame rather than
        // these checks. Reported and left rather than pushed through a path
        // that cannot fix it.
        onLog(`  scene ${sceneIndex + 1} is a generated motion component — leaving ${messages.length} finding(s) for review.`);
        continue;
      }
      onLog(`  re-authoring scene ${sceneIndex + 1} against ${messages.length} finding${messages.length === 1 ? "" : "s"}.`);
      scenes[sceneIndex] = await authorScene(provider, {
        scene: outlineScene,
        aspectRatio,
        corpus,
        previousNarration: sceneIndex > 0 ? outline.scenes[sceneIndex - 1].narration : undefined,
        diagnosticFeedback: messages,
        onLog,
      });
    }

    scriptText = serializeScript(outline.title, scenes, topic, provider.id, provider.model);
    diagnostics = diagnoseScript(scriptText);
  }

  const remainingHard = diagnostics.filter((d) => d.severity === "hard").length;
  const soft = diagnostics.length - remainingHard;
  onLog(
    remainingHard === 0
      ? `Script authored clean — ${scenes.length} scenes, ${soft} soft finding${soft === 1 ? "" : "s"}.`
      : `Script authored with ${remainingHard} unresolved hard finding${remainingHard === 1 ? "" : "s"} and ${soft} soft — review before rendering.`,
  );

  // The visual gate runs last, after everything cheap has already passed —
  // there is no point spending a render on a script that fails a schema check.
  let critiques: (Critique | undefined)[] | undefined;
  if (options.critique) {
    critiques = [];
    const outDir = options.critiqueOutDir ?? path.join("output", "critique-frames");
    // Critique needs a model that can see. When the authoring provider cannot
    // (Groq is text-only), this transparently picks one that can rather than
    // failing at the very end of an otherwise successful run.
    const visionProvider = selectVisionProvider(provider.id);
    if (!isVisionCapable(provider.id)) {
      onLog(`  critique: ${provider.id} has no vision model — reviewing with ${visionProvider.id}/${visionProvider.model}.`);
    }
    for (let index = 0; index < scenes.length; index++) {
      try {
        const result = await critiqueScene(visionProvider, {
          scriptText,
          sceneIndex: index,
          aspectRatio,
          outDir,
          onLog,
        });
        critiques[index] = result;
        // Frames are diagnostic scratch, not output — a few megabytes each at
        // 1080x1920, and a twelve-scene script would otherwise leave dozens.
        cleanUpProbeFrames(result.framePaths);
      } catch (err) {
        // A critique failure must not lose an otherwise-finished script. The
        // scene still rendered; only the opinion about it is missing.
        onLog(`  critique: scene ${index + 1} could not be reviewed — ${(err as Error).message}`);
        critiques[index] = undefined;
      }
    }
    const broken = critiques.filter((c) => c?.verdict === "broken").length;
    const weak = critiques.filter((c) => c?.verdict === "weak").length;
    onLog(
      broken === 0 && weak === 0
        ? "Visual critique: every scene reads."
        : `Visual critique: ${broken} broken, ${weak} weak — see the per-scene problems above.`,
    );
  }

  return { scriptText, outline, scenes, diagnostics, critiques, provider: provider.id, model: provider.model };
}
