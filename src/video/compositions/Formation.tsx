import React from "react";
import { staticFile, useCurrentFrame } from "remotion";
import { COLORS, FONT_FAMILY, TITLE_STYLE, PLAYER_LABEL_STYLE } from "../theme";
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
import { fadeIn, drawIn } from "../motion";
import { FORMATION_TEMPLATES } from "../formations";
import type { SharedVisualProps, FormationData } from "../sharedVisualProps";

type FormationSide = FormationData["sides"][number];

const PLAYER_RADIUS = 15;
const JERSEY_WIDTH = 30;
const JERSEY_HEIGHT = 34;
const HALF_MARGIN = 5;
const HALF_SPAN = 40;
const ENTRY_X = 50; // halfway line — players glide in from here, not a plain fade-in-place
// Ghost trail during the entrance glide — same lag/opacity recipe as
// TacticalBoard's GHOST_TRAIL, so a team assembling into shape reads as
// motion instead of 22 dots individually fading in mid-air.
const GHOST_TRAIL = [
  { lag: 0.22, opacity: 0.1 },
  { lag: 0.13, opacity: 0.18 },
  { lag: 0.06, opacity: 0.28 },
];

function defaultTitle(sides: FormationSide[]): string {
  return sides.map((s) => `${s.team} ${s.formationName}`).join("  vs  ");
}

/** With two sides shown at once, each team's shape is compressed into its own
 * half of the pitch (facing the other across the halfway line) instead of
 * spanning the full pitch length mirrored — spanning the full length made the
 * two XIs interleave through the middle third into an unreadable cluster. A
 * single side still gets the full pitch length, since there's no second team
 * to make room for. */
function positionX(slotX: number, side: "home" | "away", singleSide: boolean): number {
  if (singleSide) return side === "away" ? 100 - slotX : slotX;
  const ratio = slotX / 100;
  return side === "home" ? HALF_MARGIN + ratio * HALF_SPAN : 100 - HALF_MARGIN - ratio * HALF_SPAN;
}

/** Auto-positions named players into a standard formation shape on the
 * pitch — for scenes about a team's setup/shape rather than a specific
 * moment. Renders one or two sides on the same pitch at once (mirrored, so
 * two sides face each other), for scenes comparing both teams' shape
 * simultaneously. Unnamed slots (fewer players given than the formation has)
 * simply aren't rendered. Always renders on PerspectivePitch (touchline axis
 * running left/right on screen) regardless of the overall video's
 * orientation, same reasoning as TacticalBoard — a flat horizontal pitch has
 * no way to put a left-sided player on the screen's left edge.
 *
 * `boardPosition` (default "center") controls layout: centered with the
 * title above (unchanged from before), or offset left/right with the title
 * moved into a side text panel instead, mirroring VerticalTacticalBoard's
 * board+sideText row. */
export const Formation: React.FC<{ data: FormationData } & SharedVisualProps> = ({
  data: { title, sides },
  backgroundImage,
  backgroundImageMode,
  backgroundImageSide,
  backgroundColor,
  jerseyImages,
  orientation,
  boardPosition = "center",
}) => {
  const frame = useCurrentFrame();
  // Same reasoning as TacticalBoard's boardWidth/boardHeight: a landscape
  // (16:9) frame has far more spare horizontal room than the 1080px-wide
  // portrait frame the base board size was tuned for, and reusing that
  // narrow size in landscape is what caused player labels to overlap for a
  // formation with several players close together (e.g. a midfield three).
  const boardWidth = orientation === "portrait" ? PERSPECTIVE_PITCH_WIDTH : PERSPECTIVE_PITCH_WIDTH_LANDSCAPE;
  const boardHeight = orientation === "portrait" ? PERSPECTIVE_PITCH_HEIGHT : PERSPECTIVE_PITCH_HEIGHT_LANDSCAPE;
  const titleOpacity = fadeIn(frame, 0, 14);
  const pitchOpacity = fadeIn(frame, 4, 16);
  const singleSide = sides.length < 2;
  // Board Position only applies in landscape — portrait's board already
  // fills the frame edge to edge, so there's no spare room for a side panel.
  const isSideLayout = orientation !== "portrait" && (boardPosition === "left" || boardPosition === "right");
  const resolvedTitle = title ?? defaultTitle(sides);
  // lengthCoord is always the goal-to-goal (depth) axis, slot.y always the
  // touchline-to-touchline (width) axis — perspectiveProject's width
  // argument maps LOW value to screen-left, but this codebase's convention
  // is LOW y = the "right" side (see Pitch.tsx's edge labels and
  // SCRIPT_TEMPLATE.md's reference table), so width must be mirrored
  // (100 - widthCoord) or "right"-labeled players render on the screen's
  // left — same fix as TacticalBoard's `project`, confirmed via an actual
  // rendered still (see feedback_formation_slot_order_bug in memory).
  const project = (lengthCoord: number, widthCoord: number): [number, number] =>
    perspectiveProject(lengthCoord, 100 - widthCoord, boardWidth, boardHeight);

  const boardBlock = (
    <div style={{ width: boardWidth, height: boardHeight, position: "relative" }}>
        <svg width={boardWidth} height={boardHeight} viewBox={`0 0 ${boardWidth} ${boardHeight}`} style={{ overflow: "visible" }}>
          <g opacity={pitchOpacity}>
            <PerspectivePitch width={boardWidth} height={boardHeight} />
          </g>

          {sides.map((formationSide, sideIndex) => {
            const template = FORMATION_TEMPLATES[formationSide.formationName];
            const color = formationSide.side === "home" ? COLORS.homeTeam : COLORS.awayTeam;
            const jersey = jerseyImages?.[formationSide.side];

            return formationSide.players.slice(0, template.length).map((player, index) => {
              const slot = template[index];
              const finalLengthPos = positionX(slot.x, formationSide.side, singleSide);
              const start = 14 + (sideIndex * template.length + index) * 3;
              const opacity = fadeIn(frame, start, 12);
              // Players glide in from the halfway line rather than fading in
              // already standing in formation — the shape visibly assembles.
              const entryProgress = drawIn(frame, start, 16);
              const positionAt = (progress: number): [number, number] => {
                const lengthCoord = ENTRY_X + (finalLengthPos - ENTRY_X) * progress;
                return project(lengthCoord, slot.y);
              };
              const [cx, cy] = positionAt(entryProgress);
              const isGliding = entryProgress > 0 && entryProgress < 1;

              return (
                <g key={`${sideIndex}-${index}`} opacity={opacity}>
                  {isGliding &&
                    GHOST_TRAIL.map(({ lag, opacity: ghostOpacity }, ghostIndex) => {
                      const ghostProgress = entryProgress - lag;
                      if (ghostProgress <= 0) return null;
                      const [gx, gy] = positionAt(ghostProgress);
                      return <circle key={ghostIndex} cx={gx} cy={gy} r={PLAYER_RADIUS * 0.7} fill={color} opacity={ghostOpacity} />;
                    })}
                  {jersey ? (
                    <image
                      href={staticFile(jersey)}
                      x={cx - JERSEY_WIDTH / 2}
                      y={cy - JERSEY_HEIGHT / 2}
                      width={JERSEY_WIDTH}
                      height={JERSEY_HEIGHT}
                      preserveAspectRatio="xMidYMid meet"
                    />
                  ) : (
                    <JerseyDisc cx={cx} cy={cy} radius={PLAYER_RADIUS} color={color} />
                  )}
                  <text
                    x={cx}
                    y={cy + (jersey ? JERSEY_HEIGHT / 2 + 14 : PLAYER_RADIUS + 15)}
                    textAnchor="middle"
                    fill={COLORS.text}
                    style={PLAYER_LABEL_STYLE}
                  >
                    {player.name}
                  </text>
                </g>
              );
            });
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
  );

  const titlePanel = (
    <div style={{ width: 480, fontFamily: FONT_FAMILY, fontWeight: 600, fontSize: 34, lineHeight: 1.4, color: COLORS.textDim, opacity: titleOpacity }}>
      {resolvedTitle}
    </div>
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
        {!isSideLayout && <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 24 }}>{resolvedTitle}</div>}

        {isSideLayout ? (
          <div style={{ display: "flex", alignItems: "center", gap: 64 }}>
            {boardPosition === "left" ? (
              <>
                {boardBlock}
                {titlePanel}
              </>
            ) : (
              <>
                {titlePanel}
                {boardBlock}
              </>
            )}
          </div>
        ) : (
          boardBlock
        )}
      </div>
    </SceneFrame>
  );
};
