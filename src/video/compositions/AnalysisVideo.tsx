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
import { VISUAL_COMPONENTS } from "../visualComponents";
import type { SharedVisualProps } from "../sharedVisualProps";
import type { TimedSegment, AspectRatio, Visual, AudioClipPlacement } from "../../model/Segment";
import type { Orientation } from "../theme";

export const TRANSITION_FRAMES = 15; // ~0.5s crossfade at 30fps between segments
export const HARD_CUT_FRAMES = 1; // minimal, non-zero (linearTiming needs a real range)

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
      {audioClips?.map((clip) => (
        <Sequence
          key={clip.id}
          from={Math.round(clip.startSeconds * fps)}
          durationInFrames={Math.max(1, Math.round(clip.durationSeconds * fps))}
        >
          <Html5Audio
            src={staticFile(clip.staticPath)}
            startFrom={Math.round((clip.trimStartSeconds ?? 0) * fps)}
            volume={clip.volume ?? 1}
          />
        </Sequence>
      ))}
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
                    hasCaption: !!(segment.phases && segment.phases.length > 0),
                  };
                  return <Component data={segment.visual} {...shared} />;
                })()}
              {segment.phases && segment.phases.length > 0 && (
                <PhaseCaptionOverlay phases={segment.phases} durationInFrames={durationInFrames} />
              )}
              {segment.audioStaticPath && (
                <Html5Audio src={staticFile(segment.audioStaticPath)} volume={segment.narrationVolume ?? 1} />
              )}
              {segment.narrationClips?.map((clip, clipIndex) =>
                clip.staticPath ? (
                  <Sequence
                    key={clipIndex}
                    from={Math.round((clip.offsetSeconds ?? 0) * fps)}
                    durationInFrames={Math.max(1, Math.round((clip.durationSeconds ?? 0) * fps))}
                  >
                    <Html5Audio src={staticFile(clip.staticPath)} volume={clip.volume ?? segment.narrationVolume ?? 1} />
                  </Sequence>
                ) : null,
              )}
              {segment.sfxStaticPath && <Html5Audio src={staticFile(segment.sfxStaticPath)} volume={0.5} />}
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
