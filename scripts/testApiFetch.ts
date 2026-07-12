/**
 * Standalone live-data sanity check. Run this against one real fixture ID BEFORE
 * trusting the transform/render pipeline — confirms the free API-Football tier
 * actually returns populated events + statistics (+ xG if available) for the
 * current season, which was an open confidence flag in the build plan.
 *
 * Usage: npx tsx scripts/testApiFetch.ts <fixtureId>
 */
import { fetchMatch } from "../src/data/fetchMatch";

async function main() {
  const fixtureId = Number(process.argv[2]);
  if (!fixtureId) {
    console.error("Usage: npx tsx scripts/testApiFetch.ts <fixtureId>");
    process.exit(1);
  }

  console.log(`Fetching raw data for fixture ${fixtureId}...\n`);
  const raw = await fetchMatch(fixtureId);

  console.log("--- Fixture ---");
  console.log(
    `${raw.fixture.teams.home.name} ${raw.fixture.goals.home} - ${raw.fixture.goals.away} ${raw.fixture.teams.away.name}`,
  );
  console.log(`${raw.fixture.league.name}, ${raw.fixture.fixture.date}`);
  console.log(`Status: ${raw.fixture.fixture.status.long}`);

  console.log(`\n--- Events (${raw.events.length}) ---`);
  if (raw.events.length === 0) {
    console.warn("WARNING: no events returned. Free-tier event data may be gated for this fixture/season.");
  }
  for (const e of raw.events.slice(0, 10)) {
    console.log(`${e.time.elapsed}' [${e.type}/${e.detail}] ${e.team.name} - ${e.player.name ?? "?"}`);
  }
  if (raw.events.length > 10) console.log(`...and ${raw.events.length - 10} more`);

  console.log(`\n--- Statistics (${raw.statistics.length} team entries) ---`);
  if (raw.statistics.length === 0) {
    console.warn("WARNING: no statistics returned. Free-tier stats may be gated for this fixture/season.");
  }
  for (const teamStats of raw.statistics) {
    console.log(`${teamStats.team.name}:`);
    for (const stat of teamStats.statistics) {
      console.log(`  ${stat.type}: ${stat.value}`);
    }
  }

  console.log(
    "\nIf events/statistics above look populated and correct, this fixture is usable for the (not-yet-built) match-data automation pathway.",
  );
}

main().catch((err) => {
  console.error("testApiFetch failed:", err);
  process.exit(1);
});
