import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EdgeTTS } from "node-edge-tts";
import { parseMedia } from "@remotion/media-parser";
import { nodeReader } from "@remotion/media-parser/node";
import type { GeneratedSpeech, WordTiming } from "./elevenLabs";

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
/** Where the word-timing sidecar for a cached audio file lives. */
function subtitlePathFor(audioFilePath: string): string {
  return `${audioFilePath}.words.json`;
}

/** Reads Edge's WordBoundary sidecar, if one was written.
 *
 * Deliberately forgiving: audio cached before this existed has no sidecar, and
 * a malformed one should degrade to estimated timing rather than fail a render.
 * Every consumer must already handle `wordTimings` being absent, so returning
 * undefined is a supported state rather than an error path.
 *
 * The library records `start`/`end` in MILLISECONDS (it divides the service's
 * 100-nanosecond ticks by 10,000 before storing), so no further conversion. */
function readWordTimings(audioFilePath: string): WordTiming[] | undefined {
  const sidecar = subtitlePathFor(audioFilePath);
  if (!fs.existsSync(sidecar)) return undefined;
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(sidecar, "utf8"));
    if (!Array.isArray(raw)) return undefined;
    const timings = raw
      .filter(
        (cue): cue is { part: string; start: number; end: number } =>
          typeof cue === "object" &&
          cue !== null &&
          typeof (cue as { part?: unknown }).part === "string" &&
          Number.isFinite((cue as { start?: unknown }).start) &&
          Number.isFinite((cue as { end?: unknown }).end),
      )
      .map((cue) => ({ text: cue.part.trim(), startMs: cue.start, endMs: cue.end }))
      .filter((cue) => cue.text.length > 0);
    return timings.length > 0 ? timings : undefined;
  } catch {
    return undefined;
  }
}

export async function generateSpeechEdge(text: string, voice: string = DEFAULT_VOICE): Promise<GeneratedSpeech> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cacheKey = cacheKeyFor(text, voice);
  const audioFilePath = path.join(CACHE_DIR, `${cacheKey}.mp3`);

  if (!fs.existsSync(audioFilePath)) {
    // Streamed to a unique temp path and renamed into place. EdgeTTS writes
    // progressively, so writing straight to the cache path lets a concurrent
    // reader (the UI server, another render) open a half-written file — which
    // is what produced "Exceeded maximum byte length": parseMedia sized its
    // buffer from the length at open, then the file kept growing underneath it.
    // rename() is atomic within a filesystem, so a reader sees all or nothing.
    // Node-side temp-file naming, never evaluated inside a render. The
    // randomness is the point: two concurrent syntheses of the same text must
    // not collide on one temp path.
    // eslint-disable-next-line @remotion/deterministic-randomness
    const temporary = `${audioFilePath}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    // `saveSubtitles` makes the library keep the WordBoundary events the Edge
    // service already sends on every synthesis — it requests
    // `wordBoundaryEnabled` regardless, so these timings were being generated
    // and discarded on every render. Writing them out costs nothing and is the
    // difference between captions that land on the voice and captions that land
    // near it.
    const tts = new EdgeTTS({ voice, outputFormat: "audio-24khz-48kbitrate-mono-mp3", saveSubtitles: true });
    await tts.ttsPromise(text, temporary);
    // The sidecar is written as `<audioPath>.json`, so it follows the same
    // temp-then-rename discipline as the audio: a reader must never see a
    // half-written timings file next to a finished mp3.
    if (fs.existsSync(`${temporary}.json`)) {
      fs.renameSync(`${temporary}.json`, subtitlePathFor(audioFilePath));
    }
    fs.renameSync(temporary, audioFilePath);
  }

  let durationInSeconds: number | null = null;
  try {
    ({ durationInSeconds = null } = await parseMedia({
      src: audioFilePath,
      fields: { durationInSeconds: true },
      reader: nodeReader,
    }));
  } catch (err) {
    // An unreadable cached file would otherwise fail identically forever, since
    // the existsSync check above skips regeneration. Drop it and say so.
    try {
      fs.unlinkSync(audioFilePath);
    } catch {
      // Already gone — the rethrow is the point.
    }
    throw new Error(
      `Could not read generated audio at ${audioFilePath} — the cached copy has been deleted, so re-running will regenerate it. Cause: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!durationInSeconds) {
    throw new Error(`Could not determine duration for generated audio: ${audioFilePath}`);
  }

  return {
    audioFilePath,
    staticFilePath: `${CACHE_SUBDIR}/${path.basename(audioFilePath)}`,
    durationSeconds: durationInSeconds,
    wordTimings: readWordTimings(audioFilePath),
  };
}
