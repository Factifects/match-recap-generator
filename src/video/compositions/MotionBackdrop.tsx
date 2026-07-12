import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS } from "../theme";

const BRACKET_SIZE = 56;
const BRACKET_INSET = 64;
const BRACKET_THICKNESS = 3;

function Corner({ top, right, bottom, left, hLength, vLength }: {
  top?: boolean;
  right?: boolean;
  bottom?: boolean;
  left?: boolean;
  hLength: number;
  vLength: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: top ? BRACKET_INSET : undefined,
        bottom: bottom ? BRACKET_INSET : undefined,
        left: left ? BRACKET_INSET : undefined,
        right: right ? BRACKET_INSET : undefined,
        width: BRACKET_SIZE,
        height: BRACKET_SIZE,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: top ? 0 : undefined,
          bottom: bottom ? 0 : undefined,
          left: left ? 0 : right ? undefined : 0,
          right: right ? 0 : undefined,
          width: hLength,
          height: BRACKET_THICKNESS,
          background: COLORS.accent,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: top ? 0 : left || right ? undefined : 0,
          bottom: bottom ? 0 : undefined,
          left: left ? 0 : undefined,
          right: right ? 0 : undefined,
          width: BRACKET_THICKNESS,
          height: vLength,
          background: COLORS.accent,
        }}
      />
    </div>
  );
}

/** Shared backdrop: HUD-style corner brackets that draw in on entrance — quiet
 * broadcast-style framing, no continuous sweep/motion competing with the
 * content for attention. */
export const MotionBackdrop: React.FC = () => {
  const frame = useCurrentFrame();

  const bracketLength = interpolate(frame, [0, 14], [0, BRACKET_SIZE], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bracketOpacity = interpolate(frame, [0, 10], [0, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div style={{ opacity: bracketOpacity }}>
        <Corner top left hLength={bracketLength} vLength={bracketLength} />
        <Corner top right hLength={bracketLength} vLength={bracketLength} />
        <Corner bottom left hLength={bracketLength} vLength={bracketLength} />
        <Corner bottom right hLength={bracketLength} vLength={bracketLength} />
      </div>
    </div>
  );
};
