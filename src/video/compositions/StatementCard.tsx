import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT_FAMILY, type PanelColorKey, type Orientation } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { IconGlyph } from "./IconInfographicCard";
import { matchIconForText } from "../icons";
import { fadeIn, slideIn, drawIn } from "../motion";

const STAGGER_FRAMES = 2.2;
// Numbers/scores are the highest-signal words in match narration — highlighting
// them in accent color gives even a plain sentence a data-viz read at a glance.
const NUMERIC_WORD = /\d/;

function Word({ text, index, highlight }: { text: string; index: number; highlight: boolean }) {
  const frame = useCurrentFrame();
  const start = index * STAGGER_FRAMES;

  const opacity = fadeIn(frame, start, 10);
  const translateY = slideIn(frame, start, 10, 14);

  return (
    <span
      style={{
        display: "inline-block",
        transform: `translateY(${translateY}px)`,
        opacity,
        color: highlight ? COLORS.accent : COLORS.text,
        marginRight: 14,
      }}
    >
      {text}
    </span>
  );
}

/** Kinetic-typography caption. A keyword match in the sentence picks a
 * relevant icon (goal, card, save, etc.) to pair with the text — when
 * nothing matches, the text stands alone rather than forcing a generic
 * decoration on every beat. Fade/slide only, no bounce. */
export const StatementCard: React.FC<{ text: string; backgroundColor?: PanelColorKey; orientation?: Orientation }> = ({
  text,
  backgroundColor,
  orientation = "landscape",
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const words = text.split(/\s+/).filter(Boolean);
  const icon = matchIconForText(text);

  const drawProgress = drawIn(frame, 4, 22);
  const graphicOpacity = fadeIn(frame, 0, 8);
  // A short punchy line reads best BIG; a long sentence needs to shrink to
  // avoid wrapping into a wall of text — flat 66px undersold short lines and
  // let long ones wrap into a cramped block. Scaled by character count,
  // clamped to a range that stays readable at the short end (never below the
  // player-label size) and impactful at the long end. Same range in portrait
  // — the narrower maxWidth below just means more wrapped lines, which the
  // taller 1920px-high portrait frame has plenty of room for. Shrinking the
  // font on top of that would make portrait viewers squint for no reason.
  const fontSize = interpolate(text.length, [40, 220], [86, 58], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFrame backgroundColor={backgroundColor}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {icon && (
          <div style={{ opacity: graphicOpacity, marginBottom: 20 }}>
            <IconGlyph icon={icon} progress={drawProgress} color={COLORS.accent} size={120} />
          </div>
        )}
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontWeight: 600,
            fontSize,
            lineHeight: 1.35,
            textAlign: "center",
            maxWidth: isPortrait ? 900 : 1700,
            padding: "0 60px",
          }}
        >
          {words.map((word, index) => (
            <Word key={index} text={word} index={index} highlight={NUMERIC_WORD.test(word)} />
          ))}
        </div>
      </div>
    </SceneFrame>
  );
};
