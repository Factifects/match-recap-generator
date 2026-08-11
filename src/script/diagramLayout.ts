// The layout engine behind the `diagram` medium — architecture diagrams in the
// KodeKloud register: labelled boxes, boxes nested inside boxes, and real
// connectors between them.
//
// WHY THIS EXISTS RATHER THAN MORE CANVAS
//
// Canvas is a COORDINATE medium: an author writes `x: 28, y: 38` for every
// object and hand-places every label. Every failure in the load-balancer video
// came from that one property, not from bad taste:
//   - rectangles are centre-anchored, so `x: 8, width: 32` silently ran
//     half off-canvas;
//   - the overlap checker counts label text, so a radius-3 token carrying
//     "POST /login" was ~24 units wide and collided with things 14 units away;
//   - and most damningly, six diagram scenes shipped with NO connectors at all,
//     because `arrows` is an optional field an author can simply forget. The
//     rendered result was four columns of floating icons while the narration
//     described a pipeline.
//
// This medium is STRUCTURAL instead. The author declares nodes, nesting and
// edges; this file computes every coordinate. That makes the entire class of
// bug above unrepresentable rather than merely detectable:
//   - nothing can land off-canvas, because positions are normalised into the
//     viewport as the final step;
//   - nothing can overlap, because siblings are packed with explicit gutters
//     and containers are sized from their children;
//   - a label cannot collide with anything, because a node's box is sized to
//     fit its own text;
//   - and an edge cannot be forgotten, because edges are how you say two things
//     are related — there is no way to express a pipeline without them.
//
// Layout is layered (a simplified Sugiyama): longest-path layering along the
// flow axis, declaration order within a layer, containers sized to their
// children. Deliberately not a force-directed or general graph layout — those
// produce organic-looking blobs, and an architecture diagram wants to read as
// deliberate columns.

export type FlowDirection = "horizontal" | "vertical";
export type NodeShape = "box" | "service" | "database" | "queue" | "user" | "cloud" | "gateway" | "balancer" | "group";
export type NodeAccent = "neutral" | "primary" | "warn" | "success" | "danger";

export interface DiagramNodeInput {
  id: string;
  label?: string;
  sublabel?: string;
  shape?: NodeShape;
  icon?: string;
  brand?: string;
  /** Resolved brand mark, path relative to public/. */
  logoPath?: string;
  logoHex?: string;
  logoMonochrome?: boolean;
  accent?: NodeAccent;
  /** Nested children — the dominant shape in this register (a node holding
   * pods, a pool holding replicas, a VPC holding subnets). */
  children?: DiagramNodeInput[];
  /** How children are packed inside this container. Defaults to a row, which
   * is how nested groups are almost always drawn. */
  childDirection?: FlowDirection;
  /** Draws N identical stacked copies. Identical is the point: three replicas
   * of one service must look the same, which hand-placed icons kept getting
   * wrong by picking a different colour per object. */
  replicas?: number;
}

export interface DiagramEdgeInput {
  from: string;
  to: string;
  label?: string;
  style?: "solid" | "dashed";
  kind?: "request" | "response" | "data" | "dependency";
}

export interface LayoutOptions {
  direction?: FlowDirection;
  /** width / height of the output frame. Only used to keep a tile's anchor
   * square in pixels; defaults to 16:9. */
  frameAspect?: number;
  /** Viewport to normalise into, in percent. Leaves room for the scene title
   * and any caption overlay. */
  viewport?: { x: number; y: number; width: number; height: number };
}

export interface LaidOutNode {
  id: string;
  label?: string;
  sublabel?: string;
  shape: NodeShape;
  icon?: string;
  brand?: string;
  logoPath?: string;
  logoHex?: string;
  logoMonochrome?: boolean;
  accent: NodeAccent;
  replicas: number;
  depth: number;
  parentId?: string;
  /** Centre and size, in canvas percent. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LaidOutEdge {
  from: string;
  to: string;
  label?: string;
  style: "solid" | "dashed";
  kind: "request" | "response" | "data" | "dependency";
  /** Boundary-to-boundary polyline in canvas percent — never centre-to-centre,
   * which is what makes an arrow appear to start underneath its own node. */
  points: { x: number; y: number }[];
}

export interface DiagramLayout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
}

// Abstract units; normalised into the viewport at the end, so these are only
// ever ratios to each other.
const CHAR_WIDTH = 9.6;
const MIN_NODE_WIDTH = 112;
const NODE_PADDING_X = 26;
const BASE_NODE_HEIGHT = 86;
const SUBLABEL_HEIGHT = 26;
const ICON_HEIGHT = 26;
/** Gap between layers along the flow axis. Generous: this is the space
 * connectors live in, and a cramped connector reads as a smudge. */
const LAYER_GUTTER = 58;
/** Gap between siblings across the flow axis. */
const SIBLING_GUTTER = 30;
const CONTAINER_PADDING = 26;
/** Extra top padding inside a container, for its own label. */
const CONTAINER_HEADER = 34;
const REPLICA_OFFSET = 7;
/** Ceiling on how tall a plain leaf node may render, as a percent of frame
 * height. Keeps a sparse diagram honestly small instead of inflating it —
 * but not so small that its label stops being readable on a phone, which is
 * the failure the first value of 11 produced. */
const MAX_LEAF_HEIGHT_PERCENT = 15;

/** Fraction of a tile node's height taken by the icon square itself. Shared
 * with DiagramCard, which draws the tile at exactly this height — one constant,
 * so the drawing and the connector anchoring cannot drift apart. */
export const TILE_HEIGHT_FRACTION = 0.56;

/** Fraction of a node's face across which several connectors are fanned out.
 * Well inside 1 so the outermost port still lands on the visible shape rather
 * than grazing its corner. */
const PORT_SPREAD = 0.62;
/** Across-axis drift, as a fraction of a connector's length, still drawn as one
 * straight run rather than an elbow. */
const NEARLY_ALIGNED_SLOPE = 0.06;

interface SizedNode {
  input: DiagramNodeInput;
  id: string;
  width: number;
  height: number;
  children: SizedNode[];
  childDirection: FlowDirection;
  /** Filled in during placement. */
  x: number;
  y: number;
}

function textWidth(text: string | undefined): number {
  return text ? text.length * CHAR_WIDTH : 0;
}

/** Bottom-up sizing: a leaf is sized to its own text, a container to its
 * children plus padding. This is what guarantees a label can never overflow
 * its box, which on Canvas was purely the author's problem. */
function sizeNode(input: DiagramNodeInput): SizedNode {
  const childDirection = input.childDirection ?? "horizontal";
  const children = (input.children ?? []).map(sizeNode);

  const ownTextWidth = Math.max(textWidth(input.label), textWidth(input.sublabel)) + NODE_PADDING_X * 2;
  const replicas = Math.max(1, input.replicas ?? 1);
  const replicaPad = (replicas - 1) * REPLICA_OFFSET;

  if (children.length === 0) {
    let height = BASE_NODE_HEIGHT;
    if (input.sublabel) height += SUBLABEL_HEIGHT;
    if (input.icon || input.brand) height += ICON_HEIGHT;
    return {
      input,
      id: input.id,
      width: Math.max(MIN_NODE_WIDTH, ownTextWidth) + replicaPad,
      height: height + replicaPad,
      children,
      childDirection,
      x: 0,
      y: 0,
    };
  }

  const along = childDirection === "horizontal";
  const totalAlong = children.reduce((sum, c) => sum + (along ? c.width : c.height), 0) + SIBLING_GUTTER * (children.length - 1);
  const maxAcross = Math.max(...children.map((c) => (along ? c.height : c.width)));

  const innerWidth = along ? totalAlong : maxAcross;
  const innerHeight = along ? maxAcross : totalAlong;

  return {
    input,
    id: input.id,
    width: Math.max(innerWidth + CONTAINER_PADDING * 2, ownTextWidth),
    height: innerHeight + CONTAINER_PADDING * 2 + CONTAINER_HEADER,
    children,
    childDirection,
    x: 0,
    y: 0,
  };
}

/** Longest-path layering over the top-level nodes. A node sits one layer after
 * the furthest thing that points at it, which is what turns a declared set of
 * edges into readable columns without the author choosing any. */
function assignLayers(ids: string[], edges: DiagramEdgeInput[], ownerOf: Map<string, string>): Map<string, number> {
  const layer = new Map<string, number>(ids.map((id) => [id, 0]));
  // Resolve an edge endpoint (which may name a nested child) to the top-level
  // node that contains it — an edge into a pod is an edge into its node.
  const topOf = (id: string): string | undefined => ownerOf.get(id);

  // Relax repeatedly; |V| passes is enough for a DAG and terminates on cycles.
  for (let pass = 0; pass < ids.length + 1; pass++) {
    let changed = false;
    for (const edge of edges) {
      const from = topOf(edge.from);
      const to = topOf(edge.to);
      if (!from || !to || from === to) continue;
      const next = (layer.get(from) ?? 0) + 1;
      if (next > (layer.get(to) ?? 0)) {
        layer.set(to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return layer;
}

/** Places a container's children inside it, recursively. */
function placeChildren(node: SizedNode): void {
  const along = node.childDirection === "horizontal";
  const innerLeft = node.x - node.width / 2 + CONTAINER_PADDING;
  const innerTop = node.y - node.height / 2 + CONTAINER_PADDING + CONTAINER_HEADER;
  const innerWidth = node.width - CONTAINER_PADDING * 2;
  const innerHeight = node.height - CONTAINER_PADDING * 2 - CONTAINER_HEADER;

  const total =
    node.children.reduce((sum, c) => sum + (along ? c.width : c.height), 0) + SIBLING_GUTTER * (node.children.length - 1);
  let cursor = along ? innerLeft + (innerWidth - total) / 2 : innerTop + (innerHeight - total) / 2;

  for (const child of node.children) {
    if (along) {
      child.x = cursor + child.width / 2;
      child.y = innerTop + innerHeight / 2;
      cursor += child.width + SIBLING_GUTTER;
    } else {
      child.x = innerLeft + innerWidth / 2;
      child.y = cursor + child.height / 2;
      cursor += child.height + SIBLING_GUTTER;
    }
    placeChildren(child);
  }
}

function flatten(node: SizedNode, depth: number, parentId: string | undefined, out: LaidOutNode[]): void {
  out.push({
    id: node.id,
    label: node.input.label,
    sublabel: node.input.sublabel,
    shape: node.input.shape ?? (node.children.length > 0 ? "group" : "box"),
    icon: node.input.icon,
    brand: node.input.brand,
    logoPath: node.input.logoPath,
    logoHex: node.input.logoHex,
    logoMonochrome: node.input.logoMonochrome,
    accent: node.input.accent ?? "neutral",
    replicas: Math.max(1, node.input.replicas ?? 1),
    depth,
    parentId,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  });
  for (const child of node.children) flatten(child, depth + 1, node.id, out);
}

/** Where a connector should terminate, which is NOT always the layout box.
 *
 * A node carrying a brand mark renders as an icon tile with its caption
 * underneath and NO outer border, while its layout box is sized to fit that
 * caption's TEXT. On a node captioned "one line of execution" the box is far
 * wider than the small square icon, so a connector ending at the box edge
 * stopped in empty space well short of the thing it pointed at. Anything that
 * draws a real border is its own anchor. */
function anchorBox(node: LaidOutNode, frameAspect: number): { x: number; y: number; width: number; height: number } {
  const isTile = !!node.logoPath && node.shape !== "group";
  if (!isTile) return { x: node.x, y: node.y, width: node.width, height: node.height };
  const height = node.height * TILE_HEIGHT_FRACTION;
  // The tile is pinned to the TOP of the layout box (DiagramCard draws it that
  // way) so its centre is a pure function of the box — no dependency on how
  // tall the caption underneath happens to render. An earlier version guessed
  // the offset as a fixed fraction of the box; because the caption's real
  // height varies with whether the node has a sublabel, connectors arrived
  // 10-20px off the icon's centre line on every branded node.
  //
  // The tile is square in PIXELS, so in percent its width is divided by the
  // frame aspect — equal percentages on both axes would not be a square.
  return { x: node.x, y: node.y - node.height / 2 + height / 2, width: height / frameAspect, height };
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A self-loop (a retry, a state that transitions to itself) needs no curve —
 * it is just an orthogonal detour: out of the top, up, across, and back in the
 * side. Without this the generic route would run a line straight back through
 * the middle of the box. */
function selfLoop(from: Box): { x: number; y: number }[] {
  const reach = Math.max(2.5, from.height * 0.55);
  const top = from.y - from.height / 2;
  return [
    { x: from.x, y: top },
    { x: from.x, y: top - reach },
    { x: from.x + from.width / 2 + reach, y: top - reach },
    { x: from.x + from.width / 2 + reach, y: from.y },
    { x: from.x + from.width / 2, y: from.y },
  ];
}

interface EdgePlan {
  input: DiagramEdgeInput;
  from: LaidOutNode;
  to: LaidOutNode;
  fromBox: Box;
  toBox: Box;
  /** True when the target sits further along the flow axis than the source. */
  forward: boolean;
  /** Along-axis coordinates of the two faces the connector spans. */
  startAlong: number;
  endAlong: number;
  /** Across-axis coordinates of the two ports, filled in by the fan-out pass. */
  startAcross: number;
  endAcross: number;
}

/** Fans several connectors sharing one face out across it, so a node with two
 * or three relationships shows two or three visibly distinct wires.
 *
 * Ordered by where the far end sits across the flow axis, which is what keeps
 * the fan from crossing itself: the connector coming from highest up takes the
 * highest port. A face carrying exactly one connector gets offset zero, so the
 * overwhelmingly common one-in-one-out case is untouched. */
function assignPorts(groups: Map<string, { plan: EdgePlan; source: boolean }[]>, horizontal: boolean): void {
  for (const members of groups.values()) {
    members.sort((a, b) => {
      const farA = a.source ? a.plan.toBox : a.plan.fromBox;
      const farB = b.source ? b.plan.toBox : b.plan.fromBox;
      const acrossA = horizontal ? farA.y : farA.x;
      const acrossB = horizontal ? farB.y : farB.x;
      if (acrossA !== acrossB) return acrossA - acrossB;
      return `${a.plan.from.id}->${a.plan.to.id}`.localeCompare(`${b.plan.from.id}->${b.plan.to.id}`);
    });
    members.forEach(({ plan, source }, index) => {
      const box = source ? plan.fromBox : plan.toBox;
      const faceLength = horizontal ? box.height : box.width;
      const centre = horizontal ? box.y : box.x;
      const fraction = (index + 1) / (members.length + 1) - 0.5;
      const port = centre + fraction * faceLength * PORT_SPREAD;
      if (source) plan.startAcross = port;
      else plan.endAcross = port;
    });
  }
}

/** Routes every edge at once, rather than each in isolation.
 *
 * Isolated routing is what produced "the lines seem out of place": two buyers
 * pointing at one stock counter both left their own box, both turned at the
 * exact midpoint of the same gap, and both ended at the same point on the
 * target's face. The three coincident segments drew as a single bracket with
 * one arrowhead — a viewer could not see that there were two requests at all,
 * and the shared vertical rail read as a line floating between the icons rather
 * than as either connection.
 *
 * Two things have to be decided globally to avoid that, so they live here:
 * which point on a face each connector attaches to (`assignPorts`), and which
 * column of the inter-layer gap each one turns in (the lane pass below). */
function routeEdges(
  edges: DiagramEdgeInput[],
  byId: Map<string, LaidOutNode>,
  direction: FlowDirection,
  frameAspect: number,
): LaidOutEdge[] {
  const ALIGNED_TOLERANCE = 0.4;
  const horizontal = direction === "horizontal";
  const along = (b: Box) => (horizontal ? b.x : b.y);
  const across = (b: Box) => (horizontal ? b.y : b.x);
  const alongSize = (b: Box) => (horizontal ? b.width : b.height);

  const plans: EdgePlan[] = [];
  const selfLoops: { input: DiagramEdgeInput; box: Box }[] = [];
  for (const input of edges) {
    const from = byId.get(input.from);
    const to = byId.get(input.to);
    if (!from || !to) continue;
    const fromBox = anchorBox(from, frameAspect);
    if (from.id === to.id) {
      selfLoops.push({ input, box: fromBox });
      continue;
    }
    const toBox = anchorBox(to, frameAspect);
    const forward = along(toBox) >= along(fromBox);
    plans.push({
      input,
      from,
      to,
      fromBox,
      toBox,
      forward,
      startAlong: along(fromBox) + (forward ? 1 : -1) * (alongSize(fromBox) / 2),
      endAlong: along(toBox) + (forward ? -1 : 1) * (alongSize(toBox) / 2),
      startAcross: across(fromBox),
      endAcross: across(toBox),
    });
  }

  // Ports are grouped by the PHYSICAL face they use, not by whether the node is
  // the source or the target — a node can be left by one edge and entered by
  // another on the same side, and those two must not be handed the same point.
  const faces = new Map<string, { plan: EdgePlan; source: boolean }[]>();
  const addToFace = (key: string, member: { plan: EdgePlan; source: boolean }) => {
    const existing = faces.get(key);
    if (existing) existing.push(member);
    else faces.set(key, [member]);
  };
  for (const plan of plans) {
    addToFace(`${plan.from.id}:${plan.forward ? "+" : "-"}`, { plan, source: true });
    addToFace(`${plan.to.id}:${plan.forward ? "-" : "+"}`, { plan, source: false });
  }
  assignPorts(faces, horizontal);

  // Lanes: connectors spanning the same pair of faces each turn in their own
  // column of the gap, so their perpendicular runs never lie on top of each
  // other. A lone connector gets the midpoint, exactly as before.
  const lanes = new Map<string, EdgePlan[]>();
  for (const plan of plans) {
    const key = `${plan.startAlong.toFixed(3)}|${plan.endAlong.toFixed(3)}`;
    const existing = lanes.get(key);
    if (existing) existing.push(plan);
    else lanes.set(key, [plan]);
  }
  const laneOf = new Map<EdgePlan, number>();
  for (const members of lanes.values()) {
    members.sort((a, b) => a.startAcross - b.startAcross || a.endAcross - b.endAcross);
    members.forEach((plan, index) => {
      const fraction = (index + 1) / (members.length + 1);
      laneOf.set(plan, plan.startAlong + (plan.endAlong - plan.startAlong) * fraction);
    });
  }

  const point = (alongValue: number, acrossValue: number) =>
    horizontal ? { x: alongValue, y: acrossValue } : { x: acrossValue, y: alongValue };

  const routed: LaidOutEdge[] = [];
  const build = (input: DiagramEdgeInput, points: { x: number; y: number }[]): LaidOutEdge => ({
    from: input.from,
    to: input.to,
    label: input.label,
    style: input.style ?? "solid",
    kind: input.kind ?? "request",
    points,
  });

  for (const plan of plans) {
    // Collinear boxes get a straight segment, since an elbow between them would
    // be a kink for no reason. The tolerance is partly RELATIVE to how far the
    // connector runs: two tiles one layer apart sit a few pixels off each
    // other's centre line whenever one of them carries a sublabel, and a 12px
    // step in the middle of a 540px run is not an elbow, it is a wobble.
    const span = Math.abs(plan.endAlong - plan.startAlong);
    const tolerance = Math.max(ALIGNED_TOLERANCE, span * NEARLY_ALIGNED_SLOPE);
    const points =
      Math.abs(plan.startAcross - plan.endAcross) <= tolerance
        ? [point(plan.startAlong, plan.startAcross), point(plan.endAlong, plan.endAcross)]
        : [
            point(plan.startAlong, plan.startAcross),
            point(laneOf.get(plan)!, plan.startAcross),
            point(laneOf.get(plan)!, plan.endAcross),
            point(plan.endAlong, plan.endAcross),
          ];
    routed.push(build(plan.input, points));
  }
  for (const loop of selfLoops) routed.push(build(loop.input, selfLoop(loop.box)));

  // Restore declaration order — the renderer keys off it, and a caller reading
  // `layout.edges[0]` means the first edge they wrote.
  const order = new Map(edges.map((e, i) => [e, i]));
  const inputOf = [...plans.map((p) => p.input), ...selfLoops.map((l) => l.input)];
  return routed
    .map((edge, i) => ({ edge, at: order.get(inputOf[i]) ?? i }))
    .sort((a, b) => a.at - b.at)
    .map((entry) => entry.edge);
}

export function layoutDiagram(nodes: DiagramNodeInput[], edges: DiagramEdgeInput[], options: LayoutOptions = {}): DiagramLayout {
  const direction = options.direction ?? "horizontal";
  const viewport = options.viewport ?? { x: 6, y: 20, width: 88, height: 66 };
  const frameAspect = options.frameAspect ?? 16 / 9;
  if (nodes.length === 0) return { nodes: [], edges: [] };

  const sized = nodes.map(sizeNode);

  // Map every id (including nested ones) to the top-level node containing it,
  // so an edge may legally name a nested child.
  const ownerOf = new Map<string, string>();
  const registerOwner = (node: SizedNode, top: string) => {
    ownerOf.set(node.id, top);
    for (const child of node.children) registerOwner(child, top);
  };
  for (const node of sized) registerOwner(node, node.id);

  const layers = assignLayers(
    sized.map((n) => n.id),
    edges,
    ownerOf,
  );

  // Group by layer, preserving declaration order within each.
  const byLayer = new Map<number, SizedNode[]>();
  for (const node of sized) {
    const l = layers.get(node.id) ?? 0;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(node);
  }
  const layerKeys = [...byLayer.keys()].sort((a, b) => a - b);

  const along = direction === "horizontal";
  // Extent of each layer across the flow axis, and of the whole diagram along it.
  const layerExtent = layerKeys.map((k) => {
    const group = byLayer.get(k)!;
    return group.reduce((sum, n) => sum + (along ? n.height : n.width), 0) + SIBLING_GUTTER * (group.length - 1);
  });
  const layerThickness = layerKeys.map((k) => Math.max(...byLayer.get(k)!.map((n) => (along ? n.width : n.height))));
  const totalAlongFlow = layerThickness.reduce((a, b) => a + b, 0) + LAYER_GUTTER * (layerKeys.length - 1);
  const maxAcross = Math.max(...layerExtent);

  let flowCursor = 0;
  layerKeys.forEach((key, index) => {
    const group = byLayer.get(key)!;
    const thickness = layerThickness[index];
    let acrossCursor = (maxAcross - layerExtent[index]) / 2;
    for (const node of group) {
      if (along) {
        node.x = flowCursor + thickness / 2;
        node.y = acrossCursor + node.height / 2;
        acrossCursor += node.height + SIBLING_GUTTER;
      } else {
        node.x = acrossCursor + node.width / 2;
        node.y = flowCursor + thickness / 2;
        acrossCursor += node.width + SIBLING_GUTTER;
      }
      placeChildren(node);
    }
    flowCursor += thickness + LAYER_GUTTER;
  });

  const flat: LaidOutNode[] = [];
  for (const node of sized) flatten(node, 0, undefined, flat);

  // Normalise abstract units into the viewport, preserving aspect so nothing
  // is stretched, and centring whatever slack remains. This is the step that
  // makes "off-canvas" impossible rather than merely unlikely.
  const contentWidth = along ? totalAlongFlow : maxAcross;
  const contentHeight = along ? maxAcross : totalAlongFlow;
  // Fit-to-viewport, but CAPPED. Without a ceiling, a sparse diagram (one node,
  // or a node holding one child) gets magnified until it fills the frame — a
  // giant empty rectangle with a small label floating in the middle, which is
  // what "one box occupying the whole screen just to show a TTL" was. A cache
  // holding one key should look like a small box holding a smaller box. The cap
  // only ever binds on sparse diagrams; a five-layer pipeline is width-bound
  // well below it and is unaffected.
  const fitScale = Math.min(viewport.width / Math.max(1, contentWidth), viewport.height / Math.max(1, contentHeight));
  const scale = Math.min(fitScale, MAX_LEAF_HEIGHT_PERCENT / BASE_NODE_HEIGHT);
  const offsetX = viewport.x + (viewport.width - contentWidth * scale) / 2;

  // A wide, shallow diagram (a 5-stage pipeline is ~20:1) is width-constrained,
  // which left every box a sliver in the middle of the frame with most of the
  // height unused. Boxes grow vertically into that slack — deliberately only
  // the boxes and their spacing, never the text metrics, so nothing is
  // stretched, it is genuinely a taller composition.
  const scaledHeight = contentHeight * scale;
  // Capped deliberately low. Filling the frame is not the goal — a single node
  // stretched to 2x its natural height becomes a huge empty rectangle with a
  // label floating in it, which is worse than leaving honest whitespace. A
  // sparse diagram should look sparse; the fix for a thin scene is more
  // demonstration, not a bigger box.
  const heightBoost = Math.max(1, Math.min(1.3, (viewport.height * 0.92) / Math.max(1, scaledHeight)));
  const boostedOffsetY = viewport.y + (viewport.height - scaledHeight * heightBoost) / 2;

  for (const node of flat) {
    node.x = offsetX + node.x * scale;
    // Scaling y about the content's own origin (rather than its centre) keeps
    // the boosted span exactly `contentHeight * boost` tall, so the offset above
    // still centres it — boosting about the centre double-counted and pushed
    // the top row out of the viewport.
    node.y = boostedOffsetY + node.y * heightBoost * scale;
    node.width *= scale;
    node.height *= scale * heightBoost;
  }

  const byId = new Map(flat.map((n) => [n.id, n]));
  return { nodes: flat, edges: routeEdges(edges, byId, direction, frameAspect) };
}

/** Points along an edge at parameter `t` (0-1) — how a travelling token knows
 * where it is. A token follows the real connector rather than an author-guessed
 * tween, so it can never drift off the line or land inside its target. */
export function pointOnEdge(edge: LaidOutEdge, t: number): { x: number; y: number } {
  const pts = edge.points;
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];
  const clamped = Math.max(0, Math.min(1, t));
  const segments = pts.length - 1;
  const scaled = clamped * segments;
  const index = Math.min(segments - 1, Math.floor(scaled));
  const local = scaled - index;
  const a = pts[index];
  const b = pts[index + 1];
  return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local };
}
