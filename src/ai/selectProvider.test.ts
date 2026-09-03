import { describe, it, expect, afterEach } from "vitest";
import { isVisionCapable, selectVisionProvider } from "./selectProvider";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("vision provider selection", () => {
  it("knows which free tiers can actually see", () => {
    expect(isVisionCapable("gemini")).toBe(true);
    // Groq is the intended everyday authoring provider precisely because it has
    // no daily cap — but it serves text only, which is the whole reason this
    // split exists.
    expect(isVisionCapable("groq")).toBe(false);
  });

  it("reuses the authoring provider when it can see", () => {
    process.env.GEMINI_API_KEY = "test-key";
    expect(selectVisionProvider("gemini").id).toBe("gemini");
  });

  it("falls back to a vision-capable provider when the author cannot see", () => {
    // The failure this prevents is late and confusing: authoring succeeds for
    // minutes, then critique dies at the very end on a provider that was never
    // going to work.
    process.env.GEMINI_API_KEY = "test-key";
    expect(selectVisionProvider("groq").id).toBe("gemini");
  });

  it("refuses a VISION_PROVIDER that cannot accept images", () => {
    process.env.VISION_PROVIDER = "groq";
    expect(() => selectVisionProvider("groq")).toThrow(/cannot accept images/);
  });
});
