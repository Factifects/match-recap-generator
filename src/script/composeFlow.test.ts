import { describe, expect, it } from "vitest";
import { composeFlow } from "./composeFlow";
import { classifySceneMotion } from "./actionClassifier";
import type { SceneContract } from "./sceneContract";

function findMovesWithTransport(timeline: ReturnType<typeof composeFlow>["timeline"], id: string) {
  return timeline.filter((a) => a.type === "move" && a.id === id && a.to !== undefined);
}

describe("composeFlow — linear chain", () => {
  const contract: SceneContract = {
    entities: [
      { id: "client", label: "Client" },
      { id: "proxy", label: "Proxy" },
      { id: "server", label: "Server" },
    ],
    edges: [
      { from: "client", to: "proxy", verb: "request" },
      { from: "proxy", to: "server", verb: "forwards" },
    ],
  };
  const composed = composeFlow(contract, 20);

  it("places every declared entity as its own node", () => {
    const ids = composed.objects.map((o) => o.id);
    expect(ids).toContain("client");
    expect(ids).toContain("proxy");
    expect(ids).toContain("server");
  });

  it("lays out the row left-to-right in first-mention order", () => {
    const byId = Object.fromEntries(composed.objects.map((o) => [o.id, o]));
    expect(byId.client.x).toBeLessThan(byId.proxy.x);
    expect(byId.proxy.x).toBeLessThan(byId.server.x);
  });

  it("always draws a connector for every declared relationship (the direct Scene-1-bug fix)", () => {
    expect(composed.arrows).toHaveLength(2);
    const pairs = composed.arrows.map((a) => `${a.from}->${a.to}`);
    expect(pairs).toContain("client->proxy");
    expect(pairs).toContain("proxy->server");
  });

  it("uses ONE shared token that transports through both hops (single-path detection)", () => {
    const tokenIds = new Set(composed.objects.filter((o) => o.id.startsWith("flowToken")).map((o) => o.id));
    expect(tokenIds.size).toBe(1);
    const tokenId = [...tokenIds][0];
    const transportMoves = findMovesWithTransport(composed.timeline, tokenId);
    expect(transportMoves).toHaveLength(2);
  });

  it("every real transport lands on (or very near) its declared target's authored position", () => {
    const byId = Object.fromEntries(composed.objects.map((o) => [o.id, o]));
    const tokenId = composed.objects.find((o) => o.id.startsWith("flowToken"))!.id;
    const moves = findMovesWithTransport(composed.timeline, tokenId).sort((a, b) => a.startSeconds - b.startSeconds);
    expect(moves[0].to).toEqual({ x: byId.proxy.x, y: byId.proxy.y });
    expect(moves[1].to).toEqual({ x: byId.server.x, y: byId.server.y });
  });

  it("produces a real classifier-explanatory scene, not just entrances/decoration", () => {
    // composed.timeline is intentionally the loose pre-validation shape
    // (see composeFlow.ts's own header comment on why) — classifySceneMotion
    // is typed against the post-zod-defaults shape, since every REAL caller
    // (validateScene.ts) only ever sees already-validated data. The cast is
    // safe here: classifyTimelineAction's switch never reads the fields
    // (like `path`) that differ between the two shapes.
    const motion = classifySceneMotion(composed.timeline as Parameters<typeof classifySceneMotion>[0]);
    expect(motion.explanatoryCount).toBeGreaterThan(0);
  });

  it("stays within the compiled scene's own duration budget (no timeline event past estimatedDurationSeconds)", () => {
    // +0.3s tolerance: the token's own final cleanup fade-out (added so a
    // plain-transport token doesn't sit permanently coincident with
    // whatever node it last arrived at — see composeFlow.ts's
    // buildSinglePathTimeline) is a brief epilogue after the real action is
    // already done, same allowance composeSelect.ts's camera pull-back gets.
    const lastEnd = Math.max(...composed.timeline.map((a) => a.startSeconds + (a.durationSeconds ?? 0)));
    expect(lastEnd).toBeLessThanOrEqual(20.3);
  });
});

describe("composeFlow — there-and-back chain (client->proxy->server->proxy->client)", () => {
  const contract: SceneContract = {
    entities: [
      { id: "client", label: "Client" },
      { id: "proxy", label: "Proxy" },
      { id: "server", label: "Server" },
    ],
    edges: [
      { from: "client", to: "proxy", verb: "request" },
      { from: "proxy", to: "server", verb: "forwards" },
      { from: "server", to: "proxy", verb: "returns" },
      { from: "proxy", to: "client", verb: "returns" },
    ],
  };
  const composed = composeFlow(contract, 26);

  it("still uses a single token (this is exactly the shape isSinglePath exists for)", () => {
    const tokenIds = composed.objects.filter((o) => o.id.startsWith("flowToken"));
    expect(tokenIds).toHaveLength(1);
  });

  it("collapses the client<->proxy and proxy<->server links to one connector each, not two", () => {
    expect(composed.arrows).toHaveLength(2);
  });

  it("walks all four hops as real transport", () => {
    const tokenId = composed.objects.find((o) => o.id.startsWith("flowToken"))!.id;
    expect(findMovesWithTransport(composed.timeline, tokenId)).toHaveLength(4);
  });
});

describe("composeFlow — fan-out (one source, several leaf targets)", () => {
  const contract: SceneContract = {
    entities: [
      { id: "gateway", label: "Gateway" },
      { id: "svc1", label: "Users" },
      { id: "svc2", label: "Orders" },
      { id: "svc3", label: "Payments" },
    ],
    edges: [
      { from: "gateway", to: "svc1", verb: "routes" },
      { from: "gateway", to: "svc2", verb: "routes" },
      { from: "gateway", to: "svc3", verb: "routes" },
    ],
  };
  const composed = composeFlow(contract, 20);

  it("uses one independent token per edge, not a single shared one", () => {
    const tokenIds = composed.objects.filter((o) => o.id.startsWith("flowToken"));
    expect(tokenIds).toHaveLength(3);
  });

  it("draws a connector from the source to EVERY target, not between targets", () => {
    expect(composed.arrows).toHaveLength(3);
    for (const arrow of composed.arrows) expect(arrow.from).toBe("gateway");
  });

  it("fans targets out vertically at a shared x, distinct from the source's x", () => {
    const byId = Object.fromEntries(composed.objects.map((o) => [o.id, o]));
    expect(byId.svc1.x).toBe(byId.svc2.x);
    expect(byId.svc2.x).toBe(byId.svc3.x);
    expect(byId.svc1.x).not.toBe(byId.gateway.x);
    expect(new Set([byId.svc1.y, byId.svc2.y, byId.svc3.y]).size).toBe(3); // distinct y per target
  });
});

describe("composeFlow — verb-specific behavior", () => {
  it("blocks/rejects: the token travels only PART of the way and never reaches the target's own position", () => {
    const contract: SceneContract = {
      entities: [
        { id: "request", label: "Request" },
        { id: "limiter", label: "Rate Limiter" },
      ],
      edges: [{ from: "request", to: "limiter", verb: "blocks" }],
    };
    const composed = composeFlow(contract, 10);
    const byId = Object.fromEntries(composed.objects.map((o) => [o.id, o]));
    const tokenId = composed.objects.find((o) => o.id.startsWith("flowToken"))!.id;
    const move = findMovesWithTransport(composed.timeline, tokenId)[0];
    expect(move.to).not.toEqual({ x: byId.limiter.x, y: byId.limiter.y });
    // A disappear must exist — the token is turned back, not left on screen.
    expect(composed.timeline.some((a) => a.type === "disappear" && a.id === tokenId)).toBe(true);
  });

  it("checks/validates: no token object at all, only a style flash on the target", () => {
    const contract: SceneContract = {
      entities: [
        { id: "gateway", label: "Gateway" },
        { id: "token", label: "Auth Token" },
      ],
      edges: [{ from: "gateway", to: "token", verb: "checks" }],
    };
    const composed = composeFlow(contract, 10);
    expect(composed.objects.some((o) => o.id.startsWith("flowToken"))).toBe(false);
    const styleActions = composed.timeline.filter((a) => a.type === "style" && a.id === "token");
    expect(styleActions.length).toBeGreaterThanOrEqual(2); // flash + revert
  });

  it("stores/transforms: the token is absorbed (disappears) into the target after arriving", () => {
    const contract: SceneContract = {
      entities: [
        { id: "response", label: "Response" },
        { id: "cache", label: "Cache" },
      ],
      edges: [{ from: "response", to: "cache", verb: "stores" }],
    };
    const composed = composeFlow(contract, 10);
    const tokenId = composed.objects.find((o) => o.id.startsWith("flowToken"))!.id;
    expect(composed.timeline.some((a) => a.type === "disappear" && a.id === tokenId)).toBe(true);
    expect(composed.timeline.some((a) => a.type === "style" && a.id === "cache" && a.color !== undefined)).toBe(true);
  });
});

describe("composeFlow — icon fallback", () => {
  it("renders a plain dot for an entity with no declared icon", () => {
    const contract: SceneContract = {
      entities: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "a", to: "b", verb: "request" }],
    };
    const composed = composeFlow(contract, 10);
    expect(composed.objects.find((o) => o.id === "a")!.type).toBe("dot");
  });

  it("renders a real icon node for an entity with a valid declared icon", () => {
    const contract: SceneContract = {
      entities: [
        { id: "a", label: "A", icon: "shield" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "a", to: "b", verb: "request" }],
    };
    const composed = composeFlow(contract, 10);
    const nodeA = composed.objects.find((o) => o.id === "a")!;
    expect(nodeA.type).toBe("icon");
    expect(nodeA.icon).toBe("shield");
  });
});
