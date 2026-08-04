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
      {/* Ambient depth pass, under the content: a faint light source above
          center plus a corner vignette. A dead-flat panel color is the
          single clearest "slide deck, not film" tell next to professionally
          graded motion graphics — this stays deliberately far below
          noticeable-as-an-effect level (a viewer should feel the frame has
          depth, not see a gradient). Rendered UNDER children so text/labels
          keep their exact current contrast. */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 50% 30%, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0) 60%)," +
            "radial-gradient(ellipse 120% 110% at 50% 50%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.30) 100%)",
        }}
      />
      {children}
    </AbsoluteFill>
  );
};
