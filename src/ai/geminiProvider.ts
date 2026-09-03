import { LlmFatalError, LlmTransientError, type LlmProvider, type LlmRequest, type LlmResult } from "./provider";

// ---------------------------------------------------------------------------
// Gemini, over plain REST.
//
// No SDK on purpose. This provider exists to be the FREE default — the whole
// point is that someone can author a channel's worth of scripts without an
// Anthropic bill — and the one call shape it needs (`:generateContent` with a
// system instruction and JSON response mime type) is about fifteen lines of
// `fetch`. Adding `@google/genai` to carry that would put a second dependency
// tree in the project for no capability the pipeline actually uses; the
// Anthropic SDK earns its place because it carries prompt caching, typed
// errors and streaming, none of which have an equivalent here.
//
// `GEMINI_API_KEY` is already in `.env` (it was added for a Gemini TTS path
// that was never built — `.env.example` still advertises it), so on most
// machines this provider works with no new configuration at all.
// ---------------------------------------------------------------------------

/** Overridable because model availability on the free tier moves faster than
 * this file will. If the default 404s, set `GEMINI_MODEL` rather than editing
 * here — the error message below says so explicitly. */
const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  };
  error?: { message?: string; status?: string };
}

/** How long to wait before retrying, preferring what the server actually said.
 *
 * Gemini does not send a `retry-after` header on a 429; it states the delay in
 * the error BODY ("Please retry in 47.2s"). Reading only the header meant the
 * generic backoff applied instead — which tops out around 8 seconds and so
 * exhausted every attempt inside a 47-second window, turning an entirely
 * recoverable free-tier rate limit into a hard failure. The free tier is the
 * default path here, so honouring the stated delay is what makes it usable at
 * all rather than a nicety. */
function retryDelayFrom(res: Response, body: string): number | undefined {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return header;
  const stated = body.match(/retry in\s+([\d.]+)\s*s/i);
  if (stated) {
    const seconds = Number(stated[1]);
    // Rounded up and given a small margin: retrying at the exact instant the
    // window opens tends to land just before it.
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds) + 2;
  }
  return undefined;
}

export class GeminiProvider implements LlmProvider {
  readonly id = "gemini";
  readonly model: string;
  private readonly apiKey: string;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new LlmFatalError(
        "GEMINI_API_KEY is not set. Add it to .env (get one free at aistudio.google.com/apikey), or run with --llm anthropic.",
      );
    }
    this.apiKey = apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    // `cacheSystem` is accepted and ignored: Gemini's equivalent is explicit
    // cached-content objects with their own lifecycle and a minimum token
    // floor, which is a poor fit for a prefix that changes per medium. The
    // field stays on the interface because Anthropic honours it — a free run
    // simply pays full price for the schema prefix, which is the tradeoff
    // being free already implies.
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [
        {
          role: "user",
          parts: [
            ...(req.images ?? []).map((image) => ({
              inlineData: { mimeType: image.mediaType, data: image.dataBase64 },
            })),
            { text: req.user },
          ],
        },
      ],
      generationConfig: {
        // JSON mode without a schema. The schema itself rides in the prompt
        // (see provider.ts) — this only guarantees we get parseable JSON back
        // rather than a fenced code block with prose around it.
        responseMimeType: "application/json",
        maxOutputTokens: req.maxOutputTokens ?? 16_000,
        temperature: req.temperature ?? 0.7,
      },
    };

    let res: Response;
    try {
      res = await fetch(`${ENDPOINT}/${this.model}:generateContent?key=${this.apiKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // A thrown fetch is a transport failure (DNS, socket, TLS) — always
      // worth retrying, never a request-shape problem.
      throw new LlmTransientError(`Gemini request failed to send: ${(err as Error).message}`);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // 429 is the free tier's normal operating state, so it must be
      // transient; 5xx is transient by definition. Everything else is a
      // request we should stop re-sending.
      if (res.status === 429 || res.status >= 500) {
        // A daily quota is NOT transient, however much the response looks like
        // it is. Google returns 429 with a `retryDelay` of a few seconds even
        // when the exhausted quota is `GenerateRequestsPerDayPerProjectPerModel`
        // — so retrying burns the whole attempt budget waiting for a window
        // that will not open until tomorrow. The quotaId is the only reliable
        // way to tell the two apart, and it changes the advice completely:
        // per-minute means wait, per-day means switch model or provider.
        if (res.status === 429 && /PerDay/i.test(detail)) {
          throw new LlmFatalError(
            `Gemini daily free-tier quota exhausted for model "${this.model}" (20 requests/day per model). ` +
              `The quota is PER MODEL, so setting GEMINI_MODEL to another one gives a fresh allowance today — ` +
              `or switch to a provider with a larger free tier (LLM_PROVIDER=groq|cerebras|openrouter|ollama).`,
          );
        }
        throw new LlmTransientError(`Gemini ${res.status}: ${detail.slice(0, 300)}`, retryDelayFrom(res, detail));
      }
      if (res.status === 404) {
        // Google retires model names and the 404 body names the replacement
        // ("no longer available to new users... please use models/X"), so it
        // is passed through verbatim rather than swallowed. That message is
        // the fix; a generic "not found" would send someone hunting for it.
        throw new LlmFatalError(
          `Gemini model "${this.model}" is unavailable (404). Set GEMINI_MODEL in .env. Google said: ${detail.slice(0, 400)}`,
        );
      }
      throw new LlmFatalError(`Gemini ${res.status}: ${detail.slice(0, 300)}`);
    }

    const json = (await res.json()) as GeminiResponse;
    if (json.error) throw new LlmFatalError(`Gemini error: ${json.error.message ?? json.error.status}`);

    const candidate = json.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

    // A MAX_TOKENS finish WITH content is the dangerous case, and it has to be
    // caught here rather than downstream: the response is a truncated file that
    // looks like a complete one. Generated code makes this concrete — a
    // component cut off mid-JSX produces a wall of confusing "no corresponding
    // closing tag" errors that a repair round then tries to fix as if they were
    // authoring mistakes, instead of the caller simply asking for more room.
    if (candidate?.finishReason === "MAX_TOKENS" && text.trim()) {
      throw new LlmFatalError(
        `Gemini hit maxOutputTokens mid-response — the output is truncated, not complete. Raise maxOutputTokens for this call (currently produced ${text.length} chars).`,
      );
    }

    if (!text.trim()) {
      // A MAX_TOKENS finish with empty text means the model spent its whole
      // budget and returned nothing usable — retrying the identical request
      // would do it again, so this is fatal and says what to change.
      if (candidate?.finishReason === "MAX_TOKENS") {
        throw new LlmFatalError(
          "Gemini hit maxOutputTokens before emitting any content — the requested scene is too large for the configured budget.",
        );
      }
      throw new LlmTransientError(
        `Gemini returned no content (finishReason: ${candidate?.finishReason ?? "unknown"}).`,
      );
    }

    return {
      text,
      usage: {
        inputTokens: json.usageMetadata?.promptTokenCount,
        outputTokens: json.usageMetadata?.candidatesTokenCount,
        cachedInputTokens: json.usageMetadata?.cachedContentTokenCount,
      },
    };
  }
}
