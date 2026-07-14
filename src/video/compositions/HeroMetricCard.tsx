import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, DISPLAY_FONT_FAMILY, FONT_FAMILY } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, drawIn } from "../motion";
import type { SharedVisualProps, HeroMetricData } from "../sharedVisualProps";

const BAR_WIDTH = 520;

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** One number given the entire frame — eyebrow label, then a proportional
 * bar, then the giant value, then subtext, in that reading order. Where
 * SingleStatCard/StatBurstCard are the "just a number" and "two numbers"
 * cards, this is the "this ONE number is what the scene is about" card —
 * more visual hierarchy for the single figure that deserves the whole beat. */
export const HeroMetricCard: React.FC<{ data: HeroMetricData } & SharedVisualProps> = ({
  data: { label, value, prefix, suffix, subtext, barProgress },
  backgroundColor,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const barWidth = isPortrait ? BAR_WIDTH * 0.7 : BAR_WIDTH;

  const labelOpacity = fadeIn(frame, 0, 12);
  const barGrowth = barProgress !== undefined ? drawIn(frame, 10, 22) : 0;
  const countProgress = fadeIn(frame, 20, 26);
  const count = value * countProgress;
  const subtextOpacity = fadeIn(frame, 50, 14);

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          style={{
            opacity: labelOpacity,
            fontFamily: FONT_FAMILY,
            fontWeight: 700,
            fontSize: 28,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: COLORS.textDim,
            marginBottom: 22,
          }}
        >
          {label}
        </div>
        {barProgress !== undefined && (
          <div style={{ width: barWidth, height: 14, borderRadius: 7, background: COLORS.panel, overflow: "hidden", marginBottom: 34 }}>
            <div style={{ width: `${barProgress * barGrowth * 100}%`, height: "100%", background: COLORS.accent }} />
          </div>
        )}
        <div style={{ fontFamily: DISPLAY_FONT_FAMILY, fontSize: isPortrait ? 190 : 240, color: COLORS.accent, lineHeight: 1 }}>
          {prefix}
          {formatValue(count)}
          {suffix}
        </div>
        {subtext && (
          <div
            style={{
              marginTop: 26,
              opacity: subtextOpacity,
              fontFamily: FONT_FAMILY,
              fontWeight: 600,
              fontSize: 36,
              color: COLORS.text,
              textAlign: "center",
            }}
          >
            {subtext}
          </div>
        )}
      </div>
    </SceneFrame>
  );
};
