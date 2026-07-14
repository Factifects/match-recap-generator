import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, DISPLAY_FONT_FAMILY, FONT_FAMILY, TITLE_STYLE } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, slideIn } from "../motion";
import type { SharedVisualProps, KpiPanelData } from "../sharedVisualProps";

// Sized against BarChartCard's own scale (68px values, 480px-tall bars) —
// the previous pass here (220px tiles, 44px values) was noticeably smaller
// than every sibling card on the same 1920x1080/1080x1920 canvas, so it read
// as a cramped island in the middle of a mostly-empty frame instead of using
// the space the composition actually has. Landscape spreads up to 5 tiles
// across most of the frame's width; portrait drops to 2 per row (each tile
// wider, not shorter) rather than shrinking to fit 5 across a 1080px canvas.
const TILE_WIDTH = 400;
const TILE_WIDTH_PORTRAIT = 460;
const TILE_STAGGER_FRAMES = 8;
const SPARKLINE_WIDTH = 220;
const SPARKLINE_HEIGHT = 56;

// "up"/"down" here mean "trending the good way"/"the bad way" for this
// specific stat, not literally rose/fell — a dropping PPDA is "up" (more
// pressing, good), even though the number went down. The author states the
// verdict via `deltaDirection`; this just turns that verdict into color.
const DELTA_COLOR: Record<"up" | "down" | "neutral", string> = {
  up: COLORS.movement,
  down: COLORS.danger,
  neutral: COLORS.textDim,
};

/** Renders a short run of 0-100 values as a small filled sparkline — the
 * same "already normalized, author decides the scale" convention RadarChart
 * uses for its axis values, so a stat with a genuine recent trend (last 5
 * matches' xG, say) reads as a shape, not just a single frozen number. */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const stepX = SPARKLINE_WIDTH / (values.length - 1);
  const points = values.map((v, i) => `${i * stepX},${SPARKLINE_HEIGHT - (v / 100) * SPARKLINE_HEIGHT}`).join(" ");
  const areaPoints = `0,${SPARKLINE_HEIGHT} ${points} ${SPARKLINE_WIDTH},${SPARKLINE_HEIGHT}`;
  return (
    <svg width={SPARKLINE_WIDTH} height={SPARKLINE_HEIGHT} style={{ overflow: "visible" }}>
      <polygon points={areaPoints} fill={color} opacity={0.15} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={3} />
    </svg>
  );
}

/** A row of 2-5 stat tiles in one card — label, big value, an optional trend
 * sparkline, an optional plain-language delta — Power BI's multi-row-card/
 * KPI-panel pattern. The natural home for a dense analytics readout (xG,
 * progressive passes, PPDA, distance covered, ...) that would otherwise
 * either get thinned down into a single StatBurst's two numbers or spread
 * across several separate Icon scenes. */
export const KpiPanelCard: React.FC<{ data: KpiPanelData } & SharedVisualProps> = ({
  data: { title, stats },
  backgroundColor,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const titleOpacity = fadeIn(frame, 0, 10);
  const isPortrait = orientation === "portrait";
  const tileWidth = isPortrait ? TILE_WIDTH_PORTRAIT : TILE_WIDTH;
  const maxWidth = isPortrait ? 980 : 1760;

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div style={{ width: maxWidth }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 48, textAlign: "left" }}>{title}</div>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "center" }}>
          {stats.map((stat, index) => {
            const start = 10 + index * TILE_STAGGER_FRAMES;
            const opacity = fadeIn(frame, start, 14);
            const y = slideIn(frame, start, 14, 20);
            const color = COLORS.accent;

            return (
              <div
                key={stat.label}
                style={{
                  opacity,
                  transform: `translateY(${y}px)`,
                  width: tileWidth,
                  background: COLORS.panel,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 20,
                  padding: "32px 32px 30px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    fontFamily: FONT_FAMILY,
                    fontWeight: 700,
                    fontSize: 22,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    color: COLORS.textDim,
                  }}
                >
                  {stat.label}
                </div>
                <div style={{ fontFamily: DISPLAY_FONT_FAMILY, fontSize: 76, color: COLORS.text, lineHeight: 1 }}>
                  {stat.value}
                </div>
                {stat.delta && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontFamily: FONT_FAMILY,
                      fontWeight: 600,
                      fontSize: 20,
                      color: DELTA_COLOR[stat.deltaDirection ?? "neutral"],
                    }}
                  >
                    {stat.deltaDirection && stat.deltaDirection !== "neutral" && (
                      <span style={{ fontSize: 15 }}>{stat.deltaDirection === "up" ? "▲" : "▼"}</span>
                    )}
                    {stat.delta}
                  </div>
                )}
                {stat.trend && stat.trend.length > 1 && (
                  <div style={{ marginTop: 6 }}>
                    <Sparkline values={stat.trend} color={color} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </SceneFrame>
  );
};
