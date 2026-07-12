import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EdgeTTS } from "node-edge-tts";
import { parseMedia } from "@remotion/media-parser";
import { nodeReader } from "@remotion/media-parser/node";
import type { GeneratedSpeech } from "./elevenLabs";

// Kept in its own cache subdir (not audio-cache/) so trying this out never
// collides with or invalidates the existing ElevenLabs cache — this is
// exploratory, not yet wired into the real generate pipeline.
const CACHE_SUBDIR = "audio-cache-edge";
const CACHE_DIR = path.join(process.cwd(), "public", CACHE_SUBDIR);

// A reasonable free-form narration default — swap for whichever voice sounds
// best once you've compared a few. Full list: `EdgeTTS`'s underlying service
// exposes every Microsoft Edge Read Aloud voice (en-US, en-GB, etc., each in
// Neural quality).
const DEFAULT_VOICE = "en-US-GuyNeural";

function cacheKeyFor(text: string, voice: string): string {
  return crypto.createHash("sha256").update(`${voice}:${text}`).digest("hex").slice(0, 24);
}

/** Generates narration audio for a segment of text via Microsoft Edge's free
 * Read Aloud service (no API key, no per-character cost), caching by
 * text+voice hash the same way generateSpeech() in elevenLabs.ts does. Same
 * GeneratedSpeech shape, so it's a drop-in swap for resolveAudio.ts once
 * you've decided you like how it sounds. */
export async function generateSpeechEdge(text: string, voice: string = DEFAULT_VOICE): Promise<GeneratedSpeech> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cacheKey = cacheKeyFor(text, voice);
  const audioFilePath = path.join(CACHE_DIR, `${cacheKey}.mp3`);

  if (!fs.existsSync(audioFilePath)) {
    const tts = new EdgeTTS({ voice, outputFormat: "audio-24khz-48kbitrate-mono-mp3" });
    await tts.ttsPromise(text, audioFilePath);
  }

  const { durationInSeconds } = await parseMedia({
    src: audioFilePath,
    fields: { durationInSeconds: true },
    reader: nodeReader,
  });

  if (!durationInSeconds) {
    throw new Error(`Could not determine duration for generated audio: ${audioFilePath}`);
  }

  return {
    audioFilePath,
    staticFilePath: `${CACHE_SUBDIR}/${path.basename(audioFilePath)}`,
    durationSeconds: durationInSeconds,
  };
}
