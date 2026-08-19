import React from "react";
import { Html5Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming, type TransitionPresentation } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { none } from "@remotion/transitions/none";
import { slide } from "@remotion/transitions/slide";
import { zoomIn, zoomOut } from "../transitions";
import { ChapterCard } from "./ChapterCard";
import { StatementCard } from "./StatementCard";
import { PhaseCaptionOverlay } from "./PhaseCaptionOverlay";
import { WordCaptionOverlay } from "./WordCaptionOverlay";
import { VISUAL_COMPONENTS } from "../visualComponents";
import type { SharedVisualProps } from "../sharedVisualProps";
import type { TimedSegment, AspectRatio, Visual, AudioClipPlacement } from "../../model/Segment";
import type { Orientation } from "../theme";

export const TRANSITION_FRAMES = 15; // ~0.5s crossfade at 30fps between segments
export const HARD_CUT_FRAMES = 1; // minimal, non-zero (linearTiming needs a real range)
// How many frames before a Sequence's own end any audio inside it starts
// ducking to silence — every Html5Audio below sits inside a fixed-length
// Sequence/TransitionSeries.Sequence, so whenever the underlying audio file
// is longer than that Sequence (narration longer than a manually-shortened
// scene, a trimmed sfx/music clip, a segment whose real narration overran
// its estimate), Remotion just unmounts it at the boundary — an instant,
// audible hard stop mid-word/mid-note. Fading the last few frames to 0
// first means that same cutoff lands on silence instead, at the small cost
// of trimming a few frames off audio that WAS going to finish naturally
// anyway (imperceptible either way at this length).
const AUDIO_FADE_OUT_FRAMES = 8;

/** A VolumeProp combining an optional fade-in ramp (silent -> full over the
 * clip's first `fadeInFrames`) with a fade-out ramp (full -> silent over the
 * last `fadeOutFrames`) of a `durationInFrames`-long Sequence — either can be
 * 0 (no ramp on that side). When both are non-zero and would overlap (their
 * combined length exceeds the clip's own duration), `Math.min` below just
 * means volume never reaches full baseVolume anywhere, a deliberate "duck"
 * rather than a clamp — callers (Timeline.tsx's drag handles) are expected
 * to keep the two from overlapping in the first place, but this can't crash
 * or invert even if one somehow does. */
function fadeVolume(baseVolume: number, durationInFrames: number, fadeInFrames: number, fadeOutFrames: number): (frame: number) => number {
  return (frame: number) => {
    const inRamp = fadeInFrames > 0 ? Math.max(0, Math.min(1, frame / fadeInFrames)) : 1;
    const remaining = durationInFrames - frame;
    const outRamp = fadeOutFrames > 0 ? Math.max(0, Math.min(1, remaining / fadeOutFrames)) : 1;
    return baseVolume * Math.min(inRamp, outRamp);
  };
}

/** Narration and per-segment sfx (below) have no fade-in/fade-out authoring
 * of their own — just the same flat AUDIO_FADE_OUT_FRAMES safety fade every
 * Html5Audio in this file always had, unaffected by user-placed audioClips'
 * new manual fade controls. */
function fadeOutVolume(baseVolume: number, durationInFrames: number): (frame: number) => number {
  return fadeVolume(baseVolume, durationInFrames, 0, AUDIO_FADE_OUT_FRAMES);
}

// How close (in seconds) another clip's start has to sit to THIS clip's own
// end to count as "glued" — a duplicated clip appended right after its
// source, or a hand-dragged snap to another clip's tail (see Timeline.tsx's
// own GLUE_EPSILON_SECONDS, same convention, separate constant since that
// file is frontend-only and this one is the renderer). Large enough to
// absorb float rounding from a prior snap, small enough to never mistake a
// genuinely separate, deliberately-gapped clip for a glued one.
const GLUE_EPSILON_SECONDS = 0.05;

/** A clip fading to silence over its own last AUDIO_FADE_OUT_FRAMES makes
 * sense when nothing else picks up right after it — but when another clip is
 * glued flush against its tail (the common "duplicate, place beside" way of
 * tiling background music), that fade creates an audible dip-then-jump
 * exactly at the seam the user placed to sound continuous, even though
 * there's no real silence there. Skip the fade whenever a successor already
 * covers the boundary. */
function hasGluedSuccessor(clip: AudioClipPlacement, allClips: AudioClipPlacement[]): boolean {
  const end = clip.startSeconds + clip.durationSeconds;
  return allClips.some((c) => c.id !== clip.id && Math.abs(c.startSeconds - end) < GLUE_EPSILON_SECONDS);
}

/** How many frames of overlap a segment's outgoing transition consumes —
 * shared, not additive, with the next segment. Root.tsx's duration
 * calculation needs this exact number per segment to avoid overshooting. */
export function transitionFramesFor(segment: TimedSegment): number {
  return segment.transitionOut === "cut" ? HARD_CUT_FRAMES : TRANSITION_FRAMES;
}

/** transitionOut ("cut"/"dissolve") controls TIMING only; transitionStyle
 * picks which presentation plays for the non-cut case — independent
 * concerns, so a scene can be e.g. a slow slide-left dissolve or a fast
 * zoom-in hard cut. Defaults to fade(), today's only behavior. */
function presentationFor(segment: TimedSegment): TransitionPresentation<Record<string, unknown>> {
  // TransitionSeries.Transition's `presentation` prop is generic over a
  // single PresentationProps shape — each branch below returns a genuinely
  // different one (NoneProps/SlideProps/our own {direction}), so TS can't
  // reconcile the union against one call site's inferred type param. The
  // cast is fighting that generic invariance, not a real type-safety gap:
  // each presentation's own component only ever reads its own props.
  const presentation = (() => {
    if (segment.transitionOut === "cut") return none();
    switch (segment.transitionStyle) {
      case "zoom-in":
        return zoomIn();
      case "zoom-out":
        return zoomOut();
      case "slide-left":
        return slide({ direction: "from-right" });
      case "slide-right":
        return slide({ direction: "from-left" });
      case "slide-up":
        return slide({ direction: "from-bottom" });
      case "slide-down":
        return slide({ direction: "from-top" });
      default:
        return fade();
    }
  })();
  return presentation as unknown as TransitionPresentation<Record<string, unknown>>;
}

/** Each beat's real narration audio (once generated) drives its own duration, so a
 * beat's visual — plain caption or a graphic override — always plays under the
 * full narration for that text, never a trimmed version of it. */
/** `aspectRatio` itself isn't read here — Root.tsx's calculateMetadata already
 * derives the actual composition width/height from it. Instead, `orientation`
 * is derived once from the real rendered dimensions via useVideoConfig() and
 * passed explicitly to every card, rather than each of the ~24 cards
 * independently calling useVideoConfig() and duplicating the same
 * width>height check. `aspectRatio` stays in the prop type purely so
 * Root.tsx's defaultProps/inputProps shape still type-checks here. */
export const AnalysisVideo: React.FC<{
  segments: TimedSegment[];
  aspectRatio?: AspectRatio;
  /** Relative path (public/) to a short ambient bed, looped for the whole video's
   * duration at a low, unobtrusive volume — independent of any segment's own
   * audio/sfx, so it isn't affected by segment count or per-scene transitions. */
  backgroundMusicPath?: string;
  /** User-placed sound-effect/music clips — each positioned and trimmed
   * independently of segment boundaries, so the same uploaded file can
   * appear more than once at different points in the video. See
   * AudioClipPlacement's docstring in model/Segment.ts. */
  audioClips?: AudioClipPlacement[];
}> = ({ segments, backgroundMusicPath, audioClips }) => {
  const { fps, width, height } = useVideoConfig();
  const orientation: Orientation = height > width ? "portrait" : "landscape";

  return (
    <>
      {backgroundMusicPath && <Html5Audio src={staticFile(backgroundMusicPath)} loop volume={0.06} />}
      {audioClips?.map((clip) => {
        // Deriving durationInFrames from the clip's own end timestamp (not
        // straight from durationSeconds) means two clips placed exactly
        // flush — B.startSeconds === A.startSeconds + A.durationSeconds,
        // e.g. a duplicated clip appended right after its source — round to
        // the SAME boundary frame on both sides. Rounding each clip's
        // duration independently could land A's end and B's start a frame
        // apart (round(x) + round(y) isn't always round(x + y)), which is
        // exactly the "flush in the editor, a gap in the render" bug this
        // fixes: a genuinely silent frame at a seam the user placed to sound
        // continuous.
        const fromFrame = Math.round(clip.startSeconds * fps);
        const clipDurationInFrames = Math.max(1, Math.round((clip.startSeconds + clip.durationSeconds) * fps) - fromFrame);
        const baseVolume = clip.volume ?? 1;
        const fadeInFrames = Math.max(0, Math.round((clip.fadeInSeconds ?? 0) * fps));
        // fadeOutSeconds unset -> the smart default (glued-aware); an
        // EXPLICIT value (including 0, hence the `!== undefined` rather than
        // `??`) always wins, since setting it at all is the user manually
        // taking over via the timeline editor's drag handle.
        const autoFadeOutFrames = hasGluedSuccessor(clip, audioClips) ? 0 : AUDIO_FADE_OUT_FRAMES;
        const fadeOutFrames =
          clip.fadeOutSeconds !== undefined ? Math.max(0, Math.round(clip.fadeOutSeconds * fps)) : autoFadeOutFrames;
        const volume = fadeVolume(baseVolume, clipDurationInFrames, fadeInFrames, fadeOutFrames);
        return (
          <Sequence key={clip.id} from={fromFrame} durationInFrames={clipDurationInFrames}>
            <Html5Audio
              src={staticFile(clip.staticPath)}
              startFrom={Math.round((clip.trimStartSeconds ?? 0) * fps)}
              volume={volume}
            />
          </Sequence>
        );
      })}
      <TransitionSeries>
      {segments.map((segment, index) => {
        // Pad only by exactly what the outgoing transition consumes (15 frames for a
        // dissolve, 1 for a hard cut) — no extra dead air on top, since that padding
        // used to be a flat 20 frames regardless of transition, leaving audible silence
        // after the narration ended and before the next segment's crossfade even began.
        // Floors at visualMinDurationSeconds the same way resolveSegmentAudio and the
        // editor UI's effectiveDurationOf do — this is the actual renderer, so it has
        // to be the authoritative last line of defense: if durationSeconds ever reaches
        // here below the segment's own floor (a stale sidecar JSON, a future editor bug),
        // rendering it that short anyway would silently desync every clip placed after it
        // from what the editor displayed, which is exactly the bug this guards against.
        const effectiveDurationSeconds = Math.max(segment.durationSeconds, segment.visualMinDurationSeconds ?? 0);
        const durationInFrames = Math.ceil(effectiveDurationSeconds * fps) + transitionFramesFor(segment);
        return (
          <React.Fragment key={index}>
            <TransitionSeries.Sequence durationInFrames={durationInFrames}>
              {segment.type === "chapter" && (
                <ChapterCard title={segment.text} backgroundColor={segment.panelColor} orientation={orientation} />
              )}
              {segment.type === "statement" && !segment.visual && (
                <StatementCard text={segment.text} backgroundColor={segment.panelColor} orientation={orientation} />
              )}
              {segment.type === "statement" &&
                segment.visual &&
                (() => {
                  // One generic lookup into the visual registry
                  // (src/video/visualComponents.tsx) instead of a 21-branch
                  // conditional chain — every card already shares the same
                  // `{ data, ...SharedVisualProps }` contract (see the visual
                  // registry plan), so there's nothing per-kind left to
                  // special-case here. Adding a 22nd visual type needs no
                  // edit to this file at all.
                  const Component = VISUAL_COMPONENTS[segment.visual.kind] as React.FC<{ data: Visual } & SharedVisualProps>;
                  const shared: SharedVisualProps = {
                    backgroundColor: segment.panelColor,
                    backgroundImage: segment.backgroundImage,
                    backgroundImageMode: segment.backgroundImageMode,
                    backgroundImageSide: segment.backgroundImageSide,
                    orientation,
                    camera: segment.camera,
                    durationInFrames,
                    iconImage: segment.iconImage,
                    jerseyImages: segment.jerseyImages,
                    boardPosition: segment.boardPosition,
                    animation: segment.animation,
                    hasCaption: !!(segment.phases && segment.phases.length > 0) || !!segment.wordCaptions,
                    narrationText: segment.narrationText ?? segment.text,
                  };
                  return <Component data={segment.visual} {...shared} />;
                })()}
              {/* Exactly one caption treatment per segment: karaoke word
                  captions and authored phase captions share the same
                  bottom-pinned chrome, so rendering both would stack two
                  pills on top of each other. Word captions win when set. */}
              {segment.wordCaptions && (
                <WordCaptionOverlay
                  text={segment.narrationText ?? segment.text}
                  durationInFrames={durationInFrames}
                  clips={segment.narrationClips}
                />
              )}
              {!segment.wordCaptions && segment.phases && segment.phases.length > 0 && (
                <PhaseCaptionOverlay phases={segment.phases} durationInFrames={durationInFrames} />
              )}
              {segment.audioStaticPath && (
                <Html5Audio src={staticFile(segment.audioStaticPath)} volume={fadeOutVolume(segment.narrationVolume ?? 1, durationInFrames)} />
              )}
              {segment.narrationClips?.map((clip, clipIndex) => {
                if (!clip.staticPath) return null;
                const clipDurationInFrames = Math.max(1, Math.round((clip.durationSeconds ?? 0) * fps));
                return (
                  <Sequence key={clipIndex} from={Math.round((clip.offsetSeconds ?? 0) * fps)} durationInFrames={clipDurationInFrames}>
                    <Html5Audio
                      src={staticFile(clip.staticPath)}
                      volume={fadeOutVolume(clip.volume ?? segment.narrationVolume ?? 1, clipDurationInFrames)}
                    />
                  </Sequence>
                );
              })}
              {segment.sfxStaticPath && (
                <Html5Audio src={staticFile(segment.sfxStaticPath)} volume={fadeOutVolume(0.35, durationInFrames)} />
              )}
              {segment.sfxClips?.map((clip, clipIndex) => {
                const clipDurationInFrames = Math.max(1, Math.round(clip.durationSeconds * fps));
                return (
                  <Sequence key={clipIndex} from={Math.round(clip.startSeconds * fps)} durationInFrames={clipDurationInFrames}>
                    <Html5Audio
                      src={staticFile(clip.staticPath)}
                      trimBefore={clip.trimStartSeconds ? Math.round(clip.trimStartSeconds * fps) : undefined}
                      volume={fadeOutVolume(clip.volume ?? 0.35, clipDurationInFrames)}
                    />
                  </Sequence>
                );
              })}
            </TransitionSeries.Sequence>
            {index < segments.length - 1 && (
              <TransitionSeries.Transition
                presentation={presentationFor(segment)}
                timing={linearTiming({ durationInFrames: transitionFramesFor(segment) })}
              />
            )}
          </React.Fragment>
        );
      })}
      </TransitionSeries>
    </>
  );
};
