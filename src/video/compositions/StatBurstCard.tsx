import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, DISPLAY_FONT_FAMILY, FONT_FAMILY, TITLE_STYLE } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, scaleSettle } from "../motion";
import type { SharedVisualProps, StatBurstData } from "../sharedVisualProps";

function formatterFor(format: "integer" | "decimal"): (value: number) => string {
  return format === "decimal" ? (v) => v.toFixed(2) : (v) => String(Math.round(v));
}

/**
 * Data visualization, not a text caption — numbers count up while bars grow
 * into place, the card settling in with a quiet scale/fade instead of a
 * spring pop.
 */
export const StatBurstCard: React.FC<{ data: StatBurstData; leftColor?: string; rightColor?: string } & SharedVisualProps> = ({
  data: { label, leftLabel, leftValue, rightLabel, rightValue, format, prefix, suffix },
  leftColor = COLORS.homeTeam,
  rightColor = COLORS.awayTeam,
  backgroundColor,
  orientation,
}) => {
  const formatValue = formatterFor(format);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isPortrait = orientation === "portrait";

  const cardScale = scaleSettle(frame, 0, 16);
  const cardOpacity = fadeIn(frame, 0, 14);

  const countProgress = fadeIn(frame, 6, 20);
  const leftCount = Math.max(0, leftValue * countProgress);
  const rightCount = Math.max(0, rightValue * countProgress);

  const barGrowth = interpolate(frame, [14, 14 + fps * 0.7], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const total = leftValue + rightValue || 1;
  const leftShare = (leftValue / total) * 100 * barGrowth;
  const rightShare = (rightValue / total) * 100 * barGrowth;

  // Side-by-side at 1120px is wider than the entire 1080px portrait canvas —
  // portrait stacks the two values instead of shrinking them to fit
  // side-by-side, since a 168px number is the whole point of this card.
  const valueBlock = (value: number, valueColor: string, valueLabel: string, align: "left" | "right" | "center") => (
    <div style={{ textAlign: align }}>
      <div style={{ fontFamily: DISPLAY_FONT_FAMILY, fontWeight: 800, fontSize: 168, color: valueColor, lineHeight: 1 }}>
        {prefix}
        {formatValue(value)}
        {suffix}
      </div>
      <div style={{ fontFamily: FONT_FAMILY, fontWeight: 600, fontSize: 34, color: COLORS.text, marginTop: 6 }}>{valueLabel}</div>
    </div>
  );

  return (
    <SceneFrame backgroundColor={backgroundColor}>
      <div style={{ opacity: cardOpacity, transform: `scale(${cardScale})`, width: isPortrait ? 640 : 1120 }}>
        <div style={{ ...TITLE_STYLE, marginBottom: 32 }}>{label}</div>

        {isPortrait ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, marginBottom: 24 }}>
            {valueBlock(leftCount, leftColor, leftLabel, "center")}
            {valueBlock(rightCount, rightColor, rightLabel, "center")}
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
            {valueBlock(leftCount, leftColor, leftLabel, "left")}
            {valueBlock(rightCount, rightColor, rightLabel, "right")}
          </div>
        )}

        <div
          style={{
            display: "flex",
            width: "100%",
            height: 20,
            borderRadius: 10,
            overflow: "hidden",
            background: COLORS.panel,
          }}
        >
          <div style={{ width: `${leftShare}%`, background: leftColor, transition: "none" }} />
          <div style={{ flex: 1 }} />
          <div style={{ width: `${rightShare}%`, background: rightColor, transition: "none" }} />
        </div>
      </div>
    </SceneFrame>
  );
};
