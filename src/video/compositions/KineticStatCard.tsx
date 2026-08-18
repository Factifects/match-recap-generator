import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, DISPLAY_FONT_FAMILY } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { WordCaptionOverlay } from "./WordCaptionOverlay";
import { CANVAS_ICON_COMPONENTS } from "../canvasIcons";
import { buildSmoothPath, lerp } from "../curveMath";
import { fadeIn, scaleSettle } from "../motion";
import type { SharedVisualProps, KineticStatData } from "../sharedVisualProps";

// A short kinetic-typography stat BEAT — plain background, a climbing line
// chart, and an icon grid that fills in as ONE shared reveal, for a single
// point in a multi-scene Short (traffic climbing -> instances spinning up,
// retries piling up -> a connection pool filling). Registered in
// visualComponents.tsx like every other visual kind, so it composes with the
// existing script/segment pipeline (real per-segment TTS duration via
// resolveSegmentAudio, multiple beats cut together via TransitionSeries) —
// earlier revisions of this tried to hand-roll a standalone multi-beat
// sequencer; that's exactly what AnalysisVideo's TransitionSeries already
// does for every other scene type, so this reuses it instead.
//
// The reveal is DELIBERATELY FAST AND FIXED (see REVEAL_DURATION_FRAMES),
// not scaled to fill however long the scene's real narration turns out to
// be — a first pass tied the reveal to the whole clip length and produced a
// slow, mostly-static single scene that felt like a screensaver, not a beat.
// Chart + grid finish climbing well under 2s, then hold their settled state
// for the rest of the scene while the caption keeps pace with narration.
//
// Deliberately no character/mascot slot — the reference frame this was
// designed from used a copyrighted third-party cartoon character, which
// isn't something to reproduce. An original illustrated figure can be
// layered in later as its own field once one exists.

const CHART_W = 640;
const CHART_H = 380;
const REVEAL_LEAD_IN_FRAMES = 5;
const REVEAL_DURATION_FRAMES = 40; // ~1.3s @ 30fps — fast, not clock-filling
const GRID_COLUMNS = 5;
const CARD_SIZE = 118;
const CARD_GAP = 16;

export const KineticStatCard: React.FC<{ data: KineticStatData } & SharedVisualProps> = ({
  data: { title, points: dataPoints, unitIcon, unitCount, badgeLabel },
  orientation,
  durationInFrames,
  narrationText,
}) => {
  const frame = useCurrentFrame();
  const Icon = CANVAS_ICON_COMPONENTS[unitIcon];
  const accentColor = COLORS.highlight;
  const totalFrames = durationInFrames ?? 150;

  const n = dataPoints.length;
  const values = dataPoints.map((p) => p.value);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(...values);
  const valueSpan = maxValue - minValue || 1;

  const revealStart = REVEAL_LEAD_IN_FRAMES;
  // Clamped so a very short scene (a fast cutaway beat) still finishes its
  // reveal before the scene ends, rather than overrunning into the next cut.
  const revealEnd = Math.min(revealStart + REVEAL_DURATION_FRAMES, Math.max(revealStart + 10, totalFrames - 6));
  const progress = interpolate(frame, [revealStart, revealEnd], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const titleOpacity = fadeIn(frame, 0, 8);

  const xForIndex = (i: number) => (i / (n - 1)) * CHART_W;
  const yForValue = (v: number) => CHART_H - ((v - minValue) / valueSpan) * CHART_H;
  const chartPoints = dataPoints.map((p, i) => ({ x: xForIndex(i), y: yForValue(p.value) }));
  const curvePath = buildSmoothPath(chartPoints);
  const firstX = chartPoints[0].x;
  const lastX = chartPoints[chartPoints.length - 1].x;
  const areaPath = `${curvePath} L ${lastX} ${CHART_H} L ${firstX} ${CHART_H} Z`;

  const edgeFloat = progress * (n - 1);
  const edgeIndex = Math.max(0, Math.min(n - 2, Math.floor(edgeFloat)));
  const edgeT = edgeFloat - edgeIndex;
  const edgeValue = lerp(values[edgeIndex], values[edgeIndex + 1], edgeT);
  const edgeX = progress * CHART_W;
  const edgeY = yForValue(edgeValue);
  const settled = frame >= revealEnd;
  const badgeOpacity = fadeIn(frame, revealEnd - 6, 10);

  const clipId = `kinetic-stat-${title.replace(/[^a-z0-9]/gi, "").slice(0, 24)}`;

  const revealedCards = Math.round(progress * unitCount);
  const gridWidth = GRID_COLUMNS * CARD_SIZE + (GRID_COLUMNS - 1) * CARD_GAP;
  const isPortrait = orientation === "portrait";

  return (
    <SceneFrame orientation={orientation}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: isPortrait ? 30 : 20, paddingBottom: isPortrait ? 140 : 0 }}>
        <div
          style={{
            opacity: titleOpacity,
            fontFamily: DISPLAY_FONT_FAMILY,
            fontWeight: 800,
            fontSize: 34,
            letterSpacing: 3,
            color: COLORS.text,
            textTransform: "uppercase",
          }}
        >
          {title}
        </div>

        <svg width={CHART_W + 60} height={CHART_H + 20} viewBox={`-10 -10 ${CHART_W + 60} ${CHART_H + 20}`} style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id={`${clipId}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accentColor} stopOpacity={0.4} />
              <stop offset="100%" stopColor={accentColor} stopOpacity={0.03} />
            </linearGradient>
            <clipPath id={clipId}>
              <rect x={-10} y={-10} width={Math.max(0, progress * CHART_W + 20)} height={CHART_H + 20} />
            </clipPath>
          </defs>

          <line x1={0} y1={CHART_H} x2={CHART_W} y2={CHART_H} stroke={COLORS.border} strokeWidth={2} />

          <g clipPath={`url(#${clipId})`}>
            <path d={areaPath} fill={`url(#${clipId}-fill)`} />
            <path d={curvePath} fill="none" stroke={accentColor} strokeWidth={6} strokeLinecap="round" />
          </g>

          <g transform={`translate(${edgeX}, ${edgeY}) scale(${settled ? scaleSettle(frame - revealEnd, 0, 12, 1.15) : 1})`}>
            <circle r={10} fill={accentColor} />
          </g>

          {badgeLabel && (
            <g transform={`translate(${CHART_W - 20}, -6)`} opacity={badgeOpacity}>
              <rect x={-56} y={-30} width={80} height={44} rx={12} fill={COLORS.panel} stroke={accentColor} strokeWidth={2} />
              <text x={-16} y={0} textAnchor="middle" fontFamily={DISPLAY_FONT_FAMILY} fontWeight={900} fontSize={26} fill={accentColor}>
                {badgeLabel}
              </text>
            </g>
          )}
        </svg>

        <div style={{ width: gridWidth, display: "grid", gridTemplateColumns: `repeat(${GRID_COLUMNS}, ${CARD_SIZE}px)`, gap: CARD_GAP }}>
          {Array.from({ length: unitCount }, (_, i) => {
            const isRevealed = i < revealedCards;
            // Each card pops the instant the shared progress crosses ITS OWN
            // threshold (i / unitCount) — the grid filling in IS the metric
            // climbing, not a decoration playing alongside it. Since the
            // whole reveal is now fast (REVEAL_DURATION_FRAMES), this stagger
            // reads as a quick ripple across the grid, not a slow trickle.
            const thresholdFrame = revealStart + (i / unitCount) * (revealEnd - revealStart);
            const opacity = isRevealed ? fadeIn(frame, thresholdFrame, 8) : 0;
            const scale = isRevealed ? scaleSettle(frame, thresholdFrame, 10, 0.7) : 0.7;
            return (
              <div
                key={i}
                style={{
                  opacity,
                  transform: `scale(${scale})`,
                  width: CARD_SIZE,
                  height: CARD_SIZE,
                  borderRadius: 16,
                  background: COLORS.panel,
                  border: `1px solid ${COLORS.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {Icon && <Icon width={44} height={44} fill={COLORS.textDim} />}
              </div>
            );
          })}
        </div>
      </div>
      {narrationText && <WordCaptionOverlay text={narrationText} durationInFrames={totalFrames} />}
    </SceneFrame>
  );
};
