import React from "react";
import { useCurrentFrame, staticFile } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { SuspenseLoader3D } from "./SuspenseLoader3D";
import { COLORS, FONT_FAMILY, TITLE_STYLE } from "../theme";
import { SceneFrame } from "./SceneFrame";
import {
  PERSPECTIVE_PITCH_WIDTH,
  PERSPECTIVE_PITCH_HEIGHT,
  PERSPECTIVE_PITCH_WIDTH_LANDSCAPE,
  PERSPECTIVE_PITCH_HEIGHT_LANDSCAPE,
} from "./PerspectivePitch";
import { Pitch3D } from "./Pitch3D";
import { PlayerMarker3D, DEFAULT_JERSEY_3D } from "./PlayerMarker3D";
import { CameraRig3D } from "./CameraRig3D";
import { percentToWorld, MARKER_HEIGHT_UNITS } from "../coords3D";
import { resolveCameraPose3D } from "../camera3D";
import { fadeIn, drawIn } from "../motion";
import { FORMATION_TEMPLATES } from "../formations";
import type { SharedVisualProps, Formation3DData } from "../sharedVisualProps";

type FormationSide = Formation3DData["sides"][number];

const PLAYER_RADIUS = 0.55;
const HALF_MARGIN = 5;
const HALF_SPAN = 40;
const ENTRY_X = 50; // halfway line — players glide in from here, matching Formation.tsx

function defaultTitle(sides: FormationSide[]): string {
  return sides.map((s) => `${s.team} ${s.formationName}`).join("  vs  ");
}

// Same halving rule as Formation.tsx's positionX: two sides compress into
// their own half of the pitch facing each other; a single side spans the
// full length.
function positionX(slotX: number, side: "home" | "away", singleSide: boolean): number {
  if (singleSide) return side === "away" ? 100 - slotX : slotX;
  const ratio = slotX / 100;
  return side === "home" ? HALF_MARGIN + ratio * HALF_SPAN : 100 - HALF_MARGIN - ratio * HALF_SPAN;
}

/** 3D counterpart to Formation — same FORMATION_TEMPLATES auto-positioning,
 * rendered as billboarded jersey markers on a genuine 3D pitch with an
 * arcing camera instead of the 2D perspective board. Uses a real per-side
 * jersey (SharedVisualProps' `jerseyImages`) when resolved, same as
 * Formation.tsx, falling back to the generic recolored jersey otherwise —
 * unlike Formation.tsx's RolePod fallback, since this 3D family always shows
 * a jersey (see PlayerMarker3D/DEFAULT_JERSEY_3D). Role-pill labels are a
 * 2D-only affordance for now — v1 3D markers show the player's name via
 * PlayerMarker3D's billboard label, matching the scope cut already made for
 * TacticalBoard3D. */
export const Formation3D: React.FC<{ data: Formation3DData } & SharedVisualProps> = ({
  data: { title, sides, cameraStyle = "sway" },
  durationInFrames = 90,
  backgroundImage,
  backgroundImageMode,
  backgroundImageSide,
  backgroundColor,
  orientation,
  boardPosition = "center",
  jerseyImages,
}) => {
  const frame = useCurrentFrame();
  const boardWidth = orientation === "portrait" ? PERSPECTIVE_PITCH_WIDTH : PERSPECTIVE_PITCH_WIDTH_LANDSCAPE;
  const boardHeight = orientation === "portrait" ? PERSPECTIVE_PITCH_HEIGHT : PERSPECTIVE_PITCH_HEIGHT_LANDSCAPE;
  const titleOpacity = fadeIn(frame, 0, 14);
  const singleSide = sides.length < 2;
  const isSideLayout = orientation !== "portrait" && (boardPosition === "left" || boardPosition === "right");
  const resolvedTitle = title ?? defaultTitle(sides);
  // "two-team-reveal" needs each side's own cluster center to hold on — the
  // same HALF_MARGIN/HALF_SPAN halves positionX() lays players out into, not
  // the players' own (still-animating) positions, so the target is stable
  // from frame 0 rather than chasing a still-entering marker. It also wants
  // its own (tighter) default radius/height, NOT the wide radius:30 the
  // other styles use — that wide shot fitting both full XIs at once is
  // exactly the unreadable framing this style exists to avoid, so those two
  // options are only passed to every OTHER style here, not this one.
  const pose =
    cameraStyle === "two-team-reveal" && !singleSide
      ? resolveCameraPose3D(cameraStyle, frame, durationInFrames, {
          target: percentToWorld(25, 50, 1.2),
          targetB: percentToWorld(75, 50, 1.2),
        })
      : resolveCameraPose3D(cameraStyle, frame, durationInFrames, { radius: 30, height: 17 });

  const boardBlock = (
    <div style={{ width: boardWidth, height: boardHeight }}>
      <ThreeCanvas width={boardWidth} height={boardHeight} camera={{ position: pose.position, fov: pose.fov }}>
        <SuspenseLoader3D>
          <CameraRig3D pose={pose} />
          <ambientLight intensity={1.1} />
          <directionalLight position={[10, 20, 10]} intensity={0.6} />
          <Pitch3D />
          {sides.map((formationSide, sideIndex) => {
            const template = FORMATION_TEMPLATES[formationSide.formationName];
            const color = formationSide.side === "home" ? COLORS.homeTeam : COLORS.awayTeam;
            // jerseyImages values are paths relative to public/, resolved via
            // findAsset() at parse time (see its docstring) — "suitable for
            // Remotion's staticFile()," not already a resolved URL, same as
            // how Formation.tsx's 2D <image href={staticFile(jersey)}/>
            // wraps it at the point of use. DEFAULT_JERSEY_3D is already
            // staticFile()-resolved (computed once in PlayerMarker3D.tsx), so
            // only the real-team path needs wrapping here.
            const resolvedJerseyPath = jerseyImages?.[formationSide.side];
            const jersey = resolvedJerseyPath ? staticFile(resolvedJerseyPath) : DEFAULT_JERSEY_3D;
            return formationSide.players.slice(0, template.length).map((player, index) => {
              const slot = template[index];
              const finalLengthPos = positionX(slot.x, formationSide.side, singleSide);
              const start = 14 + (sideIndex * template.length + index) * 3;
              const opacity = fadeIn(frame, start, 12);
              const entryProgress = drawIn(frame, start, 16);
              const lengthCoord = ENTRY_X + (finalLengthPos - ENTRY_X) * entryProgress;
              return (
                <PlayerMarker3D
                  key={`${sideIndex}-${index}`}
                  position={percentToWorld(lengthCoord, slot.y, MARKER_HEIGHT_UNITS)}
                  color={color}
                  jerseyImage={jersey}
                  label={player.name}
                  radius={PLAYER_RADIUS}
                  opacity={opacity}
                />
              );
            });
          })}
        </SuspenseLoader3D>
      </ThreeCanvas>
    </div>
  );

  const titlePanel = (
    <div
      style={{
        width: 480,
        fontFamily: FONT_FAMILY,
        fontWeight: 600,
        fontSize: 34,
        lineHeight: 1.4,
        color: COLORS.textDim,
        opacity: titleOpacity,
      }}
    >
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
