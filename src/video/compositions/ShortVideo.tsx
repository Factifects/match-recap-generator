import React from "react";
import { AbsoluteFill, Html5Audio, Loop, OffthreadVideo, Sequence, staticFile, useVideoConfig } from "remotion";
import { PunchCaptions, type PunchCaptionStyle } from "./PunchCaptions";
import type { WordTiming } from "../../audio/elevenLabs";
import { FPS } from "../theme";

// ---------------------------------------------------------------------------
// The footage-backed short: looping background, narration, punch captions.
//
// A deliberately different product from AnalysisVideo, not a mode of it.
// AnalysisVideo composes authored scenes, each drawing its own bespoke visual
// on a timeline; this composes ONE continuous clip where the background is
// ambient motion and the captions carry the entire message. Trying to express
// both through one composition would mean a scene system where most scenes have
// no visual, which is how you end up with a component nobody can reason about.
//
// The quality argument for having it at all: this format's retention does not
// come from the picture. It comes from the script, the pacing of the voice, and
// captions that land on the beat. All three are things this project already
// does well, and none of them need the motion-design engine — so it is by far
// the cheapest way to turn a topic into something publishable.
// ---------------------------------------------------------------------------

export interface ShortClip {
  /** Spoken line for this clip; also what the captions render. */
  text: string;
  /** Path under public/ for the narration audio, as resolveAudio produces. */
  audioStaticPath?: string;
  durationSeconds: number;
  /** Per-word timings measured from this clip's own speech, when the provider
   * reported them. Absent means the captions fall back to estimated timing. */
  wordTimings?: WordTiming[];
}

export interface ShortVideoProps {
  clips: ShortClip[];
  /** Path under public/ to the looping background clip. Supplied by the author:
   * gameplay capture, b-roll, a screen recording, anything with steady motion
   * and no competing text. Omitted, the video renders on a flat ground, which
   * is a legitimate look rather than a failure state. */
  backgroundVideo?: string;
  /** Flat colour behind everything, seen when no background clip is set and
   * through any letterboxing if one has a different aspect ratio. */
  backgroundColor?: string;
  /** Named caption look — "tiktok" | "hormozi" | "clean" | "neon". */
  captionPreset?: string;
  captionStyle?: Partial<PunchCaptionStyle>;
  /** Path under public/ to a music bed, mixed under the narration. */
  music?: string;
  /** Music level relative to full scale. Low by default: a bed exists to fill
   * silence between lines, and anything loud enough to notice is competing with
   * the voice the video exists to deliver. */
  musicVolume?: number;
  /** Playback rate for the background. Under 1 makes busy footage calmer so it
   * competes less with the captions, which are the actual content. */
  backgroundRate?: number;
  /** Length of the background clip in seconds. Required to loop it: Remotion
   * needs a frame count to repeat, and a video's real duration is not knowable
   * inside a composition. Wrong values are safe — too short simply loops more
   * often, too long leaves a gap the flat ground fills. */
  backgroundDurationSeconds?: number;
}

export function shortTotalFrames(clips: ShortClip[]): number {
  return Math.max(1, Math.ceil(clips.reduce((sum, clip) => sum + clip.durationSeconds, 0) * FPS));
}

export const ShortVideo: React.FC<ShortVideoProps> = ({
  clips,
  backgroundVideo,
  backgroundColor = "#0b0d10",
  captionPreset,
  captionStyle,
  music,
  musicVolume = 0.12,
  backgroundRate = 1,
  backgroundDurationSeconds,
}) => {
  const { fps } = useVideoConfig();
  const loopFrames = Math.max(1, Math.round((backgroundDurationSeconds ?? 10) * fps));

  let cursor = 0;
  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {/* Music bed sits outside the per-clip sequences so it runs unbroken
          across the whole video rather than restarting on every caption beat. */}
      {music && <Html5Audio src={staticFile(music)} volume={musicVolume} loop />}

      {backgroundVideo && (
        <AbsoluteFill>
          <Loop durationInFrames={loopFrames}>
            <OffthreadVideo
              src={staticFile(backgroundVideo)}
              playbackRate={backgroundRate}
              // The background is ambient motion, never the subject: its own
              // audio would fight the narration this video exists to deliver.
              muted
              // Cover, not contain — a letterboxed background reads as a
              // mistake, and cropping ambient footage costs nothing.
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </Loop>
        </AbsoluteFill>
      )}

      {/* A constant scrim. Footage brightness swings frame to frame, and the
          caption outline alone cannot hold contrast over a blown-out sky —
          this guarantees a floor without hiding the motion underneath. */}
      <AbsoluteFill style={{ background: "rgba(0,0,0,0.28)" }} />

      {clips.map((clip, index) => {
        const from = cursor;
        const durationInFrames = Math.max(1, Math.round(clip.durationSeconds * fps));
        cursor += durationInFrames;
        return (
          <Sequence key={index} from={from} durationInFrames={durationInFrames}>
            {clip.audioStaticPath && <Html5Audio src={staticFile(clip.audioStaticPath)} />}
            <PunchCaptions
              text={clip.text}
              durationInFrames={durationInFrames}
              wordTimings={clip.wordTimings}
              preset={captionPreset}
              style={captionStyle}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
