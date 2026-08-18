import { describe, expect, it } from "vitest";
import { tokenizeLine } from "./tokenizeCode";

const joined = (line: string) => tokenizeLine(line).map((s) => s.text).join("");

describe("tokenizeLine", () => {
  it("never drops or alters a character", () => {
    for (const line of [
      "const key = uuid();",
      "  'Idempotency-Key': key",
      "SELECT * FROM users WHERE id = 42;",
      "curl -X POST https://api.dev/charge // send it",
      "",
      "   ",
      "await pay({ amount: 4200 })",
    ]) {
      expect(joined(line)).toBe(line);
    }
  });

  it("marks keywords, strings and numbers", () => {
    const spans = tokenizeLine("const n = 42;");
    expect(spans.find((s) => s.text === "const")?.token).toBe("keyword");
    expect(spans.find((s) => s.text === "42")?.token).toBe("number");
    const str = tokenizeLine("const s = 'hi';");
    expect(str.find((s) => s.text === "'hi'")?.token).toBe("string");
  });

  it("treats SQL keywords case-insensitively", () => {
    const spans = tokenizeLine("SELECT * FROM users");
    expect(spans.find((s) => s.text === "SELECT")?.token).toBe("keyword");
    expect(spans.find((s) => s.text === "FROM")?.token).toBe("keyword");
  });

  it("marks a call as a function and a dotted access as a property", () => {
    expect(tokenizeLine("database.query(sql)").find((s) => s.text === "query")?.token).toBe("function");
    expect(tokenizeLine("req.user").find((s) => s.text === "user")?.token).toBe("property");
  });

  it("does not treat a URL's slashes inside a string as a comment", () => {
    const spans = tokenizeLine('fetch("https://api.dev/users")');
    expect(spans.some((s) => s.token === "comment")).toBe(false);
    expect(joined('fetch("https://api.dev/users")')).toBe('fetch("https://api.dev/users")');
  });

  it("handles // -- and # comments", () => {
    expect(tokenizeLine("x = 1 // note").find((s) => s.token === "comment")?.text).toBe("// note");
    expect(tokenizeLine("SELECT 1 -- note").find((s) => s.token === "comment")?.text).toBe("-- note");
    expect(tokenizeLine("echo hi # note").find((s) => s.token === "comment")?.text).toBe("# note");
  });

  it("survives an unterminated string rather than throwing", () => {
    expect(joined("const s = 'oops")).toBe("const s = 'oops");
  });
});
