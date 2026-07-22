import type React from "react";
import type { Visual } from "../model/Segment";
import type { SharedVisualProps } from "./sharedVisualProps";
import { TacticalBoard } from "./compositions/TacticalBoard";
import { VerticalTacticalBoard } from "./compositions/VerticalTacticalBoard";
import { Formation } from "./compositions/Formation";
import { ShotMap } from "./compositions/ShotMap";
import { TacticalBoard3D } from "./compositions/TacticalBoard3D";
import { Formation3D } from "./compositions/Formation3D";
import { ShotMap3D } from "./compositions/ShotMap3D";
import { PassNetworkCard } from "./compositions/PassNetworkCard";
import { HeatMapCard } from "./compositions/HeatMapCard";
import { ZoneMapCard } from "./compositions/ZoneMapCard";
import { GoalSequence } from "./compositions/GoalSequence";
import { AnalysisBoard } from "./compositions/AnalysisBoard";
import { StatBurstCard } from "./compositions/StatBurstCard";
import { BarChartCard } from "./compositions/BarChartCard";
import { DonutChartCard } from "./compositions/DonutChartCard";
import { RadarChart } from "./compositions/RadarChart";
import { SingleStatCard } from "./compositions/SingleStatCard";
import { MomentumTimeline } from "./compositions/MomentumTimeline";
import { LeagueTableCard } from "./compositions/LeagueTableCard";
import { KpiPanelCard } from "./compositions/KpiPanelCard";
import { PlayerComparison } from "./compositions/PlayerComparison";
import { HeroMetricCard } from "./compositions/HeroMetricCard";
import { TreemapCard } from "./compositions/TreemapCard";
import { TierCardsCard } from "./compositions/TierCardsCard";
import { FunnelCard } from "./compositions/FunnelCard";
import { PackedCirclesCard } from "./compositions/PackedCirclesCard";
import { SplitCardsCard } from "./compositions/SplitCardsCard";
import { SequenceCard } from "./compositions/SequenceCard";
import { QuoteCard } from "./compositions/QuoteCard";
import { CodeSnippetCard } from "./compositions/CodeSnippetCard";
import { CareerPathCard } from "./compositions/CareerPathCard";
import { GridCard } from "./compositions/GridCard";
import { IconInfographicCard } from "./compositions/IconInfographicCard";
import { Canvas } from "./compositions/Canvas";

type DataFor<K extends Visual["kind"]> = Extract<Visual, { kind: K }>;

/** kind -> component, the video-layer half of the visual registry (see
 * src/model/visualDefinitions.ts for the node-safe half: schema/category/
 * label/description). AnalysisVideo.tsx renders any visual with one generic
 * lookup into this map instead of a hand-written switch — adding a new
 * visual type means adding one entry here (plus one VisualDefinition, plus
 * the component itself), not editing a growing conditional chain. */
export const VISUAL_COMPONENTS: { [K in Visual["kind"]]: React.FC<{ data: DataFor<K> } & SharedVisualProps> } = {
  "tactical-board": TacticalBoard,
  "vertical-tactical-board": VerticalTacticalBoard,
  formation: Formation,
  "shot-map": ShotMap,
  "tactical-board-3d": TacticalBoard3D,
  "formation-3d": Formation3D,
  "shot-map-3d": ShotMap3D,
  "pass-network": PassNetworkCard,
  "heat-map": HeatMapCard,
  zone: ZoneMapCard,
  "goal-sequence": GoalSequence,
  analysis: AnalysisBoard,
  statburst: StatBurstCard,
  barchart: BarChartCard,
  shape: DonutChartCard,
  radar: RadarChart,
  "single-stat": SingleStatCard,
  "momentum-timeline": MomentumTimeline,
  "league-table": LeagueTableCard,
  "kpi-panel": KpiPanelCard,
  "player-comparison": PlayerComparison,
  "hero-metric": HeroMetricCard,
  treemap: TreemapCard,
  "tier-cards": TierCardsCard,
  funnel: FunnelCard,
  "packed-circles": PackedCirclesCard,
  "split-cards": SplitCardsCard,
  sequence: SequenceCard,
  quote: QuoteCard,
  code: CodeSnippetCard,
  "career-path": CareerPathCard,
  grid: GridCard,
  icon: IconInfographicCard,
  canvas: Canvas,
};
