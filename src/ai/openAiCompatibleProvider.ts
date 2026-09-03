import { LlmFatalError, LlmTransientError, type LlmProvider, type LlmRequest, type LlmResult } from "./provider";

// ---------------------------------------------------------------------------
// One provider for every OpenAI-compatible endpoint.
//
// Groq, Cerebras, OpenRouter, Mistral, Together, GitHub Models and a local
// Ollama all expose the same `/chat/completions` shape, so implementing the
// PROTOCOL rather than a vendor unlocks all of them at once — and makes moving
// between them a config change rather than a code change. That matters more
// than usual here: the pipeline is designed to run on free tiers, and free
// tiers change terms, rename models and disappear.
//
// Raw fetch, no SDK — same reasoning as geminiProvider.ts. The one call shape
// this needs is a dozen lines, and the `openai` package would pull in a
// dependency tree for nothing the pipeline actually uses.
// ---------------------------------------------------------------------------

export interface OpenAiCompatiblePreset {
  label: string;
  baseUrl: string;
  /** Env var holding the key. Ollama needs none — it runs locally. */
  apiKeyEnv?: string;
  defaultModel: string;
  /** Hard ceiling on `max_tokens` for this endpoint.
   *
   * Free tiers meter TOTAL tokens per minute and count the requested output
   * against that budget, so an oversized `max_tokens` is rejected outright with
   * a 413 no matter how long you wait — it is a request-shape error, not a rate
   * limit. Groq's free tier is 8000 TPM, and a repair round has to fit the
   * system prompt, the previous source AND the new output inside it. */
  maxOutputTokens?: number;
  /** Total per-request token ceiling (input + requested output). See
   * LlmProvider.promptBudgetTokens for why this has to be known up front. */
  promptBudgetTokens?: number;
  notes: string;
}

/** Known free-tier endpoints. Model names are defaults, not promises — every
 * one of these vendors renames models, so each is overridable via LLM_MODEL and
 * a 404 surfaces the provider's own message saying what to use instead. */
export const OPENAI_COMPATIBLE_PRESETS: Record<string, OpenAiCompatiblePreset> = {
  groq: {
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY",
    // Verified against the live /models list 2026-09-01. Groq hosts no vision
    // model, so a critique pass must use a multimodal provider (gemini) even
    // when authoring runs here — the two are selected independently per call.
    defaultModel: "openai/gpt-oss-120b",
    // 8000 TPM free tier, shared by input and output. Budgeted as: ~1600
    // system + ~300 brief + ~1500 previous source on a repair round + this =
    // ~7900, just inside the ceiling. Note gpt-oss models are reasoning
    // models whose thinking tokens also count against max_tokens, which is why
    // this needs to be well above the size of the file itself.
    maxOutputTokens: 4500,
    // 8000 TPM covers input AND requested output together.
    promptBudgetTokens: 8000,
    notes: "Free tier, very fast, text-only (no vision). Get a key at console.groq.com/keys.",
  },
  cerebras: {
    label: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    apiKeyEnv: "CEREBRAS_API_KEY",
    defaultModel: "qwen-3-coder-480b",
    notes: "Free tier, fastest inference available; strong coding models. Key at cloud.cerebras.ai.",
  },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    defaultModel: "deepseek/deepseek-chat-v3.1:free",
    notes: "Aggregator with genuinely free models (`:free` suffix). Key at openrouter.ai/keys.",
  },
  mistral: {
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    apiKeyEnv: "MISTRAL_API_KEY",
    defaultModel: "mistral-large-latest",
    notes: "Free tier on La Plateforme. Key at console.mistral.ai.",
  },
  ollama: {
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "qwen2.5-coder:14b",
    notes: "Fully local, no key, no quota, no network. Needs RAM — see the render concurrency notes.",
  },
};

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id: string;
  readonly model: string;
  readonly promptBudgetTokens: number | undefined;
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly outputCap: number | undefined;

  constructor(presetId: string, options: { model?: string; baseUrl?: string; apiKey?: string } = {}) {
    const preset = OPENAI_COMPATIBLE_PRESETS[presetId];
    if (!preset) {
      throw new LlmFatalError(
        `Unknown provider "${presetId}" — expected one of: ${Object.keys(OPENAI_COMPATIBLE_PRESETS).join(", ")}.`,
      );
    }
    this.id = presetId;
    this.baseUrl = options.baseUrl ?? preset.baseUrl;
    this.model = options.model ?? process.env.LLM_MODEL ?? preset.defaultModel;
    this.apiKey = options.apiKey ?? (preset.apiKeyEnv ? process.env[preset.apiKeyEnv] : undefined);
    this.outputCap = preset.maxOutputTokens;
    this.promptBudgetTokens = preset.promptBudgetTokens;

    if (preset.apiKeyEnv && !this.apiKey) {
      throw new LlmFatalError(`${preset.apiKeyEnv} is not set. ${preset.notes}`);
    }
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    // `cacheSystem` is accepted and ignored: none of these endpoints expose an
    // explicit cache-control breakpoint. The field stays on the interface
    // because Anthropic honours it, and paying full price for the schema prefix
    // is a tradeoff being free already implies.
    const body = {
      model: this.model,
      messages: [
        { role: "system", content: req.system },
        {
          role: "user",
          // Plain string when there are no images: some OpenAI-compatible
          // endpoints (notably smaller self-hosted ones) reject the array form
          // outright, so the richer shape is used only when it is needed.
          content: req.images?.length
            ? [
                ...req.images.map((image) => ({
                  type: "image_url" as const,
                  image_url: { url: `data:${image.mediaType};base64,${image.dataBase64}` },
                })),
                { type: "text" as const, text: req.user },
              ]
            : req.user,
        },
      ],
      // Clamped rather than passed through: a caller asking for more than the
      // tier allows gets a 413 that no retry can clear, so the ceiling is
      // enforced here where it is known. Truncation stays detectable via
      // finish_reason below, so clamping degrades output length rather than
      // silently corrupting it.
      max_tokens: Math.min(req.maxOutputTokens ?? 16_000, this.outputCap ?? Number.MAX_SAFE_INTEGER),
      temperature: req.temperature ?? 0.7,
    };

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new LlmTransientError(`${this.id} request failed to send: ${(err as Error).message}`);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (res.status === 429 || res.status >= 500) {
        throw new LlmTransientError(`${this.id} ${res.status}: ${detail.slice(0, 300)}`, retryDelayFrom(res, detail));
      }
      if (res.status === 404 || res.status === 400) {
        // Model names churn constantly across these vendors, so the endpoint's
        // own message (which usually names valid models) is forwarded intact
        // rather than replaced with a generic error.
        throw new LlmFatalError(
          `${this.id} rejected model "${this.model}" (${res.status}). Set LLM_MODEL to a current one. It said: ${detail.slice(0, 400)}`,
        );
      }
      if (res.status === 413) {
        throw new LlmFatalError(
          `${this.id} rejected the request as too large (413) — free tiers count requested output against a per-minute token budget, so this cannot be fixed by retrying. ` +
            `Lower maxOutputTokens for this call or raise the preset's cap. It said: ${detail.slice(0, 300)}`,
        );
      }
      if (res.status === 401 || res.status === 403) {
        throw new LlmFatalError(`${this.id} rejected the credentials (${res.status}). Check the API key in .env.`);
      }
      throw new LlmFatalError(`${this.id} ${res.status}: ${detail.slice(0, 300)}`);
    }

    const json = (await res.json()) as ChatCompletionResponse;
    if (json.error) throw new LlmFatalError(`${this.id} error: ${json.error.message}`);

    const choice = json.choices?.[0];
    const text = choice?.message?.content ?? "";

    // Same trap as Gemini: a length-capped finish WITH content is a truncated
    // response masquerading as a complete one, which for generated code shows
    // up as a cascade of syntax errors rather than "ran out of room".
    if (choice?.finish_reason === "length" && text.trim()) {
      throw new LlmFatalError(
        `${this.id} hit max_tokens mid-response — the output is truncated, not complete. Raise maxOutputTokens (produced ${text.length} chars).`,
      );
    }
    if (!text.trim()) {
      throw new LlmTransientError(`${this.id} returned no content (finish_reason: ${choice?.finish_reason ?? "unknown"}).`);
    }

    return {
      text,
      usage: { inputTokens: json.usage?.prompt_tokens, outputTokens: json.usage?.completion_tokens },
    };
  }
}

/** Prefers the server's own stated delay over generic backoff — see the same
 * helper in geminiProvider.ts for why this matters on a free tier. */
function retryDelayFrom(res: Response, body: string): number | undefined {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return header;
  const stated = body.match(/(?:retry in|try again in)\s+([\d.]+)\s*(m?s|seconds?)/i);
  if (stated) {
    const value = Number(stated[1]);
    const seconds = stated[2].toLowerCase() === "ms" ? value / 1000 : value;
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds) + 2;
  }
  return undefined;
}
