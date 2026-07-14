/** A small, flat, unmistakably-a-ball glyph (white disc + a black pentagon)
 * — deliberately more literal than the generic white travel-dot the arrow
 * components already use for a "run," since a pass needs to read as "the
 * ball moved," not just "something moved." Kept intentionally simple (no
 * stitching detail, no gradient) to match the project's flat broadcast
 * aesthetic — this is a schematic marker, not an illustration. */
export function BallGlyph({ cx, cy, size = 9, opacity = 1 }: { cx: number; cy: number; size?: number; opacity?: number }) {
  return (
    <g transform={`translate(${cx}, ${cy})`} opacity={opacity}>
      <circle r={size} fill="#ffffff" stroke="#111315" strokeWidth={1.4} />
      <polygon points="0,-4.2 4,-1.3 2.5,3.4 -2.5,3.4 -4,-1.3" fill="#111315" />
    </g>
  );
}
