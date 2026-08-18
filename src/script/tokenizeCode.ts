// Syntax highlighting for the Stage medium's code panes.
//
// Deliberately a small hand-rolled lexer rather than a highlighting library:
// what actually appears in a 60-second Short is six lines of JS/TS, SQL, JSON
// or a shell command, and every real library brings a bundle, a theme system
// and a language registry to solve a much larger problem than this one. The
// failure mode to avoid is the opposite of under-engineering — a scene where
// the highlighter is the most complex thing on screen.
//
// It is also NOT the point of the code pane. Line-level highlight (brighten the
// line the narrator is on, dim the rest) is what narration can actually drive
// and what teaches; per-token colour is legibility polish on top of that.

export type CodeToken = "keyword" | "string" | "number" | "comment" | "function" | "property" | "punctuation" | "plain";

export interface TokenSpan {
  text: string;
  token: CodeToken;
}

/** Union of the keywords that actually turn up in this project's snippets —
 * JS/TS, SQL and shell — matched case-insensitively for SQL's sake. Kept as one
 * flat set rather than per-language modes because a Short never mixes enough
 * languages for the ambiguity to matter, and asking an author to declare a
 * language is friction that buys nothing at six lines. */
const KEYWORDS = new Set(
  [
    // JS / TS
    "const","let","var","function","return","await","async","if","else","for","while","try","catch","finally","throw","new","class","extends","import","from","export","default","typeof","instanceof","this","null","undefined","true","false","interface","type","enum","public","private","readonly","implements","yield","break","continue","switch","case","delete","in","of","as","void",
    // SQL
    "select","insert","update","delete","from","where","join","left","right","inner","outer","on","group","by","order","having","limit","offset","values","into","set","and","or","not","null","create","table","index","primary","key","foreign","references","distinct","count","sum","avg","max","min","as","asc","desc","union","begin","commit","rollback","transaction",
    // shell
    "curl","echo","cd","sudo","npm","npx","git","docker","kubectl",
  ].map((k) => k.toLowerCase()),
);

const IDENT = /[A-Za-z_$][A-Za-z0-9_$]*/y;
const NUMBER = /\d[\d_.]*/y;
const WHITESPACE = /\s+/y;

/** Splits one line into coloured spans. Never throws and never drops
 * characters: concatenating every span's `text` always reproduces the input
 * line exactly, which is what keeps the rendered pane faithful to the source
 * the author wrote. */
export function tokenizeLine(line: string): TokenSpan[] {
  const spans: TokenSpan[] = [];
  let i = 0;

  const push = (text: string, token: CodeToken) => {
    if (!text) return;
    const last = spans[spans.length - 1];
    if (last && last.token === token) last.text += text;
    else spans.push({ text, token });
  };

  // A comment swallows the rest of the line, so it is checked first.
  const commentAt = findComment(line);
  const body = commentAt === -1 ? line : line.slice(0, commentAt);
  const comment = commentAt === -1 ? "" : line.slice(commentAt);

  while (i < body.length) {
    const ch = body[i];

    // Strings, including the unterminated ones a truncated snippet produces.
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < body.length && body[j] !== ch) {
        if (body[j] === "\\") j++;
        j++;
      }
      push(body.slice(i, Math.min(j + 1, body.length)), "string");
      i = j + 1;
      continue;
    }

    WHITESPACE.lastIndex = i;
    const ws = WHITESPACE.exec(body);
    if (ws) {
      push(ws[0], "plain");
      i = WHITESPACE.lastIndex;
      continue;
    }

    NUMBER.lastIndex = i;
    const num = NUMBER.exec(body);
    if (num && /\d/.test(ch)) {
      push(num[0], "number");
      i = NUMBER.lastIndex;
      continue;
    }

    IDENT.lastIndex = i;
    const ident = IDENT.exec(body);
    if (ident) {
      const word = ident[0];
      const next = body.slice(IDENT.lastIndex).match(/^\s*\(/);
      const prev = body.slice(0, i).match(/\.\s*$/);
      if (KEYWORDS.has(word.toLowerCase())) push(word, "keyword");
      else if (next) push(word, "function");
      else if (prev) push(word, "property");
      else push(word, "plain");
      i = IDENT.lastIndex;
      continue;
    }

    push(ch, /[{}()[\].,;:=><+\-*/%!&|?]/.test(ch) ? "punctuation" : "plain");
    i++;
  }

  if (comment) push(comment, "comment");
  return spans;
}

/** Index where a line comment starts, ignoring one that appears inside a
 * string — `curl "http://x"` must not be treated as `//`-commented from the
 * scheme onward, which is exactly what a naive indexOf does. */
function findComment(line: string): number {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "/" && line[i + 1] === "/") return i;
    if (ch === "-" && line[i + 1] === "-") return i;
    if (ch === "#") return i;
  }
  return -1;
}

/** Palette. Cyan/amber/green/violet on near-black — the Techijest identity,
 * not a generic editor theme, so a code pane belongs to the same world as the
 * diagram beside it. */
export const CODE_COLORS: Record<CodeToken, string> = {
  keyword: "#c792ea",
  string: "#c3e88d",
  number: "#f78c6c",
  comment: "#5c6b85",
  function: "#82aaff",
  property: "#7fdbca",
  punctuation: "#89ddff",
  plain: "#d6deeb",
};
