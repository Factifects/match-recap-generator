import React from "react";
import { useVideoConfig } from "remotion";
import { GENERATED_COMPONENTS } from "../generated";
import { COLORS, FONT_FAMILY } from "../theme";
import type { SharedVisualProps, MotionData } from "../sharedVisualProps";

/** Renders an AI-generated motion component by id.
 *
 * The visible-failure branch is deliberate. Everywhere else in this engine an
 * unresolvable visual degrades quietly to a caption, which is right for a
 * hand-written script — a typo shouldn't destroy a render. Here it would be
 * exactly wrong: a missing generated component means the generation step
 * failed, and a scene that silently turns into text hides that from the only
 * person who can fix it. So it says so, on screen, in the frame where it
 * happened. */
export const GeneratedMotionCard: React.FC<{ data: MotionData } & SharedVisualProps> = ({
  data,
  orientation,
  narrationText,
}) => {
  const { durationInFrames } = useVideoConfig();
  const Component = GENERATED_COMPONENTS[data.component];

  if (!Component) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: COLORS.background,
          color: COLORS.text,
          fontFamily: FONT_FAMILY,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: 64,
          fontSize: 34,
          fontWeight: 700,
          lineHeight: 1.35,
        }}
      >
        Generated component &ldquo;{data.component}&rdquo; is not in the registry — regenerate this
        scene.
      </div>
    );
  }

  return (
    <Component
      durationInFrames={durationInFrames}
      orientation={orientation === "portrait" ? "portrait" : "landscape"}
      narrationText={narrationText}
    />
  );
};
