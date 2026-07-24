import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, FONT_FAMILY, TITLE_STYLE, PLAYER_LABEL_STYLE, FPS } from "../theme";
import { SceneFrame } from "./SceneFrame";
import {
  PerspectivePitch,
  PERSPECTIVE_PITCH_WIDTH,
  PERSPECTIVE_PITCH_HEIGHT,
  PERSPECTIVE_PITCH_WIDTH_LANDSCAPE,
  PERSPECTIVE_PITCH_HEIGHT_LANDSCAPE,
  perspectiveProject,
} from "./PerspectivePitch";
import { JerseyDisc } from "./JerseyDisc";
import { BallGlyph } from "./BallGlyph";
import { CurvedMovementArrow, CURVED_ARROW_DRAW_DURATION, bezierPointAt, RUN_TYPE_GEOMETRY } from "./CurvedMovementArrow";
import { fadeIn, drawIn, pulse } from "../motion";
import { getCameraTransformPerspective, getCameraTransformTimeline } from "../camera";
import { computeEffectiveSeconds, resolveActiveFreeze, movesFor, statesFor, objectOpacity, type TimelineAction } from "../timelineTiming";
import type { CameraStage } from "../../model/Segment";
import type { SharedVisualProps, TacticalBoardData } from "../sharedVisualProps";

type TacticalActor = TacticalBoardData["players"][number];

interface ActorFold {
  cx: number;
  cy: number;
  state?: TacticalActor["state"];
  facing?: number;
  activeMove?: Extract<TimelineAction, { type: "move" }>;
  moveProgress?: number;
  // Pitch-percent position the active move glides FROM — the previous
  // completed move's `to`, or the roster's t=0 position if this is the
  // actor's first move. Not necessarily `players[]`'s own x/y once an actor
  // has more than one move in its chain.
  moveFromX?: number;
  moveFromY?: number;
}

// Folds every `move`/`state` action for one actor up to nominal time `te`
// into "where is this actor, and what are they doing, right now" — the
// timed-action equivalent of the legacy path's phaseIndex snapshot lookup,
// except a genuine fold over authored events rather than an array index.
// `project` takes already-clamped PITCH-PERCENT coordinates (matching every
// other call site in this file); the in-flight glide itself happens in
// PIXEL space via bezierPointAt, same convention CurvedMovementArrow uses,
// so a bowed run (from M4 on) curves identically whether it's the actor's
// own glide or the arrow drawn alongside it.
function resolveActorFold(
  actor: TacticalActor,
  timeline: TimelineAction[],
  te: number,
  project: (px: number, py: number) => [number, number],
  clampPercent: (value: number) => number,
): ActorFold {
  let fromX = actor.x;
  let fromY = actor.y;
  let activeMove: Extract<TimelineAction, { type: "move" }> | undefined;
  for (const move of movesFor(timeline, actor.id)) {
    if (move.startSeconds > te) break;
    const endSeconds = move.startSeconds + move.durationSeconds;
    if (te < endSeconds) {
      activeMove = move;
      break;
    }
    fromX = move.to.x;
    fromY = move.to.y;
  }

  let state = actor.state;
  let facing = actor.facing;
  for (const action of statesFor(timeline, actor.id)) {
    if (action.startSeconds > te) break;
    if (action.state !== undefined) state = action.state;
    if (action.facing !== undefined) facing = action.facing;
  }

  if (!activeMove) {
    const [cx, cy] = project(clampPercent(fromX), clampPercent(fromY));
    return { cx, cy, state, facing };
  }

  // Real-time-authored duration is in seconds; drawIn works in frame units,
  // so convert both ends of the window rather than teach it seconds.
  const moveProgress = drawIn(
    te * FPS,
    activeMove.startSeconds * FPS,
    Math.max(activeMove.durationSeconds, 1 / FPS) * FPS,
  );
  // Explicit per-action `bow` overrides the run type's default curvature;
  // absent that, RUN_TYPE_GEOMETRY supplies it (see CurvedMovementArrow.tsx).
  const bow = activeMove.bow ?? RUN_TYPE_GEOMETRY[activeMove.runType].bow;
  const [x1, y1] = project(clampPercent(fromX), clampPercent(fromY));
  const [x2, y2] = project(clampPercent(activeMove.to.x), clampPercent(activeMove.to.y));
  const { x: cx, y: cy } = bezierPointAt(x1, y1, x2, y2, bow, moveProgress);
  return { cx, cy, state, facing, activeMove, moveProgress, moveFromX: fromX, moveFromY: fromY };
}

interface BallFold {
  cx: number;
  cy: number;
  activePossession?: Extract<TimelineAction, { type: "possession" }>;
  progress?: number;
}

// Folds every `possession` action up to nominal time `te` into "where is the
// ball, and is it currently mid-pass" — outside of an in-flight pass window
// the ball simply snaps to its current holder's LIVE folded position every
// frame (so it visibly moves WITH a possessor who's also mid-`move`, not
// just during the pass itself), which is what makes "the eye follows the
// ball" true for a whole scene rather than only its travel moments.
// `actorPixelById` is this frame's already-computed per-actor pixel
// positions (see resolveActorFold) — reused so the ball's pass target
// tracks a moving receiver's real position, not a static roster coordinate.
function resolveBallFold(
  ball: NonNullable<TacticalBoardData["ball"]> | undefined,
  timeline: TimelineAction[],
  te: number,
  actorPixelById: Map<string, { cx: number; cy: number }>,
  project: (px: number, py: number) => [number, number],
): BallFold | null {
  if (!ball) return null;
  const possessions = timeline
    .filter((a): a is Extract<TimelineAction, { type: "possession" }> => a.type === "possession")
    .sort((a, b) => a.startSeconds - b.startSeconds);

  const [initialCx, initialCy] = project(ball.x, ball.y);
  let restCx = initialCx;
  let restCy = initialCy;
  let holderId: string | undefined = ball.belongsTo;

  for (const action of possessions) {
    if (action.startSeconds > te) break;
    const endSeconds = action.startSeconds + action.durationSeconds;
    if (te < endSeconds) {
      const fromPos = holderId ? actorPixelById.get(holderId) : undefined;
      const [fx, fy] = fromPos ? [fromPos.cx, fromPos.cy] : [restCx, restCy];
      const toPos = action.toId ? actorPixelById.get(action.toId) : undefined;
      const [tx, ty] = toPos ? [toPos.cx, toPos.cy] : action.toPoint ? project(action.toPoint.x, action.toPoint.y) : [fx, fy];
      const progress = drawIn(te * FPS, action.startSeconds * FPS, Math.max(action.durationSeconds, 1 / FPS) * FPS);
      const { x: cx, y: cy } = bezierPointAt(fx, fy, tx, ty, 0, progress);
      return { cx, cy, activePossession: action, progress };
    }
    // Fully completed before te — advance the resting reference and continue.
    if (action.toId) {
      holderId = action.toId;
      const pos = actorPixelById.get(action.toId);
      if (pos) {
        restCx = pos.cx;
        restCy = pos.cy;
      }
    } else if (action.toPoint) {
      holderId = undefined;
      [restCx, restCy] = project(action.toPoint.x, action.toPoint.y);
    }
  }

  if (holderId) {
    const pos = actorPixelById.get(holderId);
    if (pos) return { cx: pos.cx, cy: pos.cy };
  }
  return { cx: restCx, cy: restCy };
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

// How long each phase of a multi-phase demonstration holds the screen —
// exported so parseSceneScript.ts can compute a real-audio-floor duration
// from the phase count instead of guessing at narration length (see the
// dead-air pacing fix: a genuinely multi-beat board earns extra screen time
// by having extra content, not by an inflated word-count estimate). 135
// frames (4.5s @ 30fps) is enough for the phase-to-phase glide (below),
// this phase's own arrow draw, and a real ~3s hold to read its caption.
export const PHASE_DURATION_FRAMES = 135;
// How long players take to glide from their previous phase's position to
// this phase's — deliberately finishes just before arrowStartFrame(0)
// (26, below) so a phase's own arrows only start drawing once every marker
// has actually arrived, never mid-glide.
const PHASE_GLIDE_DURATION_FRAMES = 24;
const PHASE_CAPTION_START_FRAME = 34;

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

interface ResolvedPhase {
  players: TacticalBoardData["players"];
  arrows: TacticalBoardData["arrows"];
  highlightZone: TacticalBoardData["highlightZone"];
  caption?: string;
  dataPoint?: string;
}

/** A tactics-whiteboard-style diagram: named players as jersey-colored discs
 * on a pitch, arrows showing movement/passes (with a traveling highlight
 * riding the draw and a fading ghost trail behind any gliding marker), an
 * optional highlighted zone, and short text callouts explaining what the
 * diagram is illustrating. This is a schematic illustration of the
 * narration's claim (like ZoneMapCard/SequenceCard already are), not literal
 * tracking data. Always renders on PerspectivePitch — a pseudo-3D "camera
 * behind the near goal" view (narrower far end, compressed far half) with
 * the touchline axis running left/right on screen, matching broadcast/FPL-
 * style tactics boards — regardless of the overall video's orientation,
 * since a flat horizontal pitch has no way to put a left-sided player on the
 * screen's left edge (see feedback_formation_slot_order_bug in memory).
 *
 * `boardPosition` (default "center") controls where the board sits: centered
 * with the current phase's caption/dataPoint overlaid on the pitch itself
 * (unchanged from before), or offset to the left/right with that same
 * caption text moved into a side panel instead — same board+text-panel row
 * `VerticalTacticalBoard` already uses.
 *
 * When `phases` is given, the board becomes a real multi-beat demonstration:
 * the top-level players/arrows/highlightZone are phase 0, and each entry in
 * `phases` is a follow-on beat — players glide from their previous phase's
 * position to this phase's, this phase's own arrows then draw, and its
 * caption/dataPoint fade in. Without `phases`, none of this activates and
 * the board renders exactly as it always has (phase 0 is the only phase, and
 * every timing constant below reduces to today's plain single-arrangement
 * board). */
export const TacticalBoard: React.FC<{ data: TacticalBoardData } & SharedVisualProps> = ({
  data: { title, players, arrows = [], highlight = [], highlightZone, annotations = [], phases: dataPhases, timeline, ball, tacticalObjects = [] },
  camera = [{ focus: "full", zoom: 1 }],
  durationInFrames = 90,
  backgroundImage,
  backgroundImageMode,
  backgroundImageSide,
  backgroundColor,
  orientation,
  boardPosition = "center",
}) => {
  const frame = useCurrentFrame();

  // Phase 0 is always the top-level fields — a board with no `phases` field
  // is just this one-entry array, so every calculation below that reads
  // `phaseIndex`/`phaseLocalFrame` collapses back to today's plain behavior.
  const allPhases: ResolvedPhase[] = [
    { players, arrows, highlightZone },
    ...(dataPhases ?? []).map((phase) => ({
      players: phase.players,
      arrows: phase.arrows ?? [],
      highlightZone: phase.highlightZone,
      caption: phase.caption,
      dataPoint: phase.dataPoint,
    })),
  ];
  const phaseIndex = Math.min(allPhases.length - 1, Math.floor(frame / PHASE_DURATION_FRAMES));
  const phaseLocalFrame = frame - phaseIndex * PHASE_DURATION_FRAMES;
  const currentPhase = allPhases[phaseIndex];
  const previousPhase = phaseIndex > 0 ? allPhases[phaseIndex - 1] : undefined;

  // A landscape (16:9) video has ~1920px of spare horizontal room a portrait
  // (9:16) frame never had — the portrait board's 760x900 was sized for a
  // 1080px-wide portrait frame, and reused unchanged reads as cramped in
  // landscape (player labels overlapping when several sit close together).
  // Use the wider landscape board size whenever the video itself isn't
  // portrait, matching the same board's own aspect the other way for
  // portrait delivery.
  const boardWidth = orientation === "portrait" ? PERSPECTIVE_PITCH_WIDTH : PERSPECTIVE_PITCH_WIDTH_LANDSCAPE;
  const boardHeight = orientation === "portrait" ? PERSPECTIVE_PITCH_HEIGHT : PERSPECTIVE_PITCH_HEIGHT_LANDSCAPE;
  // player.x/annotation.x etc. are the goal-to-goal (length) axis, .y the
  // touchline-to-touchline (width) axis — perspectiveProject's first
  // argument is length (pixel-y, top-to-bottom), second is width (pixel-x,
  // left-to-right, LOW value = screen-left). Every script ever authored uses
  // this codebase's opposite convention (LOW y = the "right" side, matching
  // Pitch.tsx's edge labels and the SCRIPT_TEMPLATE.md reference table), so
  // width must be mirrored (100 - py) here or "right"-labeled players render
  // on the screen's left — confirmed via an actual rendered still before
  // this line was added (see feedback_formation_slot_order_bug in memory).
  const project = (px: number, py: number): [number, number] => perspectiveProject(px, 100 - py, boardWidth, boardHeight);
  const toPixelX = (px: number, py: number) => project(px, py)[0];
  const toPixelY = (px: number, py: number) => project(px, py)[1];
  const boostedCamera = boostZoom(camera);
  const cameraTransform = getCameraTransformPerspective(boostedCamera, frame, durationInFrames, boardWidth, boardHeight);
  // Board Position only applies in landscape — portrait's board already
  // fills the frame edge to edge, so there's no spare room for a side panel.
  const isSideLayout = orientation !== "portrait" && (boardPosition === "left" || boardPosition === "right");

  const titleOpacity = fadeIn(frame, 0, 14);
  const pitchOpacity = fadeIn(frame, 4, 16);
  const activeZone = currentPhase.highlightZone;
  // Phase 0 keeps today's exact fade-in delay (10 frames, after the pitch
  // itself has started appearing); a later phase's zone fades in right at
  // that phase's start instead, since the pitch is already fully visible.
  // Once visible, the zone keeps gently breathing (continuous pulse, not a
  // fixed 0.3) instead of sitting static for the rest of the scene — a
  // highlighted zone is supposed to read as "live danger area," not a
  // painted rectangle.
  const zoneOpacity = fadeIn(phaseLocalFrame, phaseIndex === 0 ? 10 : 0, 16) * pulse(frame, 90, 0.22, 0.36);

  // Center (default): the phase caption/dataPoint overlays the bottom of the
  // pitch itself, same as always. Left/Right: that same text moves into a
  // side panel instead (built below, `captionPanel`), same board+text-panel
  // row VerticalTacticalBoard already uses — see its sideText layout.
  const captionPanel = (currentPhase.caption || currentPhase.dataPoint) && (
    <div
      style={{
        width: 480,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        opacity: fadeIn(phaseLocalFrame, PHASE_CAPTION_START_FRAME, 14),
      }}
    >
      {currentPhase.caption && (
        <div style={{ fontFamily: FONT_FAMILY, fontWeight: 700, fontSize: 30, color: COLORS.text, lineHeight: 1.3 }}>
          {currentPhase.caption}
        </div>
      )}
      {currentPhase.dataPoint && (
        <div style={{ fontFamily: FONT_FAMILY, fontWeight: 600, fontSize: 19, color: COLORS.highlight }}>
          {currentPhase.dataPoint}
        </div>
      )}
    </div>
  );

  const boardBlock = (
    <>
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
            <PerspectivePitch width={boardWidth} height={boardHeight} />
          </g>

          {activeZone && (
            // A perspective board turns the highlight zone into a genuine
            // trapezoid (its four corners each get individually projected),
            // not a plain rect — length becomes pixel-y (and, via the
            // projector's inversion, the rect's top edge is driven by the
            // FAR end of the length range) and width becomes pixel-x.
            <path
              d={(() => {
                const corners: [number, number][] = [
                  [activeZone.x, activeZone.y],
                  [activeZone.x, activeZone.y + activeZone.height],
                  [activeZone.x + activeZone.width, activeZone.y + activeZone.height],
                  [activeZone.x + activeZone.width, activeZone.y],
                ];
                const pts = corners.map(([l, w]) => project(l, w));
                return `M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]} L ${pts[2][0]} ${pts[2][1]} L ${pts[3][0]} ${pts[3][1]} Z`;
              })()}
              fill={COLORS.highlight}
              opacity={zoneOpacity}
            />
          )}

          {currentPhase.arrows?.map((arrow, index) => {
            const origin = currentPhase.players.find((p) => p.id === arrow.from);
            if (!origin) return null;
            return (
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
                kind={arrow.kind}
                style={arrow.style}
              />
            );
          })}

          {currentPhase.players.map((player, index) => {
            // Phase 0 fades every marker in fresh, exactly as before. A
            // later phase only fades in a marker that's newly appearing
            // (wasn't present in the previous phase, e.g. a substitute) —
            // one that's continuing from the previous phase is already
            // fully visible and should glide into place instead of
            // re-fading, or it would visibly flicker every phase change.
            const previousPlayer = previousPhase?.players.find((p) => p.id === player.id);
            const opacity =
              phaseIndex === 0
                ? fadeIn(frame, 14 + index * 4, 12)
                : previousPlayer
                  ? 1
                  : fadeIn(phaseLocalFrame, 0, 12);
            const color = player.team === "home" ? HOME_COLOR : AWAY_COLOR;
            const isHighlighted = phaseIndex === 0 && highlight.includes(player.id);

            // Two sequential motions, never overlapping: first (phase>0
            // only) a glide from last phase's position to this phase's
            // (finishes at PHASE_GLIDE_DURATION_FRAMES, well before any
            // arrow starts at frame 26+), then — if this phase gives the
            // player an outgoing "run" arrow — a further glide from that
            // now-settled position out to the arrow's endpoint. A "pass"
            // arrow is deliberately excluded from this lookup: its whole
            // point is that the FROM player stays exactly where they are and
            // only the ball (the arrow's own travel-dot, drawn below
            // regardless of kind) moves to the endpoint — confirmed via a
            // real render that treating a pass the same as a run made the
            // passer's own disc slide across the pitch to the receiver's
            // feet, reading as "the passer ran there" instead of "the ball
            // was played there."
            const outgoingIndex = currentPhase.arrows?.findIndex((a) => a.from === player.id && a.kind !== "pass") ?? -1;
            const outgoing = outgoingIndex >= 0 ? currentPhase.arrows![outgoingIndex] : undefined;

            const positionAt = (localFrame: number) => {
              const transitionT =
                phaseIndex === 0 || !previousPlayer ? 1 : drawIn(localFrame, 0, PHASE_GLIDE_DURATION_FRAMES);
              const entryX = previousPlayer?.x ?? player.x;
              const entryY = previousPlayer?.y ?? player.y;
              const baseX = entryX + (player.x - entryX) * transitionT;
              const baseY = entryY + (player.y - entryY) * transitionT;
              const arrowT = outgoing ? drawIn(localFrame, arrowStartFrame(outgoingIndex), CURVED_ARROW_DRAW_DURATION) : 0;
              const rawX = outgoing ? baseX + (outgoing.to.x - player.x) * arrowT : baseX;
              const rawY = outgoing ? baseY + (outgoing.to.y - player.y) * arrowT : baseY;
              return project(clampPercent(rawX), clampPercent(rawY));
            };

            const [cx, cy] = positionAt(phaseLocalFrame);
            const arrowDuration = CURVED_ARROW_DRAW_DURATION;
            const isTransitioning = phaseIndex > 0 && !!previousPlayer && phaseLocalFrame < PHASE_GLIDE_DURATION_FRAMES;
            const arrowGlideActive =
              !!outgoing &&
              phaseLocalFrame >= arrowStartFrame(outgoingIndex) &&
              phaseLocalFrame < arrowStartFrame(outgoingIndex) + arrowDuration;
            const isGliding = isTransitioning || arrowGlideActive;
            // Ghost trail's `lag` is a fraction of whichever motion is
            // currently playing — the phase-to-phase glide (24 frames) or
            // the arrow follow (18 frames) — matching the original single-
            // phase board's convention of `lag` as a fraction of that
            // motion's own draw duration, not an absolute frame count.
            const activeMotionDuration = isTransitioning ? PHASE_GLIDE_DURATION_FRAMES : arrowDuration;

            return (
              <g key={player.id} opacity={opacity}>
                {isGliding &&
                  GHOST_TRAIL.map(({ lag, opacity: ghostOpacity }, ghostIndex) => {
                    const ghostLocalFrame = phaseLocalFrame - Math.round(lag * activeMotionDuration);
                    if (ghostLocalFrame <= 0) return null;
                    const [gx, gy] = positionAt(ghostLocalFrame);
                    return <circle key={ghostIndex} cx={gx} cy={gy} r={PLAYER_RADIUS * 0.7} fill={color} opacity={ghostOpacity} />;
                  })}
                <JerseyDisc cx={cx} cy={cy} radius={PLAYER_RADIUS} color={color} highlighted={isHighlighted} />
                <text x={cx} y={cy + PLAYER_RADIUS + 15} textAnchor="middle" fill={COLORS.text} style={PLAYER_LABEL_STYLE}>
                  {player.label}
                </text>
              </g>
            );
          })}

          {phaseIndex === 0 &&
            annotations.map((annotation, index) => {
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
        {!isSideLayout && (currentPhase.caption || currentPhase.dataPoint) && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 18,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              opacity: fadeIn(phaseLocalFrame, PHASE_CAPTION_START_FRAME, 14),
              padding: "0 24px",
            }}
          >
            {currentPhase.caption && (
              <div
                style={{
                  fontFamily: FONT_FAMILY,
                  fontWeight: 700,
                  fontSize: 22,
                  color: COLORS.text,
                  textAlign: "center",
                  textShadow: `0 0 10px ${COLORS.background}`,
                }}
              >
                {currentPhase.caption}
              </div>
            )}
            {currentPhase.dataPoint && (
              <div
                style={{
                  fontFamily: FONT_FAMILY,
                  fontWeight: 600,
                  fontSize: 16,
                  color: COLORS.highlight,
                  textAlign: "center",
                }}
              >
                {currentPhase.dataPoint}
              </div>
            )}
          </div>
        )}
        </div>
    </>
  );

  // Evented alternative to the snapshot/glide model above — computed
  // independently from allPhases/phaseIndex/currentPhase (which stay exactly
  // as they were, still evaluated above from an untouched `dataPhases`, now
  // simply unused when `timeline` is present) rather than folded into that
  // logic, so a `phases`-authored scene's rendering can never regress. See
  // resolveActorFold/computeEffectiveSeconds above for the actual fold.
  const te = timeline ? computeEffectiveSeconds(timeline, frame / FPS) : 0;
  const actorFolds = timeline ? players.map((player) => resolveActorFold(player, timeline, te, project, clampPercent)) : [];
  const actorPixelById = new Map(
    actorFolds.map((fold, index) => [players[index].id, { cx: fold.cx, cy: fold.cy }]),
  );
  const ballFold = timeline ? resolveBallFold(ball, timeline, te, actorPixelById, project) : null;
  // A timeline scene with no `camera`-type actions at all still respects the
  // scene-level Camera: field (falls back to the same `cameraTransform` the
  // legacy path uses) — only a scene that actually authors camera events on
  // its timeline gets the finer-grained, arbitrary-event-count behavior.
  const timelineCameraEvents = timeline
    ? timeline.filter((a): a is Extract<TimelineAction, { type: "camera" }> => a.type === "camera")
    : [];
  const timelineCameraTransform =
    timeline && timelineCameraEvents.length > 0
      ? getCameraTransformTimeline(timelineCameraEvents, te, boardWidth, boardHeight)
      : cameraTransform;
  const activeFreeze = timeline ? resolveActiveFreeze(timeline, frame / FPS) : null;

  // Guarded at construction, not just at the point it's chosen for output
  // below (`{timeline ? timelineBoardBlock : ...}`) — a plain `const x =
  // (<jsx/>)` still runs every .map() inside it eagerly on EVERY render
  // regardless of which branch the JSX tree ends up using, so a legacy
  // (non-timeline) scene was still executing every `actorFolds[index]`/
  // `ballFold`-dependent loop below against empty/mismatched data and
  // crashing before React ever got to discard the unused branch. Skipping
  // construction entirely here is the actual fix — the two crashes hit
  // during the regression check (actorPixelById, then this block's own
  // arrow-render loop) were both this same root cause, not two unrelated bugs.
  const timelineBoardBlock = !timeline ? null : (
    <>
      <div style={{ width: boardWidth, height: boardHeight, overflow: "hidden", position: "relative" }}>
        <svg
          width={boardWidth}
          height={boardHeight}
          viewBox={`0 0 ${boardWidth} ${boardHeight}`}
          style={{ overflow: "visible", transform: timelineCameraTransform, transformOrigin: "0 0", position: "absolute", top: 0, left: 0 }}
        >
          <g opacity={pitchOpacity}>
            <PerspectivePitch width={boardWidth} height={boardHeight} />
          </g>

          {activeZone && (
            <path
              d={(() => {
                const corners: [number, number][] = [
                  [activeZone.x, activeZone.y],
                  [activeZone.x, activeZone.y + activeZone.height],
                  [activeZone.x + activeZone.width, activeZone.y + activeZone.height],
                  [activeZone.x + activeZone.width, activeZone.y],
                ];
                const pts = corners.map(([l, w]) => project(l, w));
                return `M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]} L ${pts[2][0]} ${pts[2][1]} L ${pts[3][0]} ${pts[3][1]} Z`;
              })()}
              fill={COLORS.highlight}
              opacity={zoneOpacity}
            />
          )}

          {tacticalObjects.map((object, index) => {
            if (object.shape === "zone") {
              const opacity = objectOpacity(te, object.appearSeconds, object.disappearSeconds);
              const corners: [number, number][] = [
                [object.x, object.y],
                [object.x, object.y + object.height],
                [object.x + object.width, object.y + object.height],
                [object.x + object.width, object.y],
              ];
              const pts = corners.map(([l, w]) => project(l, w));
              return (
                <path
                  key={index}
                  d={`M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]} L ${pts[2][0]} ${pts[2][1]} L ${pts[3][0]} ${pts[3][1]} Z`}
                  fill={COLORS.highlight}
                  opacity={opacity * 0.3}
                />
              );
            }
            if (object.shape === "line") {
              const opacity = objectOpacity(te, object.appearSeconds, object.disappearSeconds);
              const [x1, y1] = project(object.x, 0);
              const [x2, y2] = project(object.x, 100);
              return (
                <g key={index} opacity={opacity}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={COLORS.movement} strokeWidth={2} strokeDasharray="10 6" />
                  {object.label && (
                    <text
                      x={(x1 + x2) / 2}
                      y={Math.min(y1, y2) - 10}
                      textAnchor="middle"
                      fontFamily={FONT_FAMILY}
                      fontWeight={700}
                      fontSize={15}
                      fill={COLORS.text}
                    >
                      {object.label}
                    </text>
                  )}
                </g>
              );
            }
            if (object.shape === "lane") {
              const opacity = objectOpacity(te, object.appearSeconds, object.closesAtSeconds);
              const [x1, y1] = project(object.from.x, object.from.y);
              const [x2, y2] = project(object.to.x, object.to.y);
              return (
                <line
                  key={index}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={COLORS.highlight}
                  strokeWidth={2.5}
                  strokeDasharray="4 5"
                  opacity={opacity}
                />
              );
            }
            // triangle
            const opacity = objectOpacity(te, object.appearSeconds, object.disappearSeconds);
            const pts = object.points.map((p) => project(p.x, p.y));
            return (
              <polygon
                key={index}
                points={pts.map(([x, y]) => `${x},${y}`).join(" ")}
                fill={COLORS.highlight}
                fillOpacity={0.12 * opacity}
                stroke={COLORS.highlight}
                strokeWidth={1.5}
                opacity={opacity}
              />
            );
          })}

          {players.map((player, index) => {
            const fold = actorFolds[index];
            if (!fold.activeMove) return null;
            // A visual trail alongside the gliding disc below, exactly like
            // a legacy phase's "outgoing run arrow" — same component, now
            // curved/dashed per the move's runType (RUN_TYPE_GEOMETRY), same
            // bow the disc itself glides along (see resolveActorFold).
            const geometry = RUN_TYPE_GEOMETRY[fold.activeMove.runType];
            return (
              <CurvedMovementArrow
                key={player.id}
                fromX={fold.moveFromX ?? player.x}
                fromY={fold.moveFromY ?? player.y}
                toX={fold.activeMove.to.x}
                toY={fold.activeMove.to.y}
                startFrame={fold.activeMove.startSeconds * FPS}
                duration={Math.max(fold.activeMove.durationSeconds, 1 / FPS) * FPS}
                color={COLORS.movement}
                bow={fold.activeMove.bow ?? geometry.bow}
                project={project}
                kind="run"
                style={geometry.style}
              />
            );
          })}

          {players.map((player, index) => {
            const fold = actorFolds[index];
            // Deliberately NOT the legacy per-index stagger (14 + index*4) —
            // that spreads an 8-player roster's entrance across ~1.8s, which
            // collides with authored choreography that (correctly) starts
            // acting within that same window, so a later-indexed player can
            // end up mid-`move` before it's even finished fading in. A
            // timeline scene's only staggering should be the authored
            // `startSeconds`, not an incidental array-index entrance effect —
            // every actor fades in together, quickly, before frame 0's `te`
            // can meaningfully differ from any action's startSeconds.
            const opacity = fadeIn(frame, 4, 14);
            const color = player.team === "home" ? HOME_COLOR : AWAY_COLOR;
            const isHighlighted = highlight.includes(player.id);
            return (
              <g key={player.id} opacity={opacity}>
                <JerseyDisc
                  cx={fold.cx}
                  cy={fold.cy}
                  radius={PLAYER_RADIUS}
                  color={color}
                  highlighted={isHighlighted}
                  facing={fold.facing}
                  state={fold.state}
                />
                <text x={fold.cx} y={fold.cy + PLAYER_RADIUS + 15} textAnchor="middle" fill={COLORS.text} style={PLAYER_LABEL_STYLE}>
                  {player.label}
                </text>
              </g>
            );
          })}

          {ballFold && (
            // Rendered on top of every player disc — the eye should always
            // be able to find the ball, including while it's resting on a
            // possessor who's themselves mid-`move` (resolveBallFold snaps
            // to that possessor's LIVE position every frame, not just during
            // an active `possession` window). Reuses BallGlyph directly
            // rather than routing through CurvedMovementArrow's kind="pass"
            // rendering — that component projects raw pitch-percent
            // endpoints, but the ball's endpoints here are already-resolved
            // PIXEL positions of (possibly independently moving) actors, so
            // the two don't compose; a ghost trail matching
            // CurvedMovementArrow's is a reasonable follow-up, not done here.
            <BallGlyph cx={ballFold.cx} cy={ballFold.cy} size={9} opacity={fadeIn(frame, 4, 14)} />
          )}

          {activeFreeze && (
            <>
              {/* Dims the whole board (pitch, arrows, players, ball — every-
                  thing already drawn above this point in the svg) so the
                  freeze's own circle/annotation callouts below read as the
                  bright, singled-out thing to look at, matching the "pause,
                  then draw over it" coaching-analysis technique this is
                  modeled on. */}
              <rect
                x={0}
                y={0}
                width={boardWidth}
                height={boardHeight}
                fill="#000000"
                opacity={fadeIn(activeFreeze.localSeconds * FPS, 0, 8) * 0.4}
              />
              {activeFreeze.freeze.circles?.map((circle, index) => {
                const [cx, cy] = project(circle.x, circle.y);
                return (
                  <circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r={circle.radius}
                    fill="none"
                    stroke={COLORS.highlight}
                    strokeWidth={3}
                    opacity={fadeIn(activeFreeze.localSeconds * FPS, 6, 10)}
                  />
                );
              })}
              {activeFreeze.freeze.annotations?.map((annotation, index) => {
                const [x, y] = project(annotation.x, annotation.y);
                return (
                  <text
                    key={index}
                    x={x}
                    y={y - 26}
                    textAnchor="middle"
                    fontFamily={FONT_FAMILY}
                    fontWeight={700}
                    fontSize={22}
                    fill={COLORS.text}
                    opacity={fadeIn(activeFreeze.localSeconds * FPS, 10, 12)}
                    style={{ filter: `drop-shadow(0 0 6px ${COLORS.background})` }}
                  >
                    {annotation.text}
                  </text>
                );
              })}
            </>
          )}

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
    </>
  );

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

        {timeline ? (
          timelineBoardBlock
        ) : isSideLayout ? (
          <div style={{ display: "flex", alignItems: "center", gap: 64 }}>
            {boardPosition === "left" ? (
              <>
                {boardBlock}
                {captionPanel}
              </>
            ) : (
              <>
                {captionPanel}
                {boardBlock}
              </>
            )}
          </div>
        ) : (
          boardBlock
        )}

        {!timeline && allPhases.length > 1 && (
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            {allPhases.map((_, index) => (
              <div
                key={index}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  background: index === phaseIndex ? COLORS.highlight : COLORS.border,
                  transition: "background 0.2s",
                }}
              />
            ))}
          </div>
        )}
      </div>
    </SceneFrame>
  );
};
