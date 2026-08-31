import type { TimedSegment, Visual } from "../model/Segment";
import { buildPanes, assemblyAttempt, agree, affectedBy, sharedRefs, type Pane } from "./holdingsLayout";
import { diagnostic, type SceneDiagnostic } from "./sceneDiagnostics";

// Advisory checks for the `holdings` medium.
//
// WHY THIS FILE EXISTS
//
// The medium's whole discipline is that a script may ask for a statistic but
// never assert one — every number on screen is computed from the generated
// population. That protects the numbers, and it creates a NEW way to be wrong
// that no other medium has: the narration can claim something the population
// does not actually show.
//
// It happened on the first pass of the clock-sync proof. The script pushed 40
// machines into the assembly and the narration said the picture would be left
// with holes; at 40 machines that seed's population covers everything, so the
// beat would have played with zero holes drawn and a readout saying "0 PIECES
// NOBODY HAS" underneath a narrator saying the opposite. The medium was working
// exactly as designed — it refused to fake the claim — and the script was
// simply wrong.
//
// A render caught it. That is not good enough on its own (see CLAUDE.md), so
// the class of fault is checked here instead: whenever a scene asks for a fact
// about its population, the fact is computed at authoring time and the author
// is told what the frame will actually say.
//
// Every finding here is ADVISORY. Nothing in this file may block a render — an
// author is allowed to know better than the checker, and the standing rule for
// this project is that diagnostics report and the author looks at frames.

type HoldingsVisual = Extract<Visual, { kind: "holdings" }>;
type HoldingsAction = NonNullable<HoldingsVisual["timeline"]>[number];

/** How many panes exist at `atSeconds`, by replaying just the `panes` actions —
 * the same accumulation the renderer performs, so a check can never disagree
 * with the frame it is predicting. */
function paneCountAt(timeline: readonly HoldingsAction[], atSeconds: number): number {
  let count = 1;
  for (const action of timeline) {
    if (action.type !== "panes") continue;
    if (action.startSeconds + (action.durationSeconds ?? 2) <= atSeconds) count = action.count;
    else if (action.startSeconds <= atSeconds) count = action.count;
  }
  return Math.max(1, count);
}

export function diagnoseHoldingsScenes(segments: readonly TimedSegment[]): SceneDiagnostic[] {
  const found: SceneDiagnostic[] = [];

  segments.forEach((segment, index) => {
    const visual = (segment as { visual?: Visual }).visual;
    if (!visual || visual.kind !== "holdings") return;
    const timeline = visual.timeline ?? [];
    if (timeline.length === 0) return;
    const seed = visual.seed ?? 1;

    const populationAt = (atSeconds: number): Pane[] => buildPanes(paneCountAt(timeline, atSeconds), seed);

    for (const action of timeline) {
      switch (action.type) {
        case "assemble": {
          const panes = populationAt(action.startSeconds);
          const report = assemblyAttempt(panes);
          if (report.gaps.length === 0 && report.conflicts.length === 0) {
            found.push(
              diagnostic(
                index,
                3,
                "soft",
                "holdings-assembly-succeeds",
                `the assembly beat runs on ${panes.length} ${visual.subject ?? "device"}s, whose holdings cover everything and contradict nothing — the picture will simply COMPLETE, which is the opposite of the point. Use fewer, or a different seed.`,
              ),
            );
          } else if (report.gaps.length === 0) {
            found.push(
              diagnostic(
                index,
                2,
                "soft",
                "holdings-no-gaps",
                `the assembly beat runs on ${panes.length} ${visual.subject ?? "device"}s, which between them cover the whole world — there will be no holes on screen, only ${report.conflicts.length} contradictions. If the narration promises holes, lower the count (this population has holes below about ${Math.max(1, Math.round(panes.length * 0.75))}).`,
              ),
            );
          }
          break;
        }
        case "readout": {
          if (action.show !== "gaps" && action.show !== "conflicts") break;
          const report = assemblyAttempt(populationAt(action.startSeconds));
          const value = action.show === "gaps" ? report.gaps.length : report.conflicts.length;
          if (value === 0) {
            found.push(
              diagnostic(index, 3, "soft", "holdings-empty-readout", `this scene shows a "${action.show}" readout that will read 0 at that moment — the frame will state the opposite of what a beat about ${action.show} implies.`),
            );
          }
          break;
        }
        case "agree": {
          const panes = populationAt(action.startSeconds);
          const agreement = agree(panes, action.ref, action.rule ?? "median");
          if (agreement.readings.length === 0) {
            found.push(diagnostic(index, 4, "soft", "holdings-agree-empty", `"agree" targets ${action.ref}, which nobody in this population holds — the beat would resolve nothing on an empty screen.`));
          } else if (agreement.readings.length < 3) {
            found.push(
              diagnostic(index, 2, "soft", "holdings-agree-thin", `"agree" targets ${action.ref}, held by only ${agreement.readings.length} ${visual.subject ?? "device"}(s) — too few for "many partial views become one" to read as many.`),
            );
          }
          break;
        }
        case "compare": {
          const panes = populationAt(action.startSeconds);
          const [a, b] = action.panes;
          if (!panes[a] || !panes[b]) {
            found.push(diagnostic(index, 3, "soft", "holdings-compare-missing", `"compare" names ${visual.subject ?? "device"}s ${a} and ${b}, but only ${panes.length} exist at that moment.`));
            break;
          }
          const shared = sharedRefs(panes[a], panes[b]);
          if (shared.length === 0) {
            // Caught by a render: the clock proof compared two machines with no
            // peer in common while the narration said they shared one or two.
            found.push(
              diagnostic(
                index,
                3,
                "soft",
                "holdings-compare-disjoint",
                `"compare" pairs ${a} and ${b}, which hold nothing in common — nothing will be marked, so a beat about partial OVERLAP will show two unrelated cards.`,
              ),
            );
          } else if (shared.length === Math.min(panes[a].records.length, panes[b].records.length)) {
            found.push(
              diagnostic(index, 2, "soft", "holdings-compare-subset", `"compare" pairs ${a} and ${b}, where one holds everything the other does — that reads as agreement, not as partial overlap.`),
            );
          }
          break;
        }
        case "change": {
          const panes = populationAt(action.startSeconds);
          const { paneIds, fraction } = affectedBy(panes, action.ref);
          if (paneIds.length === 0) {
            found.push(diagnostic(index, 4, "soft", "holdings-change-empty", `"change" targets ${action.ref}, which nobody holds — nothing will light up and the locality beat will play on a wall of dimmed panes.`));
          } else if (fraction > 0.5) {
            found.push(
              diagnostic(index, 3, "soft", "holdings-change-global", `"change" targets ${action.ref}, held by ${Math.round(fraction * 100)}% of the population — a beat about a change being LOCAL will show most of the screen lighting up.`),
            );
          }
          break;
        }
        default:
          break;
      }
    }
  });

  return found;
}
