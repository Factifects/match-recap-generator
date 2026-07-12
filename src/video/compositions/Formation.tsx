import React from "react";
import { staticFile, useCurrentFrame } from "remotion";
import { COLORS, TITLE_STYLE, PLAYER_LABEL_STYLE, type PanelColorKey, type Orientation } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { Pitch, PITCH_WIDTH, PITCH_HEIGHT, pitchX, pitchY } from "./Pitch";
import { VerticalPitch, VERTICAL_PITCH_WIDTH, VERTICAL_PITCH_HEIGHT, vpitchX, vpitchY } from "./VerticalPitch";
import { fadeIn, drawIn } from "../motion";
import { FORMATION_TEMPLATES, type FormationName } from "../formations";

interface Player {
  name: string;
}

interface FormationSide {
  team: string;
  formationName: FormationName;
  players: Player[];
  side: "home" | "away";
}

const PLAYER_RADIUS = 11;
const JERSEY_WIDTH = 30;
const JERSEY_HEIGHT = 34;
const HALF_MARGIN = 5;
const HALF_SPAN = 40;
const ENTRY_X = 50; // halfway line — players glide in from here, not a plain fade-in-place

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
 * simply aren't rendered. */
export const Formation: React.FC<{
  title?: string;
  sides: FormationSide[];
  backgroundImage?: string;
  backgroundImageMode?: "faded" | "featured";
  backgroundImageSide?: "left" | "right" | "center";
  backgroundColor?: PanelColorKey;
  jerseyImages?: Partial<Record<"home" | "away", string>>;
  /** Portrait swaps the pitch primitive/pixel functions, and — since the
   * goal-to-goal length axis is y in portrait instead of x — swaps which
   * screen axis positionX's output (still "position along pitch length",
   * regardless of orientation) and slot.y (still "position across pitch
   * width") each feed into, rather than needing a second position function. */
  orientation?: Orientation;
}> = ({ title, sides, backgroundImage, backgroundImageMode, backgroundImageSide, backgroundColor, jerseyImages, orientation = "landscape" }) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const boardWidth = isPortrait ? VERTICAL_PITCH_WIDTH : PITCH_WIDTH;
  const boardHeight = isPortrait ? VERTICAL_PITCH_HEIGHT : PITCH_HEIGHT;
  const titleOpacity = fadeIn(frame, 0, 14);
  const pitchOpacity = fadeIn(frame, 4, 16);
  const singleSide = sides.length < 2;

  return (
    <SceneFrame
      backgroundColor={backgroundColor}
      backgroundImage={backgroundImage}
      backgroundImageMode={backgroundImageMode}
      backgroundImageSide={backgroundImageSide}
      orientation={orientation}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 24 }}>{title ?? defaultTitle(sides)}</div>

        <svg width={boardWidth} height={boardHeight} viewBox={`0 0 ${boardWidth} ${boardHeight}`} style={{ overflow: "visible" }}>
          <g opacity={pitchOpacity}>
            {isPortrait ? <VerticalPitch /> : <Pitch />}
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
              const lengthCoord = ENTRY_X + (finalLengthPos - ENTRY_X) * entryProgress;
              const cx = isPortrait ? vpitchX(slot.y) : pitchX(lengthCoord);
              const cy = isPortrait ? vpitchY(lengthCoord) : pitchY(slot.y);

              return (
                <g key={`${sideIndex}-${index}`} opacity={opacity}>
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
                    <circle cx={cx} cy={cy} r={PLAYER_RADIUS} fill={color} />
                  )}
                  <text
                    x={cx}
                    y={cy + (jersey ? JERSEY_HEIGHT / 2 + 14 : 20)}
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
      </div>
    </SceneFrame>
  );
};
