import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, FONT_FAMILY, TITLE_STYLE, PLAYER_LABEL_STYLE } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { Pitch, PITCH_WIDTH, PITCH_HEIGHT, pitchX, pitchY } from "./Pitch";
import { PerspectivePitch, PERSPECTIVE_PITCH_WIDTH, PERSPECTIVE_PITCH_HEIGHT, perspectiveProject } from "./PerspectivePitch";
import { JerseyDisc } from "./JerseyDisc";
import { fadeIn, scaleSettle } from "../motion";
import type { SharedVisualProps, AnalysisData } from "../sharedVisualProps";

const PLAYER_RADIUS = 15;
const REVEAL_START_FRAME = 55;

/** Doesn't introduce a new moment (that's TacticalBoard) — revisits one
 * already-established, answering "why": freeze the baseline shape, draw
 * thin gaze/attention lines showing what the defense was focused on, then
 * fade in the one element that explains what that focus missed. Same
 * schematic-illustration standard as every other tactical visual here. */
export const AnalysisBoard: React.FC<{ data: AnalysisData } & SharedVisualProps> = ({
  data: { title, players, gazeLines = [], revealCaption },
  backgroundColor,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const boardWidth = isPortrait ? PERSPECTIVE_PITCH_WIDTH : PITCH_WIDTH;
  const boardHeight = isPortrait ? PERSPECTIVE_PITCH_HEIGHT : PITCH_HEIGHT;
  // player.x is the goal-to-goal (length) axis, player.y the touchline-to-
  // touchline (width) axis — portrait must feed each into the opposite
  // pixel-mapper, not just swap which mapper function is used.
  const project = (px: number, py: number): [number, number] =>
    isPortrait ? perspectiveProject(px, py) : [pitchX(px), pitchY(py)];
  const titleOpacity = fadeIn(frame, 0, 14);
  const pitchOpacity = fadeIn(frame, 4, 16);
  const gazeOpacity = fadeIn(frame, 30, 20);
  const captionOpacity = fadeIn(frame, REVEAL_START_FRAME + 10, 14);

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 24 }}>{title}</div>

        <div style={{ width: boardWidth, height: boardHeight, position: "relative" }}>
        <svg width={boardWidth} height={boardHeight} viewBox={`0 0 ${boardWidth} ${boardHeight}`} style={{ overflow: "visible" }}>
          <g opacity={pitchOpacity}>
            {isPortrait ? <PerspectivePitch /> : <Pitch />}
          </g>

          {/* Dotted, muted, thin — deliberately unlike MovementArrow's solid
              accent-colored motion lines, since a gaze line isn't a movement
              claim, it's "this is what they were watching." */}
          {gazeLines.map((gaze, index) => {
            const origin = players.find((p) => p.id === gaze.from);
            if (!origin) return null;
            const [gx1, gy1] = project(origin.x, origin.y);
            const [gx2, gy2] = project(gaze.to.x, gaze.to.y);
            return (
              <line
                key={index}
                x1={gx1}
                y1={gy1}
                x2={gx2}
                y2={gy2}
                stroke={COLORS.textDim}
                strokeWidth={1.5}
                strokeDasharray="3 5"
                opacity={gazeOpacity * 0.7}
              />
            );
          })}

          {players.map((player, index) => {
            const revealed = player.revealed === true;
            const start = revealed ? REVEAL_START_FRAME : 10 + index * 4;
            const opacity = fadeIn(frame, start, revealed ? 16 : 12);
            const scale = revealed ? scaleSettle(frame, start, 18, 0.5) : 1;
            const color = player.team === "home" ? COLORS.homeTeam : COLORS.awayTeam;
            const [cx, cy] = project(player.x, player.y);

            return (
              <g key={player.id} opacity={opacity} style={revealed ? { transformOrigin: `${cx}px ${cy}px`, transform: `scale(${scale})` } : undefined}>
                <JerseyDisc cx={cx} cy={cy} radius={PLAYER_RADIUS} color={color} highlighted={revealed} />
                <text x={cx} y={cy + PLAYER_RADIUS + 15} textAnchor="middle" fill={COLORS.text} style={PLAYER_LABEL_STYLE}>
                  {player.label}
                </text>
              </g>
            );
          })}
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

        {revealCaption && (
          <div
            style={{
              marginTop: 20,
              opacity: captionOpacity,
              fontFamily: FONT_FAMILY,
              fontWeight: 600,
              fontSize: 29,
              color: COLORS.textDim,
              textAlign: "center",
              maxWidth: isPortrait ? 850 : 1000,
            }}
          >
            {revealCaption}
          </div>
        )}
      </div>
    </SceneFrame>
  );
};
