import { z } from "zod";
import { ENGINE_DOCTRINE, estimateDurationSeconds } from "./doctrine";
import { findMedium, jsonSchemaFor, pickExemplars, renderExemplars, schemaFor, type Exemplar } from "./mediumCatalog";
import { estimateTokens, withRetries, type LlmProvider } from "./provider";
import { extractJson } from "./extractJson";
import type { OutlineScene } from "./authorOutline";

// ---------------------------------------------------------------------------
// Stage 2 of 2: one scene's visual Data block.
//
// Tier 1 of the repair loop lives here. The model's output is validated
// against the SAME Zod schema the renderer's parser uses, and a failure is
// handed straight back as the exact field paths that were wrong. This is the
// cheap tier — it catches structural mistakes (a missing `id`, an enum value
// that doesn't exist, a number where an array belongs) in a round trip that
// never touches the parser, never resolves audio and never renders.
//
// Tier 2 — the project's real diagnostics, which need the whole script
// assembled and parsed — lives in repairLoop.ts. Splitting them this way
// matters because most model errors are structural, and fixing those against
// a full parse would be enormously slower for no additional signal.
// ---------------------------------------------------------------------------

/** Enough rounds to fix a genuine slip, few enough that a model which
 * fundamentally cannot author a medium fails fast instead of grinding. Three
 * consecutive failures on the same schema is not a run of bad luck; it means
 * the medium is a poor fit for the scene, and that is worth surfacing rather
 * than spending twenty more calls on. */
const MAX_SCHEMA_REPAIR_ROUNDS = 3;

export interface AuthoredScene {
  sceneType: string;
  narration: string;
  durationSeconds: number;
  /** The validated Data object, ready to serialize into the script. */
  data: unknown;
  /** How many repair rounds this scene needed. Recorded rather than discarded:
   * across a batch it is the clearest signal of which mediums a given model
   * actually handles, which is what tells you when a cheap model is costing
   * more in retries than a better one would cost outright. */
  repairRounds: number;
}

function buildSystemPrompt(sceneTypeKey: string, kind: string, exemplars: Exemplar[]): string {
  return `${ENGINE_DOCTRINE}

# Your task right now

Author the visual Data block for ONE scene, in the \`${sceneTypeKey}\` medium.

# The schema you must satisfy

This is the exact JSON Schema the renderer validates against. Every field you emit must conform. Fields marked as filled by a resolver must be omitted.

${jsonSchemaFor(kind)}

# Real examples of this medium from this channel

These are actual rendered scenes from this engine. Match their density and choreographic style — note how many timeline events a good scene has, and how the beats stagger rather than firing together.

${renderExemplars(exemplars)}

# Output

Return ONLY the JSON Data object, no prose and no code fence. It must start with { and end with }.`;
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 25)
    .map((issue) => `- ${issue.path.length ? issue.path.join(".") : "(root)"}: ${issue.message}`)
    .join("\n");
}

export interface AuthorSceneOptions {
  scene: OutlineScene;
  aspectRatio: "16:9" | "9:16";
  corpus: Exemplar[];
  /** Narration of the scene before this one, when there is one. Gives the
   * author enough continuity to build ON the previous beat instead of
   * restarting the explanation — the cumulative-canvas habit the doctrine
   * asks for, without handing over the whole script. */
  previousNarration?: string;
  /** Tier-2 feedback: diagnostics the project's real validators raised against
   * a PREVIOUS version of this scene, once it had been parsed as part of the
   * whole script. Structurally valid output can still be a bad scene — too
   * sparse, overlapping geometry, a contract it never realizes — and those are
   * only visible after a parse, so they arrive here on a re-author rather than
   * through the schema loop above. See repairLoop.ts. */
  diagnosticFeedback?: string[];
  onLog?: (message: string) => void;
}

export async function authorScene(provider: LlmProvider, options: AuthorSceneOptions): Promise<AuthoredScene> {
  const { scene, aspectRatio, corpus, previousNarration, diagnosticFeedback, onLog } = options;

  const medium = findMedium(scene.sceneType);
  if (!medium) throw new Error(`Scene type "${scene.sceneType}" is not a registered medium.`);
  const schema = schemaFor(medium.kind);
  if (!schema) throw new Error(`No schema registered for medium "${medium.kind}".`);

  const durationSeconds = estimateDurationSeconds(scene.narration);

  // How much room the reply needs. A scene's Data block is ~1500 tokens, so a
  // constrained provider is asked for far less than the generous default —
  // requesting 16k against an 8k ceiling is itself what triggers the 413,
  // because free tiers count REQUESTED output against the same budget as input.
  const outputBudget = provider.promptBudgetTokens ? 2_600 : 16_000;

  // Exemplars are the only expendable part of the prompt: the doctrine and the
  // schema are both load-bearing, so when the request will not fit they are
  // dropped one at a time rather than the call being allowed to fail. Two real
  // examples make a noticeably better scene, one still helps, and none still
  // works — which is the right order to give them up in.
  let exemplars = pickExemplars(corpus, medium.sceneTypeKey);
  let system = buildSystemPrompt(medium.sceneTypeKey, medium.kind, exemplars);
  if (provider.promptBudgetTokens) {
    const roomForPrompt = provider.promptBudgetTokens - outputBudget - 400;
    while (exemplars.length > 0 && estimateTokens(system) > roomForPrompt) {
      exemplars = exemplars.slice(0, -1);
      system = buildSystemPrompt(medium.sceneTypeKey, medium.kind, exemplars);
    }
    if (estimateTokens(system) > roomForPrompt) {
      throw new Error(
        `The "${medium.sceneTypeKey}" medium needs ~${estimateTokens(system)} prompt tokens but ${provider.id} allows ~${roomForPrompt}. ` +
          `Its schema alone does not fit this provider — author this scene on a provider with a larger per-request ceiling.`,
      );
    }
    onLog?.(`  scene "${scene.sceneType}": ${exemplars.length} exemplar(s), ~${estimateTokens(system)} prompt tokens.`);
  }

  const baseUser = `Narration (spoken over this scene, ~${durationSeconds}s):
"${scene.narration}"

What the visual must DEMONSTRATE: ${scene.visualIntent}

Act: ${scene.act}
Aspect ratio: ${aspectRatio}${aspectRatio === "9:16" ? " — vertical. Compose for a tall frame; never lay out horizontally and expect it to crop." : ""}
${previousNarration ? `\nThe previous scene said: "${previousNarration}"\nBuild on it rather than restarting the explanation.` : ""}

Author the Data object. Give it roughly one meaningful visual beat per 2-3 seconds, in the same order as the narration's clauses.${
    diagnosticFeedback?.length
      ? `\n\n# A previous version of this scene was rejected after rendering checks\n\n${diagnosticFeedback.map((d) => `- ${d}`).join("\n")}\n\nAuthor a scene that does not have these problems.`
      : ""
  }`;

  let repairRounds = 0;
  let lastError = "";

  for (let attempt = 0; attempt <= MAX_SCHEMA_REPAIR_ROUNDS; attempt++) {
    const user =
      attempt === 0
        ? baseUser
        : `${baseUser}

# Your previous attempt was rejected by the schema

${lastError}

Fix exactly these problems. Keep everything that was already valid — do not re-author the scene from scratch.`;

    const result = await withRetries(
      () =>
        provider.complete({
          system,
          user,
          cacheSystem: true,
          maxOutputTokens: outputBudget,
          // Repair rounds drop the temperature hard. A retry should converge
          // on the stated fix, not re-roll the scene and produce a different
          // set of errors — which is what a creative temperature does here,
          // and it can loop indefinitely without ever getting closer.
          temperature: attempt === 0 ? 0.8 : 0.2,
        }),
      onLog,
    );

    const candidate = extractJson(result.text);
    if (candidate === undefined) {
      lastError = "- (root): the response was not valid JSON.";
      repairRounds++;
      onLog?.(`  scene "${scene.sceneType}": response was not JSON, repairing (round ${repairRounds})`);
      continue;
    }

    const parsed = schema.safeParse(candidate);
    if (parsed.success) {
      return { sceneType: medium.sceneTypeKey, narration: scene.narration, durationSeconds, data: parsed.data, repairRounds };
    }

    lastError = formatZodIssues(parsed.error);
    repairRounds++;
    onLog?.(
      `  scene "${scene.sceneType}": ${parsed.error.issues.length} schema error${parsed.error.issues.length === 1 ? "" : "s"}, repairing (round ${repairRounds})`,
    );
  }

  throw new Error(
    `Could not author a valid "${scene.sceneType}" scene after ${MAX_SCHEMA_REPAIR_ROUNDS} repair rounds. Last errors:\n${lastError}`,
  );
}
