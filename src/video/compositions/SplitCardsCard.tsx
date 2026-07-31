import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, DISPLAY_FONT_FAMILY, FONT_FAMILY, TITLE_STYLE } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, slideIn } from "../motion";
import type { SharedVisualProps, SplitCardsData } from "../sharedVisualProps";

/** Two panels side by side, each a label/value/caption — for a qualitative
 * or mixed-content comparison a numeric-only head-to-head (Stat Burst)
 * can't carry (a claim vs a claim, a text verdict vs a text verdict, not
 * just two numbers). Values are strings by design, not numbers — this card
 * never counts up, it settles in as two whole panels at once. */
export const SplitCardsCard: React.FC<{ data: SplitCardsData } & SharedVisualProps> = ({
  data: { title, left, right, revealRightAt },
  backgroundColor,
  orientation,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const titleOpacity = fadeIn(frame, 0, 10);

  const leftOpacity = fadeIn(frame, 10, 16);
  const leftX = slideIn(frame, 10, 18, isPortrait ? 0 : -40);
  const leftY = slideIn(frame, 10, 18, isPortrait ? -30 : 0);
  // Omitted `revealRightAt` reproduces today's exact fixed 8-frame stagger
  // after the left panel; set it (a 0-1 fraction of the scene's own
  // on-screen duration) to hold `right` back further, e.g. so a narration
  // line can pose the question before `right` lands as the answer.
  const rightStartFrame =
    revealRightAt !== undefined && durationInFrames ? Math.round(durationInFrames * revealRightAt) : 18;
  const rightOpacity = fadeIn(frame, rightStartFrame, 16);
  const rightX = slideIn(frame, rightStartFrame, 18, isPortrait ? 0 : 40);
  const rightY = slideIn(frame, rightStartFrame, 18, isPortrait ? 30 : 0);

  const panel = (label: string, value: string, caption: string | undefined, opacity: number, x: number, y: number) => (
    <div
      style={{
        opacity,
        transform: `translate(${x}px, ${y}px)`,
        width: isPortrait ? 620 : 560,
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 24,
        padding: "40px 36px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
      }}
    >
      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontWeight: 700,
          fontSize: 26,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: COLORS.textDim,
          textAlign: "center",
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: DISPLAY_FONT_FAMILY, fontWeight: 800, fontSize: 96, color: COLORS.accent, lineHeight: 1, textAlign: "center" }}>{value}</div>
      {caption && (
        <div style={{ fontFamily: FONT_FAMILY, fontWeight: 600, fontSize: 24, color: COLORS.text, textAlign: "center" }}>{caption}</div>
      )}
    </div>
  );

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {title && <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 40 }}>{title}</div>}
        <div style={{ display: "flex", flexDirection: isPortrait ? "column" : "row", alignItems: "center", gap: 32 }}>
          {panel(left.label, left.value, left.caption, leftOpacity, leftX, leftY)}
          {panel(right.label, right.value, right.caption, rightOpacity, rightX, rightY)}
        </div>
      </div>
    </SceneFrame>
  );
};
