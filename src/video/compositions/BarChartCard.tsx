import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, DISPLAY_FONT_FAMILY, FONT_FAMILY, TITLE_STYLE, colorForCharacter } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, drawIn, pulse, resolveRevealOrder } from "../motion";
import type { SharedVisualProps, BarChartData } from "../sharedVisualProps";

const MAX_BAR_HEIGHT = 480;
const BAR_WIDTH = 170;
const BAR_GAP = 64;
// Narrower bars/gaps in portrait so more of them fit across the 1080px
// canvas without shrinking the value/label text riding on top of each bar —
// this is bar *chrome* width, not text size, so tightening it doesn't hurt
// readability the way shrinking fonts would.
const BAR_WIDTH_PORTRAIT = 120;
const BAR_GAP_PORTRAIT = 28;
const BAR_STAGGER_FRAMES = 6;

/** Mixes a hex color toward white by `amount` (0-1) — used for the bar's
 * gradient top-stop, so a bar reads with some depth instead of a flat fill. */
function lighten(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** Multi-category comparison — unlike StatBurstCard's two-value head-to-head,
 * this handles any number of bars (breakdown of shot zones, cards, whatever the
 * narration is grouping into more than two buckets), each growing in on its own
 * staggered timing so the chart visibly builds rather than appearing static.
 * Bars use a subtle top-to-bottom gradient and a thin baseline edge (not a
 * flat fill), for a bit more depth than a plain bar chart. */
export const BarChartCard: React.FC<{ data: BarChartData } & SharedVisualProps> = ({
  data: { title, bars, prefix, suffix },
  backgroundColor,
  orientation,
  animation,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const maxValue = Math.max(...bars.map((b) => b.value), 1);
  const isPortrait = orientation === "portrait";
  const barWidth = isPortrait ? BAR_WIDTH_PORTRAIT : BAR_WIDTH;
  const barGap = isPortrait ? BAR_GAP_PORTRAIT : BAR_GAP;

  const titleOpacity = fadeIn(frame, 0, 10);
  const staggerFrames =
    animation?.staggerSeconds !== undefined ? Math.round(animation.staggerSeconds * fps) : BAR_STAGGER_FRAMES;
  const revealOrder = animation?.focusOrder ? resolveRevealOrder(animation.focusOrder, bars.length) : null;

  return (
    <SceneFrame backgroundColor={backgroundColor}>
      <div>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 48 }}>{title}</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: barGap, height: MAX_BAR_HEIGHT, flexWrap: "wrap", maxWidth: isPortrait ? 900 : undefined, justifyContent: "center" }}>
          {bars.map((bar, index) => {
            const revealPosition = revealOrder ? revealOrder[index] : index;
            const start = revealPosition * staggerFrames;
            const growth = drawIn(frame, start, 18);
            const height = interpolate(growth, [0, 1], [0, (bar.value / maxValue) * MAX_BAR_HEIGHT]);
            const color = colorForCharacter(bar.label);
            const valueOpacity = fadeIn(frame, start + 8, 8);
            const columnScale = animation?.pulse ? pulse(frame, 90, 0.97, 1.03, index * 0.6) : 1;

            return (
              <div
                key={bar.label}
                style={{
                  width: barWidth,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  height: "100%",
                  transform: `scale(${columnScale})`,
                  transformOrigin: "bottom center",
                }}
              >
                <div
                  style={{
                    opacity: valueOpacity,
                    fontFamily: DISPLAY_FONT_FAMILY,
                    fontWeight: 800,
                    fontSize: 68,
                    color,
                    marginBottom: 10,
                  }}
                >
                  {prefix}
                  {Number.isInteger(bar.value) ? bar.value : bar.value.toFixed(2)}
                  {suffix}
                </div>
                <div
                  style={{
                    width: barWidth,
                    height,
                    background: `linear-gradient(180deg, ${lighten(color, 0.35)} 0%, ${color} 100%)`,
                    borderRadius: "8px 8px 0 0",
                    borderBottom: `2px solid ${COLORS.border}`,
                  }}
                />
                <div
                  style={{
                    marginTop: 18,
                    fontFamily: FONT_FAMILY,
                    fontWeight: 600,
                    fontSize: 30,
                    color: COLORS.text,
                    textAlign: "center",
                  }}
                >
                  {bar.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SceneFrame>
  );
};
