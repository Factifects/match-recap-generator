import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, DISPLAY_FONT_FAMILY, FONT_FAMILY, type PanelColorKey, type Orientation } from "../theme";

// A fixed, ordered palette rather than colorForCharacter's name-hash — two
// segment labels can hash to the same color by coincidence (confirmed via a
// still render: a 5/1 confederation split rendered both slices in the same
// gold), which is fatal for a chart whose entire point is a share-of-whole
// comparison. Index-based color is also more legible: the first/largest
// segment is always the same color scene to scene.
const SLICE_PALETTE = ["#4f6bff", "#e6a24f", "#3ddc97", "#ff5a5f", "#b596ff", "#38bdf8"];
import { SceneFrame } from "./SceneFrame";
import { fadeIn, drawIn } from "../motion";

interface Segment {
  label: string;
  value: number;
}

const SIZE = 640;
const CENTER = SIZE / 2;
const RADIUS = 182;
const STROKE_WIDTH = 62;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SLICE_STAGGER_FRAMES = 8;
const LABEL_RADIUS = RADIUS + STROKE_WIDTH / 2 + 46;

/** Doughnut chart: each slice grows in around the ring on its own staggered
 * spring, with its percentage labeled just outside the ring and the total
 * shown in the center hole — for a value that's naturally a share-of-whole
 * rather than a two-way comparison or a category breakdown. */
export const DonutChartCard: React.FC<{
  title: string;
  segments: Segment[];
  backgroundColor?: PanelColorKey;
  /** Not read — a fixed 640px square already fits the 1080px portrait canvas
   * with room to spare. */
  orientation?: Orientation;
}> = ({ title, segments, backgroundColor }) => {
  const frame = useCurrentFrame();
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;

  const titleOpacity = fadeIn(frame, 26, 10);

  let cumulativeAngle = -90;

  return (
    <SceneFrame backgroundColor={backgroundColor}>
      <div style={{ position: "relative", width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {segments.map((segment, index) => {
            const share = segment.value / total;
            const sliceLength = share * CIRCUMFERENCE;
            const startAngle = cumulativeAngle;
            cumulativeAngle += share * 360;

            const start = index * SLICE_STAGGER_FRAMES;
            const growth = drawIn(frame, start, 18);
            const drawnLength = interpolate(growth, [0, 1], [0, sliceLength]);
            const color = SLICE_PALETTE[index % SLICE_PALETTE.length];

            const midAngleRad = ((startAngle + (share * 360) / 2) * Math.PI) / 180;
            const labelX = CENTER + LABEL_RADIUS * Math.cos(midAngleRad);
            const labelY = CENTER + LABEL_RADIUS * Math.sin(midAngleRad);
            const labelOpacity = fadeIn(frame, start + 14, 8);

            return (
              <React.Fragment key={segment.label}>
                <circle
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                  fill="none"
                  stroke={color}
                  strokeWidth={STROKE_WIDTH}
                  strokeDasharray={`${drawnLength} ${CIRCUMFERENCE - drawnLength}`}
                  strokeDashoffset={-((startAngle + 90) / 360) * CIRCUMFERENCE}
                  transform="rotate(0)"
                  style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
                />
                <text
                  x={labelX}
                  y={labelY}
                  fill={color}
                  opacity={labelOpacity}
                  fontFamily={DISPLAY_FONT_FAMILY}
                  fontSize={42}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {Math.round(share * 100)}%
                </text>
              </React.Fragment>
            );
          })}
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            opacity: titleOpacity,
          }}
        >
          <div style={{ fontFamily: DISPLAY_FONT_FAMILY, fontSize: 92, color: COLORS.text, lineHeight: 1 }}>
            {Number.isInteger(total) ? total : total.toFixed(2)}
          </div>
          <div
            style={{
              marginTop: 12,
              fontFamily: FONT_FAMILY,
              fontWeight: 800,
              fontSize: 24,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: COLORS.text,
              textAlign: "center",
              maxWidth: 320,
            }}
          >
            {title}
          </div>
        </div>
      </div>
    </SceneFrame>
  );
};
