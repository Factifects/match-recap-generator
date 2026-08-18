export type CurvePoint = { x: number; y: number };

/** Uniform Catmull-Rom -> cubic Bezier conversion — callers hand over VALUES
 * (points), never geometry (rotation angles, segment lengths), and this turns
 * that into a genuinely smooth curve through every point. Endpoints duplicate
 * their single neighbor (the standard fix for Catmull-Rom needing a point on
 * either side of each segment). Shared by LineChartCard and any other visual
 * that needs a real interpolated curve rather than several straight,
 * hand-rotated segments. */
export function buildSmoothPath(points: CurvePoint[]): string {
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

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
