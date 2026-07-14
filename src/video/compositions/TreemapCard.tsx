import React from "react";
import { useCurrentFrame } from "remotion";
import { DISPLAY_FONT_FAMILY, FONT_FAMILY, TITLE_STYLE, colorForCharacter } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, scaleSettle } from "../motion";
import type { SharedVisualProps, TreemapData } from "../sharedVisualProps";

interface Segment {
  label: string;
  value: number;
}

interface Rect extends Segment {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Splits a sorted (descending) run of segments into two contiguous groups
 * whose value sums are as close to even as the ordering allows — keeping
 * segments contiguous (never reordering) is what makes the recursive slice
 * below read as one coherent treemap instead of scattered rectangles. */
function splitBalanced(items: Segment[]): [Segment[], Segment[]] {
  if (items.length <= 1) return [items, []];
  const total = items.reduce((s, i) => s + i.value, 0);
  let cumulative = 0;
  let splitIndex = 1;
  for (let i = 0; i < items.length; i++) {
    cumulative += items[i].value;
    if (cumulative >= total / 2) {
      splitIndex = i + 1;
      break;
    }
  }
  splitIndex = Math.min(Math.max(splitIndex, 1), items.length - 1);
  return [items.slice(0, splitIndex), items.slice(splitIndex)];
}

/** Simplified "slice and dice" treemap: recursively halves a sorted run of
 * segments by cumulative value, alternating the split axis each level so
 * the result reads as a real 2D tiling rather than one long proportional
 * strip. Not a true squarified treemap (aspect ratios aren't optimized),
 * but for the small item counts (2-8) this card handles, it produces a
 * clean, legible layout without the complexity of the real algorithm. */
function layoutTreemap(items: Segment[], x: number, y: number, width: number, height: number, horizontal: boolean): Rect[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ ...items[0], x, y, width, height }];
  const [groupA, groupB] = splitBalanced(items);
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const totalA = groupA.reduce((s, i) => s + i.value, 0);
  const shareA = totalA / total;
  if (horizontal) {
    const widthA = width * shareA;
    return [
      ...layoutTreemap(groupA, x, y, widthA, height, false),
      ...layoutTreemap(groupB, x + widthA, y, width - widthA, height, false),
    ];
  }
  const heightA = height * shareA;
  return [
    ...layoutTreemap(groupA, x, y, width, heightA, true),
    ...layoutTreemap(groupB, x, y + heightA, width, height - heightA, true),
  ];
}

const CONTAINER = { landscape: { width: 1500, height: 680 }, portrait: { width: 860, height: 760 } };

/** Proportionally-sized rectangles for a set of values — the story is in the
 * relative SIZE of each block (four ticket editions at wildly different
 * prices), not a ranked axis (that's Bar Chart/League Table). */
export const TreemapCard: React.FC<{ data: TreemapData } & SharedVisualProps> = ({
  data: { title, segments, prefix, suffix },
  backgroundColor,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const { width, height } = isPortrait ? CONTAINER.portrait : CONTAINER.landscape;

  const sorted = [...segments].sort((a, b) => b.value - a.value);
  const rects = layoutTreemap(sorted, 0, 0, width, height, width >= height);
  const titleOpacity = fadeIn(frame, 0, 10);

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div>
        {title && <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 36 }}>{title}</div>}
        <div style={{ position: "relative", width, height }}>
          {rects.map((rect, index) => {
            const start = 12 + index * 6;
            const opacity = fadeIn(frame, start, 14);
            const scale = scaleSettle(frame, start, 16, 0.9);
            const color = colorForCharacter(rect.label);
            const area = rect.width * rect.height;
            const valueFontSize = Math.max(24, Math.min(56, Math.sqrt(area) * 0.22));
            const labelFontSize = Math.max(16, Math.min(26, valueFontSize * 0.42));

            return (
              <div
                key={rect.label}
                style={{
                  position: "absolute",
                  left: rect.x,
                  top: rect.y,
                  width: rect.width,
                  height: rect.height,
                  padding: 4,
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    opacity,
                    transform: `scale(${scale})`,
                    background: color,
                    borderRadius: 10,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ fontFamily: DISPLAY_FONT_FAMILY, fontSize: valueFontSize, color: "#111315", lineHeight: 1 }}>
                    {prefix}
                    {Number.isInteger(rect.value) ? rect.value : rect.value.toFixed(2)}
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
                      letterSpacing: 0.6,
                    }}
                  >
                    {rect.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SceneFrame>
  );
};
