import React from "react";
import { staticFile } from "remotion";
import { COLORS } from "../theme";

// The only jersey art in the project today is these two specific national
// kits (public/assets/jerseys/) — real per-team art plugs in via the
// `jerseyImage` prop when a caller has resolved one (see Formation.tsx's
// jerseyImages, resolved from a real team name), but most pitch-diagram
// scenes only know `team: "home" | "away"`, not a real team name, so there's
// nothing to resolve. For those, this is a generic "it's a shirt, not a
// dot" shape — recolored to the team's own accent color below specifically
// so it never reads as an actual claim about which kit either side wore.
const FALLBACK_JERSEY = staticFile("assets/jerseys/france.png");

/** A player marker rendered as a recolored jersey silhouette instead of a
 * flat circle — real fabric shading/collar/sleeve detail from the source
 * photo survives the recolor (a `mix-blend-mode: color` overlay swaps hue/
 * saturation only, leaving the underlying luminance shading intact), so it
 * reads as "a jersey in this team's color" rather than a flat disc or an
 * obviously-fake tint. */
export const JerseyDisc: React.FC<{
  cx: number;
  cy: number;
  radius?: number;
  color: string;
  highlighted?: boolean;
  opacity?: number;
  jerseyImage?: string;
}> = ({ cx, cy, radius = 15, color, highlighted = false, opacity = 1, jerseyImage }) => {
  const clipId = `jersey-clip-${Math.round(cx)}-${Math.round(cy)}-${Math.round(radius)}`;
  const src = jerseyImage ?? FALLBACK_JERSEY;
  // Oversized relative to the clip circle and nudged down slightly so the
  // crop lands on the chest/collar area of the source photo (which is a
  // head-on product shot with margin above the collar), not the whole
  // square including its empty top margin.
  const imageSize = radius * 2.6;

  return (
    <g opacity={opacity}>
      {highlighted && <circle cx={cx} cy={cy} r={radius + 6} fill="none" stroke={COLORS.highlight} strokeWidth={2} opacity={0.85} />}
      <circle cx={cx} cy={cy} r={radius} fill={color} />
      <defs>
        <clipPath id={clipId}>
          <circle cx={cx} cy={cy} r={radius} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`} style={{ isolation: "isolate" }}>
        <image
          href={src}
          x={cx - imageSize / 2}
          y={cy - imageSize / 2 + radius * 0.35}
          width={imageSize}
          height={imageSize}
          preserveAspectRatio="xMidYMid slice"
        />
        <circle cx={cx} cy={cy} r={radius} fill={color} style={{ mixBlendMode: "color" }} opacity={0.9} />
      </g>
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#ffffff" strokeWidth={1.5} opacity={0.45} />
    </g>
  );
};
