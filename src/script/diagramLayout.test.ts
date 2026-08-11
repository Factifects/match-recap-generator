import { describe, it, expect } from "vitest";
import { layoutDiagram, pointOnEdge, type DiagramNodeInput, type DiagramEdgeInput, type LaidOutNode } from "./diagramLayout";

// These assert the PROPERTIES that hand-placed Canvas coordinates could not
// guarantee — the exact failures that shipped in the load-balancer video.
// Every one of them is a bug I actually rendered, now impossible to express.

const VIEWPORT = { x: 6, y: 20, width: 88, height: 66 };

function overlaps(a: LaidOutNode, b: LaidOutNode): boolean {
  return (
    Math.abs(a.x - b.x) * 2 < a.width + b.width - 0.01 && Math.abs(a.y - b.y) * 2 < a.height + b.height - 0.01
  );
}

/** Siblings only — a child legitimately sits inside its parent. */
function siblingPairs(nodes: LaidOutNode[]): [LaidOutNode, LaidOutNode][] {
  const pairs: [LaidOutNode, LaidOutNode][] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].parentId === nodes[j].parentId) pairs.push([nodes[i], nodes[j]]);
    }
  }
  return pairs;
}

const pipeline: DiagramNodeInput[] = [
  { id: "client", label: "Client", shape: "user" },
  { id: "lb", label: "Load Balancer", shape: "balancer" },
  { id: "gw", label: "API Gateway", shape: "gateway", replicas: 3 },
  { id: "orders", label: "orders", shape: "service" },
  { id: "users", label: "users", shape: "database" },
];
const pipelineEdges: DiagramEdgeInput[] = [
  { from: "client", to: "lb" },
  { from: "lb", to: "gw" },
  { from: "gw", to: "orders" },
  { from: "gw", to: "users" },
];

describe("no overlaps, by construction", () => {
  it("never overlaps sibling nodes in a pipeline", () => {
    const { nodes } = layoutDiagram(pipeline, pipelineEdges, { viewport: VIEWPORT });
    for (const [a, b] of siblingPairs(nodes)) {
      expect(overlaps(a, b), `${a.id} overlaps ${b.id}`).toBe(false);
    }
  });

  it("never overlaps siblings however long the labels get", () => {
    const wordy = pipeline.map((n) => ({ ...n, label: `${n.label} with a considerably longer name` }));
    const { nodes } = layoutDiagram(wordy, pipelineEdges, { viewport: VIEWPORT });
    for (const [a, b] of siblingPairs(nodes)) {
      expect(overlaps(a, b), `${a.id} overlaps ${b.id}`).toBe(false);
    }
  });

  it("sizes a node to fit its own label, so text cannot outgrow its box", () => {
    const { nodes } = layoutDiagram([{ id: "a", label: "short" }, { id: "b", label: "a very much longer label here" }], [], {
      viewport: VIEWPORT,
    });
    const a = nodes.find((n) => n.id === "a")!;
    const b = nodes.find((n) => n.id === "b")!;
    expect(b.width).toBeGreaterThan(a.width);
  });
});

describe("nothing lands off-canvas", () => {
  const cases: [string, DiagramNodeInput[], DiagramEdgeInput[]][] = [
    ["pipeline", pipeline, pipelineEdges],
    ["single node", [{ id: "only", label: "Just one" }], []],
    ["wide fan-out", [{ id: "src", label: "src" }, ...Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, label: `service ${i}` }))],
      Array.from({ length: 8 }, (_, i) => ({ from: "src", to: `n${i}` }))],
    ["deep chain", Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, label: `stage ${i}` })),
      Array.from({ length: 6 }, (_, i) => ({ from: `s${i}`, to: `s${i + 1}` }))],
  ];

  for (const [name, nodes, edges] of cases) {
    it(`keeps every node inside the viewport — ${name}`, () => {
      const laid = layoutDiagram(nodes, edges, { viewport: VIEWPORT });
      for (const node of laid.nodes) {
        expect(node.x - node.width / 2).toBeGreaterThanOrEqual(VIEWPORT.x - 0.01);
        expect(node.x + node.width / 2).toBeLessThanOrEqual(VIEWPORT.x + VIEWPORT.width + 0.01);
        expect(node.y - node.height / 2).toBeGreaterThanOrEqual(VIEWPORT.y - 0.01);
        expect(node.y + node.height / 2).toBeLessThanOrEqual(VIEWPORT.y + VIEWPORT.height + 0.01);
      }
    });
  }
});

describe("containment", () => {
  const nested: DiagramNodeInput[] = [
    {
      id: "node1",
      label: "Node",
      children: [
        { id: "pod1", label: "pod" },
        { id: "pod2", label: "pod" },
        { id: "pod3", label: "pod" },
      ],
    },
  ];

  it("fully contains children inside their parent's box", () => {
    const { nodes } = layoutDiagram(nested, [], { viewport: VIEWPORT });
    const parent = nodes.find((n) => n.id === "node1")!;
    for (const child of nodes.filter((n) => n.parentId === "node1")) {
      expect(child.x - child.width / 2).toBeGreaterThanOrEqual(parent.x - parent.width / 2 - 0.01);
      expect(child.x + child.width / 2).toBeLessThanOrEqual(parent.x + parent.width / 2 + 0.01);
      expect(child.y - child.height / 2).toBeGreaterThanOrEqual(parent.y - parent.height / 2 - 0.01);
      expect(child.y + child.height / 2).toBeLessThanOrEqual(parent.y + parent.height / 2 + 0.01);
    }
  });

  it("leaves room below the container's own label so it never sits on a child", () => {
    const { nodes } = layoutDiagram(nested, [], { viewport: VIEWPORT });
    const parent = nodes.find((n) => n.id === "node1")!;
    const topChild = Math.min(...nodes.filter((n) => n.parentId === "node1").map((n) => n.y - n.height / 2));
    expect(topChild).toBeGreaterThan(parent.y - parent.height / 2);
  });

  it("marks depth so the renderer can style nesting levels", () => {
    const { nodes } = layoutDiagram(nested, [], { viewport: VIEWPORT });
    expect(nodes.find((n) => n.id === "node1")!.depth).toBe(0);
    expect(nodes.find((n) => n.id === "pod1")!.depth).toBe(1);
  });
});

describe("edges are real connectors", () => {
  it("produces one routed edge per declared relationship", () => {
    const { edges } = layoutDiagram(pipeline, pipelineEdges, { viewport: VIEWPORT });
    expect(edges).toHaveLength(pipelineEdges.length);
  });

  it("starts and ends on box boundaries, never at centres", () => {
    const { nodes, edges } = layoutDiagram(pipeline, pipelineEdges, { viewport: VIEWPORT });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const edge of edges) {
      const from = byId.get(edge.from)!;
      const to = byId.get(edge.to)!;
      const start = edge.points[0];
      const end = edge.points[edge.points.length - 1];
      expect(Math.hypot(start.x - from.x, start.y - from.y)).toBeGreaterThan(0.5);
      expect(Math.hypot(end.x - to.x, end.y - to.y)).toBeGreaterThan(0.5);
      // ...and sits ON the boundary, not floating away from it.
      expect(Math.abs(start.x - from.x) <= from.width / 2 + 0.01).toBe(true);
      expect(Math.abs(start.y - from.y) <= from.height / 2 + 0.01).toBe(true);
    }
  });

  it("lets an edge name a nested child and still lays the parents out in order", () => {
    const nodes: DiagramNodeInput[] = [
      { id: "in", label: "in" },
      { id: "pool", label: "pool", children: [{ id: "w1", label: "worker" }] },
    ];
    const { nodes: laid } = layoutDiagram(nodes, [{ from: "in", to: "w1" }], { viewport: VIEWPORT });
    expect(laid.find((n) => n.id === "in")!.x).toBeLessThan(laid.find((n) => n.id === "pool")!.x);
  });
});

describe("layering", () => {
  it("orders a chain along the flow axis", () => {
    const { nodes } = layoutDiagram(pipeline, pipelineEdges, { viewport: VIEWPORT });
    const x = (id: string) => nodes.find((n) => n.id === id)!.x;
    expect(x("client")).toBeLessThan(x("lb"));
    expect(x("lb")).toBeLessThan(x("gw"));
    expect(x("gw")).toBeLessThan(x("orders"));
  });

  it("puts fan-out targets in the same layer", () => {
    const { nodes } = layoutDiagram(pipeline, pipelineEdges, { viewport: VIEWPORT });
    const orders = nodes.find((n) => n.id === "orders")!;
    const users = nodes.find((n) => n.id === "users")!;
    expect(Math.abs(orders.x - users.x)).toBeLessThan(0.01);
    expect(orders.y).not.toBeCloseTo(users.y, 1);
  });

  it("stacks vertically when asked, for portrait recomposition", () => {
    const { nodes } = layoutDiagram(pipeline, pipelineEdges, { viewport: VIEWPORT, direction: "vertical" });
    const y = (id: string) => nodes.find((n) => n.id === id)!.y;
    expect(y("client")).toBeLessThan(y("lb"));
    expect(y("lb")).toBeLessThan(y("gw"));
  });

  it("terminates on a cycle instead of hanging", () => {
    const cyclic: DiagramEdgeInput[] = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "a" },
    ];
    const { nodes } = layoutDiagram([{ id: "a" }, { id: "b" }, { id: "c" }], cyclic, { viewport: VIEWPORT });
    expect(nodes).toHaveLength(3);
  });
});

describe("replicas", () => {
  it("draws N identical copies as one node, so they cannot differ from each other", () => {
    const { nodes } = layoutDiagram(pipeline, pipelineEdges, { viewport: VIEWPORT });
    const gw = nodes.find((n) => n.id === "gw")!;
    expect(gw.replicas).toBe(3);
    // The bug this replaces: three hand-placed icons rendering green/purple/red
    // while the narration said "identical copies".
    expect(nodes.filter((n) => n.id.startsWith("gw"))).toHaveLength(1);
  });
});

describe("pointOnEdge", () => {
  it("walks a token from the source boundary to the target boundary", () => {
    const { edges } = layoutDiagram(pipeline, pipelineEdges, { viewport: VIEWPORT });
    const edge = edges[0];
    const start = pointOnEdge(edge, 0);
    const end = pointOnEdge(edge, 1);
    expect(start).toEqual(edge.points[0]);
    expect(end).toEqual(edge.points[edge.points.length - 1]);
  });

  it("clamps out-of-range t rather than flying off the line", () => {
    const { edges } = layoutDiagram(pipeline, pipelineEdges, { viewport: VIEWPORT });
    expect(pointOnEdge(edges[0], -3)).toEqual(edges[0].points[0]);
    expect(pointOnEdge(edges[0], 9)).toEqual(edges[0].points[edges[0].points.length - 1]);
  });

  it("advances monotonically along the edge", () => {
    const { edges } = layoutDiagram(pipeline, pipelineEdges, { viewport: VIEWPORT });
    let previous = -Infinity;
    for (let t = 0; t <= 1; t += 0.1) {
      const p = pointOnEdge(edges[0], t);
      expect(p.x).toBeGreaterThanOrEqual(previous - 0.01);
      previous = p.x;
    }
  });
});

describe("self-loops", () => {
  it("routes a node-to-itself edge as an orthogonal detour, not a line back through the box", () => {
    const { nodes, edges } = layoutDiagram([{ id: "retrying", label: "Retrying" }], [{ from: "retrying", to: "retrying", label: "retry" }], {
      viewport: VIEWPORT,
    });
    const node = nodes[0];
    const loop = edges[0];
    expect(loop.points.length).toBeGreaterThanOrEqual(4);
    // Every segment is axis-aligned — that is what makes it a broken line
    // rather than a diagonal or a curve.
    for (let i = 1; i < loop.points.length; i++) {
      const a = loop.points[i - 1];
      const b = loop.points[i];
      const axisAligned = Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01;
      expect(axisAligned).toBe(true);
    }
    // ...and it leaves the box rather than cutting through it.
    const above = loop.points.some((p) => p.y < node.y - node.height / 2 - 0.01);
    const beside = loop.points.some((p) => p.x > node.x + node.width / 2 - 0.01);
    expect(above && beside).toBe(true);
  });
});

describe("connectors anchor to the visible tile, not the layout box", () => {
  // A branded node renders as a small icon tile with its caption underneath and
  // no outer border, but its layout box is sized to fit that caption's text. A
  // connector aimed at the box edge stopped in empty space short of the icon —
  // "the lines are not extending enough to touch the concerned object".
  const nodes: DiagramNodeInput[] = [
    { id: "src", label: "src" },
    { id: "wide", label: "Thread A", sublabel: "one line of execution", logoPath: "assets/logos/x.svg" },
  ];

  it("ends the connector inside the icon's square, not out at the caption's width", () => {
    const { nodes: laid, edges } = layoutDiagram(nodes, [{ from: "src", to: "wide" }], { viewport: VIEWPORT });
    const target = laid.find((n) => n.id === "wide")!;
    const end = edges[0].points[edges[0].points.length - 1];
    const tileHalfWidth = (target.height * 0.56) / (16 / 9) / 2;
    const distanceFromCentre = Math.abs(end.x - target.x);
    expect(distanceFromCentre).toBeLessThanOrEqual(tileHalfWidth + 0.01);
    // ...and comfortably inside the layout box, which is what it used to hit.
    expect(distanceFromCentre).toBeLessThan(target.width / 2);
  });

  it("aims at the icon's centre line, which sits above the node's centre", () => {
    const { nodes: laid, edges } = layoutDiagram(nodes, [{ from: "src", to: "wide" }], { viewport: VIEWPORT });
    const target = laid.find((n) => n.id === "wide")!;
    expect(edges[0].points[edges[0].points.length - 1].y).toBeLessThan(target.y);
  });

  it("leaves an unbranded node anchored to its own border as before", () => {
    const plain: DiagramNodeInput[] = [{ id: "a", label: "a" }, { id: "b", label: "b" }];
    const { nodes: laid, edges } = layoutDiagram(plain, [{ from: "a", to: "b" }], { viewport: VIEWPORT });
    const target = laid.find((n) => n.id === "b")!;
    const end = edges[0].points[edges[0].points.length - 1];
    expect(Math.abs(end.x - target.x)).toBeCloseTo(target.width / 2, 5);
  });
});

describe("connectors sharing a node are fanned out, not stacked on each other", () => {
  // Two buyers pointing at one stock counter routed identically: same port on
  // the target, same turn column, same final segment. The three coincident
  // lines drew as a single bracket with one arrowhead, so the frame showed a
  // rail floating between the icons rather than two visible requests.
  const merge: DiagramNodeInput[] = [
    { id: "a", label: "Buyer A", logoPath: "assets/logos/user.svg" },
    { id: "b", label: "Buyer B", logoPath: "assets/logos/user.svg" },
    { id: "stock", label: "tickets left", sublabel: "1", logoPath: "assets/logos/purchase.svg" },
  ];
  const mergeEdges: DiagramEdgeInput[] = [
    { from: "a", to: "stock" },
    { from: "b", to: "stock" },
  ];

  function endpoint(edge: { points: { x: number; y: number }[] }) {
    return edge.points[edge.points.length - 1];
  }

  it("gives each connector into one node its own arrival point", () => {
    const { edges } = layoutDiagram(merge, mergeEdges, { viewport: VIEWPORT });
    const [first, second] = edges.map(endpoint);
    expect(Math.abs(first.y - second.y)).toBeGreaterThan(0.5);
  });

  it("still lands both arrival points on the target's visible tile", () => {
    const { nodes, edges } = layoutDiagram(merge, mergeEdges, { viewport: VIEWPORT });
    const target = nodes.find((n) => n.id === "stock")!;
    const tileHeight = target.height * 0.56;
    const tileCentreY = target.y - target.height / 2 + tileHeight / 2;
    for (const edge of edges) {
      const end = endpoint(edge);
      expect(Math.abs(end.y - tileCentreY)).toBeLessThanOrEqual(tileHeight / 2 + 0.01);
      expect(Math.abs(end.x - target.x)).toBeLessThanOrEqual(tileHeight / (16 / 9) / 2 + 0.01);
    }
  });

  it("turns each connector in its own column, so the elbows never coincide", () => {
    const { edges } = layoutDiagram(merge, mergeEdges, { viewport: VIEWPORT });
    const corners = edges.map((e) => e.points[1].x);
    expect(corners).toHaveLength(2);
    expect(Math.abs(corners[0] - corners[1])).toBeGreaterThan(0.5);
  });

  it("fans a node's outgoing connectors apart too", () => {
    const split: DiagramNodeInput[] = [
      { id: "rule", label: "rule", logoPath: "assets/logos/events.svg" },
      { id: "t1", label: "Transfer 1" },
      { id: "t2", label: "Transfer 2" },
    ];
    const { edges } = layoutDiagram(split, [{ from: "rule", to: "t1" }, { from: "rule", to: "t2" }], { viewport: VIEWPORT });
    expect(Math.abs(edges[0].points[0].y - edges[1].points[0].y)).toBeGreaterThan(0.5);
  });

  it("leaves a lone connector on the centre line and the midpoint elbow", () => {
    const pair: DiagramNodeInput[] = [{ id: "a", label: "a" }, { id: "b", label: "b" }];
    const { nodes, edges } = layoutDiagram(pair, [{ from: "a", to: "b" }], { viewport: VIEWPORT });
    const source = nodes.find((n) => n.id === "a")!;
    expect(edges[0].points[0].y).toBeCloseTo(source.y, 5);
  });

  it("keeps edges in declaration order", () => {
    const { edges } = layoutDiagram(merge, mergeEdges, { viewport: VIEWPORT });
    expect(edges.map((e) => `${e.from}->${e.to}`)).toEqual(["a->stock", "b->stock"]);
  });
});

describe("a branded node's connector meets the icon exactly", () => {
  // The icon tile is pinned to the top of its layout box, so its centre is
  // `top + tileHeight / 2` whatever the caption underneath does. Guessing that
  // offset as a fixed fraction of the box put every connector on a branded node
  // 10-20px off the icon it pointed at, and off by a DIFFERENT amount depending
  // on whether the node happened to carry a sublabel.
  it("arrives at the tile's centre line for a node with and without a sublabel", () => {
    const nodes: DiagramNodeInput[] = [
      { id: "src", label: "src" },
      { id: "plain", label: "Thread A", logoPath: "assets/logos/x.svg" },
      { id: "subbed", label: "Thread B", sublabel: "one line of execution", logoPath: "assets/logos/x.svg" },
    ];
    const { nodes: laid, edges } = layoutDiagram(nodes, [{ from: "src", to: "plain" }, { from: "src", to: "subbed" }], {
      viewport: VIEWPORT,
    });
    for (const edge of edges) {
      const target = laid.find((n) => n.id === edge.to)!;
      const tileHeight = target.height * 0.56;
      const tileCentreY = target.y - target.height / 2 + tileHeight / 2;
      const end = edge.points[edge.points.length - 1];
      // Within the fan-out spread of the tile's own centre — never out at the
      // layout box's centre, which sits a long way below the icon.
      expect(Math.abs(end.y - tileCentreY)).toBeLessThanOrEqual(tileHeight / 2);
    }
  });
});

describe("near-collinear connectors draw as one straight run", () => {
  it("does not put a wobble in a long run over a few pixels of drift", () => {
    // Consecutive tiles sit a little off each other's centre line whenever one
    // of them carries a sublabel. A four-point elbow for that read as a kink in
    // the middle of an otherwise horizontal wire.
    const nodes: DiagramNodeInput[] = [
      { id: "stock", label: "tickets left", sublabel: "1", logoPath: "assets/logos/purchase.svg" },
      { id: "out", label: "2 confirmations sent", logoPath: "assets/logos/warning.svg" },
    ];
    const { edges } = layoutDiagram(nodes, [{ from: "stock", to: "out" }], { viewport: VIEWPORT });
    expect(edges[0].points).toHaveLength(2);
  });

  it("still elbows when the two ends are genuinely on different rows", () => {
    const nodes: DiagramNodeInput[] = [
      { id: "a", label: "a" },
      { id: "b", label: "b" },
      { id: "c", label: "c" },
    ];
    const { edges } = layoutDiagram(nodes, [{ from: "a", to: "c" }, { from: "b", to: "c" }], { viewport: VIEWPORT });
    expect(edges.some((e) => e.points.length === 4)).toBe(true);
  });
});

describe("portrait is anchored as portrait, not as a resized 16:9", () => {
  const nodes: DiagramNodeInput[] = [
    { id: "a", label: "OpenAI", logoPath: "assets/logos/openai.svg" },
    { id: "b", label: "Anthropic", logoPath: "assets/logos/anthropic.svg" },
  ];

  it("anchors a tile to a square in PIXELS at whatever the frame aspect is", () => {
    for (const [w, h] of [[1920, 1080], [1080, 1920]]) {
      const aspect = w / h;
      const { nodes: laid, edges } = layoutDiagram(nodes, [{ from: "a", to: "b" }], {
        viewport: VIEWPORT,
        direction: "horizontal",
        frameAspect: aspect,
      });
      const target = laid.find((n) => n.id === "b")!;
      const tileHeightPct = target.height * 0.56;
      // Half the tile's width in percent, converted to pixels, must equal half
      // its height in pixels — that is what "square" means here.
      const end = edges[0].points[edges[0].points.length - 1];
      const halfWidthPx = Math.abs(end.x - target.x) * 0.01 * w;
      const halfHeightPx = (tileHeightPct / 2) * 0.01 * h;
      expect(halfWidthPx).toBeCloseTo(halfHeightPx, 1);
    }
  });
});
