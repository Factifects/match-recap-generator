import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, FONT_FAMILY, type PanelColorKey, type Orientation } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { Pitch, PITCH_WIDTH, PITCH_HEIGHT } from "./Pitch";
import { VerticalPitch, VERTICAL_PITCH_WIDTH, VERTICAL_PITCH_HEIGHT } from "./VerticalPitch";
import { fadeIn } from "../motion";
import type { ZONE_KEYS } from "../../model/Segment";

type ZoneKey = (typeof ZONE_KEYS)[number];

const THIRD_WIDTH = PITCH_WIDTH / 3;
const ZONE_X: Record<ZoneKey, number> = { defensive: 0, middle: THIRD_WIDTH, attacking: THIRD_WIDTH * 2 };
// Attacking flows toward increasing x (the "attacking" third sits at the far
// end), so the drifting chevrons always point that way regardless of which
// third is actually highlighted — they're illustrating attacking direction,
// not which zone was picked.
const CHEVRON_SPACING = 90;
const CHEVRON_COUNT = 4;

// Portrait's goal-to-goal axis is y, not x — VerticalPitch's own convention
// (vpitchY: 0=bottom/own goal, 100=top/opponent's goal) puts "attacking" at
// the TOP of the frame, so the attacking third is the top band (smallest
// pixel y) and the defensive third is the bottom band, mirroring
// ZONE_X/CHEVRON direction onto the new axis rather than reusing them as-is.
const VERTICAL_THIRD_HEIGHT = VERTICAL_PITCH_HEIGHT / 3;
const ZONE_Y_PORTRAIT: Record<ZoneKey, number> = {
  attacking: 0,
  middle: VERTICAL_THIRD_HEIGHT,
  defensive: VERTICAL_THIRD_HEIGHT * 2,
};

/** Abstract pitch diagram — line art only, no players — with one third
 * highlighted via a radial glow (brighter at the zone's own center, fading
 * toward its edges) rather than a flat opacity rectangle, plus slow drifting
 * chevrons through the zone suggesting attacking flow/territorial
 * dominance. Shares the same Pitch primitive every tactical component uses,
 * so it looks identical to TacticalBoard/Formation/ShotMap. */
export const ZoneMapCard: React.FC<{
  zone: ZoneKey;
  label: string;
  caption: string;
  backgroundColor?: PanelColorKey;
  /** Reorients the highlighted band from a vertical strip (horizontal
   * thirds) to a horizontal band (vertical thirds) — see ZONE_Y_PORTRAIT
   * above for why "attacking" moves to the top third instead of the far
   * third, and the chevron direction flip below. */
  orientation?: Orientation;
}> = ({ zone, label, caption, backgroundColor, orientation = "landscape" }) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const boardWidth = isPortrait ? VERTICAL_PITCH_WIDTH : PITCH_WIDTH;
  const boardHeight = isPortrait ? VERTICAL_PITCH_HEIGHT : PITCH_HEIGHT;

  const pitchOpacity = fadeIn(frame, 0, 12);
  const highlightOpacity = fadeIn(frame, 14, 12);
  const labelOpacity = fadeIn(frame, 22, 10);
  const captionOpacity = fadeIn(frame, 30, 10);
  const chevronOffset = (frame * 1.4) % CHEVRON_SPACING;

  // Landscape: highlighted band is a vertical strip at zoneX, THIRD_WIDTH
  // wide, full pitch height. Portrait: a horizontal band at zoneY,
  // VERTICAL_THIRD_HEIGHT tall, full pitch width.
  const zoneX = ZONE_X[zone];
  const zoneY = ZONE_Y_PORTRAIT[zone];
  const centerX = isPortrait ? boardWidth / 2 : zoneX + THIRD_WIDTH / 2;
  const centerY = isPortrait ? zoneY + VERTICAL_THIRD_HEIGHT / 2 : PITCH_HEIGHT / 2;
  const glowRadius = isPortrait ? VERTICAL_THIRD_HEIGHT * 0.85 : THIRD_WIDTH * 0.75;

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <svg width={boardWidth} height={boardHeight} viewBox={`0 0 ${boardWidth} ${boardHeight}`} style={{ overflow: "visible" }}>
          <defs>
            <radialGradient id="zone-glow" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor={COLORS.highlight} stopOpacity={0.5} />
              <stop offset="100%" stopColor={COLORS.highlight} stopOpacity={0} />
            </radialGradient>
            <clipPath id="zone-clip">
              {isPortrait ? (
                <rect x={0} y={zoneY} width={boardWidth} height={VERTICAL_THIRD_HEIGHT} />
              ) : (
                <rect x={zoneX} y={0} width={THIRD_WIDTH} height={PITCH_HEIGHT} />
              )}
            </clipPath>
          </defs>

          <g opacity={pitchOpacity}>
            {isPortrait ? <VerticalPitch /> : <Pitch />}
          </g>
          {isPortrait ? (
            <>
              <line x1={0} y1={VERTICAL_THIRD_HEIGHT} x2={boardWidth} y2={VERTICAL_THIRD_HEIGHT} stroke={COLORS.pitchLines} strokeWidth={1} strokeDasharray="6 6" opacity={pitchOpacity} />
              <line x1={0} y1={VERTICAL_THIRD_HEIGHT * 2} x2={boardWidth} y2={VERTICAL_THIRD_HEIGHT * 2} stroke={COLORS.pitchLines} strokeWidth={1} strokeDasharray="6 6" opacity={pitchOpacity} />
            </>
          ) : (
            <>
              <line x1={THIRD_WIDTH} y1={0} x2={THIRD_WIDTH} y2={PITCH_HEIGHT} stroke={COLORS.pitchLines} strokeWidth={1} strokeDasharray="6 6" opacity={pitchOpacity} />
              <line x1={THIRD_WIDTH * 2} y1={0} x2={THIRD_WIDTH * 2} y2={PITCH_HEIGHT} stroke={COLORS.pitchLines} strokeWidth={1} strokeDasharray="6 6" opacity={pitchOpacity} />
            </>
          )}

          {isPortrait ? (
            <rect x={0} y={zoneY} width={boardWidth} height={VERTICAL_THIRD_HEIGHT} fill="url(#zone-glow)" opacity={highlightOpacity} />
          ) : (
            <rect x={zoneX} y={0} width={THIRD_WIDTH} height={PITCH_HEIGHT} fill="url(#zone-glow)" opacity={highlightOpacity} />
          )}
          <circle cx={centerX} cy={centerY} r={glowRadius} fill="url(#zone-glow)" opacity={highlightOpacity * 0.6} />

          <g clipPath="url(#zone-clip)" opacity={highlightOpacity * 0.5}>
            {Array.from({ length: CHEVRON_COUNT }).map((_, i) => {
              if (isPortrait) {
                // Attacking = toward decreasing pixel y (up the frame), so
                // chevrons start below the band and drift upward through it —
                // mirror of the landscape sweep, which starts before the
                // zone and drifts toward increasing x.
                const y = zoneY + VERTICAL_THIRD_HEIGHT + CHEVRON_SPACING - i * CHEVRON_SPACING - chevronOffset;
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
