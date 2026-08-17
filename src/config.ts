import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

/** Explicit operator override for render concurrency (headless-Chrome worker
 * count). Unset by default — `renderVideo.ts`'s own RAM-tiered heuristic
 * decides when this is absent. Parsed once here rather than at every call
 * site so an invalid value (non-numeric, zero, negative) is caught with one
 * clear message instead of silently misbehaving wherever it's read. */
function renderConcurrencyOverride(): number | undefined {
  const raw = process.env.RENDER_CONCURRENCY;
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`Invalid RENDER_CONCURRENCY="${raw}" — must be a positive integer, or unset to let the RAM-tiered default decide.`);
  }
  return n;
}

export const config = {
  apiFootballKey: () => requireEnv("API_FOOTBALL_KEY"),
  elevenLabsKey: () => requireEnv("ELEVENLABS_API_KEY"),
  renderConcurrency: renderConcurrencyOverride,
};
