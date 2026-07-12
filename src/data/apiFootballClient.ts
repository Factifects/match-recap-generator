import { config } from "../config";
import type { ApiFootballResponse } from "./types/apiFootball";

// Direct API-Sports access (dashboard.api-football.com), not via RapidAPI —
// simpler signup, same free tier (100 req/day). Header/URL per api-sports.io docs;
// scripts/testApiFetch.ts is the live check that confirms this is actually correct.
const BASE_URL = "https://v3.football.api-sports.io";

export async function apiFootballGet<T>(
  path: string,
  params: Record<string, string | number>,
): Promise<T[]> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": config.apiFootballKey(),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API-Football request failed: ${response.status} ${response.statusText}\n${body}`);
  }

  const json = (await response.json()) as ApiFootballResponse<T>;

  const hasErrors =
    json.errors !== undefined &&
    json.errors !== null &&
    !(Array.isArray(json.errors) && json.errors.length === 0) &&
    !(typeof json.errors === "object" && Object.keys(json.errors).length === 0);

  if (hasErrors) {
    throw new Error(`API-Football returned an error for ${path}: ${JSON.stringify(json.errors)}`);
  }

  if (!Array.isArray(json.response)) {
    throw new Error(`Unexpected API-Football response shape for ${path}: ${JSON.stringify(json).slice(0, 500)}`);
  }

  return json.response;
}
