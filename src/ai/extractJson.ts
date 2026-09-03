/** Pulls a JSON value out of a model response.
 *
 * Both providers are asked for bare JSON and both usually comply, but "usually"
 * is not a contract you can build a pipeline on: a model that has just been
 * shown 28KB of JSON Schema will occasionally wrap its answer in a ```json
 * fence, or open with a sentence of explanation. Every one of those is a
 * recoverable formatting slip around correct content, and burning a repair
 * round on it would be pure waste — so they are handled here, once, rather
 * than being allowed to look like a schema failure to the caller.
 *
 * Returns `undefined` rather than throwing: the caller validates with Zod and
 * produces a far better error than this function could. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  const attempt = (candidate: string): unknown => {
    try {
      return JSON.parse(candidate);
    } catch {
      return undefined;
    }
  };

  const direct = attempt(trimmed);
  if (direct !== undefined) return direct;

  // A fenced block, with or without a language tag.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    const inner = attempt(fenced[1].trim());
    if (inner !== undefined) return inner;
  }

  // Last resort: the widest brace- or bracket-delimited span. Scanning from
  // the first opener to the last closer (rather than matching depth) is
  // deliberate — the failure being recovered from is prose wrapped AROUND
  // valid JSON, so the outermost span is the payload.
  for (const [open, close] of [
    ["{", "}"],
    ["[", "]"],
  ] as const) {
    const start = trimmed.indexOf(open);
    const end = trimmed.lastIndexOf(close);
    if (start !== -1 && end > start) {
      const span = attempt(trimmed.slice(start, end + 1));
      if (span !== undefined) return span;
    }
  }

  return undefined;
}
