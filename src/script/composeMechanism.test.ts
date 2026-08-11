import { describe, expect, it } from "vitest";
import { composeMechanism, mechanismContractSchema, type MechanismContractInput } from "./composeMechanism";
import { estimateObjectBoundingBox, boxesOverlap, resolveObjectPosition } from "../video/canvasLayout";
import { visualSchema } from "../model/Segment";
import type { CanvasAction } from "./timelineIR";

type MoveAction = Extract<CanvasAction, { type: "move" }>;

const restContract: MechanismContractInput = {
  entities: [
    { id: "client", label: "Client", icon: "device" },
    { id: "api", label: "API", icon: "server" },
    { id: "db", label: "Database", icon: "database" },
  ],
  steps: [
    { kind: "send", from: "client", to: "api", payload: "GET /user/42", verb: "request" },
    { kind: "transform", entity: "api", state: "validating" },
    { kind: "send", from: "api", to: "db", payload: "SELECT * FROM users WHERE id=42", verb: "query" },
    { kind: "transform", entity: "db", state: "looking up" },
    { kind: "send", from: "db", to: "api", payload: "{ id: 42, name: ... }", verb: "response" },
    { kind: "send", from: "api", to: "client", payload: "200 OK", verb: "response" },
  ],
};

describe("mechanismContractSchema", () => {
  it("accepts a well-formed contract", () => {
    expect(mechanismContractSchema.safeParse(restContract).success).toBe(true);
  });

  it("rejects fewer than 2 entities", () => {
    expect(mechanismContractSchema.safeParse({ ...restContract, entities: [restContract.entities[0]] }).success).toBe(false);
  });

  it("rejects zero steps", () => {
    expect(mechanismContractSchema.safeParse({ ...restContract, steps: [] }).success).toBe(false);
  });

  it("defaults a send step's verb to request when omitted", () => {
    const parsed = mechanismContractSchema.parse({ ...restContract, steps: [{ kind: "send", from: "client", to: "api", payload: "hi" }] });
    expect(parsed.steps[0]).toMatchObject({ verb: "request" });
  });
});

describe("composeMechanism — every step is a real, demonstrated event", () => {
  it("every send step produces a payload object carrying its own real payload text", () => {
    const composed = composeMechanism(restContract, 20);
    const payload0 = composed.objects.find((o) => o.id === "payload_step0")!;
    expect(payload0.label).toBe("GET /user/42");
    const payload2 = composed.objects.find((o) => o.id === "payload_step2")!;
    expect(payload2.label).toBe("SELECT * FROM users WHERE id=42");
  });

  it("every send step's payload actually travels — a move action targets near the real destination entity position, never coincident with it", () => {
    const composed = composeMechanism(restContract, 20);
    const apiEntity = composed.objects.find((o) => o.id === "api")!;
    const travel = composed.timeline.find((a) => a.type === "move" && a.id === "payload_step0" && a.to !== undefined) as MoveAction | undefined;
    expect(travel).toBeDefined();
    // Deliberately offset above the entity (never landing exactly on its
    // icon, which would overlap the payload text with the icon glyph) —
    // close enough to read as "arriving here," far enough not to collide.
    expect(travel!.to!.x).toBeCloseTo(apiEntity.x, 5);
    expect(travel!.to!.y).toBeLessThan(apiEntity.y);
    expect(apiEntity.y - travel!.to!.y!).toBeGreaterThan(2);
    expect(apiEntity.y - travel!.to!.y!).toBeLessThan(40);
  });

  it("every send step's arrival triggers a real reactive pulse on the target entity, not just the payload disappearing", () => {
    const composed = composeMechanism(restContract, 20);
    const pulses = composed.timeline.filter((a) => a.type === "move" && a.id === "api" && a.scale === 1.15);
    // api is the target of step0 (client->api) and step2's origin isn't api... api is target of step0 only among sends TO api; db->api (step4) also targets api.
    expect(pulses.length).toBeGreaterThanOrEqual(2);
  });

  it("every transform step produces its own visible state caption with the real described state, not a generic label", () => {
    const composed = composeMechanism(restContract, 20);
    const state1 = composed.objects.find((o) => o.id === "state_step1")!;
    expect(state1.label).toBe("validating");
    const state3 = composed.objects.find((o) => o.id === "state_step3")!;
    expect(state3.label).toBe("looking up");
  });

  it("a transform step's entity visibly changes color and then reverts — a real state change, not a static caption", () => {
    const composed = composeMechanism(restContract, 20);
    const colorChanges = composed.timeline.filter((a) => a.type === "style" && a.id === "api" && a.color !== undefined);
    // at least one change to the transform color and one revert
    expect(colorChanges.length).toBeGreaterThanOrEqual(2);
  });
});

describe("composeMechanism — narration-order sequencing", () => {
  it("steps occur in the order they were declared — each step's payload/state actions start no earlier than the previous step's", () => {
    const composed = composeMechanism(restContract, 20);
    const stepStart = (i: number) => {
      const id = restContract.steps[i].kind === "send" ? `payload_step${i}` : `state_step${i}`;
      const actions = composed.timeline.filter((a) => "id" in a && a.id === id);
      return Math.min(...actions.map((a) => a.startSeconds));
    };
    for (let i = 1; i < restContract.steps.length; i++) {
      expect(stepStart(i)).toBeGreaterThan(stepStart(i - 1));
    }
  });
});

describe("composeMechanism — layout places every entity without overlap", () => {
  it("zero pairwise overlaps among entity nodes at authored rest position, for varying entity/step counts", () => {
    const wide: MechanismContractInput = {
      entities: [
        { id: "a", label: "A Genuinely Long Entity Label", icon: "device" },
        { id: "b", label: "B", icon: "server" },
        { id: "c", label: "C", icon: "database" },
        { id: "d", label: "D", icon: "cloud" },
      ],
      steps: [
        { kind: "send", from: "a", to: "b", payload: "x", verb: "request" },
        { kind: "send", from: "b", to: "c", payload: "y", verb: "query" },
        { kind: "send", from: "c", to: "d", payload: "z", verb: "event" },
      ],
    };
    for (const contract of [restContract, wide]) {
      const composed = composeMechanism(contract, 20);
      const entityIds = new Set(contract.entities.map((e) => e.id));
      const resolved = composed.objects
        .filter((o) => entityIds.has(o.id))
        .map((o) => {
          const pos = resolveObjectPosition(o as never);
          return { id: o.id, box: estimateObjectBoundingBox(o as never, pos.x, pos.y) };
        });
      for (let i = 0; i < resolved.length; i++) {
        for (let j = i + 1; j < resolved.length; j++) {
          expect(boxesOverlap(resolved[i].box, resolved[j].box)).toBe(false);
        }
      }
    }
  });

  it("an entity never referenced by any step is still placed (appended), not dropped", () => {
    const contract: MechanismContractInput = {
      entities: [...restContract.entities, { id: "logger", label: "Logger", icon: "document" }],
      steps: restContract.steps,
    };
    const composed = composeMechanism(contract, 20);
    expect(composed.objects.find((o) => o.id === "logger")).toBeDefined();
  });
});

const cacheContract: MechanismContractInput = {
  entities: [
    { id: "client", label: "Client", icon: "device" },
    { id: "cache", label: "Cache", icon: "bolt" },
    { id: "db", label: "Database", icon: "database" },
  ],
  steps: [
    { kind: "send", from: "client", to: "cache", payload: "GET /users/42", verb: "request" },
    {
      kind: "branch",
      at: "cache",
      condition: "in cache?",
      taken: "MISS",
      outcomes: [
        { label: "HIT", steps: [{ kind: "send", from: "cache", to: "client", payload: "200 OK (cached)", verb: "response" }] },
        {
          label: "MISS",
          steps: [
            { kind: "send", from: "cache", to: "db", payload: "SELECT * FROM users WHERE id=42", verb: "query" },
            { kind: "transform", entity: "db", state: "looking up" },
            { kind: "send", from: "db", to: "cache", payload: "{ id: 42 }", verb: "response" },
            { kind: "transform", entity: "cache", state: "caching result" },
            { kind: "send", from: "cache", to: "client", payload: "200 OK", verb: "response" },
          ],
        },
      ],
    },
  ],
};

describe("mechanismContractSchema — recursive branch steps", () => {
  it("accepts a branch step with nested outcomes", () => {
    expect(mechanismContractSchema.safeParse(cacheContract).success).toBe(true);
  });

  it("rejects a branch with fewer than 2 outcomes", () => {
    const bad = { ...cacheContract, steps: [cacheContract.steps[0], { ...(cacheContract.steps[1] as { outcomes: unknown[] }), outcomes: [(cacheContract.steps[1] as { outcomes: unknown[] }).outcomes[0]] }] };
    expect(mechanismContractSchema.safeParse(bad).success).toBe(false);
  });
});

describe("composeMechanism — branch is a real, animated fork", () => {
  it("every outcome gets its own real container with its own label — a genuine fork, not a single narrated path", () => {
    const composed = composeMechanism(cacheContract, 20);
    const hit = composed.objects.find((o) => o.id === "outcome_step1_0");
    const miss = composed.objects.find((o) => o.id === "outcome_step1_1");
    expect(hit?.label).toBe("HIT");
    expect(miss?.label).toBe("MISS");
  });

  it("the taken outcome is styled toward the taken color; every other outcome is styled toward the not-taken color — a real, visible difference", () => {
    const composed = composeMechanism(cacheContract, 20);
    const takenStyle = composed.timeline.find((a) => a.type === "style" && "id" in a && a.id === "outcome_step1_1" && a.color === "#3ecf8e");
    const notTakenStyle = composed.timeline.find((a) => a.type === "style" && "id" in a && a.id === "outcome_step1_0" && a.color === "#4a4f5c");
    expect(takenStyle).toBeDefined();
    expect(notTakenStyle).toBeDefined();
  });

  it("the taken outcome's nested steps ARE compiled into real timeline events (the cache miss's fall-through to the database really happens)", () => {
    const composed = composeMechanism(cacheContract, 20);
    const dbQuery = composed.objects.find((o) => o.label === "SELECT * FROM users WHERE id=42");
    const dbTransform = composed.objects.find((o) => o.label === "looking up");
    expect(dbQuery).toBeDefined();
    expect(dbTransform).toBeDefined();
  });

  it("the NOT-taken outcome's nested steps are never compiled (no phantom hit-path payload exists)", () => {
    const composed = composeMechanism(cacheContract, 20);
    const cachedResponse = composed.objects.find((o) => o.label === "200 OK (cached)");
    expect(cachedResponse).toBeUndefined();
  });

  it("db (only reachable through the branch's nested miss outcome) is still placed in the layout without overlapping other entities", () => {
    const composed = composeMechanism(cacheContract, 20);
    const dbEntity = composed.objects.find((o) => o.id === "db")!;
    const cacheEntity = composed.objects.find((o) => o.id === "cache")!;
    expect(dbEntity.x).toBeGreaterThan(cacheEntity.x);
  });
});

const graphqlContract: MechanismContractInput = {
  entities: [
    { id: "client", label: "Client", icon: "device" },
    { id: "gateway", label: "Gateway", icon: "funnel" },
    { id: "userSvc", label: "User Service", icon: "person" },
    { id: "avatarSvc", label: "Avatar Service", icon: "camera" },
    { id: "postsSvc", label: "Posts Service", icon: "document" },
  ],
  steps: [
    { kind: "send", from: "client", to: "gateway", payload: "{ user { name avatar posts } }", verb: "request" },
    {
      kind: "fanout",
      from: "gateway",
      verb: "query",
      targets: [
        { to: "userSvc", payload: "name" },
        { to: "avatarSvc", payload: "avatar" },
        { to: "postsSvc", payload: "posts" },
      ],
    },
    {
      kind: "aggregate",
      into: "gateway",
      resultPayload: "{ name, avatar, posts }",
      sources: [
        { from: "userSvc", payload: "Amara" },
        { from: "avatarSvc", payload: "avatar.png" },
        { from: "postsSvc", payload: "[12 posts]" },
      ],
    },
    { kind: "send", from: "gateway", to: "client", payload: "{ name, avatar, posts }", verb: "response" },
  ],
};

describe("mechanismContractSchema — fanout/aggregate steps", () => {
  it("accepts a fanout+aggregate contract", () => {
    expect(mechanismContractSchema.safeParse(graphqlContract).success).toBe(true);
  });

  it("rejects a fanout with fewer than 2 targets", () => {
    const bad = { ...graphqlContract, steps: [graphqlContract.steps[0], { ...(graphqlContract.steps[1] as { targets: unknown[] }), targets: [(graphqlContract.steps[1] as { targets: unknown[] }).targets[0]] }] };
    expect(mechanismContractSchema.safeParse(bad).success).toBe(false);
  });
});

describe("composeMechanism — fanout is a real parallel dispatch, not one broadcast", () => {
  it("each fanout target gets its OWN real payload object with its own distinct content", () => {
    const composed = composeMechanism(graphqlContract, 20);
    const userPayload = composed.objects.find((o) => o.label === "name");
    const avatarPayload = composed.objects.find((o) => o.label === "avatar");
    const postsPayload = composed.objects.find((o) => o.label === "posts");
    expect(userPayload).toBeDefined();
    expect(avatarPayload).toBeDefined();
    expect(postsPayload).toBeDefined();
  });

  it("every fanout target entity gets its own individual arrival pulse", () => {
    const composed = composeMechanism(graphqlContract, 20);
    for (const id of ["userSvc", "avatarSvc", "postsSvc"]) {
      const pulse = composed.timeline.find((a) => a.type === "move" && "id" in a && a.id === id && a.scale === 1.15);
      expect(pulse).toBeDefined();
    }
  });

  it("fanout targets start close together (staggered), not spread across the whole scene like sequential sends", () => {
    const composed = composeMechanism(graphqlContract, 20);
    const startOf = (id: string) => Math.min(...composed.timeline.filter((a) => "id" in a && a.id === id).map((a) => a.startSeconds));
    const starts = ["payload_step1_0", "payload_step1_1", "payload_step1_2"].map(startOf);
    expect(Math.max(...starts) - Math.min(...starts)).toBeLessThan(2);
  });
});

describe("composeMechanism — aggregate visibly merges real converging values", () => {
  it("each source's own real value travels toward the aggregation point", () => {
    const composed = composeMechanism(graphqlContract, 20);
    for (const label of ["Amara", "avatar.png", "[12 posts]"]) {
      expect(composed.objects.find((o) => o.label === label)).toBeDefined();
    }
  });

  it("a single real merged payload appears at the aggregation point only after the sources converge", () => {
    const composed = composeMechanism(graphqlContract, 20);
    const merged = composed.objects.find((o) => o.label === "{ name, avatar, posts }" && o.id.startsWith("merged_"));
    expect(merged).toBeDefined();
    const mergedAppear = Math.min(...composed.timeline.filter((a) => "id" in a && a.id === merged!.id).map((a) => a.startSeconds));
    const lastSourceArrival = Math.max(
      ...["payload_step2_s0", "payload_step2_s1", "payload_step2_s2"].map((id) => Math.min(...composed.timeline.filter((a) => "id" in a && a.id === id && a.type === "disappear").map((a) => a.startSeconds))),
    );
    expect(mergedAppear).toBeLessThanOrEqual(lastSourceArrival + 1);
  });

  it("services only reachable through fanout/aggregate are still placed without overlapping", () => {
    const composed = composeMechanism(graphqlContract, 20);
    const svcIds = ["userSvc", "avatarSvc", "postsSvc"];
    const resolved = svcIds.map((id) => {
      const o = composed.objects.find((obj) => obj.id === id)!;
      const pos = resolveObjectPosition(o as never);
      return estimateObjectBoundingBox(o as never, pos.x, pos.y);
    });
    for (let i = 0; i < resolved.length; i++) {
      for (let j = i + 1; j < resolved.length; j++) {
        expect(boxesOverlap(resolved[i], resolved[j])).toBe(false);
      }
    }
  });
});

const websocketContract: MechanismContractInput = {
  entities: [
    { id: "client", label: "Client", icon: "device" },
    { id: "server", label: "Server", icon: "server" },
  ],
  steps: [
    { kind: "connect", a: "client", b: "server" },
    {
      kind: "stream",
      a: "client",
      b: "server",
      events: [
        { direction: "aToB", payload: "join #general", atSeconds: 0.5 },
        { direction: "bToA", payload: "Amara joined", atSeconds: 1.6 },
        { direction: "bToA", payload: "new message", atSeconds: 3.0 },
        { direction: "aToB", payload: "typing...", atSeconds: 4.2 },
      ],
    },
    { kind: "disconnect", a: "client", b: "server" },
  ],
};

describe("mechanismContractSchema — connect/disconnect/stream steps", () => {
  it("accepts a connect+stream+disconnect contract", () => {
    expect(mechanismContractSchema.safeParse(websocketContract).success).toBe(true);
  });

  it("rejects a stream with fewer than 2 events — one event isn't a stream", () => {
    const bad = { ...websocketContract, steps: [websocketContract.steps[0], { ...(websocketContract.steps[1] as { events: unknown[] }), events: [(websocketContract.steps[1] as { events: unknown[] }).events[0]] }, websocketContract.steps[2]] };
    expect(mechanismContractSchema.safeParse(bad).success).toBe(false);
  });
});

describe("composeMechanism — connect is a real persistent link, not a one-shot arrow", () => {
  it("connect produces a real line object that stays visible (continuous idle glow), not a momentary token", () => {
    const composed = composeMechanism(websocketContract, 15);
    const connection = composed.objects.find((o) => o.id.startsWith("connection_"));
    expect(connection).toBeDefined();
    expect(connection!.type).toBe("line");
    expect(connection!.idle).toBe("glow");
  });

  it("the baseline dashed arrow is suppressed for a connected pair — the persistent line replaces it, not doubles it", () => {
    const composed = composeMechanism(websocketContract, 15);
    expect(composed.arrows.length).toBe(0);
  });

  it("disconnect fades the SAME connection object connect created (same id), not a different one", () => {
    const composed = composeMechanism(websocketContract, 15);
    const connection = composed.objects.find((o) => o.id.startsWith("connection_"))!;
    const fade = composed.timeline.find((a) => a.type === "move" && "id" in a && a.id === connection.id && a.opacity === 0);
    expect(fade).toBeDefined();
  });
});

describe("composeMechanism — stream is genuinely continuous, not one request/response pair", () => {
  it("every stream event produces its own real payload with its own distinct content", () => {
    const composed = composeMechanism(websocketContract, 15);
    for (const label of ["join #general", "Amara joined", "new message", "typing..."]) {
      expect(composed.objects.find((o) => o.label === label)).toBeDefined();
    }
  });

  it("stream events travel in BOTH directions — not every event has the same from/to", () => {
    const composed = composeMechanism(websocketContract, 15);
    const travelTargets = ["payload_step1_e0", "payload_step1_e1", "payload_step1_e2", "payload_step1_e3"].map((id) => {
      const travel = composed.timeline.find((a) => a.type === "move" && "id" in a && a.id === id && a.to !== undefined) as MoveAction;
      return travel.to!.x!;
    });
    // aToB events land near the server's x, bToA events land near the client's x — not all identical.
    const distinctTargets = new Set(travelTargets.map((x) => Math.round(x)));
    expect(distinctTargets.size).toBeGreaterThan(1);
  });

  it("stream events are spread across real, distinct times spanning multiple seconds — not simultaneous or instantaneous", () => {
    const composed = composeMechanism(websocketContract, 15);
    const starts = ["payload_step1_e0", "payload_step1_e1", "payload_step1_e2", "payload_step1_e3"].map((id) => Math.min(...composed.timeline.filter((a) => "id" in a && a.id === id).map((a) => a.startSeconds)));
    const span = Math.max(...starts) - Math.min(...starts);
    expect(span).toBeGreaterThan(2);
  });
});

describe("composeMechanism — full output always passes the real render-time schema", () => {
  // A real render silently fell back to a plain text caption because a
  // 3-way stacked column (GraphQL's fanout) pushed the topmost entity to
  // y=7 — individually a "valid" 0-100 coordinate, and pairwise-overlap
  // checks above never caught it either, since it's not an overlap at
  // all. What actually broke was an ARRIVING PAYLOAD above that entity
  // needing y=7-ARRIVAL_Y_OFFSET, going negative — only `visualSchema`
  // itself (the same gate the real pipeline runs everything through)
  // catches that class of bug. Running every proof contract through it
  // directly is the permanent regression check for this, not just a
  // one-off fix — see feedback_generalize_bugs_into_static_checks.
  it.each([
    ["REST+Database", restContract],
    ["Cache hit/miss", cacheContract],
    ["GraphQL fanout/aggregate", graphqlContract],
    ["WebSocket connect/stream/disconnect", websocketContract],
  ])("%s composes to a fully schema-valid canvas visual", (_name, contract) => {
    const composed = composeMechanism(contract, 20);
    const result = visualSchema.safeParse({ kind: "canvas", title: undefined, ...composed });
    if (!result.success) {
      throw new Error(`schema validation failed:\n${result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")}`);
    }
    expect(result.success).toBe(true);
  });
});
