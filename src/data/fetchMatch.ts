import { apiFootballGet } from "./apiFootballClient";
import type {
  ApiFootballEvent,
  ApiFootballFixture,
  ApiFootballTeamStatistics,
} from "./types/apiFootball";

export interface RawMatchData {
  fixture: ApiFootballFixture;
  events: ApiFootballEvent[];
  statistics: ApiFootballTeamStatistics[];
}

export async function fetchMatch(fixtureId: number): Promise<RawMatchData> {
  const [fixtures, events, statistics] = await Promise.all([
    apiFootballGet<ApiFootballFixture>("/fixtures", { id: fixtureId }),
    apiFootballGet<ApiFootballEvent>("/fixtures/events", { fixture: fixtureId }),
    apiFootballGet<ApiFootballTeamStatistics>("/fixtures/statistics", { fixture: fixtureId }),
  ]);

  const fixture = fixtures[0];
  if (!fixture) {
    throw new Error(`No fixture found for id ${fixtureId}`);
  }

  return { fixture, events, statistics };
}
