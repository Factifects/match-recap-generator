import { describe, expect, it } from "vitest";
import { parseEntitiesField, parseFlowField, parseSceneContract } from "./sceneContract";

describe("parseEntitiesField", () => {
  it("parses id:icon pairs", () => {
    const entities = parseEntitiesField("client:device, proxy:shield, server:server");
    expect(entities).toEqual([
      { id: "client", icon: "device", label: "Client" },
      { id: "proxy", icon: "shield", label: "Proxy" },
      { id: "server", icon: "server", label: "Server" },
    ]);
  });

  it("falls back to a Title Case label derived from the id when no explicit label is given", () => {
    const entities = parseEntitiesField("rateLimiter:clock");
    expect(entities[0].label).toBe("Rate Limiter");
  });

  it("drops (falls back to undefined, not a bad value) an unrecognized icon name — the Canvas renderer draws NOTHING for an unknown icon key, so passing one through unvalidated would ship an invisible entity", () => {
    const entities = parseEntitiesField("proxy:not-a-real-icon");
    expect(entities[0].icon).toBeUndefined();
  });

  it("returns an empty array for an empty/undefined field", () => {
    expect(parseEntitiesField(undefined)).toEqual([]);
    expect(parseEntitiesField("")).toEqual([]);
  });
});

describe("parseFlowField", () => {
  it("parses semicolon-separated edges", () => {
    const edges = parseFlowField("client -request-> proxy; proxy -forwards-> server");
    expect(edges).toEqual([
      { from: "client", to: "proxy", verb: "request" },
      { from: "proxy", to: "server", verb: "forwards" },
    ]);
  });

  it("drops an edge whose verb isn't in the known FLOW_VERBS vocabulary rather than guessing", () => {
    const edges = parseFlowField("client -yeets-> proxy");
    expect(edges).toEqual([]);
  });

  it("drops a malformed edge (missing the -verb-> arrow shape) rather than throwing", () => {
    const edges = parseFlowField("client proxy server");
    expect(edges).toEqual([]);
  });
});

describe("parseSceneContract", () => {
  it("returns undefined when neither Entities nor Flow is present — every existing script is unaffected", () => {
    expect(parseSceneContract({ Narration: "just narration" })).toBeUndefined();
  });

  it("builds a full contract from Thesis + Entities + Flow fields", () => {
    const contract = parseSceneContract({
      Thesis: "The proxy sits between client and server.",
      Entities: "client:device, proxy:shield, server:server",
      Flow: "client -request-> proxy; proxy -forwards-> server",
    });
    expect(contract).toBeDefined();
    expect(contract!.thesis).toBe("The proxy sits between client and server.");
    expect(contract!.entities).toHaveLength(3);
    expect(contract!.edges).toHaveLength(2);
  });

  it("still returns a contract when only Flow is declared (no explicit Entities line)", () => {
    const contract = parseSceneContract({ Flow: "client -request-> proxy" });
    expect(contract).toBeDefined();
    expect(contract!.entities).toHaveLength(0);
    expect(contract!.edges).toHaveLength(1);
  });
});
