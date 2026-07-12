import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseMedia } from "@remotion/media-parser";
import { nodeReader } from "@remotion/media-parser/node";
import { config } from "../config";

// Lives under public/ (not output/) so Remotion compositions can reference it via
// staticFile() — the standard, supported way to load local media in a render.
const CACHE_SUBDIR = "audio-cache";
const CACHE_DIR = path.join(process.cwd(), "public", CACHE_SUBDIR);
// A reasonable default ElevenLabs voice — verify this still exists on the account;
// swap for a preferred voice_id once one's been picked deliberately.
const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

export interface GeneratedSpeech {
  /** Absolute path — only useful for local duration-parsing, not for use in a component. */
  audioFilePath: string;
  /** Relative path suitable for `staticFile()` inside a Remotion composition. */
  staticFilePath: string;
  durationSeconds: number;
}

function cacheKeyFor(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 24);
}

async function generateAndCache(
  cacheKey: string,
  requestBody: Record<string, unknown>,
  endpoint: string,
): Promise<GeneratedSpeech> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const audioFilePath = path.join(CACHE_DIR, `${cacheKey}.mp3`);

  if (!fs.existsSync(audioFilePath)) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "xi-api-key": config.elevenLabsKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`ElevenLabs request failed: ${response.status} ${response.statusText}\n${body}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(audioFilePath, audioBuffer);
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

/** Generates narration audio for a segment of text via ElevenLabs, caching by text
 * hash so identical segments across re-renders don't regenerate (and re-charge for)
 * the same audio. Returns the real measured duration — never guessed — since that's
 * what drives how long the segment's visual stays on screen. */
export async function generateSpeech(text: string): Promise<GeneratedSpeech> {
  return generateAndCache(
    cacheKeyFor(`speech:${text}`),
    { text, model_id: "eleven_multilingual_v2" },
    `https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_VOICE_ID}`,
  );
}

/** Generates a short sound effect (e.g. a whoosh) from a text description via
 * ElevenLabs' sound-generation endpoint, cached the same way as narration. */
export async function generateSoundEffect(prompt: string, durationSeconds = 1): Promise<GeneratedSpeech> {
  return generateAndCache(
    cacheKeyFor(`sfx:${prompt}:${durationSeconds}`),
    { text: prompt, duration_seconds: durationSeconds },
    "https://api.elevenlabs.io/v1/sound-generation",
  );
}
