import React from "react";
import { useCurrentFrame } from "remotion";
import { DISPLAY_FONT_FAMILY, FONT_FAMILY, TITLE_STYLE, colorForCharacter } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, scaleSettle } from "../motion";
import type { SharedVisualProps, PackedCirclesData } from "../sharedVisualProps";

interface PlacedCircle {
  label: string;
  value: number;
  r: number;
  x: number;
  y: number;
}

const MAX_RADIUS = { landscape: 170, portrait: 140 };
const MIN_RADIUS = 46;
const PADDING = 8;

/** Simple spiral-search circle packing: circles are sized by sqrt(value)
 * (so AREA, not radius, scales with value — the correct convention for a
 * size-encodes-magnitude chart), sorted largest first, then each one is
 * walked outward along a widening spiral from the center until it clears
 * every circle already placed. Not a true physically-packed layout, but for
 * the small counts (2-8) this card handles it produces a naturally
 * clustered field with no overlaps. */
function packCircles(items: { label: string; value: number }[], maxRadius: number): PlacedCircle[] {
  const maxValue = Math.max(...items.map((i) => i.value), 1);
  const sized = items
    .map((i) => ({ ...i, r: Math.max(MIN_RADIUS, Math.sqrt(i.value / maxValue) * maxRadius) }))
    .sort((a, b) => b.r - a.r);

  const placed: PlacedCircle[] = [];
  for (const item of sized) {
    if (placed.length === 0) {
      placed.push({ ...item, x: 0, y: 0 });
      continue;
    }
    let angle = 0;
    let radius = 0;
    let x = 0;
    let y = 0;
    for (let step = 0; step < 2000; step++) {
      x = radius * Math.cos(angle);
      y = radius * Math.sin(angle);
      const collides = placed.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + item.r + PADDING);
      if (!collides) break;
      angle += 0.35;
      radius += 3;
    }
    placed.push({ ...item, x, y });
  }
  return placed;
}

/** A cluster of circles sized by value (area, not radius, scales with value)
 * — for a distribution/magnitude comparison across more entries than Stat
 * Burst's two values, without Bar Chart's implied ranking axis. */
export const PackedCirclesCard: React.FC<{ data: PackedCirclesData } & SharedVisualProps> = ({
  data: { title, circles, prefix, suffix },
  backgroundColor,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const maxRadius = isPortrait ? MAX_RADIUS.portrait : MAX_RADIUS.landscape;
  const titleOpacity = fadeIn(frame, 0, 10);

  const placed = packCircles(circles, maxRadius);
  const minX = Math.min(...placed.map((p) => p.x - p.r));
  const maxX = Math.max(...placed.map((p) => p.x + p.r));
  const minY = Math.min(...placed.map((p) => p.y - p.r));
  const maxY = Math.max(...placed.map((p) => p.y + p.r));
  const width = maxX - minX;
  const height = maxY - minY;

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {title && <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 36 }}>{title}</div>}
        <div style={{ position: "relative", width, height }}>
          {placed.map((circle, index) => {
            const start = 12 + index * 6;
            const opacity = fadeIn(frame, start, 14);
            const scale = scaleSettle(frame, start, 18, 0.7);
            const color = colorForCharacter(circle.label);
            const valueFontSize = Math.max(18, circle.r * 0.34);
            const labelFontSize = Math.max(12, circle.r * 0.16);

            return (
              <div
                key={circle.label}
                style={{
                  position: "absolute",
                  left: circle.x - circle.r - minX,
                  top: circle.y - circle.r - minY,
                  width: circle.r * 2,
                  height: circle.r * 2,
                  opacity,
                  transform: `scale(${scale})`,
                  borderRadius: "50%",
                  background: color,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                <div style={{ fontFamily: DISPLAY_FONT_FAMILY, fontSize: valueFontSize, color: "#111315", lineHeight: 1 }}>
                  {prefix}
                  {Number.isInteger(circle.value) ? circle.value : circle.value.toFixed(1)}
                  {suffix}
                </div>
                <div
                  style={{
                    fontFamily: FONT_FAMILY,
                    fontWeight: 700,
                    fontSize: labelFontSize,
                    color: "rgba(17,19,21,0.75)",
                    textAlign: "center",
                    textTransform: "uppercase",
                  }}
                >
                  {circle.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SceneFrame>
  );
};
