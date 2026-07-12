import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, FONT_FAMILY, TITLE_STYLE, PLAYER_LABEL_STYLE, type PanelColorKey, type Orientation } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { VerticalPitch, VERTICAL_PITCH_WIDTH, VERTICAL_PITCH_HEIGHT, vpitchX, vpitchY } from "./VerticalPitch";
import { CurvedMovementArrow, CURVED_ARROW_DRAW_DURATION } from "./CurvedMovementArrow";
import { fadeIn, drawIn } from "../motion";

/** Kept separate from TacticalBoard.tsx's `Player`/`Arrow` interfaces rather
 * than extending them — this is a distinct scene type with its own schema
 * (`role`, per-arrow `curve`/`bow`), not a variant of the landscape board. */
export interface VerticalPlayer {
  id: string;
  x: number;
  y: number;
  team: "home" | "away";
  label: string;
  role?: string;
}

export interface VerticalArrow {
  from: string;
  to: { x: number; y: number };
  curve?: boolean;
  bow?: number;
}

const PLAYER_RADIUS = 13;
const EDGE_MARGIN = 4;
const PILL_HEIGHT = 26;
const PILL_CHAR_WIDTH = 9;
const PILL_PADDING = 18;

function clampPercent(value: number): number {
  return Math.min(100 - EDGE_MARGIN, Math.max(EDGE_MARGIN, value));
}

function arrowStartFrame(index: number): number {
  return 26 + index * 8;
}

/** A small rounded-rect badge behind a player's name — SVG has no way to
 * auto-size a background to text, so width is estimated from character
 * count (a fixed per-character width for this font/size, not a real text
 * measurement — good enough for short name/role labels, same "schematic,
 * not pixel-perfect" standard as every other tactical illustration in this
 * project). Role (if given) prefixes the name, e.g. "ST MBAPPÉ". */
function RolePill({ cx, cy, label, role, color, opacity }: { cx: number; cy: number; label: string; role?: string; color: string; opacity: number }) {
  const text = role ? `${role.toUpperCase()} ${label}` : label;
  const width = text.length * PILL_CHAR_WIDTH + PILL_PADDING;
  return (
    <g opacity={opacity}>
      <rect x={cx - width / 2} y={cy - PILL_HEIGHT / 2} width={width} height={PILL_HEIGHT} rx={PILL_HEIGHT / 2} fill={COLORS.panel} stroke={color} strokeWidth={1.5} />
      <text x={cx} y={cy + 4} textAnchor="middle" fill={color} style={PLAYER_LABEL_STYLE}>
        {text}
      </text>
    </g>
  );
}

/** Portrait/vertical tactics board — the FM/FPL-style layout from the
 * reference screenshots: a tall pitch (goal-to-goal running top-to-bottom)
 * on one side, a text side-panel on the other, role-pill player labels
 * instead of plain text, and curved (rather than straight) movement arrows.
 * A new, additive Scene Type alongside TacticalBoard — not a replacement;
 * the landscape board and its Pattern library are untouched. */
export const VerticalTacticalBoard: React.FC<{
  title: string;
  players: VerticalPlayer[];
  arrows?: VerticalArrow[];
  sideText?: string;
  backgroundColor?: PanelColorKey;
  backgroundImage?: string;
  backgroundImageMode?: "faded" | "featured";
  backgroundImageSide?: "left" | "right" | "center";
  /** Accepted but not yet consumed — this card already renders a portrait
   * pitch *inset* inside the 16:9 frame; making the whole card portrait-native
   * (full-canvas VerticalPitch instead of an inset) is still Phase 3 work. */
  orientation?: Orientation;
}> = ({ title, players, arrows = [], sideText, backgroundColor, backgroundImage, backgroundImageMode, backgroundImageSide }) => {
  const frame = useCurrentFrame();
  const titleOpacity = fadeIn(frame, 0, 14);
  const pitchOpacity = fadeIn(frame, 4, 16);
  const sideTextOpacity = fadeIn(frame, 30, 16);

  // The portrait board is only 560px wide — far narrower than the 620px
  // "featured" image panel — so unlike the landscape TacticalBoard (1120px,
  // no room to spare), there's genuine space to share the frame with a
  // featured photo. Push the whole pitch+text block clear of whichever edge
  // the image occupies instead of leaving it centered across the full
  // 1920px, which is the same overlap bug already fixed once for the
  // landscape board.
  const featured = backgroundImageMode === "featured";
  const shiftX = featured && backgroundImageSide === "left" ? 190 : featured && backgroundImageSide === "right" ? -190 : 0;

  return (
    <SceneFrame
      backgroundColor={backgroundColor}
      backgroundImage={backgroundImage}
      backgroundImageMode={backgroundImageMode}
      backgroundImageSide={backgroundImageSide}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: `translateX(${shiftX}px)` }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 24 }}>{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 64 }}>
          <svg
            width={VERTICAL_PITCH_WIDTH}
            height={VERTICAL_PITCH_HEIGHT}
            viewBox={`0 0 ${VERTICAL_PITCH_WIDTH} ${VERTICAL_PITCH_HEIGHT}`}
            style={{ overflow: "visible" }}
          >
            <g opacity={pitchOpacity}>
              <VerticalPitch />
            </g>

            {arrows.map((arrow, index) => {
              const origin = players.find((p) => p.id === arrow.from);
              if (!origin) return null;
              return (
                <CurvedMovementArrow
                  key={index}
                  fromX={origin.x}
                  fromY={origin.y}
                  toX={arrow.to.x}
                  toY={arrow.to.y}
                  startFrame={arrowStartFrame(index)}
                  bow={arrow.curve === false ? 0 : (arrow.bow ?? 40)}
                  color={COLORS.movement}
                />
              );
            })}

            {players.map((player, index) => {
              const opacity = fadeIn(frame, 14 + index * 4, 12);
              const color = player.team === "home" ? COLORS.homeTeam : COLORS.awayTeam;

              const outgoingIndex = arrows.findIndex((a) => a.from === player.id);
              const outgoing = outgoingIndex >= 0 ? arrows[outgoingIndex] : undefined;
              const glideProgress = outgoing ? drawIn(frame, arrowStartFrame(outgoingIndex), CURVED_ARROW_DRAW_DURATION) : 0;
              const rawX = outgoing ? player.x + (outgoing.to.x - player.x) * glideProgress : player.x;
              const rawY = outgoing ? player.y + (outgoing.to.y - player.y) * glideProgress : player.y;
              const cx = vpitchX(clampPercent(rawX));
              const cy = vpitchY(clampPercent(rawY));

              return (
                <g key={player.id} opacity={opacity}>
                  <circle cx={cx} cy={cy} r={PLAYER_RADIUS} fill={color} />
                  <RolePill cx={cx} cy={cy + PLAYER_RADIUS + 18} label={player.label} role={player.role} color={color} opacity={1} />
                </g>
              );
            })}
          </svg>

          {sideText && (
            <div
              style={{
                opacity: sideTextOpacity,
                width: 480,
                fontFamily: FONT_FAMILY,
                fontWeight: 600,
                fontSize: 34,
                lineHeight: 1.4,
                color: COLORS.textDim,
              }}
            >
              {sideText}
            </div>
          )}
        </div>
      </div>
    </SceneFrame>
  );
};
