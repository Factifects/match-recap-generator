import { AnthropicProvider } from "./anthropicProvider";
import { GeminiProvider } from "./geminiProvider";
import { OPENAI_COMPATIBLE_PRESETS, OpenAiCompatibleProvider } from "./openAiCompatibleProvider";
import { LlmFatalError, type LlmProvider } from "./provider";

export type LlmProviderId = "gemini" | "anthropic" | keyof typeof OPENAI_COMPATIBLE_PRESETS;

export const LLM_PROVIDER_IDS: string[] = ["gemini", "anthropic", ...Object.keys(OPENAI_COMPATIBLE_PRESETS)];

/** Resolves which model authors a script.
 *
 * Everything except `anthropic` is a free tier. That ordering is deliberate:
 * correctness comes from the repair loops, not from the model, so the paid
 * option must be an explicit choice for a video that matters and never the
 * thing an unattended queue silently runs on.
 *
 * Most of these route through one OpenAI-compatible implementation. Groq,
 * Cerebras, OpenRouter, Mistral and a local Ollama all speak the same protocol,
 * so supporting the PROTOCOL rather than each vendor means a free tier that
 * changes its terms is survived by editing .env — which, given how often free
 * tiers churn, is the difference between a pipeline that keeps working and one
 * that needs a code change every few months. */
export function selectProvider(id: string | undefined, options: { model?: string } = {}): LlmProvider {
  const resolved = (id ?? process.env.LLM_PROVIDER ?? "gemini").toLowerCase();

  if (resolved === "gemini") return new GeminiProvider({ model: options.model });
  if (resolved === "anthropic") return new AnthropicProvider({ model: options.model });
  if (resolved in OPENAI_COMPATIBLE_PRESETS) {
    return new OpenAiCompatibleProvider(resolved, { model: options.model });
  }

  throw new LlmFatalError(
    `Unknown LLM provider "${resolved}" — expected one of: ${LLM_PROVIDER_IDS.join(", ")}.`,
  );
}

/** Human-readable rundown of every option and how to get a key, for the CLI's
 * usage text and the UI's provider picker. */
export function describeProviders(): string {
  const lines = [
    "  gemini      Google AI Studio — free but only 20 requests/DAY PER MODEL. Key: aistudio.google.com/apikey",
    "  anthropic   Claude — PAID. Key: console.anthropic.com",
  ];
  for (const [id, preset] of Object.entries(OPENAI_COMPATIBLE_PRESETS)) {
    lines.push(`  ${id.padEnd(11)} ${preset.label} — ${preset.notes}`);
  }
  return lines.join("\n");
}

/** Providers that can actually accept images.
 *
 * Not every free tier hosts a multimodal model — Groq, for instance, is fast
 * and has no daily cap but serves text only. Tracked explicitly because the
 * failure is otherwise confusing and late: authoring succeeds for minutes, then
 * the critique pass dies at the end on a provider that was never going to work. */
const VISION_CAPABLE = new Set(["gemini", "anthropic", "openrouter", "mistral"]);

export function isVisionCapable(providerId: string): boolean {
  return VISION_CAPABLE.has(providerId.toLowerCase());
}

/** The provider to use for the critique pass, given whichever one is authoring.
 *
 * Authoring and critique are genuinely different jobs with different
 * requirements, so they are selected independently rather than assumed to be
 * the same model. The intended everyday pairing is Groq for authoring (no daily
 * cap, fast) and Gemini for critique (multimodal) — this makes that automatic
 * instead of something to remember. */
export function selectVisionProvider(authoringProviderId: string, options: { model?: string } = {}): LlmProvider {
  if (isVisionCapable(authoringProviderId)) {
    return selectProvider(authoringProviderId, options);
  }
  const fallback = process.env.VISION_PROVIDER ?? "gemini";
  if (!isVisionCapable(fallback)) {
    throw new LlmFatalError(
      `VISION_PROVIDER="${fallback}" cannot accept images. Use one of: ${[...VISION_CAPABLE].join(", ")}.`,
    );
  }
  return selectProvider(fallback, { model: process.env.VISION_MODEL });
}
