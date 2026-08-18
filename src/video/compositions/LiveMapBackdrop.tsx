import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

// A persistent "the system is live" backdrop — a city-block street grid with
// small vehicle dots continuously drifting along it, on a loop, completely
// independent of narration timing. This is the missing ingredient behind the
// "cumulative canvas" format (CLAUDE.md's priority-3 roadmap item, not
// previously built against): a scene that never cuts away needs SOMETHING
// moving in the background the whole time, or "persistent" just reads as
// "static." Diagram/UI content renders on TOP of this, unaffected by it —
// this stays low-contrast and background-only on purpose (the doctrine's
// "largely static frame, highlight-and-dim" rule applies to the FOREGROUND
// subject, not to this ambient layer, but it still must never compete with
// it for attention).
//
// Deliberately not tied to any specific brand's map style — a generic dark
// street grid with anonymous vehicle dots reads as "a live location system"
// in the abstract, the same way this project's existing diagram vocabulary
// stays generic (a "database" shape, not a specific vendor's UI chrome)
// unless a scene is specifically about a named brand.

const GRID_SPACING = 90; // px between streets at 1080p width
const STREET_COLOR = "rgba(160, 175, 200, 0.22)";
const VEHICLE_COLOR = "#7fa8ff";
const VEHICLE_GLOW = "rgba(127, 168, 255, 0.35)";

// Fixed seed set (not Math.random()) so the same scene renders identically
// frame to frame and run to run — 14 vehicles, mixed horizontal/vertical,
// mixed lane index and speed so they don't all move in visible lockstep.
const VEHICLES: { axis: "h" | "v"; lane: number; speed: number; offset: number }[] = [
  { axis: "h", lane: 1, speed: 38, offset: 0.1 },
  { axis: "h", lane: 3, speed: 52, offset: 0.6 },
  { axis: "h", lane: 4, speed: 30, offset: 0.3 },
  { axis: "h", lane: 6, speed: 45, offset: 0.8 },
  { axis: "h", lane: 8, speed: 34, offset: 0.45 },
  { axis: "h", lane: 9, speed: 48, offset: 0.15 },
  { axis: "h", lane: 11, speed: 40, offset: 0.7 },
  { axis: "v", lane: 2, speed: 42, offset: 0.2 },
  { axis: "v", lane: 3, speed: 33, offset: 0.55 },
  { axis: "v", lane: 5, speed: 50, offset: 0.05 },
  { axis: "v", lane: 6, speed: 36, offset: 0.65 },
  { axis: "v", lane: 8, speed: 44, offset: 0.35 },
  { axis: "v", lane: 9, speed: 29, offset: 0.9 },
  { axis: "v", lane: 11, speed: 47, offset: 0.5 },
];

export const LiveMapBackdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;

  const cols = Math.ceil(width / GRID_SPACING) + 1;
  const rows = Math.ceil(height / GRID_SPACING) + 1;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0 }}
    >
      {Array.from({ length: cols }, (_, i) => (
        <line key={`v${i}`} x1={i * GRID_SPACING} y1={0} x2={i * GRID_SPACING} y2={height} stroke={STREET_COLOR} strokeWidth={2} />
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={i * GRID_SPACING} x2={width} y2={i * GRID_SPACING} stroke={STREET_COLOR} strokeWidth={2} />
      ))}
      {VEHICLES.map((v, i) => {
        // Each vehicle loops along its own full-width/height lane — constant
        // speed (px/s) times elapsed seconds, modulo the lane's length, so it
        // wraps seamlessly rather than snapping back to a start point. Drawn
        // as a larger glow rect UNDER a smaller solid core — a flat 14x6 dot
        // at 1080p read as near-invisible noise rather than "a vehicle";
        // the glow is what actually reads at a glance, the core is what
        // stays crisp up close.
        if (v.axis === "h") {
          const laneY = v.lane * GRID_SPACING;
          if (laneY > height) return null;
          const laneLength = width + 60;
          const x = (((v.offset * laneLength + v.speed * t) % laneLength) + laneLength) % laneLength - 30;
          return (
            <g key={i}>
              <rect x={x - 4} y={laneY - 8} width={30} height={16} rx={6} fill={VEHICLE_GLOW} />
              <rect x={x} y={laneY - 4} width={22} height={8} rx={3} fill={VEHICLE_COLOR} />
            </g>
          );
        }
        const laneX = v.lane * GRID_SPACING;
        if (laneX > width) return null;
        const laneLength = height + 60;
        const y = (((v.offset * laneLength + v.speed * t) % laneLength) + laneLength) % laneLength - 30;
        return (
          <g key={i}>
            <rect x={laneX - 8} y={y - 4} width={16} height={30} rx={6} fill={VEHICLE_GLOW} />
            <rect x={laneX - 4} y={y} width={8} height={22} rx={3} fill={VEHICLE_COLOR} />
          </g>
        );
      })}
    </svg>
  );
};
