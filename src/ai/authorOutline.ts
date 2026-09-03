import { z } from "zod";
import { ENGINE_DOCTRINE, estimateDurationSeconds } from "./doctrine";
import { findMedium, renderMediumCatalog } from "./mediumCatalog";
import { withRetries, type LlmProvider } from "./provider";
import { extractJson } from "./extractJson";

// ---------------------------------------------------------------------------
// Stage 1 of 2: the lesson outline.
//
// This call decides everything that is expensive to get wrong — the arc, what
// each scene says, and crucially WHICH MEDIUM each scene uses — while seeing
// only the one-line medium catalog (~18KB) rather than any schema. Separating
// it from scene authoring is what makes the pipeline affordable: medium choice
// is a judgement about the whole script and needs to see all 45 options at
// once, whereas authoring a scene needs one schema in full and no knowledge of
// the other 44. Fusing the two would mean sending every schema on every call.
//
// It also makes medium rotation enforceable. A per-scene author has no way to
// know it just wrote three Stage scenes in a row; an outline author sees the
// whole script and can be checked against itself (see `rotationWarnings`).
// ---------------------------------------------------------------------------

export const outlineSceneSchema = z.object({
  /** Must match a registered `sceneTypeKey` — checked against the real
   * registry after parsing, since the model can and does invent plausible
   * names for mediums that don't exist. */
  sceneType: z.string().min(1),
  narration: z.string().min(1),
  /** What the visual must DEMONSTRATE — carried into the scene call as its
   * brief. Deliberately separate from narration: the whole doctrine turns on
   * the visual showing the mechanism rather than restating the words, and
   * asking for that intent explicitly here is what stops stage 2 from simply
   * illustrating the sentence. */
  visualIntent: z.string().min(1),
  act: z.enum(["strange", "investigate", "reveal", "consequence", "cta"]),
});

export const outlineSchema = z.object({
  title: z.string().min(1),
  scenes: z.array(outlineSceneSchema).min(3),
});

export type OutlineScene = z.infer<typeof outlineSceneSchema>;
export type Outline = z.infer<typeof outlineSchema>;

export interface OutlineOptions {
  topic: string;
  aspectRatio: "16:9" | "9:16";
  /** Restricts medium choice. Useful because the registry still carries the
   * project's football-analysis heritage (`formation`, `shot-map`,
   * `pass-network`), which is live capability but nonsense for a tech lesson. */
  allowedMediums?: string[];
  targetSceneCount?: number;
  onLog?: (message: string) => void;
}

function buildSystemPrompt(allowedMediums: string[] | undefined): string {
  return `${ENGINE_DOCTRINE}

# Your task right now

Produce the OUTLINE of one video: its title, and an ordered list of scenes. For each scene give the narration, the medium it will be rendered in, and what the visual must demonstrate.

You are NOT authoring the visuals yet. Do not emit any visual data, coordinates, or timelines.

# Available mediums

Pick each scene's \`sceneType\` from EXACTLY this list. Use the backticked key verbatim.
${renderMediumCatalog(allowedMediums)}

# Rules for the outline

- The medium must change across the script. Never use the same sceneType for three consecutive scenes.
- A medium marked **ONLY WHEN ...** is specialized. Pick it ONLY if this scene genuinely meets that
  condition. If it does not, choose an ordinary medium — a specialized medium used for the wrong shape
  of concept renders as an empty or unreadable frame, and no amount of scene detail will rescue it.
- Prefer the medium that a viewer will RECOGNIZE fastest. If a visual would need the narration to
  identify what it is, the medium is wrong.
- Scene 1 is the hook: it states a concrete anomaly and names the domain plainly in its first sentence.
- The final scene is a short call to action (\`act: "cta"\`).
- Fold ONE light spoken call-to-action line into a scene right after the main payoff — never before the hook.
- Each scene's narration should be roughly 25-70 words. Shorter for a hook, longer for a mechanism explanation.
- \`visualIntent\` must describe a MECHANISM being demonstrated, not a picture. "Two runs of the same prompt diverging into different tokens" is an intent. "A diagram of an LLM" is not.

# Output

Return ONLY a JSON object, no prose and no code fence:

{
  "title": "string",
  "scenes": [
    { "sceneType": "string", "narration": "string", "visualIntent": "string", "act": "strange" | "investigate" | "reveal" | "consequence" | "cta" }
  ]
}`;
}

/** Flags medium repetition the outline call was told to avoid.
 *
 * Advisory, never fatal — matching this project's standing position that
 * diagnostics report and let the author look, rather than blocking. A run of
 * the same medium is sometimes right (a cumulative canvas is BUILT from
 * consecutive same-medium scenes), so this is a prompt for a human glance, not
 * a rule the pipeline can safely enforce on its own. */
export function rotationWarnings(outline: Outline): string[] {
  const warnings: string[] = [];
  let run = 1;
  for (let i = 1; i < outline.scenes.length; i++) {
    if (outline.scenes[i].sceneType === outline.scenes[i - 1].sceneType) {
      run++;
      if (run === 3) {
        warnings.push(
          `Scenes ${i - 1}-${i + 1} all use "${outline.scenes[i].sceneType}" — the medium should change more often.`,
        );
      }
    } else {
      run = 1;
    }
  }
  const statements = outline.scenes.filter((s) => s.sceneType.toLowerCase() === "statement").length;
  if (statements > 1) {
    warnings.push(`${statements} Statement scenes — the house limit is one per script, and it is a last resort.`);
  }
  return warnings;
}

export async function authorOutline(provider: LlmProvider, options: OutlineOptions): Promise<Outline> {
  const { topic, aspectRatio, allowedMediums, targetSceneCount, onLog } = options;
  const system = buildSystemPrompt(allowedMediums);

  const user = `Topic: ${topic}

Aspect ratio: ${aspectRatio}${aspectRatio === "9:16" ? " (a vertical Short — keep it tight, one idea per scene, and favour mediums that read at a glance)" : ""}
${targetSceneCount ? `Target: about ${targetSceneCount} scenes.` : "Choose the scene count the topic actually needs."}

Write the outline.`;

  const result = await withRetries(
    () => provider.complete({ system, user, cacheSystem: true, maxOutputTokens: 8_000, temperature: 0.9 }),
    onLog,
  );

  const parsed = outlineSchema.safeParse(extractJson(result.text));
  if (!parsed.success) {
    throw new Error(`Outline did not match the expected shape: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }

  // Medium names are checked against the live registry rather than trusted.
  // An unregistered `Scene Type:` does not fail loudly downstream — the parser
  // degrades it to a plain caption — so an unchecked hallucinated medium would
  // surface as a silently boring scene in the finished render, which is far
  // worse than an error here.
  const unknown = parsed.data.scenes
    .map((s) => s.sceneType)
    .filter((t) => !findMedium(t));
  if (unknown.length > 0) {
    throw new Error(
      `Outline referenced mediums that are not registered: ${[...new Set(unknown)].join(", ")}. Valid keys come from VISUAL_DEFINITIONS.`,
    );
  }

  for (const warning of rotationWarnings(parsed.data)) onLog?.(`  outline warning: ${warning}`);
  onLog?.(
    `  outline: "${parsed.data.title}" — ${parsed.data.scenes.length} scenes, ~${parsed.data.scenes.reduce((sum, s) => sum + estimateDurationSeconds(s.narration), 0)}s`,
  );

  return parsed.data;
}
