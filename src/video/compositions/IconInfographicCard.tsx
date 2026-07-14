import React from "react";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { COLORS, DISPLAY_FONT_FAMILY, FONT_FAMILY } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { FEATURED_ENTRANCE_FRAMES } from "./BackgroundArt";
import { ICON_PATHS, type IconKey } from "../icons";
import { fadeIn, scaleSettle, drawIn } from "../motion";
import type { SharedVisualProps, IconData } from "../sharedVisualProps";

export function IconGlyph({
  icon,
  progress,
  color,
  size = 170,
}: {
  icon: IconKey;
  progress: number;
  color: string;
  size?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ overflow: "visible" }}>
      <path
        d={ICON_PATHS[icon]}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={interpolate(progress, [0, 1], [1, 0])}
      />
    </svg>
  );
}

/** Real icon image if the user has supplied one (public/assets/icons/), with a
 * scale-and-fade entrance to match the vector icon's own settle timing —
 * otherwise the built-in hand-drawn stroke icon, which draws itself in via a
 * path animation instead since there's no raster equivalent of that. */
function IconArt({ icon, iconImage, frame, start, color }: { icon: IconKey; iconImage?: string; frame: number; start: number; color: string }) {
  if (iconImage) {
    const scale = scaleSettle(frame, start, 16);
    const opacity = fadeIn(frame, start, 12);
    return <Img src={staticFile(iconImage)} style={{ width: 170, height: 170, objectFit: "contain", transform: `scale(${scale})`, opacity }} />;
  }
  const drawProgress = drawIn(frame, start, 24);
  return <IconGlyph icon={icon} progress={drawProgress} color={color} />;
}

/** A single fact paired with a symbolic icon — for beats that are about ONE
 * concrete thing (a card shown, a save made) rather than a comparison or a
 * sequence of moments. */
export const IconInfographicCard: React.FC<{ data: IconData } & SharedVisualProps> = ({
  data: { icon, headline, caption },
  backgroundImage,
  backgroundImageMode,
  backgroundImageSide,
  backgroundColor,
  iconImage,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";

  const featured = backgroundImageMode === "featured";
  // A "featured" reference photo is the point of the scene — let it visibly
  // land first, then bring the fact in after, rather than both fading in at
  // once. Faded mode's image is barely visible, so it isn't worth delaying
  // anything there — same timing as before "featured" existed.
  const textDelay = featured ? FEATURED_ENTRANCE_FRAMES + 4 : 0;
  const stackedLayout = featured && backgroundImageSide === "center";
  // "center" already moves its own text out of the way (stackedLayout, below
  // the image) — "left"/"right" didn't, so a wide caption stayed centered
  // across the full frame and ran straight under the image's side panel
  // (confirmed via a still render in landscape: "chase" in a Camavinga
  // caption got cut off under the photo). Shifting the whole content block
  // toward the free half of the frame is the same fix already applied to
  // VerticalTacticalBoard for the same category of overlap. The shift is
  // exactly half of BackgroundArt's own featured-panel width in either
  // orientation, so it always clears the panel by the same margin.
  const featuredPanelWidth = isPortrait ? 440 : 620;
  const sideShift = featured && backgroundImageSide === "left" ? featuredPanelWidth / 2 : featured && backgroundImageSide === "right" ? -featuredPanelWidth / 2 : 0;

  const cardScale = scaleSettle(frame, textDelay, 16);
  const cardOpacity = fadeIn(frame, textDelay, 8);

  const headlineScale = scaleSettle(frame, textDelay + 18, 14, 0.85);
  const headlineOpacity = fadeIn(frame, textDelay + 18, 8);

  const captionOpacity = fadeIn(frame, textDelay + 26, 10);
  const captionY = interpolate(frame, [textDelay + 26, textDelay + 36], [14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFrame
      backgroundColor={backgroundColor}
      backgroundImage={backgroundImage}
      backgroundImageMode={backgroundImageMode}
      backgroundImageSide={backgroundImageSide}
      contentAlign={stackedLayout ? "bottom" : "center"}
      orientation={orientation}
    >
      <div
        style={{
          opacity: cardOpacity,
          transform: `translateX(${sideShift}px) scale(${cardScale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <IconArt icon={icon} iconImage={iconImage} frame={frame} start={textDelay} color={COLORS.accent} />
        <div
          style={{
            marginTop: 32,
            transform: `scale(${headlineScale})`,
            opacity: headlineOpacity,
            fontFamily: DISPLAY_FONT_FAMILY,
            fontSize: 144,
            color: COLORS.text,
            lineHeight: 1,
          }}
        >
          {headline}
        </div>
        <div
          style={{
            marginTop: 22,
            transform: `translateY(${captionY}px)`,
            opacity: captionOpacity,
            fontFamily: FONT_FAMILY,
            fontWeight: 600,
            fontSize: 36,
            color: COLORS.textDim,
            textAlign: "center",
            maxWidth: isPortrait ? (sideShift !== 0 ? 520 : 700) : sideShift !== 0 ? 760 : 900,
          }}
        >
          {caption}
        </div>
      </div>
    </SceneFrame>
  );
};
