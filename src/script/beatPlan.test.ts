import { describe, it, expect } from "vitest";
import { beatPlanSchema, visualEventSchema } from "./beatPlan";

const validEvent = {
  before: "The viewer reads the window as their own computer.",
  viewerExpectation: "report.pdf is one solid object on the disk.",
  trigger: "The narration says the disk has no such file; every other icon dims.",
  action: "report.pdf lifts out of the grid and grows while the browser recedes behind it.",
  transformation: "The tile splits along faint seams into separate pieces that drift apart.",
  consequence: "A floating name on one side, a scattered handful of pieces on the other.",
  viewerRealization: "The filename and the contents are two different things.",
};

const validPlan = {
  semanticGoal: "A file is a name the system shows you, not one object on the disk.",
  primarySubject: "report.pdf",
  visualWorld: "An ordinary desktop file browser window with a folder and a few files.",
  viewerKnowledgeBefore: "A file is a real thing that lives in one place on the disk.",
  viewerKnowledgeAfter: "What the browser shows as one file is the system presenting a name.",
  representationNeed: "watch-one-thing-transform",
  event: validEvent,
};

describe("beatPlanSchema", () => {
  it("accepts a complete plan", () => {
    expect(beatPlanSchema.safeParse(validPlan).success).toBe(true);
  });

  it("accepts an optional-free event (no expectation, no transformation)", () => {
    const parsed = visualEventSchema.safeParse({
      before: "a", trigger: "b", action: "c", consequence: "d", viewerRealization: "e",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an event missing the physical action", () => {
    const noAction = { ...validEvent, action: undefined };
    expect(beatPlanSchema.safeParse({ ...validPlan, event: noAction }).success).toBe(false);
  });

  it("rejects an unknown representationNeed", () => {
    expect(beatPlanSchema.safeParse({ ...validPlan, representationNeed: "make-it-pop" }).success).toBe(false);
  });

  it("allows event: null only with an establishingReason", () => {
    expect(beatPlanSchema.safeParse({ ...validPlan, event: null }).success).toBe(false);
    expect(
      beatPlanSchema.safeParse({
        ...validPlan,
        event: null,
        establishingReason: "Opening establishing shot — names the domain before anything changes.",
      }).success,
    ).toBe(true);
  });
});
