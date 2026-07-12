import path from "node:path";
import { parseAnalysisScript } from "./script/parseAnalysisScript";
import { parseSceneScript, isSceneScript } from "./script/parseSceneScript";
import { resolveSegmentAudio, type TtsProvider } from "./audio/resolveAudio";
import { renderVideo, type RenderProgress } from "./render/renderVideo";
import type { TimedSegment, AspectRatio } from "./model/Segment";

export interface GenerateOptions {
  withAudio: boolean;
  ttsProvider?: TtsProvider;
  edgeVoice?: string;
  aspectRatio?: AspectRatio;
  outputName?: string;
  onLog?: (message: string) => void;
  onProgress?: (progress: RenderProgress) => void;
}

export interface GenerateResult {
  outputPath: string;
  segmentCount: number;
  totalSeconds: number;
  usedSceneFormat: boolean;
}

/** The one shared pipeline (parse -> optional real narration audio -> render)
 * behind both the CLI and the local generator UI, so the two entry points
 * can never drift out of sync with each other. */
export async function generateVideo(scriptText: string, options: GenerateOptions): Promise<GenerateResult> {
  const log = options.onLog ?? (() => {});
  const usedSceneFormat = isSceneScript(scriptText);
  let segments: TimedSegment[] = usedSceneFormat ? parseSceneScript(scriptText) : parseAnalysisScript(scriptText);

  log(`Parsed ${segments.length} segments as ${usedSceneFormat ? "scene-spec" : "prose+tags"} format.`);

  if (options.withAudio) {
    const provider = options.ttsProvider ?? "elevenlabs";
    log(
      provider === "edge"
        ? `Generating narration audio via Edge TTS (free, voice: ${options.edgeVoice ?? "default"})...`
        : "Generating narration audio via ElevenLabs (real API cost applies)...",
    );
    segments = await resolveSegmentAudio(segments, { provider, edgeVoice: options.edgeVoice });
  }

  const totalSeconds = segments.reduce((sum, s) => sum + s.durationSeconds, 0);
  log(
    `Total on-screen time: ${(totalSeconds / 60).toFixed(1)} minutes${
      options.withAudio ? " (from real narration audio)" : " (word-count estimate)"
    }.`,
  );

  const aspectRatio: AspectRatio = options.aspectRatio ?? "16:9";
  const orientationSuffix = aspectRatio === "9:16" ? "-9x16" : "-16x9";
  const outputName = options.outputName ?? `generated-${Date.now()}${orientationSuffix}`;
  const outputPath = path.join(process.cwd(), "output", `${outputName}.mp4`);
  log(`Rendering to ${outputPath}...`);
  await renderVideo("AnalysisVideo", { segments, aspectRatio }, outputPath, options.onProgress);
  log("Render complete.");

  return { outputPath, segmentCount: segments.length, totalSeconds, usedSceneFormat };
}
