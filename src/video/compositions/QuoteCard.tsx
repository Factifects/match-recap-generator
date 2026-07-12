import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, DISPLAY_FONT_FAMILY, FONT_FAMILY, type PanelColorKey, type Orientation } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { FEATURED_ENTRANCE_FRAMES } from "./BackgroundArt";
import { fadeIn, slideIn } from "../motion";

/** A quoted statement with attribution — the Tifo Football "manager quote
 * next to a portrait" style. For narration that's reporting what someone
 * SAID, not a fact/stat about them (that's Icon/Stat) — a direct quote reads
 * as more credible and more human than paraphrasing it into plain narration. */
export const QuoteCard: React.FC<{
  quote: string;
  attribution: string;
  backgroundImage?: string;
  backgroundImageMode?: "faded" | "featured";
  backgroundImageSide?: "left" | "right" | "center";
  backgroundColor?: PanelColorKey;
  orientation?: Orientation;
}> = ({ quote, attribution, backgroundImage, backgroundImageMode, backgroundImageSide, backgroundColor, orientation = "landscape" }) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";

  const featured = backgroundImageMode === "featured";
  // Same "image lands first, then the words" sequencing as IconInfographicCard.
  const textDelay = featured ? FEATURED_ENTRANCE_FRAMES + 4 : 0;
  const stackedLayout = featured && backgroundImageSide === "center";

  const markOpacity = fadeIn(frame, textDelay, 10);
  const quoteOpacity = fadeIn(frame, textDelay + 6, 14);
  const quoteY = slideIn(frame, textDelay + 6, 14, 20);
  const attributionOpacity = fadeIn(frame, textDelay + 24, 12);

  return (
    <SceneFrame
      backgroundColor={backgroundColor}
      backgroundImage={backgroundImage}
      backgroundImageMode={backgroundImageMode}
      backgroundImageSide={backgroundImageSide}
      contentAlign={stackedLayout ? "bottom" : "center"}
      orientation={orientation}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", maxWidth: isPortrait ? 900 : 1200 }}>
        <div style={{ opacity: markOpacity, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 112, color: COLORS.accent, lineHeight: 0.6, marginBottom: 8 }}>
          “
        </div>
        <div
          style={{
            opacity: quoteOpacity,
            transform: `translateY(${quoteY}px)`,
            fontFamily: FONT_FAMILY,
            fontWeight: 600,
            fontSize: 52,
            lineHeight: 1.35,
            color: COLORS.text,
            textAlign: "center",
          }}
        >
          {quote}
        </div>
        <div
          style={{
            marginTop: 28,
            opacity: attributionOpacity,
            fontFamily: FONT_FAMILY,
            fontWeight: 700,
            fontSize: 29,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: COLORS.textDim,
          }}
        >
          — {attribution}
        </div>
      </div>
    </SceneFrame>
  );
};
