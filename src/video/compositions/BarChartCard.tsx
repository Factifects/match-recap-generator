import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, DISPLAY_FONT_FAMILY, FONT_FAMILY, TITLE_STYLE, colorForCharacter } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, pulse, resolveRevealOrder } from "../motion";
import { CANVAS_ICON_COMPONENTS } from "../canvasIcons";
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
// Widened from 6 (0.2s) — at 6 frames, 4 bars all started within under a
// third of a second of each other, reading as "everything at once" rather
// than a real one-after-another build. 22 frames (~0.73s) gives each bar a
// visibly distinct starting moment while still overlapping with its
// neighbors' own (much longer, see MIN_GROWTH_FRAMES/sceneEnd) count-up.
const BAR_STAGGER_FRAMES = 22;
const MIN_GROWTH_FRAMES = 30;
const REVEAL_TAIL_FRAMES = 20;

/** Comma-formatted, same convention as LineChartCard's formatValue. `asInteger`
 * decides rounding independently of whatever fractional value is passed in —
 * needed because the LIVE (still-counting-up) value is almost never a clean
 * integer even when the bar's own FINAL target is, and a count-up shouldn't
 * flash decimals for a value that's whole once it lands. */
function formatBarValue(value: number, prefix: string | undefined, suffix: string | undefined, asInteger: boolean): string {
  const text = asInteger ? Math.round(value).toLocaleString("en-US") : value.toFixed(2);
  return `${prefix ?? ""}${text}${suffix ?? ""}`;
}

/** The value sits in a column no wider than the bar itself plus its gap —
 * fine at the default 68px for a short value ("$499"), but a real dollar
 * figure ("$494,308") is wide enough at that size to overflow into the
 * NEXT column and collide with its neighbor's own value (confirmed via a
 * still render). Scaling font size down by the formatted string's own
 * length keeps every value inside its own column regardless of how large
 * the underlying number is, without touching the common case (every
 * existing script's bars stay at the original 68px). */
function fontSizeForLength(length: number): number {
  if (length <= 4) return 68;
  if (length <= 6) return 56;
  if (length <= 8) return 44;
  return 36;
}

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
 * narration is grouping into more than two buckets). Bar growth AND each
 * bar's own value counter run at a constant (linear, not eased) rate across
 * nearly the whole scene — not a quick ~0.6s snap to the final height like
 * this card used to do. A fast snap-then-hold meant a 13-second scene spent
 * its last 11+ seconds with literally nothing moving besides a faint idle
 * pulse; stretching the count to the real scene length (via
 * `durationInFrames`) means the number visibly ticking up alongside the
 * growing bar IS the demonstration for most of the scene's runtime, the
 * same "spend the actual on-screen time showing something happen" principle
 * LineChartCard's clip-wipe reveal already uses. Bars use a subtle top-to-
 * bottom gradient and a thin baseline edge (not a flat fill), for a bit more
 * depth than a plain bar chart. */
export const BarChartCard: React.FC<{ data: BarChartData } & SharedVisualProps> = ({
  data: { title, bars, prefix, suffix },
  backgroundColor,
  orientation,
  animation,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const maxValue = Math.max(...bars.map((b) => b.value), 1);
  const isPortrait = orientation === "portrait";
  const barWidth = isPortrait ? BAR_WIDTH_PORTRAIT : BAR_WIDTH;
  const barGap = isPortrait ? BAR_GAP_PORTRAIT : BAR_GAP;
  const sceneEnd = Math.max(MIN_GROWTH_FRAMES, (durationInFrames ?? 240) - REVEAL_TAIL_FRAMES);

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
            const growthEnd = Math.max(start + MIN_GROWTH_FRAMES, sceneEnd);
            const growth = interpolate(frame, [start, growthEnd], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const liveValue = bar.value * growth;
            const height = (liveValue / maxValue) * MAX_BAR_HEIGHT;
            const color = colorForCharacter(bar.label);
            const valueOpacity = fadeIn(frame, start, 8);
            const columnScale = animation?.pulse ? pulse(frame, 90, 0.97, 1.03, index * 0.6) : 1;
            const IconComponent = bar.icon ? CANVAS_ICON_COMPONENTS[bar.icon] : null;
            const isIntegerTarget = Number.isInteger(bar.value);
            const finalValueText = formatBarValue(bar.value, prefix, suffix, isIntegerTarget);
            const liveValueText = formatBarValue(liveValue, prefix, suffix, isIntegerTarget);
            const valueFontSize = fontSizeForLength(finalValueText.length);

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
                {IconComponent && (
                  <IconComponent style={{ width: 40, height: 40, color, opacity: valueOpacity, marginBottom: 10 }} />
                )}
                <div
                  style={{
                    opacity: valueOpacity,
                    fontFamily: DISPLAY_FONT_FAMILY,
                    fontWeight: 800,
                    fontSize: valueFontSize,
                    color,
                    marginBottom: 10,
                    whiteSpace: "nowrap",
                  }}
                >
                  {liveValueText}
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
