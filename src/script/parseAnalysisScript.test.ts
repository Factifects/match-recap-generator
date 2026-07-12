import { describe, expect, it } from "vitest";
import { parseAnalysisScript } from "./parseAnalysisScript";

describe("parseAnalysisScript", () => {
  it("emits a chapter segment for each ## header", () => {
    const script = `## HOOK\nSome opening line.\n\n## FIRST HALF\nSome match text.`;
    const segments = parseAnalysisScript(script);
    const chapters = segments.filter((s) => s.type === "chapter");
    expect(chapters.map((c) => c.text)).toEqual(["HOOK", "FIRST HALF"]);
  });

  it("chunks a paragraph into statement segments of 2 sentences each", () => {
    const script = `## HOOK\nFirst sentence here. Second sentence here. Third sentence here. Fourth sentence here.`;
    const segments = parseAnalysisScript(script);
    const statements = segments.filter((s) => s.type === "statement");
    expect(statements).toHaveLength(2);
    expect(statements[0].text).toBe(
      "First sentence here. Second sentence here.",
    );
    expect(statements[1].text).toBe(
      "Third sentence here. Fourth sentence here.",
    );
  });

  it("handles an odd number of sentences with a shorter final chunk", () => {
    const script = `## HOOK\nOne. Two. Three.`;
    const segments = parseAnalysisScript(script);
    const statements = segments.filter((s) => s.type === "statement");
    expect(statements).toHaveLength(2);
    expect(statements[1].text).toBe("Three.");
  });

  it("preserves chapter -> statement ordering across multiple sections", () => {
    const script = `## HOOK\nOpening line.\n\n## CONTEXT\nBackground line.`;
    const segments = parseAnalysisScript(script);
    expect(segments.map((s) => s.type)).toEqual([
      "chapter",
      "statement",
      "chapter",
      "statement",
    ]);
  });

  it("joins multi-line paragraphs (soft line breaks) before sentence-splitting", () => {
    const script = `## HOOK\nLine one continues\nonto line two. Second sentence.`;
    const segments = parseAnalysisScript(script);
    const statements = segments.filter((s) => s.type === "statement");
    expect(statements).toHaveLength(1);
    expect(statements[0].text).toBe(
      "Line one continues onto line two. Second sentence.",
    );
  });

  it("ignores a blank script", () => {
    expect(parseAnalysisScript("")).toEqual([]);
  });

  it("skips a header with no following prose", () => {
    const script = `## EMPTY SECTION\n\n## HOOK\nReal content here.`;
    const segments = parseAnalysisScript(script);
    expect(segments.map((s) => s.type)).toEqual([
      "chapter",
      "chapter",
      "statement",
    ]);
  });

  it("attaches an inline [STAT: ...] tag as a visual on the preceding statement, not a new segment", () => {
    const script = `## THE NUMBERS\nThe final shot count says it all.\n[STAT: Total Shots | France 21 | Morocco 4]`;
    const segments = parseAnalysisScript(script);
    expect(segments.map((s) => s.type)).toEqual(["chapter", "statement"]);

    const statement = segments[1];
    if (statement.type !== "statement")
      throw new Error("expected a statement segment");
    expect(statement.text).toBe("The final shot count says it all.");
    expect(statement.visual).toMatchObject({
      kind: "statburst",
      label: "Total Shots",
      leftLabel: "France",
      leftValue: 21,
      rightLabel: "Morocco",
      rightValue: 4,
      format: "integer",
    });
  });

  it("detects decimal format when either STAT value has a decimal point", () => {
    const script = `Some narration line here.\n[STAT: Expected Goals (xG) | France 3.04 | Morocco 0.14]`;
    const segments = parseAnalysisScript(script);
    const statement = segments[0];
    if (statement.type !== "statement")
      throw new Error("expected a statement segment");
    expect(statement.visual).toMatchObject({
      format: "decimal",
      leftValue: 3.04,
      rightValue: 0.14,
    });
  });

  it("attaches an inline [SEQUENCE: ...] tag with ordered beats to the preceding statement", () => {
    const script = `He laid it back for Dembele, who curled a low finish into the corner.\n[SEQUENCE: Redemption | 60': Curls it in | 66': Squares it for Dembele]`;
    const segments = parseAnalysisScript(script);
    const statement = segments[0];
    if (statement.type !== "statement")
      throw new Error("expected a statement segment");
    expect(statement.visual).toMatchObject({
      kind: "sequence",
      title: "Redemption",
      beats: [
        { marker: "60'", label: "Curls it in" },
        { marker: "66'", label: "Squares it for Dembele" },
      ],
    });
  });

  it("never trims narration text to make room for a graphic — the full prose still becomes statement segments", () => {
    const script = `## THE NUMBERS\nThe final shot count says it all.\n[STAT: Total Shots | France 21 | Morocco 4]\n\nAbout as lopsided as this tournament has produced.`;
    const segments = parseAnalysisScript(script);
    const allText = segments.map((s) => s.text).join(" ");
    expect(allText).toContain("The final shot count says it all.");
    expect(allText).toContain(
      "About as lopsided as this tournament has produced.",
    );
  });

  it("drops a tag with no preceding statement to attach to, instead of crashing", () => {
    const script = `## THE NUMBERS\n[STAT: Total Shots | France 21 | Morocco 4]`;
    const segments = parseAnalysisScript(script);
    expect(segments.map((s) => s.type)).toEqual(["chapter"]);
  });

  it("gives a visual-bearing statement the same word-count-driven duration as any other statement", () => {
    const withoutTag = parseAnalysisScript("A short narration line here.");
    const withTag = parseAnalysisScript(
      "A short narration line here.\n[STAT: Total Shots | France 21 | Morocco 4]",
    );
    expect(withTag[0].durationSeconds).toBe(withoutTag[0].durationSeconds);
  });

  it("attaches an inline [BARCHART: ...] tag with any number of bars", () => {
    const script = `Shots broke down across three zones.\n[BARCHART: Shot Zones | Inside Box 14 | Outside Box 5 | Headers 2]`;
    const segments = parseAnalysisScript(script);
    const statement = segments[0];
    if (statement.type !== "statement")
      throw new Error("expected a statement segment");
    expect(statement.visual).toMatchObject({
      kind: "barchart",
      title: "Shot Zones",
      bars: [
        { label: "Inside Box", value: 14 },
        { label: "Outside Box", value: 5 },
        { label: "Headers", value: 2 },
      ],
    });
  });

  it("attaches an inline [ICON: ...] tag with icon key, headline, and caption", () => {
    const script = `Bounou kept Morocco in it.\n[ICON: save | 1 | Penalty save that changed the game]`;
    const segments = parseAnalysisScript(script);
    const statement = segments[0];
    if (statement.type !== "statement")
      throw new Error("expected a statement segment");
    expect(statement.visual).toMatchObject({
      kind: "icon",
      icon: "save",
      headline: "1",
      caption: "Penalty save that changed the game",
    });
  });

  it("attaches an inline [ZONE: ...] tag with a valid zone key", () => {
    const script = `France pinned Morocco back all night.\n[ZONE: attacking | Final Third Pressure | 68% of shots came from here]`;
    const segments = parseAnalysisScript(script);
    const statement = segments[0];
    if (statement.type !== "statement")
      throw new Error("expected a statement segment");
    expect(statement.visual).toMatchObject({
      kind: "zone",
      zone: "attacking",
      label: "Final Third Pressure",
    });
  });

  it("drops an [ICON: ...] tag with an unrecognized icon key instead of crashing", () => {
    const script = `Some narration line.\n[ICON: not-a-real-icon | 1 | Some caption]`;
    const segments = parseAnalysisScript(script);
    const statement = segments[0];
    if (statement.type !== "statement")
      throw new Error("expected a statement segment");
    expect(statement.visual).toBeUndefined();
  });

  it("attaches an inline [SHAPE: ...] tag with any number of segments", () => {
    const script = `Possession told its own story all night.\n[SHAPE: Possession | France 67 | Morocco 33]`;
    const segments = parseAnalysisScript(script);
    const statement = segments[0];
    if (statement.type !== "statement")
      throw new Error("expected a statement segment");
    expect(statement.visual).toMatchObject({
      kind: "shape",
      title: "Possession",
      segments: [
        { label: "France", value: 67 },
        { label: "Morocco", value: 33 },
      ],
    });
  });
});
