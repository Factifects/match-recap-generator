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

export const config = {
  apiFootballKey: () => requireEnv("API_FOOTBALL_KEY"),
  elevenLabsKey: () => requireEnv("ELEVENLABS_API_KEY"),
};
