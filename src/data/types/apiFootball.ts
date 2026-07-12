/**
 * Raw response shapes for the API-Football endpoints we use, based on their
 * documented schema. NOT yet verified against a real payload — that's what
 * scripts/testApiFetch.ts is for. If the real response differs, only this file
 * and transform.ts should need to change (MatchRecapData is the isolation layer).
 */

export interface ApiFootballResponse<T> {
  response: T[];
  errors?: unknown;
  results?: number;
}

export interface ApiFootballFixture {
  fixture: {
    id: number;
    date: string;
    venue: { name: string | null; city: string | null };
    status: { long: string; short: string };
  };
  league: {
    id: number;
    name: string;
    country: string;
    season: number;
    round: string;
  };
  teams: {
    home: { id: number; name: string; winner: boolean | null };
    away: { id: number; name: string; winner: boolean | null };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
}

export type ApiFootballEventType = "Goal" | "Card" | "subst" | "Var";

export interface ApiFootballEvent {
  time: { elapsed: number; extra: number | null };
  team: { id: number; name: string };
  player: { id: number | null; name: string | null };
  assist: { id: number | null; name: string | null };
  type: ApiFootballEventType;
  detail: string;
  comments: string | null;
}

export interface ApiFootballStatisticEntry {
  type: string;
  value: string | number | null;
}

export interface ApiFootballTeamStatistics {
  team: { id: number; name: string };
  statistics: ApiFootballStatisticEntry[];
}
