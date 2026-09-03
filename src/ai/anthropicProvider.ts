import Anthropic from "@anthropic-ai/sdk";
import { LlmFatalError, LlmTransientError, type LlmProvider, type LlmRequest, type LlmResult } from "./provider";

// ---------------------------------------------------------------------------
// Anthropic, via the official SDK.
//
// The escalation path, not the default — reached with `--llm anthropic` when a
// script matters enough to pay for. It earns the extra dependency over a raw
// fetch on one feature in particular: prompt caching. Authoring a 12-scene
// script re-sends the same medium schema (28KB of JSON Schema for `stage`,
// the flagship Shorts medium) on every scene call plus every repair round, so
// the cached prefix is most of the token spend. Caching it turns the dominant
// cost into roughly a tenth of itself.
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

export class AnthropicProvider implements LlmProvider {
  readonly id = "anthropic";
  readonly model: string;
  private readonly client: Anthropic;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    // The zero-arg constructor resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN
    // or an `ant auth login` profile on its own, so an unset env var is NOT
    // proof there are no credentials — let the SDK look before concluding
    // anything, and let its own auth error speak if there really are none.
    this.client = options.apiKey ? new Anthropic({ apiKey: options.apiKey }) : new Anthropic();
    this.model = options.model ?? DEFAULT_MODEL;
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    try {
      // Streamed unconditionally. Scene authoring routinely runs long — a
      // `stage` scene's Data block is a few thousand tokens of dense JSON on
      // its own — and a non-streaming request at this max_tokens is exactly
      // the shape that hits an HTTP timeout and gets retried at full cost.
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: req.maxOutputTokens ?? 32_000,
        // Adaptive thinking: choosing a medium and choreographing beats
        // against narration is genuinely a reasoning task, and this is the
        // half of the pipeline where being wrong costs a render.
        thinking: { type: "adaptive" },
        system: [
          {
            type: "text",
            text: req.system,
            // The breakpoint goes on the system block because that is exactly
            // the boundary between the reusable half (doctrine + schema) and
            // the volatile half (this scene). Caching is a prefix match, so
            // anything volatile above this line would silently defeat it.
            ...(req.cacheSystem ? { cache_control: { type: "ephemeral" as const } } : {}),
          },
        ],
        messages: [
          {
            role: "user",
            content: [
              ...(req.images ?? []).map(
                (image) =>
                  ({
                    type: "image" as const,
                    source: { type: "base64" as const, media_type: image.mediaType, data: image.dataBase64 },
                  }),
              ),
              { type: "text" as const, text: req.user },
            ],
          },
        ],
      });

      const message = await stream.finalMessage();

      if (message.stop_reason === "refusal") {
        throw new LlmFatalError(
          `Anthropic declined the request (${message.stop_details?.category ?? "unspecified"}). This is a content decision, not a transient failure.`,
        );
      }

      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      if (!text.trim()) {
        if (message.stop_reason === "max_tokens") {
          throw new LlmFatalError(
            "Anthropic hit max_tokens before emitting any content — the requested scene is too large for the configured budget.",
          );
        }
        throw new LlmTransientError("Anthropic returned an empty response.");
      }

      return {
        text,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cachedInputTokens: message.usage.cache_read_input_tokens ?? undefined,
        },
      };
    } catch (err) {
      if (err instanceof LlmFatalError || err instanceof LlmTransientError) throw err;
      // Typed SDK exceptions, most specific first — the split that matters is
      // retryable (rate limit, connection, 5xx) versus a request that will
      // never succeed (bad key, bad model, malformed body).
      if (err instanceof Anthropic.RateLimitError) {
        throw new LlmTransientError(`Anthropic rate limited: ${err.message}`);
      }
      if (err instanceof Anthropic.AuthenticationError) {
        throw new LlmFatalError(
          "Anthropic rejected the credentials. Set ANTHROPIC_API_KEY in .env, or run `ant auth login`.",
        );
      }
      if (err instanceof Anthropic.NotFoundError) {
        throw new LlmFatalError(`Anthropic model "${this.model}" was not found. Set ANTHROPIC_MODEL in .env.`);
      }
      if (err instanceof Anthropic.BadRequestError) {
        throw new LlmFatalError(`Anthropic rejected the request: ${err.message}`);
      }
      if (err instanceof Anthropic.APIConnectionError) {
        throw new LlmTransientError(`Anthropic connection failed: ${err.message}`);
      }
      if (err instanceof Anthropic.APIError) {
        const status = err.status ?? 0;
        if (status >= 500) throw new LlmTransientError(`Anthropic ${status}: ${err.message}`);
        throw new LlmFatalError(`Anthropic ${status}: ${err.message}`);
      }
      throw err;
    }
  }
}
