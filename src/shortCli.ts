import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { authorShortScript } from "./ai/authorShortScript";
import { describeProviders, selectProvider } from "./ai/selectProvider";
import { resolveSegmentAudio } from "./audio/resolveAudio";
import { renderVideo } from "./render/renderVideo";
import type { ShortClip } from "./video/compositions/ShortVideo";
import { PUNCH_PRESET_NAMES } from "./video/compositions/PunchCaptions";
import type { TimedSegment } from "./model/Segment";
import type { TtsProvider } from "./audio/resolveAudio";

// ---------------------------------------------------------------------------
// `npm run short -- --topic "..."` — topic in, finished vertical video out.
//
// The whole pipeline in one command: the model writes the narration, TTS speaks
// each line, every line's REAL measured duration becomes its caption beat, and
// the whole thing composites over a looping background clip.
//
// The timing detail is the one that matters. Captions are cut per line and each
// line is its own audio file, so a beat lasts exactly as long as the sentence
// takes to say. Splitting one long audio file evenly across N lines is what
// makes generated shorts feel subtly off — the words drift out of sync with the
// voice and the whole thing reads as automated.
// ---------------------------------------------------------------------------

/** Minimal segment carrying one spoken line, so `resolveSegmentAudio` — the
 * same TTS + caching path the scene pipeline uses — can measure it. Reusing it
 * rather than calling the TTS providers directly means this format inherits the
 * audio cache, the provider switching and the duration measurement for free. */
function lineSegment(text: string): TimedSegment {
  return {
    type: "statement",
    text,
    // Replaced by the real measured length once audio resolves; a word-count
    // estimate only so anything reading this before then is not zero.
    durationSeconds: Math.max(1.2, text.split(/\s+/).length / 2.6),
    visualMinDurationSeconds: 0,
  } as TimedSegment;
}

async function main() {
  const { values } = parseArgs({
    options: {
      topic: { type: "string" },
      /** A hand-written script instead of an AI-written one: one line per
       * caption beat. The renderer does not care which produced it. */
      lines: { type: "string" },
      background: { type: "string" },
      music: { type: "string" },
      "music-volume": { type: "string", default: "0.12" },
      caption: { type: "string", default: "tiktok" },
      "background-seconds": { type: "string", default: "10" },
      "background-rate": { type: "string", default: "1" },
      llm: { type: "string" },
      model: { type: "string" },
      "tts-provider": { type: "string", default: "edge" },
      "edge-voice": { type: "string" },
      "target-lines": { type: "string" },
      out: { type: "string" },
    },
  });

  if (!values.topic && !values.lines) {
    console.error(
      'Usage: npm run short -- --topic "why your phone battery dies in the cold" [--background clips/parkour.mp4] [--background-seconds 30] [--music beds/lofi.mp3] [--caption tiktok|hormozi|clean|neon] [--llm groq] [--tts-provider edge|elevenlabs] [--target-lines 30] [--out <path>]',
    );
    console.error("\n  --background and --music are paths under public/ — supply your own footage and audio.");
    console.error(`  --caption presets: ${PUNCH_PRESET_NAMES.join(", ")}`);
    console.error("\nProviders:\n" + describeProviders());
    process.exit(1);
  }

  let title: string;
  let lines: string[];

  if (values.lines) {
    lines = fs
      .readFileSync(values.lines, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    title = path.basename(values.lines, path.extname(values.lines));
    console.log(`Read ${lines.length} lines from ${values.lines}.`);
  } else {
    const provider = selectProvider(values.llm, { model: values.model });
    console.log(`Writing narration with ${provider.id}/${provider.model}...`);
    const script = await authorShortScript(provider, {
      topic: values.topic!,
      targetLines: values["target-lines"] ? Number(values["target-lines"]) : undefined,
      onLog: (m) => console.log(m),
    });
    title = script.title;
    lines = script.lines;
  }

  console.log(`\nNarrating ${lines.length} lines...`);
  const withAudio = await resolveSegmentAudio(lines.map(lineSegment), {
    provider: values["tts-provider"] as TtsProvider,
    edgeVoice: values["edge-voice"],
  });

  const clips: ShortClip[] = withAudio.map((segment, index) => ({
    text: lines[index],
    audioStaticPath: segment.audioStaticPath,
    // Measured word timings from the synthesiser — what puts each caption word
    // exactly on its spoken syllable.
    wordTimings: segment.wordTimings,
    // The MEASURED length, not the estimate — this is what puts the captions on
    // the voice instead of near it.
    durationSeconds: segment.narrationSeconds ?? segment.durationSeconds,
  }));

  const totalSeconds = clips.reduce((sum, c) => sum + c.durationSeconds, 0);
  const measured = clips.filter((c) => c.wordTimings?.length).length;
  console.log(`\nTotal: ${totalSeconds.toFixed(1)}s across ${clips.length} caption beats.`);
  console.log(
    measured === clips.length
      ? `Captions: word-perfect on all ${clips.length} clips (timings measured from the speech).`
      : `Captions: ${measured}/${clips.length} clips have measured timings; the rest fall back to estimates.`,
  );

  if (values.background && !fs.existsSync(path.join("public", values.background))) {
    console.warn(`\nWARNING: public/${values.background} does not exist — rendering on a flat ground instead.`);
  }

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  const outputPath = values.out ?? path.join("output", `${slug || "short"}-9x16.mp4`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  console.log(`\nRendering to ${outputPath}...`);
  await renderVideo(
    "ShortVideo",
    {
      clips,
      backgroundVideo: values.background,
      music: values.music,
      musicVolume: Number(values["music-volume"]) || 0.12,
      captionPreset: values.caption,
      backgroundDurationSeconds: Number(values["background-seconds"]) || 10,
      backgroundRate: Number(values["background-rate"]) || 1,
      aspectRatio: "9:16",
    },
    outputPath,
  );

  console.log(`\nDone — ${outputPath}`);
}

main().catch((err) => {
  console.error("short failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
