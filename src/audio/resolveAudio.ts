import { generateSoundEffect, generateSpeech } from "./elevenLabs";
import { generateSpeechEdge } from "./edgeTts";
import type { TimedSegment } from "../model/Segment";

const CHAPTER_WHOOSH_PROMPT = "short sharp whoosh transition sound effect, cinematic, punchy";

export type TtsProvider = "elevenlabs" | "edge";

export interface ResolveAudioOptions {
  provider?: TtsProvider;
  /** Edge voice ID (e.g. "en-US-GuyNeural") — only meaningful when provider is "edge". */
  edgeVoice?: string;
}

/** Replaces every segment's word-count-estimated duration with its real narration
 * audio length, and attaches a shared whoosh SFX to chapter beats to go with the
 * swoosh wipe transition. This is what makes on-screen timing exactly match what
 * gets said out loud, instead of an estimate.
 *
 * The chapter whoosh SFX is always generated via ElevenLabs (edge-tts is speech-only,
 * it can't produce a sound effect) — when provider is "edge", chapter beats simply
 * play without a whoosh instead of silently requiring an ElevenLabs key just for
 * that one sound, which would defeat the point of trying a free provider. */
export async function resolveSegmentAudio(
  segments: TimedSegment[],
  options: ResolveAudioOptions = {},
): Promise<TimedSegment[]> {
  const provider = options.provider ?? "elevenlabs";
  const sfx = provider === "elevenlabs" ? await generateSoundEffect(CHAPTER_WHOOSH_PROMPT, 1) : null;

  const resolved: TimedSegment[] = [];
  for (const segment of segments) {
    const speech =
      provider === "edge" ? await generateSpeechEdge(segment.text, options.edgeVoice) : await generateSpeech(segment.text);
    const durationSeconds = segment.visualMinDurationSeconds
      ? Math.max(speech.durationSeconds, segment.visualMinDurationSeconds)
      : speech.durationSeconds;
    resolved.push({
      ...segment,
      durationSeconds,
      audioStaticPath: speech.staticFilePath,
      sfxStaticPath: segment.type === "chapter" && sfx ? sfx.staticFilePath : undefined,
    });
  }
  return resolved;
}
