import "dotenv/config";

// ---------------------------------------------------------------------------
// The LLM boundary.
//
// Every model call in the authoring pipeline goes through this one interface,
// for a reason that is architectural rather than tidiness: the authoring loop's
// correctness does NOT come from the model being good. It comes from
// `repairLoop.ts` re-running the project's real validators against whatever the
// model emitted and handing back the failures until they're gone. That means a
// cheap free-tier model and a frontier model differ only in how many repair
// rounds they need — not in whether the output is valid. Keeping the boundary
// this narrow is what makes "run the whole channel on a free model, escalate
// only when a video matters" a config change instead of a rewrite.
//
// Deliberately NOT used here: provider-native structured output (Anthropic's
// `output_config.format`, Gemini's `responseSchema`). Both exist, both are
// good, and both would fork this file into two incompatible code paths —
// Gemini's `responseSchema` accepts a restricted OpenAPI subset that rejects
// the `$ref`/`$defs` output Zod produces for the nested visual schemas, so the
// two providers could not be handed the same schema object. Instead the JSON
// Schema travels in the prompt as text and the response is validated locally
// against the SAME Zod schema the renderer uses. One code path, and the
// validation is strictly stronger than either provider's native mode because
// Zod refinements survive it.
// ---------------------------------------------------------------------------

/** An image handed to the model, base64-encoded. Used by the critique pass to
 * show a model what a scene ACTUALLY rendered — the one question no static
 * check can answer. */
export interface LlmImage {
  mediaType: "image/png" | "image/jpeg";
  dataBase64: string;
}

export interface LlmRequest {
  /** The stable, reusable half of the prompt — role, doctrine, medium schema.
   * Held separate from `user` purely so it can be cached; see `cacheSystem`. */
  system: string;
  /** The volatile half — this scene, this topic, this repair round. */
  user: string;
  /** Marks `system` as worth caching across calls. Authoring a 12-scene script
   * re-sends the same ~30KB medium schema a dozen times, so this is the single
   * largest cost lever in the pipeline; providers that can't cache ignore it. */
  cacheSystem?: boolean;
  /** Images attached to the user turn. A provider that cannot accept images
   * must throw rather than silently drop them: a critique that never saw the
   * frames would confidently review nothing at all, which is worse than an
   * error because it looks like it worked. */
  images?: LlmImage[];
  maxOutputTokens?: number;
  /** Authoring wants variety; repair wants obedience. Repair rounds pass a low
   * value so a retry converges on the fix instead of re-rolling the scene. */
  temperature?: number;
}

export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
  /** Non-zero proves `cacheSystem` actually took effect. Worth surfacing:
   * a silent cache miss is invisible except as a bill. */
  cachedInputTokens?: number;
}

export interface LlmResult {
  text: string;
  usage: LlmUsage;
}

export interface LlmProvider {
  /** Stable identifier for logs and job records — "anthropic" | "gemini". */
  readonly id: string;
  /** Total tokens this provider will accept in one request, input and requested
   * output combined, when that is meaningfully constrained.
   *
   * Exists because a free tier's per-minute ceiling is a REQUEST-SHAPE limit,
   * not a rate limit: Groq's 8000 TPM rejects an oversized prompt with a 413 no
   * matter how long you wait. Callers that assemble large prompts (the scene
   * author sends a medium's full JSON Schema, 7000+ tokens for `stage`) must be
   * able to trim to fit rather than discover the ceiling at send time.
   *
   * Undefined means "no meaningful constraint" — the caller should not trim. */
  readonly promptBudgetTokens?: number;
  /** The concrete model this instance calls, for provenance on a rendered
   * video: "which model wrote scene 4" is a real question once a script is
   * authored unattended. */
  readonly model: string;
  complete(req: LlmRequest): Promise<LlmResult>;
}

/** Thrown for a failure the caller cannot fix by retrying — a bad key, a
 * rejected request shape, an unknown model. Separated from transient failures
 * so `withRetries` doesn't burn its budget re-sending something that will
 * never succeed. */
export class LlmFatalError extends Error {}

/** Thrown when the provider is temporarily unavailable — 429, 5xx, a dropped
 * connection. The free tiers this pipeline is designed around rate-limit
 * aggressively, so this is the expected case, not the exceptional one. */
export class LlmTransientError extends Error {
  constructor(
    message: string,
    /** Honoured verbatim when the provider tells us how long to wait —
     * guessing shorter just wastes another request against the same limit. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

// Five attempts of pure exponential backoff is only ~16 seconds of patience,
// which is less than a single free-tier rate-limit window. Since the provider
// now reports the server's OWN stated delay (see retryDelayFrom in
// geminiProvider.ts), a hinted wait consumes one attempt and actually clears
// the window — so the budget is set by how many genuine failures are worth
// tolerating, not by how long they add up to.
const MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 1_000;

/** Exponential backoff with jitter around a single provider call. Jitter is
 * not decoration here: scenes are authored concurrently, so without it a
 * shared rate limit synchronizes every worker into the same retry instant and
 * they collide again on exactly the request that just failed. */
export async function withRetries<T>(
  operation: () => Promise<T>,
  onLog?: (message: string) => void,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (err instanceof LlmFatalError) throw err;
      if (attempt === MAX_ATTEMPTS) break;
      const hinted = err instanceof LlmTransientError ? err.retryAfterSeconds : undefined;
      // The jitter below is Node-side retry scheduling, never evaluated inside
      // a Remotion render, and it must be genuinely random: a deterministic
      // value would resynchronize every worker onto the same retry instant,
      // which is the exact collision it exists to break up.
      // eslint-disable-next-line @remotion/deterministic-randomness
      const jitterMs = Math.random() * 500;
      const backoffMs =
        hinted !== undefined ? hinted * 1000 : BASE_BACKOFF_MS * 2 ** (attempt - 1) + jitterMs;
      onLog?.(
        `  LLM call failed (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${(backoffMs / 1000).toFixed(1)}s — ${(err as Error).message}`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError;
}

/** Rough token count for prompt budgeting.
 *
 * Deliberately an estimate, not a tokenizer call: this is used to decide how
 * much optional context to include, where being 15% out costs a slightly
 * smaller prompt, and a real tokenizer would mean a network round-trip or a
 * per-provider dependency for a decision that does not need that precision.
 * Four characters per token is the usual English approximation, rounded up so
 * the estimate errs toward trimming rather than overflowing. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
