import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, DISPLAY_FONT_FAMILY, FONT_FAMILY, TITLE_STYLE } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, pulse } from "../motion";
import type { SharedVisualProps, LineChartData } from "../sharedVisualProps";

const CHART_W = 820;
const CHART_H = 380;
const CHART_H_PORTRAIT = 1180;
const CHART_W_PORTRAIT = 620;
const BASELINE_X_PORTRAIT = 40;
const REVEAL_LEAD_IN_FRAMES = 10;
const REVEAL_TAIL_FRAMES = 20;
// Second series is deliberately muted grey, not a second bright color — it
// reads as "the baseline/boring case" next to the primary accent curve,
// which is exactly the contrast a simple-vs-compound comparison needs.
const SERIES2_COLOR = COLORS.textDim;

type Point = { x: number; y: number };

/** Uniform Catmull-Rom -> cubic Bezier conversion — the actual point of this
 * component: a script author hands over VALUES (points), never geometry
 * (rotation angles, segment lengths), and this is what turns that into a
 * genuinely smooth curve through every point. Endpoints duplicate their
 * single neighbor (the standard fix for Catmull-Rom needing a point on
 * either side of each segment). */
function buildSmoothPath(points: Point[]): string {
  if (points.length < 2) return "";
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function formatValue(value: number, prefix?: string, suffix?: string): string {
  const rounded = Number.isInteger(value) ? value : Math.round(value * 100) / 100;
  const text = Number.isInteger(rounded)
    ? rounded.toLocaleString("en-US")
    : rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${prefix ?? ""}${text}${suffix ?? ""}`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** A real interpolated curve through an ordered series of values — the fix
 * for scripts that were faking a "curve" out of several straight, hand-
 * rotated Canvas line objects (unmaintainable, and visibly polygonal, not
 * curved). Reveals at a CONSTANT pace along the index/X-axis via a growing
 * clip rect, not a constant-arc-length stroke draw — a stroke-length draw
 * would rush through an exponential curve's long, gently-sloped early
 * stretch (short arc length per unit of X) and crawl through its short,
 * steep late stretch (long arc length per unit of X), the exact opposite of
 * "flat for a while, then suddenly not." A clip-wipe reveals equal X per
 * unit time regardless of the curve's own shape, so a genuinely slow-then-
 * sudden data series actually plays that way.
 *
 * An optional second series (`points2`) draws a second curve sharing the
 * same X-axis and value scale — the two curves visibly diverging live is
 * the single clearest way to explain "same starting conditions, different
 * mechanism" (e.g. simple interest's flat rate vs compound interest's
 * growing base), which no single-curve chart can show on its own. Dual-series
 * mode reads its live values from a fixed scoreboard row (under the legend)
 * instead of labels chasing each curve's own traveling dot — two dots start
 * right next to each other by design (same starting balance), so
 * dot-attached labels would collide for most of the reveal; a scoreboard
 * has no such collision risk regardless of how close the curves currently
 * are. Single-series mode is untouched: still a big floating number glued
 * to the one traveling dot. */
export const LineChartCard: React.FC<{ data: LineChartData } & SharedVisualProps> = ({
  data: { title, points: dataPoints, points2: dataPoints2, series1Label, series2Label, prefix, suffix, highlightRange },
  backgroundColor,
  orientation,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const n = dataPoints.length;
  const hasSecondSeries = !!dataPoints2 && dataPoints2.length >= 2;
  const values = dataPoints.map((p) => p.value);
  const values2 = hasSecondSeries ? dataPoints2!.map((p) => p.value) : [];
  // Both series share one value scale when a second series is present —
  // otherwise the two curves' divergence would be a lie told by two
  // independently-rescaled axes rather than a real, comparable difference.
  const allValues = hasSecondSeries ? [...values, ...values2] : values;
  const minValue = Math.min(0, ...allValues);
  const maxValue = Math.max(...allValues);
  const valueSpan = maxValue - minValue || 1;

  const revealStart = REVEAL_LEAD_IN_FRAMES;
  const revealEnd = Math.max(revealStart + 40, (durationInFrames ?? 240) - REVEAL_TAIL_FRAMES);
  const progress = interpolate(frame, [revealStart, revealEnd], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Legend follows the title in rather than landing at the same instant —
  // a small thing on its own, but part of the same "nothing should arrive
  // in a single simultaneous group" fix applied across BarChartCard/Canvas.
  const titleOpacity = fadeIn(frame, 0, 10);
  const legendOpacity = fadeIn(frame, 10, 10);
  // Primary-series dot/label is gold ONLY in single-series mode (a "here's
  // the highlighted answer" convention with nothing else on screen to
  // conflict with). With a legend on screen, gold would be a third color
  // matching neither swatch — the primary series switches to its own
  // legend color (accent blue) so the traveling number and the legend
  // entry it belongs to are visibly the same series.
  const series1DotColor = hasSecondSeries ? COLORS.accent : COLORS.highlight;

  const edgeFloat = progress * (n - 1);
  const edgeIndex = Math.max(0, Math.min(n - 2, Math.floor(edgeFloat)));
  const edgeT = edgeFloat - edgeIndex;
  const edgeValue = lerp(values[edgeIndex], values[edgeIndex + 1], edgeT);
  const edgeValue2 = hasSecondSeries ? lerp(values2[edgeIndex], values2[edgeIndex + 1], edgeT) : 0;
  const settled = frame >= revealEnd;
  const dotScale = settled ? pulse(frame, 50, 0.92, 1.12) : 1;

  const clipId = `line-chart-reveal-${title.replace(/[^a-z0-9]/gi, "").slice(0, 24)}`;

  // Point labels fade in independently of the clip-wipe (rather than living
  // inside the clipped group) — a label sitting exactly at the current reveal
  // edge would otherwise render mid-slice (only its first couple of glyphs
  // past the clip boundary) for however many frames it takes the wipe to
  // finish crossing it, instead of appearing whole once its point is reached.
  const labelOpacityForIndex = (i: number) => fadeIn(frame, revealStart + (i / (n - 1)) * (revealEnd - revealStart), 10);

  const scoreboard = hasSecondSeries ? (
    <div style={{ display: "flex", gap: isPortrait ? 28 : 48, opacity: legendOpacity, marginBottom: isPortrait ? 16 : 24 }}>
      <ScoreboardEntry color={COLORS.accent} label={series1Label ?? "Series 1"} value={formatValue(edgeValue, prefix, suffix)} portrait={isPortrait} />
      <ScoreboardEntry color={SERIES2_COLOR} label={series2Label ?? "Series 2"} value={formatValue(edgeValue2, prefix, suffix)} portrait={isPortrait} />
    </div>
  ) : null;

  if (isPortrait) {
    const yForIndex = (i: number) => (i / (n - 1)) * CHART_H_PORTRAIT;
    const xForValue = (v: number) => BASELINE_X_PORTRAIT + ((v - minValue) / valueSpan) * (CHART_W_PORTRAIT - BASELINE_X_PORTRAIT);
    const chartPoints = dataPoints.map((p, i) => ({ x: xForValue(p.value), y: yForIndex(i) }));
    const curvePath = buildSmoothPath(chartPoints);
    const firstY = chartPoints[0].y;
    const lastY = chartPoints[chartPoints.length - 1].y;
    const areaPath = `${curvePath} L ${BASELINE_X_PORTRAIT} ${lastY} L ${BASELINE_X_PORTRAIT} ${firstY} Z`;
    const edgeY = progress * CHART_H_PORTRAIT;
    const edgeX = xForValue(edgeValue);
    const curvePath2 = hasSecondSeries ? buildSmoothPath(dataPoints2!.map((p, i) => ({ x: xForValue(p.value), y: yForIndex(i) }))) : "";
    const edgeX2 = hasSecondSeries ? xForValue(edgeValue2) : 0;

    return (
      <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: hasSecondSeries ? 12 : 24 }}>{title}</div>
          {scoreboard}
          <svg width={CHART_W_PORTRAIT + 260} height={CHART_H_PORTRAIT + 20} viewBox={`-40 -10 ${CHART_W_PORTRAIT + 260} ${CHART_H_PORTRAIT + 20}`} style={{ overflow: "visible" }}>
            <defs>
              <linearGradient id={`${clipId}-fill`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.04} />
                <stop offset="100%" stopColor={COLORS.accent} stopOpacity={0.4} />
              </linearGradient>
              <clipPath id={clipId}>
                <rect x={-40} y={-10} width={CHART_W_PORTRAIT + 260} height={Math.max(0, progress * CHART_H_PORTRAIT + 20)} />
              </clipPath>
            </defs>

            <line x1={BASELINE_X_PORTRAIT} y1={0} x2={BASELINE_X_PORTRAIT} y2={CHART_H_PORTRAIT} stroke={COLORS.border} strokeWidth={2} />

            {highlightRange && (
              <g clipPath={`url(#${clipId})`}>
                <rect
                  x={BASELINE_X_PORTRAIT}
                  y={yForIndex(highlightRange.fromIndex)}
                  width={CHART_W_PORTRAIT - BASELINE_X_PORTRAIT}
                  height={yForIndex(highlightRange.toIndex) - yForIndex(highlightRange.fromIndex)}
                  fill={COLORS.highlight}
                  opacity={0.14}
                  rx={6}
                />
                {highlightRange.label && (
                  <text
                    x={BASELINE_X_PORTRAIT + 18}
                    y={(yForIndex(highlightRange.fromIndex) + yForIndex(highlightRange.toIndex)) / 2}
                    fontFamily={FONT_FAMILY}
                    fontWeight={700}
                    fontSize={22}
                    fill={COLORS.text}
                  >
                    {highlightRange.label}
                  </text>
                )}
              </g>
            )}

            <g clipPath={`url(#${clipId})`}>
              {hasSecondSeries && <path d={curvePath2} fill="none" stroke={SERIES2_COLOR} strokeWidth={4} strokeDasharray="10 8" strokeLinecap="round" />}
              <path d={areaPath} fill={`url(#${clipId}-fill)`} />
              <path d={curvePath} fill="none" stroke={COLORS.accent} strokeWidth={5} strokeLinecap="round" />
            </g>

            {dataPoints.map((p, i) =>
              p.label.trim() === "" ? null : (
                <text
                  key={i}
                  x={BASELINE_X_PORTRAIT - 12}
                  y={yForIndex(i) + 6}
                  textAnchor="end"
                  fontFamily={FONT_FAMILY}
                  fontWeight={600}
                  fontSize={18}
                  fill={COLORS.textDim}
                  opacity={labelOpacityForIndex(i)}
                >
                  {p.label}
                </text>
              ),
            )}

            {hasSecondSeries && (
              <g transform={`translate(${edgeX2}, ${edgeY}) scale(${dotScale})`}>
                <circle r={7} fill={SERIES2_COLOR} />
              </g>
            )}
            <g transform={`translate(${edgeX}, ${edgeY}) scale(${dotScale})`}>
              <circle r={9} fill={series1DotColor} />
              {!hasSecondSeries && (
                <text x={16} y={6} fontFamily={DISPLAY_FONT_FAMILY} fontWeight={800} fontSize={32} fill={COLORS.text}>
                  {formatValue(edgeValue, prefix, suffix)}
                </text>
              )}
            </g>
          </svg>
        </div>
      </SceneFrame>
    );
  }

  const xForIndex = (i: number) => (i / (n - 1)) * CHART_W;
  const yForValue = (v: number) => CHART_H - ((v - minValue) / valueSpan) * CHART_H;
  const chartPoints = dataPoints.map((p, i) => ({ x: xForIndex(i), y: yForValue(p.value) }));
  const curvePath = buildSmoothPath(chartPoints);
  const firstX = chartPoints[0].x;
  const lastX = chartPoints[chartPoints.length - 1].x;
  const areaPath = `${curvePath} L ${lastX} ${CHART_H} L ${firstX} ${CHART_H} Z`;
  const edgeX = progress * CHART_W;
  const edgeY = yForValue(edgeValue);
  const curvePath2 = hasSecondSeries ? buildSmoothPath(dataPoints2!.map((p, i) => ({ x: xForIndex(i), y: yForValue(p.value) }))) : "";
  const edgeY2 = hasSecondSeries ? yForValue(edgeValue2) : 0;

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: hasSecondSeries ? 16 : 40 }}>{title}</div>
        {scoreboard}
        <svg width={CHART_W + 40} height={CHART_H + 70} viewBox={`-20 -30 ${CHART_W + 40} ${CHART_H + 70}`} style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id={`${clipId}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.4} />
              <stop offset="100%" stopColor={COLORS.accent} stopOpacity={0.03} />
            </linearGradient>
            <clipPath id={clipId}>
              <rect x={-20} y={-30} width={Math.max(0, progress * CHART_W + 20)} height={CHART_H + 70} />
            </clipPath>
          </defs>

          <line x1={0} y1={CHART_H} x2={CHART_W} y2={CHART_H} stroke={COLORS.border} strokeWidth={2} />

          {highlightRange && (
            <g clipPath={`url(#${clipId})`}>
              <rect
                x={xForIndex(highlightRange.fromIndex)}
                y={0}
                width={xForIndex(highlightRange.toIndex) - xForIndex(highlightRange.fromIndex)}
                height={CHART_H}
                fill={COLORS.highlight}
                opacity={0.14}
                rx={6}
              />
              {highlightRange.label && (
                <text
                  x={(xForIndex(highlightRange.fromIndex) + xForIndex(highlightRange.toIndex)) / 2}
                  y={30}
                  textAnchor="middle"
                  fontFamily={FONT_FAMILY}
                  fontWeight={700}
                  fontSize={22}
                  fill={COLORS.text}
                >
                  {highlightRange.label}
                </text>
              )}
            </g>
          )}

          <g clipPath={`url(#${clipId})`}>
            {hasSecondSeries && <path d={curvePath2} fill="none" stroke={SERIES2_COLOR} strokeWidth={4} strokeDasharray="10 8" strokeLinecap="round" />}
            <path d={areaPath} fill={`url(#${clipId}-fill)`} />
            <path d={curvePath} fill="none" stroke={COLORS.accent} strokeWidth={6} strokeLinecap="round" />
          </g>

          {dataPoints.map((p, i) => {
            if (p.label.trim() === "") return null;
            const textAnchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
            return (
              <text
                key={i}
                x={xForIndex(i)}
                y={CHART_H + 34}
                textAnchor={textAnchor}
                fontFamily={FONT_FAMILY}
                fontWeight={600}
                fontSize={20}
                fill={COLORS.textDim}
                opacity={labelOpacityForIndex(i)}
              >
                {p.label}
              </text>
            );
          })}

          {hasSecondSeries && (
            <g transform={`translate(${edgeX}, ${edgeY2}) scale(${dotScale})`}>
              <circle r={8} fill={SERIES2_COLOR} />
            </g>
          )}
          <g transform={`translate(${edgeX}, ${edgeY}) scale(${dotScale})`}>
            <circle r={10} fill={series1DotColor} />
            {!hasSecondSeries && (
              <text x={0} y={-26} textAnchor="middle" fontFamily={DISPLAY_FONT_FAMILY} fontWeight={800} fontSize={38} fill={COLORS.text}>
                {formatValue(edgeValue, prefix, suffix)}
              </text>
            )}
          </g>
        </svg>
      </div>
    </SceneFrame>
  );
};

function ScoreboardEntry({ color, label, value, portrait }: { color: string; label: string; value: string; portrait: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: portrait ? "flex-start" : "center", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 14, height: 14, borderRadius: 7, background: color }} />
        <div style={{ fontFamily: FONT_FAMILY, fontWeight: 600, fontSize: portrait ? 18 : 22, color: COLORS.text }}>{label}</div>
      </div>
      <div style={{ fontFamily: DISPLAY_FONT_FAMILY, fontWeight: 800, fontSize: portrait ? 30 : 36, color, paddingLeft: portrait ? 22 : 0 }}>{value}</div>
    </div>
  );
}
