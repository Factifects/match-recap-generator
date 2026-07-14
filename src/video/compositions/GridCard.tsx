import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, FONT_FAMILY, TITLE_STYLE } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { IconGlyph } from "./IconInfographicCard";
import { fadeIn, scaleSettle } from "../motion";
import type { SharedVisualProps, GridData } from "../sharedVisualProps";

const TILE_WIDTH = 380;
const TILE_WIDTH_PORTRAIT = 460;
const TILE_STAGGER_FRAMES = 6;

/** A grid of small items, each an optional icon + label + caption — for a
 * COLLECTION of related facts (this week's transfer rumors, top-scorer
 * nominees) shown together in one beat, distinct from Icon (one fact) and
 * League Table (a ranked list with a shared numeric column). */
export const GridCard: React.FC<{ data: GridData } & SharedVisualProps> = ({
  data: { title, items },
  backgroundColor,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const tileWidth = isPortrait ? TILE_WIDTH_PORTRAIT : TILE_WIDTH;
  const maxWidth = isPortrait ? 980 : 1760;
  const titleOpacity = fadeIn(frame, 0, 10);

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div style={{ width: maxWidth }}>
        {title && <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 44, textAlign: "left" }}>{title}</div>}
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center" }}>
          {items.map((item, index) => {
            const start = 10 + index * TILE_STAGGER_FRAMES;
            const opacity = fadeIn(frame, start, 14);
            const scale = scaleSettle(frame, start, 16, 0.9);
            const drawProgress = fadeIn(frame, start + 4, 14);

            return (
              <div
                key={item.label}
                style={{
                  opacity,
                  transform: `scale(${scale})`,
                  width: tileWidth,
                  background: COLORS.panel,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 20,
                  padding: "30px 28px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                  textAlign: "center",
                }}
              >
                {item.icon && <IconGlyph icon={item.icon} progress={drawProgress} color={COLORS.accent} size={64} />}
                <div style={{ fontFamily: FONT_FAMILY, fontWeight: 700, fontSize: 28, color: COLORS.text }}>{item.label}</div>
                {item.caption && (
                  <div style={{ fontFamily: FONT_FAMILY, fontWeight: 500, fontSize: 20, color: COLORS.textDim }}>{item.caption}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </SceneFrame>
  );
};
