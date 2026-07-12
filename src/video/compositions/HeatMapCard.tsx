import React from "react";
import { useCurrentFrame } from "remotion";
import { TITLE_STYLE, type PanelColorKey, type Orientation } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { Pitch, PITCH_WIDTH, PITCH_HEIGHT, pitchX, pitchY } from "./Pitch";
import { VerticalPitch, VERTICAL_PITCH_WIDTH, VERTICAL_PITCH_HEIGHT, vpitchX, vpitchY } from "./VerticalPitch";
import { fadeIn, scaleSettle } from "../motion";

interface HeatZone {
  x: number;
  y: number;
  /** 0-1, author-decided — same "you pick the scale" philosophy as Radar's
   * pre-normalized values, not a literal recorded metric. */
  intensity: number;
}

const ZONE_RADIUS = 130;
const ZONE_STAGGER_FRAMES = 5;

// Cool-to-warm heat scale (blue -> yellow -> red) so a low-intensity zone
// reads as a barely-there glow and a high-intensity one as a hot core,
// rather than every zone just being the same accent color at different
// opacity — the color itself, not just the strength, communicates "how
// much."
const HEAT_STOPS: { at: number; rgb: [number, number, number] }[] = [
  { at: 0, rgb: [77, 163, 255] },
  { at: 0.5, rgb: [248, 210, 74] },
  { at: 1, rgb: [255, 82, 82] },
];

function heatColor(intensity: number): string {
  const t = Math.max(0, Math.min(1, intensity));
  let lower = HEAT_STOPS[0];
  let upper = HEAT_STOPS[HEAT_STOPS.length - 1];
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    if (t >= HEAT_STOPS[i].at && t <= HEAT_STOPS[i + 1].at) {
      lower = HEAT_STOPS[i];
      upper = HEAT_STOPS[i + 1];
      break;
    }
  }
  const span = upper.at - lower.at || 1;
  const localT = (t - lower.at) / span;
  const rgb = lower.rgb.map((c, i) => Math.round(c + (upper.rgb[i] - c) * localT));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

/** Where a player/team operated most, as a gradient of blurred color blobs —
 * for "dominated the left channel" claims with more nuance than Zone's flat
 * third-highlight, and no discrete connections to show (that's
 * PassNetworkCard). Each zone is independent (overlapping blobs blend via
 * normal alpha compositing, not a true accumulated density field) — schematic
 * illustration of the narration's claim, same standard as every other
 * tactical visual here, not literal positional tracking data. */
export const HeatMapCard: React.FC<{
  title: string;
  zones: HeatZone[];
  backgroundColor?: PanelColorKey;
  orientation?: Orientation;
}> = ({ title, zones, backgroundColor, orientation = "landscape" }) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const boardWidth = isPortrait ? VERTICAL_PITCH_WIDTH : PITCH_WIDTH;
  const boardHeight = isPortrait ? VERTICAL_PITCH_HEIGHT : PITCH_HEIGHT;
  // zone.x is the goal-to-goal (length) axis, zone.y the touchline-to-
  // touchline (width) axis — portrait must feed each into the opposite
  // pixel-mapper, not just swap which mapper function is used.
  const project = (px: number, py: number): [number, number] =>
    isPortrait ? [vpitchX(py), vpitchY(px)] : [pitchX(px), pitchY(py)];
  const titleOpacity = fadeIn(frame, 0, 14);
  const pitchOpacity = fadeIn(frame, 4, 16);

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 24 }}>{title}</div>

        <svg width={boardWidth} height={boardHeight} viewBox={`0 0 ${boardWidth} ${boardHeight}`} style={{ overflow: "visible" }}>
          <defs>
            <clipPath id="heatmap-clip">
              <rect x={0} y={0} width={boardWidth} height={boardHeight} rx={6} />
            </clipPath>
            <filter id="heatmap-blur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="26" />
            </filter>
          </defs>

          <g opacity={pitchOpacity}>
            {isPortrait ? <VerticalPitch /> : <Pitch />}
          </g>

          <g clipPath="url(#heatmap-clip)" filter="url(#heatmap-blur)">
            {zones.map((zone, index) => {
              const start = 10 + index * ZONE_STAGGER_FRAMES;
              const scale = scaleSettle(frame, start, 20, 0.5);
              // Opacity carries intensity too, alongside color — a faint
              // zone should visibly recede, not just shift hue.
              const opacity = fadeIn(frame, start, 16) * (0.25 + zone.intensity * 0.55);
              const [cx, cy] = project(zone.x, zone.y);

              return (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={ZONE_RADIUS}
                  fill={heatColor(zone.intensity)}
                  opacity={opacity}
                  style={{ transformOrigin: `${cx}px ${cy}px`, transform: `scale(${scale})` }}
                />
              );
            })}
          </g>
        </svg>
      </div>
    </SceneFrame>
  );
};
