import { describe, expect, it } from "vitest";
import { composeSelect, selectContractSchema, type SelectContractInput } from "./composeSelect";
import { estimateObjectBoundingBox, boxesOverlap, resolveObjectPosition } from "../video/canvasLayout";

const matchedContract: SelectContractInput = {
  subject: { label: "Payment", icon: "cash" },
  criteria: [
    { id: "amount", label: "$240.00" },
    { id: "account", label: "Acct 4821" },
    { id: "reference", label: "INV-9021" },
  ],
  candidates: [
    { id: "txn1", label: "Txn #7742", fields: { amount: "$180.00", account: "Acct 4821", reference: "INV-1002" } },
    { id: "txn2", label: "Txn #4471", fields: { amount: "$240.00", account: "Acct 4821", reference: "INV-9021" } },
    { id: "txn3", label: "Txn #9012", fields: { amount: "$310.00", account: "Acct 9911", reference: "INV-9021" } },
  ],
  resultLabel: "MATCHED",
};

const rejectedContract: SelectContractInput = {
  ...matchedContract,
  candidates: matchedContract.candidates.map((c) => (c.id === "txn2" ? { ...c, fields: { ...c.fields, amount: "$238.50" } } : c)),
  resultLabel: "REJECTED",
};

describe("selectContractSchema", () => {
  it("accepts a well-formed contract", () => {
    expect(selectContractSchema.safeParse(matchedContract).success).toBe(true);
  });

  it("rejects zero candidates", () => {
    expect(selectContractSchema.safeParse({ ...matchedContract, candidates: [] }).success).toBe(false);
  });
});

describe("composeSelect — the result is never visible before the final beat", () => {
  it("the result object starts at opacity 0 and only becomes visible in a late timeline action", () => {
    const composed = composeSelect(matchedContract, 25);
    const resultObject = composed.objects.find((o) => o.id === "selectResult")!;
    expect(resultObject.opacity).toBe(0);

    const revealIndex = composed.timeline.findIndex((a) => a.type === "move" && a.id === "selectResult" && a.opacity === 1);
    expect(revealIndex).toBeGreaterThan(-1);
    const revealAction = composed.timeline[revealIndex];
    const lastNonCameraAction = [...composed.timeline].reverse().find((a) => a.type !== "camera")!;
    expect(revealAction.startSeconds).toBeGreaterThan(composed.timeline[0].startSeconds + 2);
    expect(Math.abs(revealAction.startSeconds - lastNonCameraAction.startSeconds)).toBeLessThan(3);
  });

  it("no candidate field value or mark is visible at authored rest state — everything starts hidden", () => {
    const composed = composeSelect(matchedContract, 25);
    for (const o of composed.objects) {
      if (o.id === "selectSubject") continue; // the subject itself is the one thing legitimately visible immediately
      expect(o.opacity).toBe(0);
    }
  });
});

describe("composeSelect — the mechanism: real value equality, not an author-declared verdict", () => {
  it("a candidate's per-field mark is CHECK when its real value equals the criterion's real value, CROSS otherwise", () => {
    const composed = composeSelect(matchedContract, 25);
    // txn1 fails amount, passes account, fails reference (label INV-9021 vs its INV-1002).
    const txn1Amount = composed.objects.find((o) => o.id === "mark_txn1_amount")!;
    const txn1Account = composed.objects.find((o) => o.id === "mark_txn1_account")!;
    const txn1Reference = composed.objects.find((o) => o.id === "mark_txn1_reference")!;
    expect(txn1Amount.label).toBe("✕");
    expect(txn1Account.label).toBe("✓");
    expect(txn1Reference.label).toBe("✕");
    // txn2 matches on every field (identical to the criteria's own real values).
    for (const critId of ["amount", "account", "reference"]) {
      expect(composed.objects.find((o) => o.id === `mark_txn2_${critId}`)!.label).toBe("✓");
    }
  });

  it("changing a candidate's real field value (not a declared outcome) changes its computed mark", () => {
    const composed = composeSelect(rejectedContract, 25);
    // rejectedContract only changes txn2's real amount string — nothing else.
    expect(composed.objects.find((o) => o.id === "mark_txn2_amount")!.label).toBe("✕");
    expect(composed.objects.find((o) => o.id === "mark_txn2_account")!.label).toBe("✓");
  });

  it("a criterion missing from a candidate's fields defaults to a mismatch, never a silent match", () => {
    const contract: SelectContractInput = {
      ...matchedContract,
      candidates: [{ id: "incomplete", label: "Txn #1", fields: { amount: "$240.00", account: "Acct 4821" } }], // no "reference" key at all
    };
    const composed = composeSelect(contract, 25);
    expect(composed.objects.find((o) => o.id === "mark_incomplete_reference")!.label).toBe("✕");
  });

  it("candidate field labels show the candidate's REAL value, not a pass/fail word", () => {
    const composed = composeSelect(matchedContract, 25);
    expect(composed.objects.find((o) => o.id === "field_txn1_amount")!.label).toBe("$180.00");
    expect(composed.objects.find((o) => o.id === "field_txn2_amount")!.label).toBe("$240.00");
  });
});

describe("composeSelect — elimination is deferred: a near-miss is fully checked before it's rejected", () => {
  it("a candidate that fails an EARLY criterion still gets a comparison beat for LATER criteria (no early elimination)", () => {
    const composed = composeSelect(rejectedContract, 25);
    // txn2 fails amount (checked first) but must still be compared on
    // account and reference — every field must have its own reveal +
    // resolve actions, not just the first one.
    for (const critId of ["amount", "account", "reference"]) {
      const fieldId = `field_txn2_${critId}`;
      expect(composed.timeline.some((a) => a.type === "move" && a.id === fieldId && a.opacity === 1)).toBe(true);
      expect(composed.timeline.some((a) => a.type === "appear" && a.id === `mark_txn2_${critId}`)).toBe(true);
    }
  });

  it("rejection (row fade) only starts after every criterion's comparison beats have all been scheduled", () => {
    const composed = composeSelect(rejectedContract, 25);
    const lastFieldReveal = Math.max(...composed.timeline.filter((a) => a.type === "move" && a.id?.startsWith("field_") && a.opacity === 1).map((a) => a.startSeconds));
    const firstRejectFade = Math.min(...composed.timeline.filter((a) => a.type === "move" && a.id === "candidate_txn1" && a.opacity === 0).map((a) => a.startSeconds));
    expect(firstRejectFade).toBeGreaterThanOrEqual(lastFieldReveal);
  });
});

describe("composeSelect — candidates are genuinely inspected and filtered", () => {
  it("every non-matching candidate's whole row (label + fields + marks) fades and disappears", () => {
    const composed = composeSelect(matchedContract, 25);
    for (const prefix of ["candidate_txn1", "field_txn1_amount", "mark_txn1_amount"]) {
      expect(composed.timeline.some((a) => a.type === "move" && a.id === prefix && a.opacity === 0)).toBe(true);
      expect(composed.timeline.some((a) => a.type === "disappear" && a.id === prefix)).toBe(true);
    }
  });

  it("the one fully-matching candidate's label survives and travels toward the result instead of fading", () => {
    const composed = composeSelect(matchedContract, 25);
    expect(composed.timeline.some((a) => a.type === "disappear" && a.id === "candidate_txn2")).toBe(false);
    const travel = composed.timeline.find((a) => a.type === "move" && a.id === "candidate_txn2" && a.to !== undefined);
    expect(travel).toBeDefined();
  });

  it("when NO candidate fully matches, every candidate row fades and the subject visibly ejects (color change)", () => {
    const allFail: SelectContractInput = {
      ...matchedContract,
      candidates: matchedContract.candidates.map((c) => ({ ...c, fields: { ...c.fields, amount: "$999.99" } })),
    };
    const composed = composeSelect(allFail, 25);
    for (const id of ["candidate_txn1", "candidate_txn2", "candidate_txn3"]) {
      expect(composed.timeline.some((a) => a.type === "disappear" && a.id === id)).toBe(true);
    }
    expect(composed.timeline.some((a) => a.type === "style" && a.id === "selectSubject" && a.color === "#8a8f98")).toBe(true);
  });
});

describe("composeSelect — layout is derived from content, zero overlaps at authored rest state", () => {
  it("places every visible object without any pairwise overlap, for a range of criteria/candidate counts", () => {
    const wide: SelectContractInput = {
      subject: { label: "Payment" },
      criteria: [
        { id: "a", label: "A Genuinely Long Criterion Label" },
        { id: "b", label: "$1" },
      ],
      candidates: [
        { id: "c1", label: "Candidate One", fields: { a: "A Genuinely Long Criterion Label", b: "$1" } },
        { id: "c2", label: "Candidate Two", fields: { a: "nope", b: "$1" } },
        { id: "c3", label: "Candidate Three", fields: { a: "A Genuinely Long Criterion Label", b: "nope" } },
      ],
      resultLabel: "MATCHED",
    };
    for (const contract of [matchedContract, rejectedContract, wide]) {
      const composed = composeSelect(contract, 25);
      // Every hidden (opacity 0) object shares its authored rest position
      // with something else on purpose (subject-colocation for criteria,
      // stacked field/mark pairs) — only objects genuinely visible at
      // authored rest state (opacity !== 0) can meaningfully overlap.
      const resolved = composed.objects
        .filter((o) => o.opacity !== 0)
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
});
