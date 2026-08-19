import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_FAMILY } from "../theme";
import { fadeIn, pulse } from "../motion";
import { buildWordCaptionLines, buildPassageCaptionLines, type NarrationClipTiming } from "../../script/wordCaptions";

const CROSSFADE_FRAMES = 8;

/** Karaoke-style captions: the full line is on screen at once, and only the
 * word currently being spoken (per buildWordCaptionLines's estimated timing)
 * lights up in the accent color while the rest stay plain white — distinct
 * from PhaseCaptionOverlay, which shows one short authored phrase per beat
 * with no per-word timing. Same bottom-pinned pill chrome as
 * PhaseCaptionOverlay on purpose (one shared caption visual language), so a
 * segment picks exactly one of the two overlays, never both — see
 * AnalysisVideo.tsx's `wordCaptions` branch. */
export const WordCaptionOverlay: React.FC<{
  text: string;
  durationInFrames: number;
  /** Present when this segment is a MERGED passage. Captions are then built per
   * clip, so a line can never straddle a scene boundary and each clip's words
   * are timed against its own real audio duration rather than an even share of
   * the whole passage. */
  clips?: NarrationClipTiming[];
}> = ({ text, durationInFrames, clips }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines =
    clips && clips.length > 1
      ? buildPassageCaptionLines(clips, durationInFrames / fps, fps)
      : buildWordCaptionLines(text, durationInFrames / fps, fps);
  if (lines.length === 0) return null;

  let activeIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if (frame >= lines[i].startFrame) activeIndex = i;
  }
  const line = lines[activeIndex];
  const nextLineStart = activeIndex + 1 < lines.length ? lines[activeIndex + 1].startFrame : durationInFrames;
  const opacity =
    fadeIn(frame, line.startFrame, CROSSFADE_FRAMES) * (1 - fadeIn(frame, nextLineStart - CROSSFADE_FRAMES, CROSSFADE_FRAMES));

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 64 }}>
      <div
        style={{
          opacity,
          background: "rgba(17, 19, 21, 0.82)",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 18,
          padding: "20px 40px",
          maxWidth: "84%",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0 14px",
        }}
      >
        {line.words.map((word, index) => {
          const isActive = frame >= word.startFrame && frame < word.endFrame;
          const scale = isActive ? pulse(frame - word.startFrame, 40, 1, 1.1) : 1;
          return (
            <span
              key={index}
              style={{
                display: "inline-block",
                transform: `scale(${scale})`,
                fontFamily: FONT_FAMILY,
                fontWeight: 800,
                fontSize: 42,
                lineHeight: 1.3,
                color: isActive ? COLORS.highlight : COLORS.text,
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
