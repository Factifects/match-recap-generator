import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, DISPLAY_FONT_FAMILY, FONT_FAMILY, TITLE_STYLE } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { FEATURED_ENTRANCE_FRAMES } from "./BackgroundArt";
import { fadeIn } from "../motion";
import type { SharedVisualProps, SingleStatData } from "../sharedVisualProps";

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** A single number climbing from 0 to its final value — for a stat that
 * stands alone (an xG total, a distance covered) rather than a two-sided or
 * multi-category comparison. `context` is an optional second line for a
 * contrasting fact the number is measured against (e.g. a frozen scoreline). */
export const SingleStatCard: React.FC<{ data: SingleStatData } & SharedVisualProps> = ({
  data: { title, value, context, prefix, suffix },
  backgroundImage,
  backgroundImageMode,
  backgroundImageSide,
  backgroundColor,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";

  const featured = backgroundImageMode === "featured";
  // Same "image lands first, then the fact" sequencing as IconInfographicCard.
  const textDelay = featured ? FEATURED_ENTRANCE_FRAMES + 4 : 0;
  const stackedLayout = featured && backgroundImageSide === "center";
  // Same left/right overlap fix as IconInfographicCard — "center" already
  // moves its text below the image (stackedLayout); "left"/"right" need the
  // whole content block shifted clear of the image's featured panel instead.
  // Shift is exactly half of BackgroundArt's own panel width in either
  // orientation, so it always clears the panel by the same margin.
  const featuredPanelWidth = isPortrait ? 440 : 620;
  const sideShift = featured && backgroundImageSide === "left" ? featuredPanelWidth / 2 : featured && backgroundImageSide === "right" ? -featuredPanelWidth / 2 : 0;

  const titleOpacity = fadeIn(frame, textDelay, 14);
  const countProgress = fadeIn(frame, textDelay + 10, 26);
  const contextOpacity = fadeIn(frame, textDelay + 40, 14);
  const count = value * countProgress;

  return (
    <SceneFrame
      backgroundColor={backgroundColor}
      backgroundImage={backgroundImage}
      backgroundImageMode={backgroundImageMode}
      backgroundImageSide={backgroundImageSide}
      contentAlign={stackedLayout ? "bottom" : "center"}
      orientation={orientation}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: `translateX(${sideShift}px)` }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 24 }}>{title}</div>
        <div style={{ fontFamily: DISPLAY_FONT_FAMILY, fontSize: 200, color: COLORS.accent, lineHeight: 1 }}>
          {prefix}
          {formatValue(count)}
          {suffix}
        </div>
        {context && (
          <div
            style={{
              marginTop: 18,
              opacity: contextOpacity,
              fontFamily: FONT_FAMILY,
              fontWeight: 600,
              fontSize: 32,
              color: COLORS.textDim,
              textAlign: "center",
              maxWidth: isPortrait ? (sideShift !== 0 ? 520 : 700) : sideShift !== 0 ? 760 : 900,
            }}
          >
            {context}
          </div>
        )}
      </div>
    </SceneFrame>
  );
};
