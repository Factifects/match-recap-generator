import fs from "node:fs";
import { z } from "zod";
import { parseSceneScript } from "../script/parseSceneScript";
import { renderProbeStills } from "../render/renderVideo";
import { FPS } from "../video/theme";
import { extractJson } from "./extractJson";
import { withRetries, type LlmImage, type LlmProvider } from "./provider";
import type { TimedSegment, AspectRatio } from "../model/Segment";

// ---------------------------------------------------------------------------
// The only check that looks at the picture.
//
// Everything else in this pipeline verifies STRUCTURE: Zod says the data has
// the right shape, validateGeometry says nothing overlaps, the compiler says
// the code type-checks. A scene can pass every one of those and still be an
// empty black frame — which is exactly what happened on the first AI-authored
// script, where a `channels` scene rendered as three labels in a void and a
// `spatial` scene rendered as an unrecognizable stick. Both were structurally
// perfect. Nothing in the engine could see the problem, because seeing was
// never something it did.
//
// This closes that gap by rendering a few real frames and asking a multimodal
// model what it sees. It is deliberately the LAST gate: it is the only one
// that costs a render, so everything cheaper runs first.
//
// Built to be gentle on the machine (see renderProbeStills): single stills
// rather than video, strictly sequential, sharing the existing bundle. A
// critique pass costs three frames, not three seconds of encoded output.
// ---------------------------------------------------------------------------

/** Three frames, at fractions of the scene rather than fixed times.
 *
 * Placed to answer the doctrine's own question — does the viewer CONTINUALLY
 * gain information? Early establishes, middle should be visibly further along,
 * late should have resolved. Sampling the very first and last frames instead
 * would mostly catch entrance and exit transitions, which look similar in
 * every scene and say nothing about whether the middle did any work. */
const PROBE_FRACTIONS = [0.25, 0.55, 0.85];

export const critiqueSchema = z.object({
  /** Reserved for the caller's own thresholding — the model is asked to score
   * so that "weak but not broken" is expressible, rather than forcing every
   * judgement into pass/fail. */
  readable: z.number().min(0).max(10),
  demonstratesMechanism: z.number().min(0).max(10),
  textLegible: z.number().min(0).max(10),
  progression: z.number().min(0).max(10),
  /** True when a frame is essentially empty — the single most common and most
   * damaging failure, and the one static checks are blindest to. */
  looksEmpty: z.boolean(),
  /** Concrete, actionable problems. Phrased as instructions to the author, so
   * they can be fed straight back into a repair round. */
  problems: z.array(z.string()),
  verdict: z.enum(["good", "weak", "broken"]),
});

export type Critique = z.infer<typeof critiqueSchema>;

const CRITIQUE_SYSTEM = `You are a motion-design director reviewing frames from an educational video scene. You are looking at what actually rendered, not at what was intended.

Judge only what you can SEE. Be strict — this is the last check before a scene ships, and the failure that matters most is a scene that is technically valid and visually empty.

Score each 0-10:
- readable: can a viewer tell what they are looking at within one second, with the sound off?
- demonstratesMechanism: do the frames show a process happening, or just objects sitting there?
- textLegible: is every piece of text large enough and high-contrast enough to read on a phone? Small grey text on a dark ground scores low.
- progression: do the three frames differ meaningfully, or is this one static composition?

Set looksEmpty to true if any frame is mostly bare background.

verdict: "good" (ships as-is), "weak" (works but underwhelming), "broken" (empty, illegible, or meaningless).

List concrete problems as instructions to the person who authored it — "the label is too small to read", not "consider improving legibility".

Return ONLY JSON:
{"readable":0-10,"demonstratesMechanism":0-10,"textLegible":0-10,"progression":0-10,"looksEmpty":true|false,"problems":["..."],"verdict":"good"|"weak"|"broken"}`;

function frameOffsetsFor(segments: TimedSegment[], sceneIndex: number): number[] {
  let startFrame = 0;
  for (let i = 0; i < sceneIndex; i++) {
    startFrame += Math.ceil(
      Math.max(segments[i].durationSeconds, segments[i].visualMinDurationSeconds ?? 0) * FPS,
    );
  }
  const scene = segments[sceneIndex];
  const sceneFrames = Math.ceil(
    Math.max(scene.durationSeconds, scene.visualMinDurationSeconds ?? 0) * FPS,
  );
  return PROBE_FRACTIONS.map((fraction) => startFrame + Math.floor(sceneFrames * fraction));
}

export interface CritiqueOptions {
  scriptText: string;
  sceneIndex: number;
  aspectRatio: AspectRatio;
  outDir: string;
  onLog?: (message: string) => void;
}

export interface CritiqueResult extends Critique {
  framePaths: string[];
}

export async function critiqueScene(
  provider: LlmProvider,
  options: CritiqueOptions,
): Promise<CritiqueResult> {
  const { scriptText, sceneIndex, aspectRatio, outDir, onLog } = options;
  const segments = parseSceneScript(scriptText);
  const scene = segments[sceneIndex];
  if (!scene) throw new Error(`No scene at index ${sceneIndex} — the script has ${segments.length}.`);

  onLog?.(`  critique: rendering ${PROBE_FRACTIONS.length} probe frames for scene ${sceneIndex + 1}...`);
  const framePaths = await renderProbeStills({
    compositionId: "AnalysisVideo",
    inputProps: { segments, aspectRatio, audioClips: [] },
    frames: frameOffsetsFor(segments, sceneIndex),
    outDir,
    namePrefix: `critique-s${sceneIndex + 1}`,
  });

  const images: LlmImage[] = framePaths.map((filePath) => ({
    mediaType: "image/png",
    dataBase64: fs.readFileSync(filePath).toString("base64"),
  }));

  const user = `This scene's narration is: "${scene.text}"

The three images are frames from ${Math.round(PROBE_FRACTIONS[0] * 100)}%, ${Math.round(PROBE_FRACTIONS[1] * 100)}% and ${Math.round(PROBE_FRACTIONS[2] * 100)}% through the scene, in order.

Aspect ratio: ${aspectRatio}. This is watched on a phone.

Review what you can see.`;

  const result = await withRetries(
    () => provider.complete({ system: CRITIQUE_SYSTEM, user, images, maxOutputTokens: 4_000, temperature: 0.2 }),
    onLog,
  );

  const parsed = critiqueSchema.safeParse(extractJson(result.text));
  if (!parsed.success) {
    throw new Error(
      `Critique response did not match the expected shape: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }

  onLog?.(
    `  critique: scene ${sceneIndex + 1} — ${parsed.data.verdict}` +
      (parsed.data.problems.length ? ` (${parsed.data.problems.length} problem(s))` : ""),
  );

  return { ...parsed.data, framePaths };
}

/** Frees the probe frames once a critique has been read.
 *
 * Worth doing explicitly: at 1080x1920 a PNG is a few megabytes, and a
 * critique pass over a twelve-scene script leaves tens of them behind. They
 * are diagnostic scratch, not output. */
export function cleanUpProbeFrames(framePaths: string[]): void {
  for (const filePath of framePaths) {
    if (fs.existsSync(filePath)) fs.rmSync(filePath);
  }
}

export { PROBE_FRACTIONS, frameOffsetsFor };
