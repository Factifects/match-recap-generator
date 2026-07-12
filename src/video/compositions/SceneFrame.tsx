import React from "react";
import { AbsoluteFill } from "remotion";
import { COLORS, PANEL_COLORS, type PanelColorKey, type Orientation } from "../theme";
import { MotionBackdrop } from "./MotionBackdrop";
import { BackgroundArt } from "./BackgroundArt";

/** Every card composition wraps its content in this instead of repeating its
 * own `<AbsoluteFill style={{background,...}}><MotionBackdrop /></AbsoluteFill>`
 * boilerplate — this is what used to be duplicated across all ~16 card
 * files. Centralizing it means a new cross-cutting concern (like
 * `backgroundColor` here) only needs wiring once, not once per card.
 *
 * `backgroundImage`/`backgroundImageMode`/`backgroundImageSide` are safe to
 * pass on every card now (BackgroundArt renders nothing when `backgroundImage`
 * is undefined) — cards that never resolved one before simply keep rendering
 * nothing, same as today.
 *
 * `contentAlign` defaults to "center" (today's behavior, unchanged). A card
 * passes "bottom" when it's using a "center"-positioned featured image and
 * needs its own text pushed clear of it instead of overlapping — see
 * IconInfographicCard/SingleStatCard's `stackedLayout`. */
export const SceneFrame: React.FC<{
  backgroundColor?: PanelColorKey;
  backgroundImage?: string;
  backgroundImageMode?: "faded" | "featured";
  backgroundImageSide?: "left" | "right" | "center";
  contentAlign?: "center" | "bottom";
  orientation?: Orientation;
  children: React.ReactNode;
}> = ({
  backgroundColor,
  backgroundImage,
  backgroundImageMode,
  backgroundImageSide,
  contentAlign = "center",
  orientation,
  children,
}) => {
  const background = backgroundColor ? PANEL_COLORS[backgroundColor] : COLORS.background;

  return (
    <AbsoluteFill
      style={{
        background,
        alignItems: "center",
        justifyContent: contentAlign === "bottom" ? "flex-end" : "center",
        paddingBottom: contentAlign === "bottom" ? 90 : 0,
      }}
    >
      <MotionBackdrop />
      <BackgroundArt src={backgroundImage} mode={backgroundImageMode} side={backgroundImageSide} orientation={orientation} />
      {children}
    </AbsoluteFill>
  );
};
