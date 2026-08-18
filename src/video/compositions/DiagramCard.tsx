import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing, staticFile } from "remotion";
import { COLORS } from "../theme";
import { brandTileColor } from "../brandTile";
import { SceneFrame } from "./SceneFrame";
import { LiveMapBackdrop } from "./LiveMapBackdrop";
import { layoutDiagram, pointOnEdge, TILE_HEIGHT_FRACTION, type LaidOutEdge, type LaidOutNode, type NodeAccent } from "../../script/diagramLayout";
import { placeAnnotations, placeEdgeLabels, connectorObstacles, resolveAnnotations, ANNOTATION_LINE_HEIGHT } from "../../script/diagramAnnotations";
import type { SharedVisualProps, DiagramData } from "../sharedVisualProps";

/** Diagrams use the UI sans face, not the project's display serif — an
 * architecture box labelled in a serif reads as a book illustration rather than
 * a system diagram. */
const DIAGRAM_FONT = '"Inter", "Helvetica Neue", Arial, sans-serif';

// Renderer for the `diagram` medium. Every coordinate here comes from
// diagramLayout.ts — this file draws, it never decides where anything goes.
// That split is the point: layout is a pure function with property tests
// proving no overlaps, nothing off-canvas and boundary-anchored connectors,
// none of which could be guaranteed while an author hand-wrote x/y on Canvas.

type DiagramAction = NonNullable<DiagramData["timeline"]>[number];

const ACCENT_COLORS: Record<NodeAccent, { stroke: string; fill: string; text: string }> = {
  neutral: { stroke: "#5b6b8c", fill: "rgba(91, 107, 140, 0.10)", text: "#e6ecff" },
  primary: { stroke: "#4f6bff", fill: "rgba(79, 107, 255, 0.14)", text: "#ffffff" },
  warn: { stroke: "#f59e0b", fill: "rgba(245, 158, 11, 0.14)", text: "#ffffff" },
  success: { stroke: "#22c55e", fill: "rgba(34, 197, 94, 0.14)", text: "#ffffff" },
  danger: { stroke: "#f87171", fill: "rgba(248, 113, 113, 0.14)", text: "#ffffff" },
};

/** A container is drawn as a quieter frame than a leaf so nesting reads as
 * depth rather than as more boxes competing for attention. */
const GROUP_STROKE = "rgba(148, 163, 184, 0.45)";
const GROUP_FILL = "rgba(148, 163, 184, 0.05)";

const DIMMED = 0.45;

/** Absolute readability floors, in px at 1080p. Type size was being derived
 * purely from box height, so capping box size to stop sparse diagrams
 * ballooning also shrank the text below what a viewer can read on a phone.
 * Text now has its own floor and the layout sizes boxes to fit it, rather than
 * the other way round. */
const MIN_LABEL_PX = 27;
const MIN_SUB_PX = 21;
const MIN_ANNOTATION_PX = 25;
const MIN_EDGE_LABEL_PX = 22;

const EDGE_COLOR = "#93a7d4";
const TOKEN_DEFAULT = "#22d3ee";

/** Different flows get different colours, the way a real architecture diagram
 * distinguishes a data path from a request path. */
const EDGE_KIND_COLORS: Record<string, string> = {
  request: "#c3d0ea",
  response: "#4ade80",
  data: "#fbbf24",
  dependency: "#7c8db5",
};

/** Canonical styling per `flow` action `kind` — the renderer, not each
 * script, decides what "this is a response" looks like, so it's consistent
 * everywhere instead of depending on an author picking the same hex twice.
 * `request` and `response` are deliberately far apart (amber vs green) —
 * they must never read as the same thing moving in two directions. */
const MOTION_KIND_STYLES: Record<string, { color: string; dashed?: boolean; defaultLabel?: string }> = {
  request: { color: "#f59e0b" },
  response: { color: "#22c55e" },
  success: { color: "#22c55e" },
  data: { color: "#60a5fa" },
  discover: { color: "#2dd4bf", defaultLabel: "?" },
  error: { color: "#f87171", dashed: true, defaultLabel: "rejected" },
  retry: { color: "#fb923c", defaultLabel: "retry" },
};

// Connector metrics in real pixels at 1080p. A 0.5px hairline read as a faint
// scratch rather than a wire.
const EDGE_STROKE_PX = 3;
const EDGE_DOT_R_PX = 6;
const ARROW_LEN_PX = 16;
const ARROW_HALF_PX = 8;

/** Walks a polyline to `t` of its total length — what makes a multi-segment
 * elbow draw itself end to end instead of each segment animating separately. */
function pointsUpTo(points: { x: number; y: number }[], t: number): { x: number; y: number }[] {
  if (t >= 1 || points.length < 2) return points;
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total <= 0) return points;
  let remaining = total * Math.max(0, t);
  const out = [points[0]];
  for (let i = 0; i < lengths.length; i++) {
    if (remaining >= lengths[i]) {
      out.push(points[i + 1]);
      remaining -= lengths[i];
      continue;
    }
    const ratio = lengths[i] > 0 ? remaining / lengths[i] : 0;
    out.push({ x: points[i].x + (points[i + 1].x - points[i].x) * ratio, y: points[i].y + (points[i + 1].y - points[i].y) * ratio });
    break;
  }
  return out;
}

function ease(t: number): number {
  return interpolate(t, [0, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
}

function progress(atSeconds: number, start: number, duration: number): number {
  if (duration <= 0) return atSeconds >= start ? 1 : 0;
  return ease(Math.max(0, Math.min(1, (atSeconds - start) / duration)));
}

/** Everything the diagram looks like at one moment, folded from the timeline.
 * Structural state is a fold (a node is revealed or it isn't); only the
 * transition into each state is animated. */
interface DiagramState {
  nodeReveal: Map<string, number>;
  edgeReveal: Map<string, number>;
  accents: Map<string, NodeAccent>;
  focused: string[] | null;
  focusProgress: number;
  annotations: { target: string; text: string; opacity: number }[];
  /** Edges a token is traversing RIGHT NOW, and which way it is going. An
   * arrowhead should point where the data is actually moving — a response
   * travelling back down a request edge must not still show an arrow pointing
   * forward. */
  activeDirection: Map<string, "forward" | "reverse">;
  /** 1 = fully present, 0 = fully evicted. Multiplies into node opacity. */
  removal: Map<string, number>;
  values: Map<string, string>;
  meters: Map<string, { value: number; label?: string }>;
  tokens: { x: number; y: number; label?: string; color: string; dashed: boolean; opacity: number }[];
}

function edgeKey(from: string, to: string): string {
  return `${from}->${to}`;
}

function foldState(timeline: DiagramAction[], atSeconds: number, edges: LaidOutEdge[], hasTimeline: boolean): DiagramState {
  const state: DiagramState = {
    nodeReveal: new Map(),
    edgeReveal: new Map(),
    accents: new Map(),
    focused: null,
    focusProgress: 1,
    annotations: [],
    activeDirection: new Map(),
    removal: new Map(),
    values: new Map(),
    meters: new Map(),
    tokens: [],
  };

  // With no timeline the whole diagram is simply present — a static
  // architecture diagram is a legitimate scene, not an error.
  if (!hasTimeline) return state;

  const ordered = [...timeline].sort((a, b) => a.startSeconds - b.startSeconds);
  // Annotation lifetimes are resolved separately — see diagramAnnotations.ts.
  state.annotations = resolveAnnotations(timeline, atSeconds);

  for (const action of ordered) {
    switch (action.type) {
      case "addNode":
        state.nodeReveal.set(action.id, progress(atSeconds, action.startSeconds, action.durationSeconds));
        break;
      case "addEdge":
        state.edgeReveal.set(edgeKey(action.from, action.to), progress(atSeconds, action.startSeconds, action.durationSeconds));
        break;
      case "setState":
        if (atSeconds >= action.startSeconds) state.accents.set(action.id, action.accent);
        break;
      case "focus":
        if (atSeconds >= action.startSeconds) {
          state.focused = action.ids.length > 0 ? action.ids : null;
          state.focusProgress = progress(atSeconds, action.startSeconds, action.durationSeconds);
        }
        break;
      case "removeNode":
        state.removal.set(action.id, 1 - progress(atSeconds, action.startSeconds, action.durationSeconds));
        break;
      case "setValue":
        if (atSeconds >= action.startSeconds) state.values.set(action.id, action.text);
        break;
      case "meter": {
        if (atSeconds < action.startSeconds) break;
        const t = progress(atSeconds, action.startSeconds, action.durationSeconds);
        state.meters.set(action.id, { value: action.from + (action.to - action.from) * t, label: action.label });
        break;
      }
      case "flow": {
        const end = action.startSeconds + action.durationSeconds;
        // The destination's arrival reaction runs on its own time window
        // (Part 8: the destination must visibly respond, not just absorb the
        // token) — independent of the token's own fade-out below, so it must
        // be evaluated before the early-exit guard that skips the rest of
        // this case once the token itself is done fading.
        if (action.reactsOnArrival && atSeconds >= end && atSeconds <= end + action.reactsOnArrival.durationSeconds) {
          state.accents.set(action.path[action.path.length - 1], action.reactsOnArrival.accent);
        }
        if (atSeconds < action.startSeconds || atSeconds > end + 0.3) break;
        // The token walks the declared path of nodes by following the real
        // routed edge between each consecutive pair.
        const legs = action.path.length - 1;
        const overall = Math.max(0, Math.min(1, (atSeconds - action.startSeconds) / action.durationSeconds));
        const scaled = overall * legs;
        const legIndex = Math.min(legs - 1, Math.floor(scaled));
        const legT = scaled - legIndex;
        const from = action.path[legIndex];
        const to = action.path[legIndex + 1];
        const edge = edges.find((e) => e.from === from && e.to === to) ?? edges.find((e) => e.from === to && e.to === from);
        if (!edge) break;
        const reversed = edge.from !== from;
        state.activeDirection.set(edgeKey(edge.from, edge.to), reversed ? "reverse" : "forward");
        const point = pointOnEdge(edge, reversed ? 1 - legT : legT);
        const kindStyle = action.kind ? MOTION_KIND_STYLES[action.kind] : undefined;
        state.tokens.push({
          ...point,
          label: action.label ?? kindStyle?.defaultLabel,
          color: action.color ?? kindStyle?.color ?? TOKEN_DEFAULT,
          dashed: kindStyle?.dashed ?? false,
          opacity: atSeconds > end ? Math.max(0, 1 - (atSeconds - end) / 0.3) : 1,
        });
        break;
      }
      default:
        break;
    }
  }
  return state;
}

function opacityFor(id: string, state: DiagramState, hasTimeline: boolean): number {
  const revealed = (hasTimeline && state.nodeReveal.size > 0 ? (state.nodeReveal.get(id) ?? 0) : 1) * (state.removal.get(id) ?? 1);
  if (revealed <= 0) return 0;
  if (!state.focused) return revealed;
  const isFocused = state.focused.includes(id);
  const target = isFocused ? 1 : DIMMED;
  return revealed * (1 + (target - 1) * state.focusProgress);
}

const NodeBox: React.FC<{
  node: LaidOutNode;
  opacity: number;
  accent: NodeAccent;
  scale: number;
  fontScale: number;
  valueOverride?: string;
  meter?: { value: number; label?: string };
}> = ({ node, opacity, accent, scale, fontScale, valueOverride, meter }) => {
  const isGroup = node.shape === "group";
  const palette = ACCENT_COLORS[accent];
  const stroke = isGroup ? GROUP_STROKE : palette.stroke;
  const fill = isGroup ? GROUP_FILL : palette.fill;
  const labelSize = Math.max(MIN_LABEL_PX, Math.min(38, node.height * 0.22)) * fontScale;
  const subSize = Math.max(MIN_SUB_PX, labelSize * 0.72);

  // Replicas render as offset copies of the SAME box — identical by
  // construction, which is what "three identical replicas" has to look like.
  const copies = Array.from({ length: node.replicas }, (_, i) => node.replicas - 1 - i);

  // A node carrying a real brand mark is drawn as an ICON TILE with its caption
  // underneath — the register real architecture diagrams use — rather than as a
  // labelled rectangle. When no mark could be resolved (offline, unknown slug)
  // this falls through to the plain box below, so the diagram always renders.
  const isTile = !isGroup && !!node.logoPath;
  // A full-colour mark carries its own identity, so it sits on a neutral slate
  // tile; a tinted-white mark needs the brand colour behind it to read — unless
  // that brand colour is itself near-black, in which case the tile would vanish
  // into the panel. See brandTile.ts.
  const tileColor = brandTileColor(node.logoHex, node.logoMonochrome, palette.stroke);

  if (isTile) {
    return (
      <>
        {copies.map((offset) => (
          <div
            key={offset}
            style={{
              position: "absolute",
              left: `${node.x - node.width / 2}%`,
              top: `${node.y - node.height / 2}%`,
              width: `${node.width}%`,
              height: `${node.height}%`,
              transform: `translate(${offset * 4.5}%, ${offset * -7}%)`,
              opacity: opacity * (offset === 0 ? 1 : 0.42),
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              // Pinned to the top, NOT centred. diagramLayout's anchorBox
              // computes the icon's centre as `box top + tileHeight / 2`; if
              // the column were centred, that centre would slide with the
              // caption's rendered height and every connector would arrive
              // slightly off the icon it points at.
              justifyContent: "flex-start",
              gap: 8,
            }}
          >
            <div
              style={{
                height: `${TILE_HEIGHT_FRACTION * 100}%`,
                aspectRatio: "1 / 1",
                borderRadius: 12,
                background: tileColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 10px 26px rgba(0,0,0,0.4)",
                flexShrink: 0,
              }}
            >
              {/* A single-shape mark is MASKED and tinted white on the
                  brand-coloured tile. A full-colour mark (the real Lambda
                  gradient, the Postgres elephant) is drawn as-is — masking it
                  would throw away the colour that makes it recognizable. */}
              {node.logoMonochrome === false ? (
                <img src={staticFile(node.logoPath!)} alt="" style={{ width: "68%", height: "68%", objectFit: "contain" }} />
              ) : (
                <div
                  style={{
                    width: "62%",
                    height: "62%",
                    backgroundColor: "#ffffff",
                    WebkitMaskImage: `url(${staticFile(node.logoPath!)})`,
                    maskImage: `url(${staticFile(node.logoPath!)})`,
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskPosition: "center",
                    maskPosition: "center",
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                  }}
                />
              )}
            </div>
            {offset === 0 && node.label && (
              <span style={{ fontFamily: DIAGRAM_FONT, fontSize: labelSize * 0.82, fontWeight: 600, color: "#e6ecff", textAlign: "center", lineHeight: 1.15 }}>
                {node.label}
              </span>
            )}
            {offset === 0 && (valueOverride ?? node.sublabel) && (
              <span style={{ fontFamily: DIAGRAM_FONT, fontSize: subSize * 0.9, color: "#93a4c8", textAlign: "center" }}>
                {valueOverride ?? node.sublabel}
              </span>
            )}
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      {copies.map((offset) => (
        <div
          key={offset}
          style={{
            position: "absolute",
            left: `${node.x - node.width / 2}%`,
            top: `${node.y - node.height / 2}%`,
            width: `${node.width}%`,
            height: `${node.height}%`,
            transform: `translate(${offset * 4.5}%, ${offset * -7}%) scale(${scale})`,
            border: `2px solid ${stroke}`,
            background: fill,
            borderRadius: 14,
            opacity: opacity * (offset === 0 ? 1 : 0.42),
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: isGroup ? "flex-start" : "center",
            padding: isGroup ? "6px 10px" : "4px 10px",
            boxSizing: "border-box",
          }}
        >
          {offset === 0 && node.label && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              {/* A container can carry a brand too — a cache that IS Redis, a
                  cluster that IS Kubernetes. The tile treatment only applies to
                  leaves, so a group wears its mark as a chip beside the label
                  instead of going unmarked. */}
              {node.logoPath && (
                <div
                  style={{
                    width: labelSize * 1.15,
                    height: labelSize * 1.15,
                    borderRadius: 6,
                    flexShrink: 0,
                    ...(node.logoMonochrome === false
                      ? {
                          backgroundImage: `url(${staticFile(node.logoPath)})`,
                          backgroundSize: "contain",
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "center",
                        }
                      : {
                          backgroundColor: node.logoHex ?? palette.stroke,
                          WebkitMaskImage: `url(${staticFile(node.logoPath)})`,
                          maskImage: `url(${staticFile(node.logoPath)})`,
                          WebkitMaskRepeat: "no-repeat",
                          maskRepeat: "no-repeat",
                          WebkitMaskPosition: "center",
                          maskPosition: "center",
                          WebkitMaskSize: "contain",
                          maskSize: "contain",
                        }),
                  }}
                />
              )}
              <span
                style={{
                  fontFamily: DIAGRAM_FONT,
                  fontSize: labelSize,
                  fontWeight: 600,
                  color: palette.text,
                  textAlign: "center",
                  lineHeight: 1.15,
                  letterSpacing: -0.2,
                }}
              >
                {node.label}
              </span>
            </div>
          )}
          {offset === 0 && (valueOverride ?? node.sublabel) && (
            <span style={{ fontFamily: DIAGRAM_FONT, fontSize: subSize, color: "#93a4c8", textAlign: "center", marginTop: 4 }}>
              {valueOverride ?? node.sublabel}
            </span>
          )}
          {offset === 0 && meter && (
            <div style={{ width: "78%", marginTop: 10 }}>
              <div style={{ height: 7, borderRadius: 4, background: "rgba(148,163,184,0.22)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.max(0, Math.min(1, meter.value)) * 100}%`,
                    height: "100%",
                    borderRadius: 4,
                    // Runs green -> amber -> red as the budget drains, so the
                    // state is legible from colour alone at a glance.
                    background: meter.value > 0.5 ? "#22c55e" : meter.value > 0.2 ? "#f59e0b" : "#f87171",
                  }}
                />
              </div>
              {meter.label && (
                <div style={{ fontFamily: DIAGRAM_FONT, fontSize: subSize * 0.9, color: "#93a4c8", textAlign: "center", marginTop: 4 }}>
                  {meter.label}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </>
  );
};

export const DiagramCard: React.FC<SharedVisualProps & { data: DiagramData }> = ({ data, hasCaption }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const atSeconds = frame / fps;
  const isPortrait = height > width;

  // Portrait genuinely recomposes to a vertical stack rather than squeezing the
  // horizontal arrangement — the aspect-ratio rule from CLAUDE.md.
  const direction = data.direction ?? (isPortrait ? "vertical" : "horizontal");
  // Percentages, matching the workspace medium's page margins (~4% x, ~5% y).
  const viewport = {
    x: 7,
    y: data.title ? 24 : 13,
    width: 86,
    height: (hasCaption ? 58 : 70) - (data.title ? 5 : 0),
  };

  // frameAspect is what keeps an icon tile SQUARE IN PIXELS when the layout
  // reasons in percent. Leaving it to default meant a portrait render anchored
  // its connectors as though the frame were still 16:9, which is exactly the
  // "9:16 is a separate composition target, not a resize" rule.
  const frameAspect = width / height;
  const layout = React.useMemo(
    () => layoutDiagram(data.nodes, data.edges ?? [], { direction, viewport, frameAspect }),
    [data.nodes, data.edges, direction, viewport, frameAspect],
  );

  const timeline = data.timeline ?? [];
  const hasTimeline = timeline.length > 0;
  const state = foldState(timeline, atSeconds, layout.edges, hasTimeline);
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const fontScale = isPortrait ? 1.15 : 1;

  // Text placement is resolved against everything already on the frame — node
  // boxes and drawn connectors — rather than anchored and hoped for. See
  // diagramAnnotations.ts for why that is the only thing that actually works.
  const visibleNodes = layout.nodes.filter((node) => opacityFor(node.id, state, hasTimeline) > 0.05);
  const nodeRects = visibleNodes.map((node) => ({
    left: node.x - node.width / 2,
    top: node.y - node.height / 2,
    width: node.width,
    height: node.height,
  }));
  const drawnEdges = layout.edges.filter(
    (edge) => (hasTimeline && state.edgeReveal.size > 0 ? (state.edgeReveal.get(edgeKey(edge.from, edge.to)) ?? 0) : 1) >= 0.9,
  );
  const edgeLabels = placeEdgeLabels(
    drawnEdges.filter((edge) => !!edge.label).map((edge) => ({ text: edge.label!, points: edge.points })),
    MIN_EDGE_LABEL_PX * fontScale,
    width,
    height,
  );
  const annotations = placeAnnotations(state.annotations, (id) => byId.get(id), MIN_ANNOTATION_PX * fontScale, width, height, [
    ...nodeRects,
    ...connectorObstacles(drawnEdges),
    ...edgeLabels,
  ]);

  return (
    <SceneFrame>
      {data.background === "liveMap" && <LiveMapBackdrop />}
      <div style={{ position: "absolute", inset: 0, color: COLORS.text }}>
        {data.title && (
          <div
            style={{
              position: "absolute",
              top: "7%",
              left: 0,
              right: 0,
              textAlign: "center",
              fontFamily: DIAGRAM_FONT,
              fontSize: isPortrait ? 32 : 36,
              fontWeight: 600,
              letterSpacing: -0.3,
              padding: "0 7%",
            }}
          >
            {data.title}
          </div>
        )}

        {/* Connectors sit beneath the nodes so a line never crosses over a
            label. They are drawn, not implied: an edge exists because the
            author declared a relationship. */}
        {/* Connectors.
            The viewBox matches the frame's REAL pixel dimensions rather than a
            square 0-100 space stretched with preserveAspectRatio="none". That
            stretch scaled x by ~19 and y by ~11 at 1080p, so every endpoint
            circle rendered as a squashed blob and no rotated arrowhead could
            ever be drawn correctly. Working in pixels keeps circles circular,
            lets the stroke be a real weight, and makes a proper arrowhead
            possible. */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox={`0 0 ${width} ${height}`}>
          {layout.edges.map((edge, index) => {
            const revealed = hasTimeline && state.edgeReveal.size > 0 ? (state.edgeReveal.get(edgeKey(edge.from, edge.to)) ?? 0) : 1;
            if (revealed <= 0) return null;
            const fromNode = byId.get(edge.from);
            const toNode = byId.get(edge.to);
            const endpointOpacity = Math.min(
              fromNode ? opacityFor(fromNode.id, state, hasTimeline) : 1,
              toNode ? opacityFor(toNode.id, state, hasTimeline) : 1,
            );
            const colour = EDGE_KIND_COLORS[edge.kind] ?? EDGE_COLOR;
            const px = edge.points.map((p) => ({ x: (p.x / 100) * width, y: (p.y / 100) * height }));
            const drawn = pointsUpTo(px, revealed);
            // While a token is crossing this edge, the head points the way the
            // token is going; otherwise it points along the declared relationship.
            const travelling = state.activeDirection.get(edgeKey(edge.from, edge.to));
            const backwards = travelling === "reverse";
            const headPts = backwards ? [...drawn].reverse() : drawn;
            const tip = headPts[headPts.length - 1];
            const before = headPts[headPts.length - 2] ?? headPts[0];
            const angle = (Math.atan2(tip.y - before.y, tip.x - before.x) * 180) / Math.PI;
            const complete = revealed > 0.98;
            return (
              <g key={`${edge.from}-${edge.to}-${index}`} opacity={Math.max(0.55, endpointOpacity)}>
                <polyline
                  points={drawn.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={colour}
                  strokeWidth={EDGE_STROKE_PX}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={edge.style === "dashed" ? "10 8" : undefined}
                />
                {/* Dot at the source, solid arrowhead at the target — the
                    convention that makes direction readable at a glance. */}
                <circle cx={backwards ? px[px.length - 1].x : px[0].x} cy={backwards ? px[px.length - 1].y : px[0].y} r={EDGE_DOT_R_PX} fill={colour} />
                {complete && (
                  <polygon
                    points={`0,0 -${ARROW_LEN_PX},-${ARROW_HALF_PX} -${ARROW_LEN_PX},${ARROW_HALF_PX}`}
                    fill={colour}
                    transform={`translate(${tip.x} ${tip.y}) rotate(${angle})`}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Containers first so nested children paint on top of their frame. */}
        {[...layout.nodes]
          .sort((a, b) => a.depth - b.depth)
          .map((node) => (
            <NodeBox
              key={node.id}
              node={node}
              opacity={opacityFor(node.id, state, hasTimeline)}
              accent={state.accents.get(node.id) ?? node.accent}
              scale={1}
              fontScale={fontScale}
              valueOverride={state.values.get(node.id)}
              meter={state.meters.get(node.id)}
            />
          ))}

        {/* Edge labels ride above their connector's longest straight run, then
            are lifted clear of any node box they would otherwise print over. */}
        {edgeLabels.map((label, index) => (
          <div
            key={`label-${index}`}
            style={{
              position: "absolute",
              left: `${label.left}%`,
              top: `${label.top}%`,
              width: `${label.width}%`,
              textAlign: "center",
              fontFamily: DIAGRAM_FONT,
              fontSize: MIN_EDGE_LABEL_PX * fontScale,
              color: "#9fb0d4",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ background: "rgba(10, 14, 24, 0.85)", padding: "1px 8px", borderRadius: 6 }}>{label.text}</span>
          </div>
        ))}

        {annotations.map((annotation, index) => (
          <div
            key={`note-${index}`}
            style={{
              position: "absolute",
              left: `${annotation.left}%`,
              top: `${annotation.top}%`,
              width: `${annotation.width}%`,
              fontFamily: DIAGRAM_FONT,
              fontSize: MIN_ANNOTATION_PX * fontScale,
              lineHeight: ANNOTATION_LINE_HEIGHT,
              color: "#f8c76a",
              opacity: annotation.opacity,
              textAlign: "center",
            }}
          >
            {annotation.text}
          </div>
        ))}

        {/* A flow token is the actual thing in transit — "GET /users", "200
            OK", "AUTH TOKEN" — drawn as a flat labelled card, not a glowing
            anonymous dot: the moving object is the story, not the fact that
            something moved (doctrine: "animate the communication, not the
            connection"). No blur/box-shadow glow — a flat fill + stroke reads
            just as clearly and costs nothing extra per frame. Only a token
            with no label at all (an older, unlabeled flow) falls back to a
            small flat dot. */}
        {state.tokens.map((token, index) =>
          token.label ? (
            <div
              key={`token-${index}`}
              style={{
                position: "absolute",
                left: `${token.x}%`,
                top: `${token.y}%`,
                transform: "translate(-50%, -50%)",
                opacity: token.opacity,
                padding: "7px 14px",
                borderRadius: 8,
                background: "rgba(10, 14, 24, 0.92)",
                border: `2px ${token.dashed ? "dashed" : "solid"} ${token.color}`,
                color: token.color,
                fontFamily: DIAGRAM_FONT,
                fontSize: MIN_EDGE_LABEL_PX * fontScale,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {token.label}
            </div>
          ) : (
            <div
              key={`token-${index}`}
              style={{
                position: "absolute",
                left: `${token.x}%`,
                top: `${token.y}%`,
                transform: "translate(-50%, -50%)",
                opacity: token.opacity,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: token.color,
              }}
            />
          ),
        )}
      </div>
    </SceneFrame>
  );
};
