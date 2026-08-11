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

export function buildAudioCacheKey(kind: "speech" | "sfx", value: string, durationSeconds?: number): string {
  const normalizedValue = value.trim().replace(/\s+/g, " ");
  const payload = durationSeconds === undefined
    ? `${kind}:${normalizedValue}`
    : `${kind}:${normalizedValue}:${durationSeconds}`;
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

function cacheKeyFor(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 24);
}

/** Writes via a unique temp file and an atomic rename, never straight to the
 * destination.
 *
 * The cache is shared by every process that touches this project — the UI
 * server, a CLI render, an ad-hoc script — and they routinely run at the same
 * time. Writing in place means another process can open the file mid-write:
 * `parseMedia` sizes its buffer from the length it sees at open, then keeps
 * reading as the file grows, and dies with "Exceeded maximum byte length
 * <sizeAtOpen> with <sizeLater>". A rename is atomic within a filesystem, so a
 * concurrent reader sees either no file at all or a complete one. */
function writeFileAtomic(destination: string, data: Buffer): void {
  const temporary = `${destination}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  fs.writeFileSync(temporary, data);
  fs.renameSync(temporary, destination);
}

/** Reads a cached file's real duration, and DELETES it if it cannot be parsed.
 * Without the delete, one bad artifact (an interrupted write, an error page
 * saved as .mp3) is cached forever and fails every future run identically,
 * because the `existsSync` check above then skips regeneration. */
async function measureDuration(audioFilePath: string): Promise<number> {
  try {
    const { durationInSeconds } = await parseMedia({
      src: audioFilePath,
      fields: { durationInSeconds: true },
      reader: nodeReader,
    });
    if (!durationInSeconds) throw new Error("no duration reported");
    return durationInSeconds;
  } catch (err) {
    try {
      fs.unlinkSync(audioFilePath);
    } catch {
      // Already gone, or not ours to remove — the rethrow below is what matters.
    }
    throw new Error(
      `Could not read generated audio at ${audioFilePath} — the cached copy has been deleted, so re-running will regenerate it. Cause: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
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
    writeFileAtomic(audioFilePath, audioBuffer);
  }

  const durationInSeconds = await measureDuration(audioFilePath);

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
    buildAudioCacheKey("speech", text),
    { text, model_id: "eleven_multilingual_v2" },
    `https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_VOICE_ID}`,
  );
}

// ElevenLabs' sound-generation endpoint 400s outside this range — clamped
// here, once, rather than trusting every cadence preset / script author to
// stay in bounds (a preset shipped at 0.35s once and broke every render
// using it, silently, until the actual API call).
const SFX_MIN_DURATION_SECONDS = 0.5;
const SFX_MAX_DURATION_SECONDS = 30;

/** Generates a short sound effect (e.g. a whoosh) from a text description via
 * ElevenLabs' sound-generation endpoint, cached the same way as narration. */
export async function generateSoundEffect(prompt: string, durationSeconds = 1): Promise<GeneratedSpeech> {
  const clampedDuration = Math.min(SFX_MAX_DURATION_SECONDS, Math.max(SFX_MIN_DURATION_SECONDS, durationSeconds));
  return generateAndCache(
    buildAudioCacheKey("sfx", prompt, clampedDuration),
    { text: prompt, duration_seconds: clampedDuration },
    "https://api.elevenlabs.io/v1/sound-generation",
  );
}
