import { describe, expect, it } from "vitest";
import { estimateDurationSeconds } from "./estimateDuration";

describe("estimateDurationSeconds", () => {
  it("scales roughly linearly with word count", () => {
    const short = estimateDurationSeconds("One two three four five.", "statement");
    const long = estimateDurationSeconds("One two three four five six seven eight nine ten.", "statement");
    expect(long).toBeGreaterThan(short);
  });

  it("never returns below the statement floor even for very short text", () => {
    expect(estimateDurationSeconds("Hi.", "statement")).toBeGreaterThanOrEqual(1.5);
  });

  it("gives chapters a higher minimum than statements", () => {
    expect(estimateDurationSeconds("Hi.", "chapter")).toBeGreaterThan(
      estimateDurationSeconds("Hi.", "statement"),
    );
  });
});
