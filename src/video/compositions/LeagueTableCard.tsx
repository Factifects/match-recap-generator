import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, DISPLAY_FONT_FAMILY, FONT_FAMILY, TITLE_STYLE, type PanelColorKey, type Orientation } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, slideIn } from "../motion";

interface TableRow {
  rank: number;
  label: string;
  value: number;
  highlight?: boolean;
}

const ROW_HEIGHT = 70;
const ROW_STAGGER_FRAMES = 5;

/** A full ranked multi-row table — league standings, top-scorer charts,
 * anything with more than the two entries PlayerComparison/StatBurst handle.
 * One row can be highlighted (e.g. the team the narration is actually
 * about) — the Tifo Football standings-table reference. Rows reveal top to
 * bottom on a stagger, like BarChart's bars, rather than appearing at once. */
export const LeagueTableCard: React.FC<{
  title: string;
  columnLabel: string;
  rowLabel?: string;
  rows: TableRow[];
  backgroundColor?: PanelColorKey;
  /** Not read — 760px width already comfortably fits the 1080px portrait
   * canvas, so this card needs no orientation-specific values. Accepted
   * purely so AnalysisVideo.tsx can pass it uniformly to every card. */
  orientation?: Orientation;
}> = ({ title, columnLabel, rowLabel = "Team", rows, backgroundColor }) => {
  const frame = useCurrentFrame();
  const titleOpacity = fadeIn(frame, 0, 10);
  const headerOpacity = fadeIn(frame, 6, 10);

  return (
    <SceneFrame backgroundColor={backgroundColor}>
      <div style={{ width: 760 }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 28, textAlign: "left" }}>{title}</div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            opacity: headerOpacity,
            paddingBottom: 10,
            borderBottom: `2px solid ${COLORS.border}`,
            fontFamily: FONT_FAMILY,
            fontWeight: 700,
            fontSize: 18,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: COLORS.textDim,
          }}
        >
          <div style={{ width: 52 }}>#</div>
          <div style={{ flex: 1 }}>{rowLabel}</div>
          <div>{columnLabel}</div>
        </div>

        {rows.map((row, index) => {
          const start = 14 + index * ROW_STAGGER_FRAMES;
          const opacity = fadeIn(frame, start, 12);
          const x = slideIn(frame, start, 12, 24);
          const color = row.highlight ? COLORS.highlight : COLORS.text;

          return (
            <div
              key={row.rank}
              style={{
                opacity,
                transform: `translateX(${x}px)`,
                height: ROW_HEIGHT,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: `1px solid ${COLORS.border}`,
                background: row.highlight ? "rgba(255,213,79,0.08)" : "transparent",
              }}
            >
              <div style={{ width: 52, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 32, color }}>{row.rank}</div>
              <div style={{ flex: 1, fontFamily: FONT_FAMILY, fontWeight: 700, fontSize: 30, color }}>{row.label}</div>
              <div style={{ fontFamily: DISPLAY_FONT_FAMILY, fontSize: 34, color }}>{row.value}</div>
            </div>
          );
        })}
      </div>
    </SceneFrame>
  );
};
