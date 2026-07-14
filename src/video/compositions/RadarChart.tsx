import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, FONT_FAMILY, TITLE_STYLE, colorForCharacter } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, scaleSettle } from "../motion";
import type { SharedVisualProps, RadarData } from "../sharedVisualProps";

const SIZE = 640;
const CENTER = SIZE / 2;
const RADIUS = 240;
const RINGS = [0.25, 0.5, 0.75, 1];

function axisPoint(index: number, axisCount: number, radiusFraction: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index / axisCount) * Math.PI * 2;
  return {
    x: CENTER + Math.cos(angle) * RADIUS * radiusFraction,
    y: CENTER + Math.sin(angle) * RADIUS * radiusFraction,
  };
}

function polygonPoints(values: number[]): string {
  return values.map((value, i) => axisPoint(i, values.length, Math.max(0, Math.min(100, value)) / 100)).map((p) => `${p.x},${p.y}`).join(" ");
}

/** A multi-axis profile chart — several categories arranged radially, one
 * closed polygon per series (1 or 2, for a single profile or a head-to-head).
 * For "this team's overall shape across N metrics at once" rather than a
 * single number or a two-value comparison. Each series' polygon grows in
 * from the center (a quiet scale settle, not a spring pop), and the grid/
 * axis labels fade in first so the scale reads before the data does. */
export const RadarChart: React.FC<{ data: RadarData } & SharedVisualProps> = ({ data: { title, axes, series }, backgroundColor }) => {
  const frame = useCurrentFrame();
  const titleOpacity = fadeIn(frame, 0, 14);
  const gridOpacity = fadeIn(frame, 6, 16);
  const labelOpacity = fadeIn(frame, 14, 14);

  return (
    <SceneFrame backgroundColor={backgroundColor}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 24 }}>{title}</div>

        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ overflow: "visible" }}>
          <g opacity={gridOpacity}>
            {RINGS.map((ring) => (
              <polygon
                key={ring}
                points={polygonPoints(axes.map(() => ring * 100))}
                fill="none"
                stroke={COLORS.border}
                strokeWidth={1}
              />
            ))}
            {axes.map((_, i) => {
              const p = axisPoint(i, axes.length, 1);
              return <line key={i} x1={CENTER} y1={CENTER} x2={p.x} y2={p.y} stroke={COLORS.border} strokeWidth={1} />;
            })}
          </g>

          {axes.map((axis, i) => {
            const p = axisPoint(i, axes.length, 1.16);
            return (
              <text
                key={axis}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily={FONT_FAMILY}
                fontWeight={600}
                fontSize={16}
                fill={COLORS.textDim}
                opacity={labelOpacity}
              >
                {axis}
              </text>
            );
          })}

          {series.map((s, index) => {
            const color = s.color ?? (index === 0 ? COLORS.accent : colorForCharacter(s.label));
            const start = 24 + index * 10;
            const scale = scaleSettle(frame, start, 20, 0.4);
            const opacity = fadeIn(frame, start, 16);
            return (
              <polygon
                key={s.label}
                points={polygonPoints(s.values)}
                fill={color}
                fillOpacity={0.18}
                stroke={color}
                strokeWidth={2.5}
                opacity={opacity}
                style={{ transformOrigin: `${CENTER}px ${CENTER}px`, transform: `scale(${scale})` }}
              />
            );
          })}
        </svg>

        {series.length > 1 && (
          <div style={{ display: "flex", gap: 32, marginTop: 8, opacity: labelOpacity }}>
            {series.map((s, index) => {
              const color = s.color ?? (index === 0 ? COLORS.accent : colorForCharacter(s.label));
              return (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, background: color }} />
                  <div style={{ fontFamily: FONT_FAMILY, fontWeight: 600, fontSize: 18, color: COLORS.text }}>{s.label}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SceneFrame>
  );
};
