import type { CameraStage, Visual } from "../model/Segment";
import type { PanelColorKey, Orientation } from "./theme";

/** Every prop a visual component MIGHT need beyond its own Data JSON —
 * presentation metadata that lives on the segment, not the visual, shared
 * across however many of the (eventually hundreds of) visual types actually
 * use each field. A component simply doesn't destructure whichever of these
 * it has no use for (e.g. DonutChartCard ignores `camera`) — safe in React,
 * and it's what keeps AnalysisVideo.tsx's render call fully generic instead
 * of a per-kind prop list. Deliberately its own file, not declared alongside
 * VISUAL_COMPONENTS in visualComponents.tsx — every card component needs to
 * import this type, and visualComponents.tsx itself imports every card
 * component, so declaring it there would be a circular import. */
export interface SharedVisualProps {
  backgroundColor?: PanelColorKey;
  backgroundImage?: string;
  backgroundImageMode?: "faded" | "featured";
  backgroundImageSide?: "left" | "right" | "center";
  orientation: Orientation;
  camera?: CameraStage[];
  durationInFrames?: number;
  iconImage?: string;
  jerseyImages?: Partial<Record<"home" | "away", string>>;
  // TacticalBoard/Formation only — where the pitch board sits in a landscape
  // frame. "left"/"right" moves the title/caption into a side text panel
  // instead of overlaying/sitting above the board; ignored in portrait
  // (the board already fills the frame there).
  boardPosition?: "left" | "right" | "center";
  // Cross-visual reveal control (stagger/focusOrder/pulse) — read by every
  // array-based card (Grid, BarChart, LeagueTable, TierCards, Funnel,
  // PackedCircles, KpiPanel, Treemap, MomentumTimeline, Radar); every other
  // card safely ignores it.
  animation?: {
    staggerSeconds?: number;
    focusOrder?: number[];
    pulse?: boolean;
  };
}

/** One data-shape alias per visual kind, each just `Extract<Visual, {kind:
 * "x"}>` — every card component's own prop type reads `{ data: XData } &
 * SharedVisualProps` using the alias below instead of repeating the Extract
 * at every call site. */
export type TacticalBoardData = Extract<Visual, { kind: "tactical-board" }>;
export type VerticalTacticalBoardData = Extract<Visual, { kind: "vertical-tactical-board" }>;
export type FormationData = Extract<Visual, { kind: "formation" }>;
export type ShotMapData = Extract<Visual, { kind: "shot-map" }>;
export type TacticalBoard3DData = Extract<Visual, { kind: "tactical-board-3d" }>;
export type Formation3DData = Extract<Visual, { kind: "formation-3d" }>;
export type ShotMap3DData = Extract<Visual, { kind: "shot-map-3d" }>;
export type PassNetworkData = Extract<Visual, { kind: "pass-network" }>;
export type HeatMapData = Extract<Visual, { kind: "heat-map" }>;
export type ZoneData = Extract<Visual, { kind: "zone" }>;
export type GoalSequenceData = Extract<Visual, { kind: "goal-sequence" }>;
export type AnalysisData = Extract<Visual, { kind: "analysis" }>;
export type StatBurstData = Extract<Visual, { kind: "statburst" }>;
export type BarChartData = Extract<Visual, { kind: "barchart" }>;
export type DonutChartData = Extract<Visual, { kind: "shape" }>;
export type RadarData = Extract<Visual, { kind: "radar" }>;
export type SingleStatData = Extract<Visual, { kind: "single-stat" }>;
export type MomentumTimelineData = Extract<Visual, { kind: "momentum-timeline" }>;
export type LeagueTableData = Extract<Visual, { kind: "league-table" }>;
export type KpiPanelData = Extract<Visual, { kind: "kpi-panel" }>;
export type PlayerComparisonData = Extract<Visual, { kind: "player-comparison" }>;
export type HeroMetricData = Extract<Visual, { kind: "hero-metric" }>;
export type TreemapData = Extract<Visual, { kind: "treemap" }>;
export type TierCardsData = Extract<Visual, { kind: "tier-cards" }>;
export type FunnelData = Extract<Visual, { kind: "funnel" }>;
export type PackedCirclesData = Extract<Visual, { kind: "packed-circles" }>;
export type SplitCardsData = Extract<Visual, { kind: "split-cards" }>;
export type GridData = Extract<Visual, { kind: "grid" }>;
export type SequenceData = Extract<Visual, { kind: "sequence" }>;
export type QuoteData = Extract<Visual, { kind: "quote" }>;
export type CodeData = Extract<Visual, { kind: "code" }>;
export type CareerPathData = Extract<Visual, { kind: "career-path" }>;
export type IconData = Extract<Visual, { kind: "icon" }>;
export type CanvasData = Extract<Visual, { kind: "canvas" }>;
