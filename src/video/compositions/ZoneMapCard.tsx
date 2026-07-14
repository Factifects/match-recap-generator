import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, FONT_FAMILY } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { Pitch, PITCH_WIDTH, PITCH_HEIGHT } from "./Pitch";
import { PerspectivePitch, PERSPECTIVE_PITCH_WIDTH, PERSPECTIVE_PITCH_HEIGHT, perspectiveProject } from "./PerspectivePitch";
import { fadeIn } from "../motion";
import type { SharedVisualProps, ZoneData } from "../sharedVisualProps";

type ZoneKey = ZoneData["zone"];

const THIRD_WIDTH = PITCH_WIDTH / 3;
const ZONE_X: Record<ZoneKey, number> = { defensive: 0, middle: THIRD_WIDTH, attacking: THIRD_WIDTH * 2 };
// Attacking flows toward increasing x (the "attacking" third sits at the far
// end), so the drifting chevrons always point that way regardless of which
// third is actually highlighted — they're illustrating attacking direction,
// not which zone was picked.
const CHEVRON_SPACING = 90;
const CHEVRON_COUNT = 4;

// Portrait's goal-to-goal axis is length (0=own goal/near, 100=opponent's
// goal/far), and "attacking" sits at the far end — the top of the frame once
// projected. Defined in percent-space (not pixels) so it can be fed through
// perspectiveProject, same convention as everywhere else pitch-based.
const ZONE_LENGTH_RANGE_PORTRAIT: Record<ZoneKey, [number, number]> = {
  defensive: [0, 100 / 3],
  middle: [100 / 3, 200 / 3],
  attacking: [200 / 3, 100],
};

/** A zone band's four corners projected through the perspective warp — a
 * trapezoid, not a rect, since the board narrows toward the far end. Shared
 * by the highlight glow and the chevron clip path. */
function trapezoidBandPath(lengthStart: number, lengthEnd: number): string {
  const corners: [number, number][] = [
    [lengthStart, 0],
    [lengthStart, 100],
    [lengthEnd, 100],
    [lengthEnd, 0],
  ];
  const pts = corners.map(([l, w]) => perspectiveProject(l, w));
  return `M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]} L ${pts[2][0]} ${pts[2][1]} L ${pts[3][0]} ${pts[3][1]} Z`;
}

/** Abstract pitch diagram — line art only, no players — with one third
 * highlighted via a radial glow (brighter at the zone's own center, fading
 * toward its edges) rather than a flat opacity rectangle, plus slow drifting
 * chevrons through the zone suggesting attacking flow/territorial
 * dominance. Shares the same Pitch primitive every tactical component uses,
 * so it looks identical to TacticalBoard/Formation/ShotMap. */
export const ZoneMapCard: React.FC<{ data: ZoneData } & SharedVisualProps> = ({
  data: { zone, label, caption },
  backgroundColor,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const boardWidth = isPortrait ? PERSPECTIVE_PITCH_WIDTH : PITCH_WIDTH;
  const boardHeight = isPortrait ? PERSPECTIVE_PITCH_HEIGHT : PITCH_HEIGHT;

  const pitchOpacity = fadeIn(frame, 0, 12);
  const highlightOpacity = fadeIn(frame, 14, 12);
  const labelOpacity = fadeIn(frame, 22, 10);
  const captionOpacity = fadeIn(frame, 30, 10);
  const chevronOffset = (frame * 1.4) % CHEVRON_SPACING;

  // Landscape: highlighted band is a vertical strip at zoneX, THIRD_WIDTH
  // wide, full pitch height. Portrait: a trapezoid band spanning the
  // zone's length range, projected through the perspective warp.
  const zoneX = ZONE_X[zone];
  const [lengthStart, lengthEnd] = ZONE_LENGTH_RANGE_PORTRAIT[zone];
  const [, yNear] = isPortrait ? perspectiveProject(lengthStart, 50) : [0, 0];
  const [, yFar] = isPortrait ? perspectiveProject(lengthEnd, 50) : [0, 0];
  const centerX = isPortrait ? boardWidth / 2 : zoneX + THIRD_WIDTH / 2;
  const centerY = isPortrait ? (yNear + yFar) / 2 : PITCH_HEIGHT / 2;
  const glowRadius = isPortrait ? Math.abs(yNear - yFar) * 0.85 : THIRD_WIDTH * 0.75;
  const bandPath = isPortrait ? trapezoidBandPath(lengthStart, lengthEnd) : "";
  const [dividerOneA, dividerOneB] = isPortrait ? [perspectiveProject(100 / 3, 0), perspectiveProject(100 / 3, 100)] : [null, null];
  const [dividerTwoA, dividerTwoB] = isPortrait ? [perspectiveProject(200 / 3, 0), perspectiveProject(200 / 3, 100)] : [null, null];

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: boardWidth, height: boardHeight, position: "relative" }}>
        <svg width={boardWidth} height={boardHeight} viewBox={`0 0 ${boardWidth} ${boardHeight}`} style={{ overflow: "visible" }}>
          <defs>
            <radialGradient id="zone-glow" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor={COLORS.highlight} stopOpacity={0.5} />
              <stop offset="100%" stopColor={COLORS.highlight} stopOpacity={0} />
            </radialGradient>
            <clipPath id="zone-clip">
              {isPortrait ? <path d={bandPath} /> : <rect x={zoneX} y={0} width={THIRD_WIDTH} height={PITCH_HEIGHT} />}
            </clipPath>
          </defs>

          <g opacity={pitchOpacity}>
            {isPortrait ? <PerspectivePitch /> : <Pitch />}
          </g>
          {isPortrait ? (
            <>
              <line x1={dividerOneA![0]} y1={dividerOneA![1]} x2={dividerOneB![0]} y2={dividerOneB![1]} stroke={COLORS.pitchLines} strokeWidth={1} strokeDasharray="6 6" opacity={pitchOpacity} />
              <line x1={dividerTwoA![0]} y1={dividerTwoA![1]} x2={dividerTwoB![0]} y2={dividerTwoB![1]} stroke={COLORS.pitchLines} strokeWidth={1} strokeDasharray="6 6" opacity={pitchOpacity} />
            </>
          ) : (
            <>
              <line x1={THIRD_WIDTH} y1={0} x2={THIRD_WIDTH} y2={PITCH_HEIGHT} stroke={COLORS.pitchLines} strokeWidth={1} strokeDasharray="6 6" opacity={pitchOpacity} />
              <line x1={THIRD_WIDTH * 2} y1={0} x2={THIRD_WIDTH * 2} y2={PITCH_HEIGHT} stroke={COLORS.pitchLines} strokeWidth={1} strokeDasharray="6 6" opacity={pitchOpacity} />
            </>
          )}

          {isPortrait ? (
            <path d={bandPath} fill="url(#zone-glow)" opacity={highlightOpacity} />
          ) : (
            <rect x={zoneX} y={0} width={THIRD_WIDTH} height={PITCH_HEIGHT} fill="url(#zone-glow)" opacity={highlightOpacity} />
          )}
          <circle cx={centerX} cy={centerY} r={glowRadius} fill="url(#zone-glow)" opacity={highlightOpacity * 0.6} />

          <g clipPath="url(#zone-clip)" opacity={highlightOpacity * 0.5}>
            {Array.from({ length: CHEVRON_COUNT }).map((_, i) => {
              if (isPortrait) {
                // Attacking = toward decreasing pixel y (up the frame), so
                // chevrons start below the band (yNear, larger pixel y) and
                // drift upward through it toward yFar — mirror of the
                // landscape sweep, which starts before the zone and drifts
                // toward increasing x.
                const y = yNear + CHEVRON_SPACING - i * CHEVRON_SPACING - chevronOffset;
                return (
                  <path
                    key={i}
                    d={`M ${centerX - 16} ${y} L ${centerX} ${y - 14} L ${centerX + 16} ${y}`}
                    fill="none"
                    stroke={COLORS.highlight}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              }
              const x = zoneX - CHEVRON_SPACING + i * CHEVRON_SPACING + chevronOffset;
              return (
                <path
                  key={i}
                  d={`M ${x} ${centerY - 16} L ${x + 14} ${centerY} L ${x} ${centerY + 16}`}
                  fill="none"
                  stroke={COLORS.highlight}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}
          </g>
        </svg>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: boardWidth,
            height: boardHeight,
            pointerEvents: "none",
            background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 46%, rgba(0,0,0,0.5) 100%)",
          }}
        />
        </div>
        <div
          style={{
            marginTop: 40,
            opacity: labelOpacity,
            fontFamily: FONT_FAMILY,
            fontWeight: 700,
            fontSize: 44,
            color: COLORS.text,
            textAlign: "center",
          }}
        >
          {label}
        </div>
        <div
          style={{
            marginTop: 14,
            opacity: captionOpacity,
            fontFamily: FONT_FAMILY,
            fontWeight: 500,
            fontSize: 31,
            color: COLORS.textDim,
            textAlign: "center",
            maxWidth: 900,
          }}
        >
          {caption}
        </div>
      </div>
    </SceneFrame>
  );
};
