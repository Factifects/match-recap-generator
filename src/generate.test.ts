import { describe, expect, it } from "vitest";
import { runEnforcementGate, generateVideo } from "./generate";
import { diagnostic } from "./script/sceneDiagnostics";

describe("runEnforcementGate", () => {
  const hardOnly = [diagnostic(0, 3, "hard", "low-richness", "Scene 1: zero explanatory motion.")];
  const softOnly = [diagnostic(0, 2, "soft", "low-density", "Scene 1: mostly empty canvas.")];
  const mixed = [...hardOnly, ...softOnly];

  it("does nothing when there are no hard failures", () => {
    expect(() => runEnforcementGate(softOnly, true, "before render")).not.toThrow();
    expect(() => runEnforcementGate([], true, "before render")).not.toThrow();
  });

  // The contract inverted deliberately on 2026-08-10: findings are ADVISORY by
  // default and blocking is opt-in. A checker that stops the author from seeing
  // the render it is complaining about costs more than it saves, and the
  // structural media (diagram/workspace) make the geometry failures it guarded
  // against unrepresentable anyway.
  it("does NOT throw on a hard failure by default — diagnostics are advisory", () => {
    expect(() => runEnforcementGate(hardOnly, false, "before render")).not.toThrow();
    expect(() => runEnforcementGate(hardOnly, undefined, "before render")).not.toThrow();
  });

  it("throws on a hard failure only when strict is opted into", () => {
    expect(() => runEnforcementGate(hardOnly, true, "before render")).toThrow(/Scene 1: zero explanatory motion/);
  });

  it("the thrown message names the blocking stage and lists only the hard findings, not soft ones", () => {
    try {
      runEnforcementGate(mixed, true, "before narration/audio generation");
      expect.unreachable();
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("before narration/audio generation");
      expect(message).toContain("zero explanatory motion");
      expect(message).not.toContain("mostly empty canvas");
    }
  });
});

describe("generateVideo — enforcement integration", () => {
  // Same fixture as before: one scene with enough objects/timeline to trigger
  // the low-richness AND unconnected-entities hard failures.
  const badScript = `### SCENE 1

**Scene Type:** Canvas

**Narration:** This scene demonstrates nothing.

**Duration:** 21 seconds

**Data:** {"title": "", "objects": [{"id": "a", "type": "icon", "icon": "device", "x": 22, "y": 45}, {"id": "b", "type": "icon", "icon": "server", "x": 78, "y": 45}], "timeline": [{"type": "appear", "id": "a", "startSeconds": 0.3}, {"type": "appear", "id": "b", "startSeconds": 0.6}]}`;

  it("aborts before any render work when strict is set and the script has a hard failure", async () => {
    await expect(generateVideo(badScript, { withAudio: false, strict: true, onLog: () => {} })).rejects.toThrow(/Generation blocked/);
  });

  // The complementary case — that the SAME script proceeds when strict is
  // unset — is deliberately not asserted through generateVideo here: without
  // the gate, the call runs on into a real Remotion render, which is not
  // something a unit test should start. The advisory default is covered
  // directly (and fast) by the runEnforcementGate cases above.
});
