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

/** One word, with the time it is ACTUALLY spoken.
 *
 * The distinction that matters: everything else in this project derives caption
 * timing by estimating — splitting a line across its clip by word length. That
 * is fine for a subtitle sitting quietly at the bottom of a diagram, and wrong
 * for the short-form format, where the caption IS the content and a word
 * landing 200ms off the voice is the difference between "produced" and
 * "generated". These come from the speech synthesiser itself, so they are what
 * was said, not what was guessed. */
export interface WordTiming {
  text: string;
  startMs: number;
  endMs: number;
}

export interface GeneratedSpeech {
  /** Absolute path — only useful for local duration-parsing, not for use in a component. */
  audioFilePath: string;
  /** Relative path suitable for `staticFile()` inside a Remotion composition. */
  staticFilePath: string;
  durationSeconds: number;
  /** Real per-word timings, when the provider reports them. Edge TTS does;
   * ElevenLabs can via its timestamps endpoint but this project does not yet
   * request them, so it is optional and consumers must fall back to estimation
   * rather than assume it is present. */
  wordTimings?: WordTiming[];
}

export function buildAudioCacheKey(kind: "speech" | "sfx", value: string, durationSeconds?: number): string {
  const normalizedValue = value.trim().replace(/\s+/g, " ");
  const payload = durationSeconds === undefined
    ? `${kind}:${normalizedValue}`
    : `${kind}:${normalizedValue}:${durationSeconds}`;
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 24);
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
  // Node-side temp-file naming, never evaluated inside a render — the
  // randomness is what stops two concurrent writers colliding on one path.
  // eslint-disable-next-line @remotion/deterministic-randomness
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

/** ElevenLabs' character-level alignment, as returned by the
 * `/with-timestamps` endpoints. */
interface ElevenLabsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/**
 * Folds ElevenLabs' CHARACTER-level alignment into whole-word timings.
 *
 * The API reports a start and end per character, which is more precision than
 * a caption can use and the wrong unit besides — a caption highlights words.
 * Accumulating characters until whitespace and taking the first character's
 * start with the last character's end gives the word's true span.
 *
 * Whitespace is deliberately not included in either boundary: the trailing
 * space after a word carries the pause, and folding it into the word would make
 * every highlight overrun into the gap before the next one.
 */
export function wordTimingsFromAlignment(alignment: ElevenLabsAlignment): WordTiming[] {
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;
  const timings: WordTiming[] = [];

  let text = "";
  let startSeconds = 0;
  let endSeconds = 0;

  const flush = () => {
    const trimmed = text.trim();
    if (trimmed.length > 0) {
      timings.push({ text: trimmed, startMs: Math.round(startSeconds * 1000), endMs: Math.round(endSeconds * 1000) });
    }
    text = "";
  };

  for (let i = 0; i < characters.length; i++) {
    const character = characters[i];
    if (/\s/.test(character)) {
      flush();
      continue;
    }
    if (text.length === 0) startSeconds = starts[i] ?? endSeconds;
    text += character;
    endSeconds = ends[i] ?? startSeconds;
  }
  flush();

  return timings;
}

/**
 * Narration WITH per-word timings, via ElevenLabs' `/with-timestamps` endpoint.
 *
 * Same cache and same shape as `generateSpeech`, with two differences forced by
 * the endpoint: the response is JSON rather than raw audio (the mp3 arrives
 * base64-encoded inside it), and it carries character alignment which is folded
 * into words here.
 *
 * Worth the extra handling because captions timed from real speech are the
 * difference between a video that reads as produced and one that reads as
 * generated — and until now this project estimated word timing for every
 * provider, having recorded in `wordCaptions.ts` that no alignment was
 * available. It was, on both providers.
 */
export async function generateSpeechWithTimestamps(text: string): Promise<GeneratedSpeech> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cacheKey = buildAudioCacheKey("speech", text);
  const audioFilePath = path.join(CACHE_DIR, `${cacheKey}.mp3`);
  const timingsPath = path.join(CACHE_DIR, `${cacheKey}.mp3.words.json`);

  if (!fs.existsSync(audioFilePath)) {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_VOICE_ID}/with-timestamps`,
      {
        method: "POST",
        headers: { "xi-api-key": config.elevenLabsKey(), "Content-Type": "application/json" },
        body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`ElevenLabs request failed: ${response.status} ${response.statusText}\n${body}`);
    }

    const payload = (await response.json()) as {
      audio_base64?: string;
      alignment?: ElevenLabsAlignment;
      normalized_alignment?: ElevenLabsAlignment;
    };
    if (!payload.audio_base64) {
      throw new Error("ElevenLabs returned no audio in its timestamped response.");
    }

    writeFileAtomic(audioFilePath, Buffer.from(payload.audio_base64, "base64"));

    // `alignment` maps to the text as sent; `normalized_alignment` maps to the
    // text after the model expands abbreviations and numbers. The former is what
    // the captions render, so it is the one that must be used — the normalized
    // form would drift wherever the two differ, which is exactly the kind of bug
    // that only shows up on the one sentence containing "Dr." or "1990".
    const alignment = payload.alignment ?? payload.normalized_alignment;
    if (alignment) {
      writeFileAtomic(timingsPath, Buffer.from(JSON.stringify(wordTimingsFromAlignment(alignment)), "utf8"));
    }
  }

  const durationInSeconds = await measureDuration(audioFilePath);

  let wordTimings: WordTiming[] | undefined;
  if (fs.existsSync(timingsPath)) {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(timingsPath, "utf8"));
      if (Array.isArray(parsed) && parsed.length > 0) wordTimings = parsed as WordTiming[];
    } catch {
      // Malformed sidecar degrades to estimated timing rather than failing the
      // render — every consumer already handles `wordTimings` being absent.
    }
  }

  return {
    audioFilePath,
    staticFilePath: `${CACHE_SUBDIR}/${path.basename(audioFilePath)}`,
    durationSeconds: durationInSeconds,
    wordTimings,
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
