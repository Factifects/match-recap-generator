import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, DISPLAY_FONT_FAMILY, FONT_FAMILY, TITLE_STYLE } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, slideIn, pulse, resolveRevealOrder } from "../motion";
import type { SharedVisualProps, LeagueTableData } from "../sharedVisualProps";

const ROW_HEIGHT = 88;
const ROW_STAGGER_FRAMES = 5;
const RANK_COLUMN_WIDTH = 64;
const STAT_COLUMN_WIDTH = 150;
// Portrait's canvas is only 1080px wide — a real 6-column standings table at
// landscape's column widths would run past 1400px and clip off both edges.
// Narrower columns/rank gutter here, not narrower text everywhere — the
// single-column case still gets a wide, readable table in portrait too.
const RANK_COLUMN_WIDTH_PORTRAIT = 44;
const STAT_COLUMN_WIDTH_PORTRAIT = 84;

/** A full ranked multi-row table — league standings, top-scorer charts,
 * anything with more than the two entries PlayerComparison/StatBurst handle.
 * One row can be highlighted (e.g. the team the narration is actually
 * about) — the Tifo Football standings-table reference. Rows reveal top to
 * bottom on a stagger, like BarChart's bars, rather than appearing at once.
 * Sized against BarChartCard's own scale (68px values) rather than a size
 * that reads small next to every sibling card on the same 1920x1080 canvas. */
export const LeagueTableCard: React.FC<{ data: LeagueTableData } & SharedVisualProps> = ({
  data: { title, columnLabel, columnLabels, rowLabel = "Team", rows },
  backgroundColor,
  orientation,
  animation,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleOpacity = fadeIn(frame, 0, 10);
  const staggerFrames =
    animation?.staggerSeconds !== undefined ? Math.round(animation.staggerSeconds * fps) : ROW_STAGGER_FRAMES;
  const revealOrder = animation?.focusOrder ? resolveRevealOrder(animation.focusOrder, rows.length) : null;
  const headerOpacity = fadeIn(frame, 6, 10);
  const isPortrait = orientation === "portrait";
  // Real standings (MP/W/D/L/GD/Pts) or a multi-stat leaderboard (Goals/
  // Assists/xG) instead of one proportional-bar column — only when the
  // author supplies `columnLabels`; a plain single-column table (still the
  // common case) renders exactly as before.
  const isMultiColumn = !!columnLabels && columnLabels.length > 0;
  const rankColumnWidth = isPortrait ? RANK_COLUMN_WIDTH_PORTRAIT : RANK_COLUMN_WIDTH;
  const statColumnWidth = isPortrait ? STAT_COLUMN_WIDTH_PORTRAIT : STAT_COLUMN_WIDTH;
  const width = isMultiColumn
    ? rankColumnWidth + (isPortrait ? 220 : 460) + columnLabels!.length * statColumnWidth
    : isPortrait
      ? 900
      : 1100;
  const statFontSize = isPortrait ? 24 : 34;
  const rankFontSize = isPortrait ? 28 : 40;
  const labelFontSize = isPortrait ? 26 : 38;
  const headerFontSize = isPortrait ? 16 : 22;

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div style={{ width }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 36, textAlign: "left" }}>{title}</div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            opacity: headerOpacity,
            paddingBottom: 14,
            borderBottom: `2px solid ${COLORS.border}`,
            fontFamily: FONT_FAMILY,
            fontWeight: 700,
            fontSize: headerFontSize,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: COLORS.textDim,
          }}
        >
          <div style={{ width: rankColumnWidth }}>#</div>
          <div style={{ flex: 1 }}>{rowLabel}</div>
          {isMultiColumn ? (
            columnLabels!.map((label) => (
              <div key={label} style={{ width: statColumnWidth, textAlign: "right" }}>
                {label}
              </div>
            ))
          ) : (
            <div>{columnLabel}</div>
          )}
        </div>

        {rows.map((row, index) => {
          const revealPosition = revealOrder ? revealOrder[index] : index;
          const start = 14 + revealPosition * staggerFrames;
          const opacity = fadeIn(frame, start, 12);
          const x = slideIn(frame, start, 12, 24);
          const rowScale = animation?.pulse ? pulse(frame, 90, 0.985, 1.015, index * 0.6) : 1;
          const color = row.highlight ? COLORS.highlight : COLORS.text;
          const columns = row.columns ?? [row.value];

          return (
            <div
              key={row.rank}
              style={{
                opacity,
                transform: `translateX(${x}px) scale(${rowScale})`,
                height: ROW_HEIGHT,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: `1px solid ${COLORS.border}`,
                background: row.highlight ? "rgba(255,213,79,0.08)" : "transparent",
              }}
            >
              <div style={{ width: rankColumnWidth, fontFamily: DISPLAY_FONT_FAMILY, fontSize: rankFontSize, color }}>{row.rank}</div>
              <div style={{ flex: 1, fontFamily: FONT_FAMILY, fontWeight: 700, fontSize: labelFontSize, color }}>{row.label}</div>
              {isMultiColumn ? (
                columnLabels!.map((label, colIndex) => (
                  <div key={label} style={{ width: statColumnWidth, textAlign: "right", fontFamily: DISPLAY_FONT_FAMILY, fontSize: statFontSize, color }}>
                    {columns[colIndex] ?? "–"}
                  </div>
                ))
              ) : (
                <div style={{ fontFamily: DISPLAY_FONT_FAMILY, fontSize: isPortrait ? 36 : 46, color }}>{row.value}</div>
              )}
            </div>
          );
        })}
      </div>
    </SceneFrame>
  );
};
