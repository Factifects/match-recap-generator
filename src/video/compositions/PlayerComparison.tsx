import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, DISPLAY_FONT_FAMILY, FONT_FAMILY } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, slideIn } from "../motion";
import type { SharedVisualProps, PlayerComparisonData } from "../sharedVisualProps";

const ROW_STAGGER_FRAMES = 8;
const ROW_HEIGHT = 74;

function formatValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/** Side-by-side, row-by-row comparison of two named players across whatever
 * stats the narration is discussing — a generalization of StatBurstCard's
 * single two-value comparison into multiple rows under one head-to-head. */
export const PlayerComparison: React.FC<{ data: PlayerComparisonData } & SharedVisualProps> = ({
  data: { leftPlayer, rightPlayer, stats },
  backgroundColor,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";

  const headerOpacity = fadeIn(frame, 0, 14);

  return (
    <SceneFrame backgroundColor={backgroundColor}>
      <div style={{ width: isPortrait ? 900 : 1100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", opacity: headerOpacity, marginBottom: 36 }}>
          <div style={{ fontFamily: DISPLAY_FONT_FAMILY, fontWeight: 800, fontSize: 62, color: COLORS.homeTeam }}>{leftPlayer}</div>
          <div style={{ fontFamily: DISPLAY_FONT_FAMILY, fontWeight: 800, fontSize: 62, color: COLORS.awayTeam }}>{rightPlayer}</div>
        </div>

        {stats.map((row, index) => {
          const start = 16 + index * ROW_STAGGER_FRAMES;
          const opacity = fadeIn(frame, start, 12);
          const y = slideIn(frame, start, 12, 16);
          const countProgress = fadeIn(frame, start + 4, 16);
          const leftValue = row.left * countProgress;
          const rightValue = row.right * countProgress;

          const total = row.left + row.right || 1;
          const leftShare = (row.left / total) * 100;
          const rightShare = (row.right / total) * 100;
          const barGrowth = fadeIn(frame, start + 10, 14);

          return (
            <div key={row.label} style={{ opacity, transform: `translateY(${y}px)`, height: ROW_HEIGHT }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontFamily: DISPLAY_FONT_FAMILY, fontWeight: 800, fontSize: 48, color: COLORS.homeTeam, minWidth: 120 }}>
                  {formatValue(leftValue)}
                </div>
                <div
                  style={{
                    fontFamily: FONT_FAMILY,
                    fontWeight: 700,
                    fontSize: 22,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    color: COLORS.textDim,
                    textAlign: "center",
                  }}
                >
                  {row.label}
                </div>
                <div style={{ fontFamily: DISPLAY_FONT_FAMILY, fontWeight: 800, fontSize: 48, color: COLORS.awayTeam, minWidth: 120, textAlign: "right" }}>
                  {formatValue(rightValue)}
                </div>
              </div>
              <div style={{ display: "flex", width: "100%", height: 6, borderRadius: 3, overflow: "hidden", background: COLORS.panel, marginTop: 10 }}>
                <div style={{ width: `${leftShare * barGrowth}%`, background: COLORS.homeTeam }} />
                <div style={{ flex: 1 }} />
                <div style={{ width: `${rightShare * barGrowth}%`, background: COLORS.awayTeam }} />
              </div>
            </div>
          );
        })}
      </div>
    </SceneFrame>
  );
};
