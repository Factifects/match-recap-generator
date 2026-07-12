/**
 * Lists Premier League fixtures in a date range, so you have something to point
 * testApiFetch.ts / cli.ts at without hunting through the dashboard UI.
 *
 * Note: the free API-Football plan does NOT support the `last` parameter or
 * current-season data (confirmed live: "Free plans do not have access to this
 * season, try from 2022 to 2024" / "Free plans do not have access to the Last
 * parameter"). This uses an explicit date range instead, which the free plan does
 * support.
 *
 * Usage: npx tsx scripts/findFixtures.ts [fromDate] [toDate]
 * Example: npx tsx scripts/findFixtures.ts 2025-05-18 2025-05-25
 */
import { apiFootballGet } from "../src/data/apiFootballClient";
import type { ApiFootballFixture } from "../src/data/types/apiFootball";

const PREMIER_LEAGUE_ID = 39;

async function main() {
  const from = process.argv[2] || "2025-05-18";
  const to = process.argv[3] || "2025-05-25";

  console.log(`Fetching Premier League fixtures between ${from} and ${to}...\n`);

  const fixtures = await apiFootballGet<ApiFootballFixture>("/fixtures", {
    league: PREMIER_LEAGUE_ID,
    season: 2024,
    from,
    to,
  });

  if (fixtures.length === 0) {
    console.log("No fixtures returned for that date range. Try a different range within 2022-2024.");
    return;
  }

  for (const f of fixtures) {
    const date = new Date(f.fixture.date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    console.log(
      `id=${f.fixture.id}  ${date}  ${f.teams.home.name} ${f.goals.home ?? "-"} - ${f.goals.away ?? "-"} ${f.teams.away.name}  [${f.fixture.status.short}]`,
    );
  }

  console.log(
    "\nPick an id from a FINISHED match (status FT) for the most complete data, then run:\nnpx tsx scripts/testApiFetch.ts <id>",
  );
}

main().catch((err) => {
  console.error("findFixtures failed:", err);
  process.exit(1);
});
