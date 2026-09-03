import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { buildWordCaptionLines, buildWordCaptionLinesFromTimings, type CaptionWord } from "../../script/wordCaptions";
import type { WordTiming } from "../../audio/elevenLabs";

// ---------------------------------------------------------------------------
// Short-form "punch" captions.
//
// A different animal from WordCaptionOverlay, which pins a quiet pill to the
// bottom of the frame and tints the active word. That reads as a SUBTITLE —
// something you may read while watching the picture. These captions ARE the
// picture: centred, huge, uppercase, one short phrase at a time, with the
// spoken word popping. On a feed where most viewers never unmute, the captions
// carry the whole message and the footage behind them is just motion.
//
// The two coexist rather than one replacing the other: a diagram scene wants a
// subtitle that stays out of the way of the visual, and a footage-backed short
// wants captions that dominate. Choosing per format is the point.
// ---------------------------------------------------------------------------

/** Words visible at once. Short on purpose: the format's readability comes from
 * never making the eye track a long line, and a three-word phrase at this size
 * is legible in a thumb-scroll. */
const WORDS_PER_LINE = 3;

/** Heavy outline, drawn as stacked text-shadows because SVG-style stroke on
 * HTML text is unevenly supported and clips descenders.
 *
 * Not decoration: these captions sit over arbitrary footage whose brightness
 * changes every frame, so contrast cannot be inherited from a background the
 * caption does not control. The outline is what guarantees legibility over a
 * bright sky and a dark tunnel in the same clip — the "text never sits directly
 * on content" rule, solved for a surface that has no fixed ground. */
function outline(px: number, colour = "#000"): string {
  const offsets: string[] = [];
  for (let angle = 0; angle < 360; angle += 30) {
    const rad = (angle * Math.PI) / 180;
    offsets.push(`${(Math.cos(rad) * px).toFixed(2)}px ${(Math.sin(rad) * px).toFixed(2)}px 0 ${colour}`);
  }
  offsets.push(`0 ${(px * 1.6).toFixed(2)}px ${(px * 1.8).toFixed(2)}px rgba(0,0,0,0.55)`);
  return offsets.join(", ");
}

export interface PunchCaptionStyle {
  /** Colour of the word currently being spoken. */
  activeColour: string;
  /** Colour of the other words in the phrase. */
  restColour: string;
  /** Vertical position as a fraction of frame height. Around 0.5 keeps the
   * captions in the thumb-safe middle, clear of platform UI at both edges. */
  centreY: number;
  uppercase: boolean;
  /** How the spoken word is marked beyond its colour. */
  treatment: ActiveTreatment;
  /** Plate colour, used only by the `plate` treatment. */
  plateColour: string;
  /** Multiplier on the computed font size, so a preset can be louder or
   * quieter without every caller recomputing sizes. */
  fontScale: number;
}

/** Extra treatment for the word currently being spoken, beyond its colour.
 * `plate` is the filled-block look; `scale` is colour plus the pop; `none`
 * leaves the pop only. */
export type ActiveTreatment = "none" | "scale" | "plate";

export const DEFAULT_PUNCH_STYLE: PunchCaptionStyle = {
  activeColour: "#ffe14d",
  restColour: "#ffffff",
  centreY: 0.5,
  uppercase: true,
  treatment: "scale",
  plateColour: "#12b981",
  fontScale: 1,
};

/**
 * Named caption looks.
 *
 * These are not decoration — the caption IS the video in this format, so the
 * look is most of the creative choice available. They differ along the axes
 * that actually change how a caption reads: how the spoken word is marked
 * (colour, scale, a filled plate behind it), how loud the type is, and whether
 * it shouts in capitals.
 *
 * `tiktok`   — white on a heavy outline, the spoken word tinted. The default
 *              look of the format; reads cleanly over any footage.
 * `hormozi`  — capitals with the spoken word on a filled plate. The loudest
 *              option, named for the style it is copied from; very high
 *              retention, very fatiguing at length.
 * `clean`    — sentence case, no plate, restrained. For explanatory content
 *              where the captions support a visual rather than replacing it.
 * `neon`     — cool palette on a dark scrim, for technical subjects where the
 *              yellow-and-green look reads as cheap.
 */
export const PUNCH_PRESETS: Record<string, PunchCaptionStyle> = {
  tiktok: { ...DEFAULT_PUNCH_STYLE },
  hormozi: {
    activeColour: "#0b0d10",
    restColour: "#ffffff",
    centreY: 0.5,
    uppercase: true,
    treatment: "plate",
    plateColour: "#22c55e",
    fontScale: 1.08,
  },
  clean: {
    activeColour: "#ffffff",
    restColour: "rgba(255,255,255,0.62)",
    centreY: 0.62,
    uppercase: false,
    treatment: "none",
    plateColour: "#ffffff",
    fontScale: 0.82,
  },
  neon: {
    activeColour: "#38bdf8",
    restColour: "#e2e8f0",
    centreY: 0.5,
    uppercase: true,
    treatment: "scale",
    plateColour: "#38bdf8",
    fontScale: 1,
  },
};

export const PUNCH_PRESET_NAMES = Object.keys(PUNCH_PRESETS);

export function resolvePunchStyle(preset: string | undefined, overrides?: Partial<PunchCaptionStyle>): PunchCaptionStyle {
  const base = (preset && PUNCH_PRESETS[preset]) || DEFAULT_PUNCH_STYLE;
  return { ...base, ...overrides };
}

export const PunchCaptions: React.FC<{
  text: string;
  durationInFrames: number;
  /** Real per-word timings measured from this clip's speech. When present they
   * are used verbatim; the estimator is only a fallback. This is the single
   * thing that decides whether the captions sit ON the voice or merely near it,
   * and in this format that is the difference between produced and generated. */
  wordTimings?: WordTiming[];
  /** Named look from PUNCH_PRESETS — "tiktok" | "hormozi" | "clean" | "neon". */
  preset?: string;
  style?: Partial<PunchCaptionStyle>;
}> = ({ text, durationInFrames, wordTimings, preset, style }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const resolved = resolvePunchStyle(preset, style);

  // Measured timings win outright. The estimator remains for audio cached
  // before timings were captured, and for any provider that does not report
  // them — so a fallback is a real state, not a bug.
  const measured = wordTimings?.length ? buildWordCaptionLinesFromTimings(wordTimings, fps, WORDS_PER_LINE) : [];
  const lines = measured.length > 0 ? measured : buildWordCaptionLines(text, durationInFrames / fps, fps, WORDS_PER_LINE);
  if (lines.length === 0) return null;

  // The line whose window contains this frame. Scanning forward rather than
  // binary-searching keeps it correct when lines share a boundary frame.
  let active = lines[0];
  for (const line of lines) {
    if (frame >= line.startFrame) active = line;
  }

  // Sized off the frame's shorter side so the captions are the same physical
  // size in portrait and landscape rather than silently shrinking in one.
  const unit = Math.min(width, height);
  const fontSize = unit * 0.115 * resolved.fontScale;
  const strokePx = Math.max(3, unit * 0.006);

  const isSpoken = (word: CaptionWord) => frame >= word.startFrame && frame <= word.endFrame;

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingTop: `${(resolved.centreY - 0.5) * 200}%`,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: `${unit * 0.018}px`,
          maxWidth: "88%",
          fontFamily: "Montserrat, system-ui, sans-serif",
          fontWeight: 900,
          fontSize,
          lineHeight: 1.08,
          letterSpacing: "-0.01em",
          textAlign: "center",
          textShadow: outline(strokePx),
        }}
      >
        {active.words.map((word, index) => {
          const spoken = isSpoken(word);
          // A short overshoot on the spoken word. This is what makes the
          // captions read as PERFORMED rather than merely displayed — the same
          // reason a composition move overshoots and settles.
          const pop = spoken
            ? interpolate(frame - word.startFrame, [0, 3, 7], [0.86, 1.12, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
              })
            : 1;
          const plated = spoken && resolved.treatment === "plate";
          return (
              <span
                key={`${active.startFrame}-${index}`}
                style={{
                  color: spoken ? resolved.activeColour : resolved.restColour,
                  transform: `scale(${resolved.treatment === "none" ? 1 : pop})`,
                  display: "inline-block",
                  transformOrigin: "center bottom",
                  // The plate is drawn behind the word rather than around the
                  // whole line, so the highlight tracks the voice word by word.
                  // Its own padding is what keeps the glyphs off the plate edge.
                  ...(plated
                    ? {
                        background: resolved.plateColour,
                        padding: `${unit * 0.004}px ${unit * 0.016}px`,
                        borderRadius: unit * 0.012,
                        // The outline exists to hold contrast against unknown
                        // footage; on a solid plate it only muddies the glyphs.
                        textShadow: "none",
                      }
                    : {}),
                }}
              >
                {resolved.uppercase ? word.text.toUpperCase() : word.text}
              </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
