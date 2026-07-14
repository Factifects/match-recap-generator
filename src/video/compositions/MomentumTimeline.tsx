import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, FONT_FAMILY, TITLE_STYLE } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, drawIn } from "../motion";
import type { SharedVisualProps, MomentumTimelineData } from "../sharedVisualProps";

const TIMELINE_WIDTH = 720;
const BASELINE_Y = 90;
const PEAK_HEIGHT = 46;
const PHASE_STAGGER_FRAMES = 34;

// Portrait rotates the whole chart 90°: time runs top-to-bottom instead of
// left-to-right (same "chronology reads top-to-bottom" convention already
// used by CareerPathCard's portrait branch), and phases arch left (fall) or
// right (rise) from a vertical baseline instead of up/down from a
// horizontal one. Not a Pitch-based card at all, so this is a from-scratch
// vertical chart, not a coordinate-system swap like the tactical cards.
const TIMELINE_HEIGHT_PORTRAIT = 1400;
const BASELINE_X_PORTRAIT = 130;
const PEAK_WIDTH_PORTRAIT = 130;

/** A horizontal minute-axis where each named stretch of the match gets its
 * own arch — rising above the baseline in green for a stretch where threat
 * built, dipping below it in red for a stretch where it drained away —
 * instead of a single hill that only ever means "something happened here."
 * A match's whole rhythm (build, lull, build again) reads left-to-right
 * across the axis rather than needing a separate scene per beat. */
export const MomentumTimeline: React.FC<{ data: MomentumTimelineData } & SharedVisualProps> = ({
  data: { title, matchMinutes, phases },
  backgroundColor,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const titleOpacity = fadeIn(frame, 0, 14);
  const axisOpacity = fadeIn(frame, 4, 16);
  const pulse = 1 + Math.sin(frame / 9) * 0.12;

  if (isPortrait) {
    return (
      <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 24 }}>{title}</div>

          <svg width={340} height={TIMELINE_HEIGHT_PORTRAIT} viewBox={`0 0 340 ${TIMELINE_HEIGHT_PORTRAIT}`} style={{ overflow: "visible" }}>
            <defs>
              <linearGradient id="momentum-rise-v" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={COLORS.movement} stopOpacity={0.05} />
                <stop offset="100%" stopColor={COLORS.movement} stopOpacity={0.55} />
              </linearGradient>
              <linearGradient id="momentum-fall-v" x1="1" y1="0" x2="0" y2="0">
                <stop offset="0%" stopColor={COLORS.danger} stopOpacity={0.05} />
                <stop offset="100%" stopColor={COLORS.danger} stopOpacity={0.5} />
              </linearGradient>
            </defs>

            <g opacity={axisOpacity}>
              <line x1={BASELINE_X_PORTRAIT} y1={0} x2={BASELINE_X_PORTRAIT} y2={TIMELINE_HEIGHT_PORTRAIT} stroke={COLORS.border} strokeWidth={2} />
              <text x={BASELINE_X_PORTRAIT - 14} y={16} textAnchor="end" fontFamily={FONT_FAMILY} fontWeight={600} fontSize={16} fill={COLORS.textDim}>
                0&apos;
              </text>
              <text x={BASELINE_X_PORTRAIT - 14} y={TIMELINE_HEIGHT_PORTRAIT} textAnchor="end" fontFamily={FONT_FAMILY} fontWeight={600} fontSize={16} fill={COLORS.textDim}>
                {matchMinutes}&apos;
              </text>
            </g>

            {phases.map((phase, index) => {
              const start = 20 + index * PHASE_STAGGER_FRAMES;
              const sweepProgress = drawIn(frame, start, PHASE_STAGGER_FRAMES);
              const labelOpacity = fadeIn(frame, start + 16, 8);
              const markerOpacity = fadeIn(frame, start, 14);

              const startY = (phase.startMinute / matchMinutes) * TIMELINE_HEIGHT_PORTRAIT;
              const endY = (phase.endMinute / matchMinutes) * TIMELINE_HEIGHT_PORTRAIT;
              const midY = (startY + endY) / 2;
              const rising = phase.direction === "rise";
              const color = rising ? COLORS.movement : COLORS.danger;
              const fill = rising ? "url(#momentum-rise-v)" : "url(#momentum-fall-v)";
              const peakX = BASELINE_X_PORTRAIT + (rising ? PEAK_WIDTH_PORTRAIT : -PEAK_WIDTH_PORTRAIT) * sweepProgress;
              const labelX = rising ? peakX + 14 : peakX - 14;

              return (
                <g key={index}>
                  <path
                    d={`M ${BASELINE_X_PORTRAIT} ${startY} Q ${peakX} ${midY} ${BASELINE_X_PORTRAIT} ${endY} Z`}
                    fill={fill}
                    opacity={sweepProgress}
                  />
                  <path
                    d={`M ${BASELINE_X_PORTRAIT} ${startY} Q ${peakX} ${midY} ${BASELINE_X_PORTRAIT} ${endY}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={2.5}
                    opacity={sweepProgress}
                  />
                  <text
                    x={labelX}
                    y={midY}
                    textAnchor={rising ? "start" : "end"}
                    dominantBaseline="middle"
                    fontFamily={FONT_FAMILY}
                    fontWeight={700}
                    fontSize={20}
                    fill={COLORS.text}
                    opacity={labelOpacity}
                  >
                    {phase.label}
                  </text>
                  <circle cx={BASELINE_X_PORTRAIT} cy={startY} r={5 * pulse} fill={color} opacity={markerOpacity} />
                  <circle cx={BASELINE_X_PORTRAIT} cy={endY} r={5 * pulse} fill={color} opacity={markerOpacity} />
                </g>
              );
            })}
          </svg>
        </div>
      </SceneFrame>
    );
  }

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 24 }}>{title}</div>

        <svg width={TIMELINE_WIDTH} height={210} viewBox={`0 0 ${TIMELINE_WIDTH} 210`} style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id="momentum-rise" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={COLORS.movement} stopOpacity={0.05} />
              <stop offset="100%" stopColor={COLORS.movement} stopOpacity={0.55} />
            </linearGradient>
            <linearGradient id="momentum-fall" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.danger} stopOpacity={0.05} />
              <stop offset="100%" stopColor={COLORS.danger} stopOpacity={0.5} />
            </linearGradient>
          </defs>

          <g opacity={axisOpacity}>
            <line x1={0} y1={BASELINE_Y} x2={TIMELINE_WIDTH} y2={BASELINE_Y} stroke={COLORS.border} strokeWidth={2} />
            <text x={0} y={BASELINE_Y + 34} fontFamily={FONT_FAMILY} fontWeight={600} fontSize={16} fill={COLORS.textDim}>
              0&apos;
            </text>
            <text x={TIMELINE_WIDTH} y={BASELINE_Y + 34} textAnchor="end" fontFamily={FONT_FAMILY} fontWeight={600} fontSize={16} fill={COLORS.textDim}>
              {matchMinutes}&apos;
            </text>
          </g>

          {phases.map((phase, index) => {
            const start = 20 + index * PHASE_STAGGER_FRAMES;
            const sweepProgress = drawIn(frame, start, PHASE_STAGGER_FRAMES);
            const labelOpacity = fadeIn(frame, start + 16, 8);
            const markerOpacity = fadeIn(frame, start, 14);

            const startX = (phase.startMinute / matchMinutes) * TIMELINE_WIDTH;
            const endX = (phase.endMinute / matchMinutes) * TIMELINE_WIDTH;
            const midX = (startX + endX) / 2;
            const rising = phase.direction === "rise";
            const color = rising ? COLORS.movement : COLORS.danger;
            const fill = rising ? "url(#momentum-rise)" : "url(#momentum-fall)";
            const peakY = BASELINE_Y + (rising ? -PEAK_HEIGHT : PEAK_HEIGHT) * sweepProgress;
            const labelY = rising ? peakY - 16 : peakY + 30;

            return (
              <g key={index}>
                <path
                  d={`M ${startX} ${BASELINE_Y} Q ${midX} ${peakY} ${endX} ${BASELINE_Y} Z`}
                  fill={fill}
                  opacity={sweepProgress}
                />
                <path
                  d={`M ${startX} ${BASELINE_Y} Q ${midX} ${peakY} ${endX} ${BASELINE_Y}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.5}
                  opacity={sweepProgress}
                />
                <text
                  x={midX}
                  y={labelY}
                  textAnchor="middle"
                  fontFamily={FONT_FAMILY}
                  fontWeight={700}
                  fontSize={20}
                  fill={COLORS.text}
                  opacity={labelOpacity}
                >
                  {phase.label}
                </text>
                <circle cx={startX} cy={BASELINE_Y} r={5 * pulse} fill={color} opacity={markerOpacity} />
                <circle cx={endX} cy={BASELINE_Y} r={5 * pulse} fill={color} opacity={markerOpacity} />
              </g>
            );
          })}
        </svg>
      </div>
    </SceneFrame>
  );
};
