import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, DISPLAY_FONT_FAMILY, type PanelColorKey, type Orientation } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, slideIn } from "../motion";

const WIPE_BAR_WIDTH = 360;
const WIPE_BAR_HEIGHT = 130;
const WIPE_DURATION_FRAMES = 20;
const WIPE_PASSES_CENTER_AT = 11;

/** Section-divider card: a narrow colored bar whooshes across from off-screen
 * left to off-screen right over ~20 frames, and the title slides in right as it
 * passes center — as if pushed into place by the wipe. Replaces the old static
 * flanking lines, which just read as "---HOOK---" instead of motion. */
export const ChapterCard: React.FC<{ title: string; backgroundColor?: PanelColorKey; orientation?: Orientation }> = ({
  title,
  backgroundColor,
  orientation = "landscape",
}) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const isPortrait = orientation === "portrait";

  const wipeX = interpolate(frame, [0, WIPE_DURATION_FRAMES], [-WIPE_BAR_WIDTH, width + WIPE_BAR_WIDTH], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const wipeOpacity = interpolate(frame, [0, 3, WIPE_DURATION_FRAMES - 3, WIPE_DURATION_FRAMES], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const titleX = -slideIn(frame, WIPE_PASSES_CENTER_AT, 14, 50);
  const titleOpacity = fadeIn(frame, WIPE_PASSES_CENTER_AT, 10);

  return (
    <SceneFrame backgroundColor={backgroundColor}>
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          width: WIPE_BAR_WIDTH,
          height: WIPE_BAR_HEIGHT,
          transform: `translate(${wipeX}px, -50%) skewX(-18deg)`,
          background: COLORS.accent,
          opacity: wipeOpacity,
        }}
      />
      <div
        style={{
          transform: `translateX(${titleX}px)`,
          opacity: titleOpacity,
          fontFamily: DISPLAY_FONT_FAMILY,
          fontWeight: 800,
          fontSize: 128,
          letterSpacing: 4,
          color: COLORS.text,
          textAlign: "center",
          textTransform: "uppercase",
          // Titles are meant to be short (2-5 words per SCRIPT_TEMPLATE.md),
          // but a longer one (a full question, say) still needs to not clip —
          // wrapping onto a second line beats running off the edge of the
          // frame. Both orientations wrap now; landscape's cap is just wider
          // since the frame itself is (1920px vs portrait's 1080px).
          whiteSpace: "normal",
          maxWidth: isPortrait ? 900 : 1600,
        }}
      >
        {title}
      </div>
    </SceneFrame>
  );
};
