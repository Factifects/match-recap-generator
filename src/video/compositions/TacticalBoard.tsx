import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, FONT_FAMILY, TITLE_STYLE, PLAYER_LABEL_STYLE, type PanelColorKey, type Orientation } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { Pitch, PITCH_WIDTH, PITCH_HEIGHT, pitchX, pitchY } from "./Pitch";
import { PerspectivePitch, PERSPECTIVE_PITCH_WIDTH, PERSPECTIVE_PITCH_HEIGHT, perspectiveProject } from "./PerspectivePitch";
import { JerseyDisc } from "./JerseyDisc";
import { MovementArrow, ARROW_DRAW_DURATION } from "./MovementArrow";
import { CurvedMovementArrow, CURVED_ARROW_DRAW_DURATION } from "./CurvedMovementArrow";
import { fadeIn, drawIn } from "../motion";
import { getCameraTransform, getCameraTransformPerspective } from "../camera";
import type { CameraStage } from "../../model/Segment";

interface Player {
  id: string;
  x: number;
  y: number;
  team: "home" | "away";
  label: string;
}

interface Arrow {
  from: string;
  to: { x: number; y: number };
}

interface HighlightZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Annotation {
  text: string;
  x: number;
  y: number;
}

const PLAYER_RADIUS = 15;
const HOME_COLOR = COLORS.homeTeam;
const AWAY_COLOR = COLORS.awayTeam;
const EDGE_MARGIN = 4;
// Any camera stage the script asked to actually tighten on gets pushed
// further still — "full pitch"/zoom 1 establishing shots are left alone so
// they still read as a true wide shot, but every directed zoom (a half, a
// box, a follow) leans in harder than requested for a more cinematic frame.
const ZOOM_BOOST = 1.15;
// Ghost trail behind a gliding marker: each entry is how far behind the
// marker's current glide progress a fainter copy sits, paired with its
// opacity — furthest-back copy first so later (closer, more opaque) copies
// paint on top.
const GHOST_TRAIL = [
  { lag: 0.26, opacity: 0.12 },
  { lag: 0.16, opacity: 0.22 },
  { lag: 0.08, opacity: 0.34 },
];

function arrowStartFrame(arrowIndex: number): number {
  return 26 + arrowIndex * 8;
}

// Defense-in-depth: a pattern or a hand-authored Data block can specify a
// position right at the pitch boundary (e.g. a wing-play arrow aimed at the
// touchline) — harmless for a static marker, but once a marker actually
// glides there (see the players.map below) it can clip out of the camera's
// clipped viewport entirely. Clamping keeps every rendered marker safely
// on-frame regardless of what any given script or pattern asks for.
function clampPercent(value: number): number {
  return Math.min(100 - EDGE_MARGIN, Math.max(EDGE_MARGIN, value));
}

function boostZoom(stages: CameraStage[]): CameraStage[] {
  return stages.map((stage) => (stage.zoom > 1 ? { ...stage, zoom: stage.zoom * ZOOM_BOOST } : stage));
}

/** A tactics-whiteboard-style diagram: named players as jersey-colored discs
 * on a pitch, arrows showing movement/passes (with a traveling highlight
 * riding the draw and a fading ghost trail behind any gliding marker), an
 * optional highlighted zone, and short text callouts explaining what the
 * diagram is illustrating. This is a schematic illustration of the
 * narration's claim (like ZoneMapCard/SequenceCard already are), not literal
 * tracking data. Portrait renders on PerspectivePitch — a pseudo-3D "camera
 * behind the near goal" view (narrower far end, compressed far half) instead
 * of a flat top-down rectangle, matching broadcast/FPL-style tactics boards
 * rather than a satellite view. */
export const TacticalBoard: React.FC<{
  title: string;
  players: Player[];
  arrows?: Arrow[];
  highlight?: string[];
  highlightZone?: HighlightZone;
  annotations?: Annotation[];
  camera?: CameraStage[];
  durationInFrames?: number;
  backgroundImage?: string;
  backgroundImageMode?: "faded" | "featured";
  backgroundImageSide?: "left" | "right" | "center";
  backgroundColor?: PanelColorKey;
  /** Portrait swaps the horizontal Pitch/pitchX/pitchY/MovementArrow/
   * getCameraTransform system for PerspectivePitch/perspectiveProject/
   * CurvedMovementArrow(bow=0)/getCameraTransformPerspective, AND swaps which
   * physical axis each coordinate's x/y feeds into — length (goal-to-goal)
   * is pixel-x in landscape but pixel-y in portrait, width
   * (touchline-to-touchline) is the reverse. See the `project` helper below.
   * See camera.ts for the box-left/box-right semantics decision this
   * depends on. */
  orientation?: Orientation;
}> = ({
  title,
  players,
  arrows = [],
  highlight = [],
  highlightZone,
  annotations = [],
  camera = [{ focus: "full", zoom: 1 }],
  durationInFrames = 90,
  backgroundImage,
  backgroundImageMode,
  backgroundImageSide,
  backgroundColor,
  orientation = "landscape",
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";

  const boardWidth = isPortrait ? PERSPECTIVE_PITCH_WIDTH : PITCH_WIDTH;
  const boardHeight = isPortrait ? PERSPECTIVE_PITCH_HEIGHT : PITCH_HEIGHT;
  // player.x/annotation.x etc. are the goal-to-goal (length) axis, .y the
  // touchline-to-touchline (width) axis — landscape's length axis is
  // pixel-x, portrait's is pixel-y, so portrait must feed each coordinate
  // into the opposite pixel-mapper, not just swap which mapper is used.
  const project = (px: number, py: number): [number, number] =>
    isPortrait ? perspectiveProject(px, py) : [pitchX(px), pitchY(py)];
  const toPixelX = (px: number, py: number) => project(px, py)[0];
  const toPixelY = (px: number, py: number) => project(px, py)[1];
  const boostedCamera = boostZoom(camera);
  const cameraTransform = isPortrait
    ? getCameraTransformPerspective(boostedCamera, frame, durationInFrames)
    : getCameraTransform(boostedCamera, frame, durationInFrames);

  const titleOpacity = fadeIn(frame, 0, 14);
  const pitchOpacity = fadeIn(frame, 4, 16);
  const zoneOpacity = fadeIn(frame, 10, 16) * 0.3;

  return (
    <SceneFrame
      backgroundColor={backgroundColor}
      backgroundImage={backgroundImage}
      backgroundImageMode={backgroundImageMode}
      backgroundImageSide={backgroundImageSide}
      orientation={orientation}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 24 }}>{title}</div>

        {/* Fixed-size clip container: the camera transform below can scale/pan
            the svg element itself to anywhere on the page, so this wrapper is
            what actually keeps the zoomed pitch confined to its own box
            instead of visually bleeding up over the title. The vignette
            overlay lives here too, as a sibling of the zoomed svg rather than
            inside it — a camera vignette is a property of the lens/frame, not
            the scene, so it must stay fixed on screen while the pitch
            underneath pans and zooms. */}
        <div style={{ width: boardWidth, height: boardHeight, overflow: "hidden", position: "relative" }}>
        <svg
          width={boardWidth}
          height={boardHeight}
          viewBox={`0 0 ${boardWidth} ${boardHeight}`}
          style={{ overflow: "visible", transform: cameraTransform, transformOrigin: "0 0", position: "absolute", top: 0, left: 0 }}
        >
          <g opacity={pitchOpacity}>
            {isPortrait ? <PerspectivePitch /> : <Pitch />}
          </g>

          {highlightZone && (
            // Landscape: zone.x/width ride the length axis (pixel-x),
            // zone.y/height ride the width axis (pixel-y). Portrait swaps
            // which physical axis each rides — length becomes pixel-y (and,
            // via vpitchY's inversion, the rect's top edge is driven by the
            // FAR end of the length range) and width becomes pixel-x. A
            // perspective board also turns the rect into a genuine trapezoid
            // (its four corners each get individually projected), not just
            // an inverted rect.
            isPortrait ? (
              <path
                d={(() => {
                  const corners: [number, number][] = [
                    [highlightZone.x, highlightZone.y],
                    [highlightZone.x, highlightZone.y + highlightZone.height],
                    [highlightZone.x + highlightZone.width, highlightZone.y + highlightZone.height],
                    [highlightZone.x + highlightZone.width, highlightZone.y],
                  ];
                  const pts = corners.map(([l, w]) => project(l, w));
                  return `M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]} L ${pts[2][0]} ${pts[2][1]} L ${pts[3][0]} ${pts[3][1]} Z`;
                })()}
                fill={COLORS.highlight}
                opacity={zoneOpacity}
              />
            ) : (
              <rect
                x={toPixelX(highlightZone.x, highlightZone.y)}
                y={toPixelY(highlightZone.x, highlightZone.y)}
                width={toPixelX(highlightZone.width, 0)}
                height={toPixelY(0, highlightZone.height)}
                fill={COLORS.highlight}
                opacity={zoneOpacity}
                rx={8}
              />
            )
          )}

          {arrows.map((arrow, index) => {
            const origin = players.find((p) => p.id === arrow.from);
            if (!origin) return null;
            // CurvedMovementArrow projects through whichever `project`
            // function it's given (defaults to VerticalPitch's vpitchX/Y) —
            // portrait needs it pointed at this board's perspective
            // projection instead, same axis-swap-at-the-call-site pattern as
            // every other point in this file.
            return isPortrait ? (
              <CurvedMovementArrow
                key={index}
                fromX={origin.x}
                fromY={origin.y}
                toX={arrow.to.x}
                toY={arrow.to.y}
                startFrame={arrowStartFrame(index)}
                duration={CURVED_ARROW_DRAW_DURATION}
                color={COLORS.movement}
                bow={0}
                project={project}
              />
            ) : (
              <MovementArrow
                key={index}
                fromX={origin.x}
                fromY={origin.y}
                toX={arrow.to.x}
                toY={arrow.to.y}
                startFrame={arrowStartFrame(index)}
                color={COLORS.movement}
              />
            );
          })}

          {players.map((player, index) => {
            const opacity = fadeIn(frame, 14 + index * 4, 12);
            const color = player.team === "home" ? HOME_COLOR : AWAY_COLOR;
            const isHighlighted = highlight.includes(player.id);

            // A player with an outgoing arrow glides along that exact path
            // instead of fading in already standing at the destination — the
            // marker's position uses the same progress the arrow computes
            // internally, so the disc always sits right at the arrow's
            // currently-drawn tip rather than a separately-timed animation.
            const outgoingIndex = arrows.findIndex((a) => a.from === player.id);
            const outgoing = outgoingIndex >= 0 ? arrows[outgoingIndex] : undefined;
            const glideProgress = outgoing
              ? drawIn(frame, arrowStartFrame(outgoingIndex), isPortrait ? CURVED_ARROW_DRAW_DURATION : ARROW_DRAW_DURATION)
              : 0;

            const positionAt = (progress: number) => {
              const rawX = outgoing ? player.x + (outgoing.to.x - player.x) * progress : player.x;
              const rawY = outgoing ? player.y + (outgoing.to.y - player.y) * progress : player.y;
              return project(clampPercent(rawX), clampPercent(rawY));
            };

            const [cx, cy] = positionAt(glideProgress);
            const isGliding = outgoing !== undefined && glideProgress > 0 && glideProgress < 1;

            return (
              <g key={player.id} opacity={opacity}>
                {isGliding &&
                  GHOST_TRAIL.map(({ lag, opacity: ghostOpacity }, ghostIndex) => {
                    const ghostProgress = glideProgress - lag;
                    if (ghostProgress <= 0) return null;
                    const [gx, gy] = positionAt(ghostProgress);
                    return <circle key={ghostIndex} cx={gx} cy={gy} r={PLAYER_RADIUS * 0.7} fill={color} opacity={ghostOpacity} />;
                  })}
                <JerseyDisc cx={cx} cy={cy} radius={PLAYER_RADIUS} color={color} highlighted={isHighlighted} />
                <text x={cx} y={cy + PLAYER_RADIUS + 15} textAnchor="middle" fill={COLORS.text} style={PLAYER_LABEL_STYLE}>
                  {player.label}
                </text>
              </g>
            );
          })}

          {annotations.map((annotation, index) => {
            const opacity = fadeIn(frame, 40 + index * 10, 14);
            return (
              <text
                key={index}
                x={toPixelX(annotation.x, annotation.y)}
                y={toPixelY(annotation.x, annotation.y)}
                textAnchor="middle"
                fontFamily={FONT_FAMILY}
                fontWeight={700}
                fontSize={19}
                fill={COLORS.text}
                opacity={opacity}
                style={{ filter: `drop-shadow(0 0 6px ${COLORS.background})` }}
              >
                {annotation.text}
              </text>
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
