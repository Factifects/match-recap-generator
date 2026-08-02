import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_FAMILY } from "../theme";
import { fadeIn } from "../motion";

const CROSSFADE_FRAMES = 10;

/** An independent sequence of on-screen captions ("Phases") playing over a
 * scene's own duration, on top of whichever visual is showing — rendered as
 * a sibling inside AnalysisVideo.tsx's TransitionSeries.Sequence (same
 * integration point segment.audioStaticPath/sfxStaticPath already use),
 * so no visual card needs any changes to support this. Each phase gets an
 * even time slice by default, or an explicit slice via `startSeconds` when
 * given (unspecified phases after an explicit one fill the remaining time
 * evenly). */
export const PhaseCaptionOverlay: React.FC<{
  phases: { caption: string; startSeconds?: number }[];
  durationInFrames: number;
}> = ({ phases, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const starts = resolvePhaseStartFrames(phases, durationInFrames, fps);
  let activeIndex = 0;
  for (let i = 0; i < starts.length; i++) {
    if (frame >= starts[i]) activeIndex = i;
  }
  const phaseStart = starts[activeIndex];
  const phaseEnd = activeIndex + 1 < starts.length ? starts[activeIndex + 1] : durationInFrames;

  const opacity =
    fadeIn(frame, phaseStart, CROSSFADE_FRAMES) * (1 - fadeIn(frame, phaseEnd - CROSSFADE_FRAMES, CROSSFADE_FRAMES));

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 64 }}>
      <div
        style={{
          opacity,
          background: "rgba(17, 19, 21, 0.82)",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 18,
          padding: "20px 48px",
          maxWidth: "80%",
        }}
      >
        {/* Sized well above the title (54px) on purpose — captions are meant
            to read as short keyword badges, not a subtitle bar, and are the
            one piece of text a viewer with sound off actually relies on.
            Authors should keep `caption` to a handful of words; long
            sentences here will still render (CSS wraps), just smaller than
            intended. */}
        <div style={{ fontFamily: FONT_FAMILY, fontWeight: 700, fontSize: 44, color: COLORS.text, textAlign: "center", lineHeight: 1.25 }}>
          {phases[activeIndex]?.caption}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Even split by default; an explicit `startSeconds` on any phase pins that
 * phase's start, with unspecified phases before/after it still dividing
 * their own remaining span evenly — degrades to a pure even split when no
 * phase specifies one. */
function resolvePhaseStartFrames(
  phases: { caption: string; startSeconds?: number }[],
  durationInFrames: number,
  fps: number,
): number[] {
  const hasExplicit = phases.some((p) => p.startSeconds !== undefined);
  if (!hasExplicit) {
    return phases.map((_, index) => Math.round((index / phases.length) * durationInFrames));
  }
  return phases.map((phase, index) => {
    if (phase.startSeconds !== undefined) return Math.round(phase.startSeconds * fps);
    return Math.round((index / phases.length) * durationInFrames);
  });
}
