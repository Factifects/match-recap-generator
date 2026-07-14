import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, FONT_FAMILY, TITLE_STYLE } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, drawIn, scaleSettle } from "../motion";
import type { SharedVisualProps, CareerPathData } from "../sharedVisualProps";

const PATH_WIDTH = 1500;
// Portrait swaps the left-to-right timeline for a top-to-bottom one — 1500px
// is wider than the entire portrait canvas, but the 1920px-tall frame has
// plenty of room to stack stops vertically instead.
const PATH_HEIGHT_PORTRAIT = 820;
const STOP_GAP_FRAMES = 14;

/** A player's or manager's history as a left-to-right journey — a connecting
 * line draws across as each stop pops in, rather than Sequence's vertical
 * stacked-beats layout. For "here's the path that led here" narration (a
 * managerial CV, a transfer history), distinct from Sequence's use for
 * connected in-match moments. */
export const CareerPathCard: React.FC<{ data: CareerPathData } & SharedVisualProps> = ({
  data: { title, stops },
  backgroundColor,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const titleOpacity = fadeIn(frame, 0, 10);

  const count = Math.max(stops.length - 1, 1);
  const stopPos = (index: number) => {
    const axisLength = isPortrait ? PATH_HEIGHT_PORTRAIT : PATH_WIDTH;
    return stops.length === 1 ? axisLength / 2 : (index / count) * axisLength;
  };

  const lineStart = 14;
  const lineDuration = stops.length * STOP_GAP_FRAMES;
  const lineProgress = drawIn(frame, lineStart, lineDuration);

  if (isPortrait) {
    // Vertical timeline: line runs top-to-bottom at a fixed x, stops space
    // out along y, label/period sit to the right of each circle rather than
    // above/below it (there's no room to the side of a 1080px-wide frame for
    // a second column, but there's plenty of vertical room for this axis
    // flip).
    const axisX = 90;
    const svgWidth = 620;
    return (
      <SceneFrame backgroundColor={backgroundColor}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 40 }}>{title}</div>

          <svg width={svgWidth} height={PATH_HEIGHT_PORTRAIT} viewBox={`0 0 ${svgWidth} ${PATH_HEIGHT_PORTRAIT}`} style={{ overflow: "visible" }}>
            <line x1={axisX} y1={0} x2={axisX} y2={PATH_HEIGHT_PORTRAIT} stroke={COLORS.border} strokeWidth={2} />
            <line
              x1={axisX}
              y1={0}
              x2={axisX}
              y2={PATH_HEIGHT_PORTRAIT}
              stroke={COLORS.accent}
              strokeWidth={3}
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - lineProgress}
            />

            {stops.map((stop, index) => {
              const start = lineStart + index * STOP_GAP_FRAMES;
              const scale = scaleSettle(frame, start, 14);
              const opacity = fadeIn(frame, start, 10);
              const cy = stopPos(index);
              const isLast = index === stops.length - 1;

              return (
                <g key={index} opacity={opacity}>
                  <circle
                    cx={axisX}
                    cy={cy}
                    r={isLast ? 12 : 9}
                    fill={isLast ? COLORS.accent : COLORS.panel}
                    stroke={COLORS.accent}
                    strokeWidth={2.5}
                    style={{ transformOrigin: `${axisX}px ${cy}px`, transform: `scale(${scale})` }}
                  />
                  <text x={axisX + 32} y={cy - 6} textAnchor="start" fontFamily={FONT_FAMILY} fontWeight={700} fontSize={28} fill={COLORS.text}>
                    {stop.label}
                  </text>
                  <text x={axisX + 32} y={cy + 26} textAnchor="start" fontFamily={FONT_FAMILY} fontWeight={500} fontSize={20} fill={COLORS.textDim}>
                    {stop.period}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </SceneFrame>
    );
  }

  return (
    <SceneFrame backgroundColor={backgroundColor}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 56 }}>{title}</div>

        <svg width={PATH_WIDTH} height={160} viewBox={`0 0 ${PATH_WIDTH} 160`} style={{ overflow: "visible" }}>
          <line x1={0} y1={80} x2={PATH_WIDTH} y2={80} stroke={COLORS.border} strokeWidth={2} />
          <line
            x1={0}
            y1={80}
            x2={PATH_WIDTH}
            y2={80}
            stroke={COLORS.accent}
            strokeWidth={3}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - lineProgress}
          />

          {stops.map((stop, index) => {
            const start = lineStart + index * STOP_GAP_FRAMES;
            const scale = scaleSettle(frame, start, 14);
            const opacity = fadeIn(frame, start, 10);
            const cx = stopPos(index);
            const isLast = index === stops.length - 1;

            return (
              <g key={index} opacity={opacity}>
                <circle
                  cx={cx}
                  cy={80}
                  r={isLast ? 12 : 9}
                  fill={isLast ? COLORS.accent : COLORS.panel}
                  stroke={COLORS.accent}
                  strokeWidth={2.5}
                  style={{ transformOrigin: `${cx}px 80px`, transform: `scale(${scale})` }}
                />
                <text x={cx} y={44} textAnchor="middle" fontFamily={FONT_FAMILY} fontWeight={700} fontSize={25} fill={COLORS.text}>
                  {stop.label}
                </text>
                <text x={cx} y={114} textAnchor="middle" fontFamily={FONT_FAMILY} fontWeight={500} fontSize={18} fill={COLORS.textDim}>
                  {stop.period}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </SceneFrame>
  );
};
