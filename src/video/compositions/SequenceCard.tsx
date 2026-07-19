import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, DISPLAY_FONT_FAMILY, FONT_FAMILY, TITLE_STYLE } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, slideIn } from "../motion";
import type { SharedVisualProps, SequenceData } from "../sharedVisualProps";

/** For connected moments that build on each other — "X, then Y, N minutes apart."
 * Beats reveal in sequence with a connecting line drawing between them, rather
 * than appearing all at once, so the causality/momentum reads visually. */
export const SequenceCard: React.FC<{ data: SequenceData } & SharedVisualProps> = ({
  data: { title, beats },
  backgroundColor,
  backgroundImage,
  backgroundImageMode,
  backgroundImageSide,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";

  const titleOpacity = fadeIn(frame, 0, 10);
  const beatGapFrames = 18;

  return (
    <SceneFrame
      backgroundColor={backgroundColor}
      backgroundImage={backgroundImage}
      backgroundImageMode={backgroundImageMode}
      backgroundImageSide={backgroundImageSide}
      orientation={orientation}
    >
      <div style={{ width: isPortrait ? 900 : 1300 }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 48 }}>{title}</div>

        {beats.map((beat, index) => {
          const beatStart = 10 + index * beatGapFrames;
          const opacity = fadeIn(frame, beatStart, 10);
          const translateX = slideIn(frame, beatStart, 10, 30);

          const connectorStart = beatStart + beatGapFrames - 10;
          const connectorHeight = interpolate(frame, [connectorStart, connectorStart + 10], [0, 68], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <div key={index}>
              <div
                style={{
                  opacity,
                  transform: `translateX(${translateX}px)`,
                  display: "flex",
                  // A short minute marker ("60'") and a long phrase marker
                  // ("If Fernández leaves") both pass through this same
                  // `marker` slot — a long one wraps to 2-3 lines, which
                  // made "center" alignment read as broken (the single-line
                  // body text looked like it floated above where the tag's
                  // text actually sat). Top-aligning both columns, with a
                  // small nudge on the body so its first line's cap-height
                  // lines up with the marker's, reads correctly either way.
                  alignItems: "flex-start",
                  gap: 34,
                }}
              >
                <div
                  style={{
                    fontFamily: DISPLAY_FONT_FAMILY,
                    fontWeight: 800,
                    fontSize: 62,
                    lineHeight: 1.05,
                    color: COLORS.accent,
                    width: 280,
                  }}
                >
                  {beat.marker}
                </div>
                <div style={{ fontFamily: FONT_FAMILY, fontWeight: 600, fontSize: 46, color: COLORS.text, paddingTop: 10 }}>
                  {beat.label}
                </div>
              </div>
              {index < beats.length - 1 && (
                <div
                  style={{
                    width: 3,
                    height: connectorHeight,
                    background: COLORS.border,
                    marginLeft: 30,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </SceneFrame>
  );
};
