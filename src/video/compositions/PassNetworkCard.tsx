import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, TITLE_STYLE, PLAYER_LABEL_STYLE } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { Pitch, PITCH_WIDTH, PITCH_HEIGHT, pitchX, pitchY } from "./Pitch";
import { PerspectivePitch, PERSPECTIVE_PITCH_WIDTH, PERSPECTIVE_PITCH_HEIGHT, perspectiveProject } from "./PerspectivePitch";
import { JerseyDisc } from "./JerseyDisc";
import { fadeIn, drawIn } from "../motion";
import type { SharedVisualProps, PassNetworkData } from "../sharedVisualProps";

const PLAYER_RADIUS = 15;
const MIN_LINE_WIDTH = 1.5;
const MAX_LINE_WIDTH = 8;
const LINK_STAGGER_FRAMES = 4;

/** Nodes (players) connected by weighted lines — how a team actually built
 * play, not just where shots/players ended up (ShotMap/TacticalBoard). Link
 * thickness scales with `weight` (the narration's own claim about how often
 * that connection happened — schematic, not real event-tracking data, same
 * epistemic status as every other tactical illustration here). Reuses the
 * landscape Pitch.tsx system since — like ShotMap and Zone — this shows a
 * whole team's shape at once rather than needing the pan/zoom-friendly
 * fixed-size clip wrapper TacticalBoard/GoalSequence use. */
export const PassNetworkCard: React.FC<{ data: PassNetworkData } & SharedVisualProps> = ({
  data: { title, nodes, links },
  backgroundColor,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const boardWidth = isPortrait ? PERSPECTIVE_PITCH_WIDTH : PITCH_WIDTH;
  const boardHeight = isPortrait ? PERSPECTIVE_PITCH_HEIGHT : PITCH_HEIGHT;
  // node.x is the goal-to-goal (length) axis, node.y the touchline-to-
  // touchline (width) axis — portrait must feed each into the opposite
  // pixel-mapper, not just swap which mapper function is used.
  const project = (px: number, py: number): [number, number] =>
    isPortrait ? perspectiveProject(px, py) : [pitchX(px), pitchY(py)];
  const titleOpacity = fadeIn(frame, 0, 14);
  const pitchOpacity = fadeIn(frame, 4, 16);
  const maxWeight = Math.max(...links.map((l) => l.weight), 1);

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 24 }}>{title}</div>

        <div style={{ width: boardWidth, height: boardHeight, position: "relative" }}>
        <svg width={boardWidth} height={boardHeight} viewBox={`0 0 ${boardWidth} ${boardHeight}`} style={{ overflow: "visible" }}>
          <g opacity={pitchOpacity}>
            {isPortrait ? <PerspectivePitch /> : <Pitch />}
          </g>

          {links.map((link, index) => {
            const from = nodes.find((n) => n.id === link.from);
            const to = nodes.find((n) => n.id === link.to);
            if (!from || !to) return null;
            const start = 20 + index * LINK_STAGGER_FRAMES;
            const progress = drawIn(frame, start, 16);
            const strokeWidth = MIN_LINE_WIDTH + (link.weight / maxWeight) * (MAX_LINE_WIDTH - MIN_LINE_WIDTH);
            const [x1, y1] = project(from.x, from.y);
            const [x2, y2] = project(to.x, to.y);
            // The line actually grows to its current tip (not just a flat
            // opacity fade over its full length) so a traveling highlight at
            // that tip reads as motion — same "moving highlight along the
            // draw" treatment as TacticalBoard's arrows.
            const tipX = x1 + (x2 - x1) * progress;
            const tipY = y1 + (y2 - y1) * progress;
            const travelOpacity = progress > 0.01 && progress < 0.96 ? 1 : 0;
            const travelPulse = 1 + Math.sin(frame / 4) * 0.2;

            return (
              <g key={index}>
                <line x1={x1} y1={y1} x2={tipX} y2={tipY} stroke={COLORS.passes} strokeWidth={strokeWidth} strokeLinecap="round" opacity={0.75} />
                <circle cx={tipX} cy={tipY} r={(strokeWidth + 5) * travelPulse} fill={COLORS.passes} opacity={travelOpacity * 0.25} />
                <circle cx={tipX} cy={tipY} r={3.5} fill="#ffffff" opacity={travelOpacity * 0.85} />
              </g>
            );
          })}

          {nodes.map((node, index) => {
            const opacity = fadeIn(frame, 10 + index * 3, 12);
            const color = node.team === "home" ? COLORS.homeTeam : COLORS.awayTeam;
            const [cx, cy] = project(node.x, node.y);

            return (
              <g key={node.id} opacity={opacity}>
                <JerseyDisc cx={cx} cy={cy} radius={PLAYER_RADIUS} color={color} />
                <text x={cx} y={cy + PLAYER_RADIUS + 16} textAnchor="middle" fill={COLORS.text} style={PLAYER_LABEL_STYLE}>
                  {node.label}
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
      </div>
    </SceneFrame>
  );
};
