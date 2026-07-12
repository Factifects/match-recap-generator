import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, TITLE_STYLE, PLAYER_LABEL_STYLE, type PanelColorKey, type Orientation } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { Pitch, PITCH_WIDTH, PITCH_HEIGHT, pitchX, pitchY } from "./Pitch";
import { VerticalPitch, VERTICAL_PITCH_WIDTH, VERTICAL_PITCH_HEIGHT, vpitchX, vpitchY } from "./VerticalPitch";
import { fadeIn, drawIn } from "../motion";

interface NetworkNode {
  id: string;
  x: number;
  y: number;
  team: "home" | "away";
  label: string;
}

interface NetworkLink {
  from: string;
  to: string;
  weight: number;
}

const PLAYER_RADIUS = 13;
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
export const PassNetworkCard: React.FC<{
  title: string;
  nodes: NetworkNode[];
  links: NetworkLink[];
  backgroundColor?: PanelColorKey;
  orientation?: Orientation;
}> = ({ title, nodes, links, backgroundColor, orientation = "landscape" }) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const boardWidth = isPortrait ? VERTICAL_PITCH_WIDTH : PITCH_WIDTH;
  const boardHeight = isPortrait ? VERTICAL_PITCH_HEIGHT : PITCH_HEIGHT;
  // node.x is the goal-to-goal (length) axis, node.y the touchline-to-
  // touchline (width) axis — portrait must feed each into the opposite
  // pixel-mapper, not just swap which mapper function is used.
  const project = (px: number, py: number): [number, number] =>
    isPortrait ? [vpitchX(py), vpitchY(px)] : [pitchX(px), pitchY(py)];
  const titleOpacity = fadeIn(frame, 0, 14);
  const pitchOpacity = fadeIn(frame, 4, 16);
  const maxWeight = Math.max(...links.map((l) => l.weight), 1);

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 24 }}>{title}</div>

        <svg width={boardWidth} height={boardHeight} viewBox={`0 0 ${boardWidth} ${boardHeight}`} style={{ overflow: "visible" }}>
          <g opacity={pitchOpacity}>
            {isPortrait ? <VerticalPitch /> : <Pitch />}
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

            return (
              <line
                key={index}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={COLORS.passes}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                opacity={0.75 * progress}
              />
            );
          })}

          {nodes.map((node, index) => {
            const opacity = fadeIn(frame, 10 + index * 3, 12);
            const color = node.team === "home" ? COLORS.homeTeam : COLORS.awayTeam;
            const [cx, cy] = project(node.x, node.y);

            return (
              <g key={node.id} opacity={opacity}>
                <circle cx={cx} cy={cy} r={PLAYER_RADIUS} fill={color} />
                <text x={cx} y={cy + PLAYER_RADIUS + 16} textAnchor="middle" fill={COLORS.text} style={PLAYER_LABEL_STYLE}>
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </SceneFrame>
  );
};
