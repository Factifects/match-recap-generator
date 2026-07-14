import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, DISPLAY_FONT_FAMILY, FONT_FAMILY, TITLE_STYLE } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, scaleSettle } from "../motion";
import type { SharedVisualProps, FunnelData } from "../sharedVisualProps";

const MAX_WIDTH = 1100;
const MAX_WIDTH_PORTRAIT = 820;
const BAND_HEIGHT = 92;
const STAGE_STAGGER_FRAMES = 10;

/** Ordered stages narrowing top to bottom, each proportional to its value —
 * for a hierarchy/drop-off (a transfer process, a knockout draw) rather than
 * a flat category comparison (Bar Chart). `shape: "funnel"` renders
 * continuous trapezoid bands (a real funnel silhouette, no gaps between
 * stages); `"pyramid"` renders discrete centered bands with a small gap
 * between each — a stepped-levels feel instead of a continuous taper. */
export const FunnelCard: React.FC<{ data: FunnelData } & SharedVisualProps> = ({
  data: { title, stages, shape },
  backgroundColor,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const maxWidth = isPortrait ? MAX_WIDTH_PORTRAIT : MAX_WIDTH;
  const maxValue = Math.max(...stages.map((s) => s.value), 1);
  const titleOpacity = fadeIn(frame, 0, 10);
  const isPyramid = shape === "pyramid";

  const widths = stages.map((s) => Math.max(0.12, s.value / maxValue) * maxWidth);

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {title && <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 40 }}>{title}</div>}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: isPyramid ? 14 : 0 }}>
          {stages.map((stage, index) => {
            const start = 12 + index * STAGE_STAGGER_FRAMES;
            const opacity = fadeIn(frame, start, 14);
            const growth = scaleSettle(frame, start, 18, 0.85);
            const width = widths[index];
            const nextWidth = widths[index + 1] ?? width;

            const clipPath = isPyramid
              ? undefined
              : `polygon(${((maxWidth - width) / 2 / maxWidth) * 100}% 0%, ${(100 - ((maxWidth - width) / 2 / maxWidth) * 100)}% 0%, ${(100 - ((maxWidth - nextWidth) / 2 / maxWidth) * 100)}% 100%, ${((maxWidth - nextWidth) / 2 / maxWidth) * 100}% 100%)`;

            const valueLabel = interpolate(growth, [0.85, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

            return (
              <div
                key={stage.label}
                style={{
                  opacity,
                  transform: `scaleY(${growth})`,
                  transformOrigin: "center top",
                  width: isPyramid ? width : maxWidth,
                  height: BAND_HEIGHT,
                  clipPath,
                  background: `linear-gradient(90deg, ${COLORS.accent}66, ${COLORS.accent})`,
                  borderRadius: isPyramid ? 12 : 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 16,
                }}
              >
                <div style={{ fontFamily: FONT_FAMILY, fontWeight: 700, fontSize: 28, color: "#0b0d0e", opacity: valueLabel }}>{stage.label}</div>
                <div style={{ fontFamily: DISPLAY_FONT_FAMILY, fontSize: 36, color: "#0b0d0e", opacity: valueLabel }}>{stage.value}</div>
              </div>
            );
          })}
        </div>
      </div>
    </SceneFrame>
  );
};
