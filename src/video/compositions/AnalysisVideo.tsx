import React from "react";
import { Html5Audio, staticFile, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming, type TransitionPresentation } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { none } from "@remotion/transitions/none";
import { slide } from "@remotion/transitions/slide";
import { zoomIn, zoomOut } from "../transitions";
import { ChapterCard } from "./ChapterCard";
import { StatementCard } from "./StatementCard";
import { StatBurstCard } from "./StatBurstCard";
import { SequenceCard } from "./SequenceCard";
import { BarChartCard } from "./BarChartCard";
import { IconInfographicCard } from "./IconInfographicCard";
import { ZoneMapCard } from "./ZoneMapCard";
import { DonutChartCard } from "./DonutChartCard";
import { TacticalBoard } from "./TacticalBoard";
import { Formation } from "./Formation";
import { ShotMap } from "./ShotMap";
import { PlayerComparison } from "./PlayerComparison";
import { GoalSequence } from "./GoalSequence";
import { MomentumTimeline } from "./MomentumTimeline";
import { SingleStatCard } from "./SingleStatCard";
import { RadarChart } from "./RadarChart";
import { VerticalTacticalBoard } from "./VerticalTacticalBoard";
import { QuoteCard } from "./QuoteCard";
import { LeagueTableCard } from "./LeagueTableCard";
import { CareerPathCard } from "./CareerPathCard";
import { PassNetworkCard } from "./PassNetworkCard";
import { HeatMapCard } from "./HeatMapCard";
import { AnalysisBoard } from "./AnalysisBoard";
import type { TimedSegment, AspectRatio } from "../../model/Segment";
import type { Orientation } from "../theme";

const FADE_PADDING_FRAMES = 20;
export const TRANSITION_FRAMES = 15; // ~0.5s crossfade at 30fps between segments
export const HARD_CUT_FRAMES = 1; // minimal, non-zero (linearTiming needs a real range)

/** How many frames of overlap a segment's outgoing transition consumes —
 * shared, not additive, with the next segment. Root.tsx's duration
 * calculation needs this exact number per segment to avoid overshooting. */
export function transitionFramesFor(segment: TimedSegment): number {
  return segment.transitionOut === "cut" ? HARD_CUT_FRAMES : TRANSITION_FRAMES;
}

/** transitionOut ("cut"/"dissolve") controls TIMING only; transitionStyle
 * picks which presentation plays for the non-cut case — independent
 * concerns, so a scene can be e.g. a slow slide-left dissolve or a fast
 * zoom-in hard cut. Defaults to fade(), today's only behavior. */
function presentationFor(segment: TimedSegment): TransitionPresentation<Record<string, unknown>> {
  // TransitionSeries.Transition's `presentation` prop is generic over a
  // single PresentationProps shape — each branch below returns a genuinely
  // different one (NoneProps/SlideProps/our own {direction}), so TS can't
  // reconcile the union against one call site's inferred type param. The
  // cast is fighting that generic invariance, not a real type-safety gap:
  // each presentation's own component only ever reads its own props.
  const presentation = (() => {
    if (segment.transitionOut === "cut") return none();
    switch (segment.transitionStyle) {
      case "zoom-in":
        return zoomIn();
      case "zoom-out":
        return zoomOut();
      case "slide-left":
        return slide({ direction: "from-right" });
      case "slide-right":
        return slide({ direction: "from-left" });
      case "slide-up":
        return slide({ direction: "from-bottom" });
      case "slide-down":
        return slide({ direction: "from-top" });
      default:
        return fade();
    }
  })();
  return presentation as unknown as TransitionPresentation<Record<string, unknown>>;
}

function formatterFor(format: "integer" | "decimal"): (value: number) => string {
  return format === "decimal" ? (v) => v.toFixed(2) : (v) => String(Math.round(v));
}

/** Each beat's real narration audio (once generated) drives its own duration, so a
 * beat's visual — plain caption or a graphic override — always plays under the
 * full narration for that text, never a trimmed version of it. */
/** `aspectRatio` itself isn't read here — Root.tsx's calculateMetadata already
 * derives the actual composition width/height from it. Instead, `orientation`
 * is derived once from the real rendered dimensions via useVideoConfig() and
 * passed explicitly to every card, rather than each of the ~24 cards
 * independently calling useVideoConfig() and duplicating the same
 * width>height check. `aspectRatio` stays in the prop type purely so
 * Root.tsx's defaultProps/inputProps shape still type-checks here. */
export const AnalysisVideo: React.FC<{ segments: TimedSegment[]; aspectRatio?: AspectRatio }> = ({ segments }) => {
  const { fps, width, height } = useVideoConfig();
  const orientation: Orientation = height > width ? "portrait" : "landscape";

  return (
    <TransitionSeries>
      {segments.map((segment, index) => {
        const durationInFrames = Math.ceil(segment.durationSeconds * fps) + FADE_PADDING_FRAMES;
        return (
          <React.Fragment key={index}>
            <TransitionSeries.Sequence durationInFrames={durationInFrames}>
              {segment.type === "chapter" && (
                <ChapterCard title={segment.text} backgroundColor={segment.panelColor} orientation={orientation} />
              )}
              {segment.type === "statement" && !segment.visual && (
                <StatementCard text={segment.text} backgroundColor={segment.panelColor} orientation={orientation} />
              )}
              {segment.type === "statement" && segment.visual?.kind === "statburst" && (
                <StatBurstCard
                  label={segment.visual.label}
                  leftLabel={segment.visual.leftLabel}
                  leftValue={segment.visual.leftValue}
                  rightLabel={segment.visual.rightLabel}
                  rightValue={segment.visual.rightValue}
                  formatValue={formatterFor(segment.visual.format)}
                  backgroundColor={segment.panelColor}
                  orientation={orientation}
                />
              )}
              {segment.type === "statement" && segment.visual?.kind === "sequence" && (
                <SequenceCard
                  title={segment.visual.title}
                  beats={segment.visual.beats}
                  backgroundImage={segment.backgroundImage}
                  backgroundImageMode={segment.backgroundImageMode}
                  backgroundImageSide={segment.backgroundImageSide}
                  backgroundColor={segment.panelColor}
                  orientation={orientation}
                />
              )}
              {segment.type === "statement" && segment.visual?.kind === "barchart" && (
                <BarChartCard
                  title={segment.visual.title}
                  bars={segment.visual.bars}
                  backgroundColor={segment.panelColor}
                  orientation={orientation}
                />
              )}
              {segment.type === "statement" && segment.visual?.kind === "icon" && (
                <IconInfographicCard
                  icon={segment.visual.icon}
                  headline={segment.visual.headline}
                  caption={segment.visual.caption}
                  backgroundImage={segment.backgroundImage}
                  backgroundImageMode={segment.backgroundImageMode}
                  backgroundImageSide={segment.backgroundImageSide}
                  backgroundColor={segment.panelColor}
                  iconImage={segment.iconImage}
                  orientation={orientation}
                />
              )}
              {segment.type === "statement" && segment.visual?.kind === "zone" && (
                <ZoneMapCard
                  zone={segment.visual.zone}
                  label={segment.visual.label}
                  caption={segment.visual.caption}
                  backgroundColor={segment.panelColor}
                  orientation={orientation}
                />
              )}
              {segment.type === "statement" && segment.visual?.kind === "shape" && (
                <DonutChartCard
                  title={segment.visual.title}
                  segments={segment.visual.segments}
                  backgroundColor={segment.panelColor}
                  orientation={orientation}
                />
              )}
              {segment.type === "statement" && segment.visual?.kind === "tactical-board" && (
                <TacticalBoard
                  title={segment.visual.title}
                  players={segment.visual.players}
                  arrows={segment.visual.arrows}
                  highlight={segment.visual.highlight}
                  highlightZone={segment.visual.highlightZone}
                  annotations={segment.visual.annotations}
                  camera={segment.camera}
                  durationInFrames={durationInFrames}
                  backgroundImage={segment.backgroundImage}
                  backgroundImageMode={segment.backgroundImageMode}
                  backgroundImageSide={segment.backgroundImageSide}
                  backgroundColor={segment.panelColor}
                  orientation={orientation}
                />
              )}
              {segment.type === "statement" && segment.visual?.kind === "formation" && (
                <Formation
                  title={segment.visual.title}
                  sides={segment.visual.sides}
                  backgroundImage={segment.backgroundImage}
                  backgroundImageMode={segment.backgroundImageMode}
                  backgroundImageSide={segment.backgroundImageSide}
                  backgroundColor={segment.panelColor}
                  jerseyImages={segment.jerseyImages}
                  orientation={orientation}
                />
              )}
              {segment.type === "statement" && segment.visual?.kind === "shot-map" && (
                <ShotMap
                  title={segment.visual.title}
                  shots={segment.visual.shots}
                  backgroundColor={segment.panelColor}
                  orientation={orientation}
                />
              )}
              {segment.type === "statement" && segment.visual?.kind === "player-comparison" && (
                <PlayerComparison
                  leftPlayer={segment.visual.leftPlayer}
                  rightPlayer={segment.visual.rightPlayer}
                  stats={segment.visual.stats}
                  backgroundColor={segment.panelColor}
                  orientation={orientation}
                />
              )}
              {segment.type === "statement" && segment.visual?.kind === "goal-sequence" && (
                <GoalSequence
                  title={segment.visual.title}
                  shooter={segment.visual.shooter}
                  from={segment.visual.from}
                  to={segment.visual.to}
                  keeper={segment.visual.keeper}
                  keeperAt={segment.visual.keeperAt}
                  curve={segment.visual.curve}
                  camera={segment.camera}
                  durationInFrames={durationInFrames}
                  backgroundImage={segment.backgroundImage}
                  backgroundImageMode={segment.backgroundImageMode}
                  backgroundImageSide={segment.backgroundImageSide}
                  backgroundColor={segment.panelColor}
                  orientation={orientation}
                />
              )}
              {segment.type === "statement" && segment.visual?.kind === "momentum-timeline" && (
                <MomentumTimeline
                  title={segment.visual.title}
                  matchMinutes={segment.visual.matchMinutes}
                  phases={segment.visual.phases}
                  backgroundColor={segment.panelColor}
                  orientation={orientation}
                />
              )}
              {segment.type === "statement" && segment.visual?.kind === "single-stat" && (
                <SingleStatCard
                  title={segment.visual.title}
                  value={segment.visual.value}
                  context={segment.visual.context}
                  backgroundImage={segment.backgroundImage}
                  backgroundImageMode={segment.backgroundImageMode}
                  backgroundImageSide={segment.backgroundImageSide}
                  backgroundColor={segment.panelColor}
                  orientation={orientation}
                />
              )}
              {segment.type === "statement" && segment.visual?.kind === "radar" && (
                <RadarChart
                  title={segment.visual.title}
                  axes={segment.visual.axes}
                  series={segment.visual.series}
                  backgroundColor={segment.panelColor}
                  orientation={orientation}
                />
              )}
              {segment.type === "statement" && segment.visual?.kind === "vertical-tactical-board" && (
                <VerticalTacticalBoard
                  title={segment.visual.title}
                  players={segment.visual.players}
                  arrows={segment.visual.arrows}
                  sideText={segment.visual.sideText}
                  backgroundColor={segment.panelColor}
                  orientation={orientation}
                />
              )}
              {segment.type === "statement" && segment.visual?.kind === "quote" && (
                <QuoteCard
                  quote={segment.visual.quote}
                  attribution={segment.visual.attribution}
                  backgroundImage={segment.backgroundImage}
                  backgroundImageMode={segment.backgroundImageMode}
                  backgroundImageSide={segment.backgroundImageSide}
                  backgroundColor={segment.panelColor}
                  orientation={orientation}
                />
              )}
              {segment.type === "statement" && segment.visual?.kind === "league-table" && (
                <LeagueTableCard
                  title={segment.visual.title}
                  columnLabel={segment.visual.columnLabel}
                  rowLabel={segment.visual.rowLabel}
                  rows={segment.visual.rows}
                  backgroundColor={segment.panelColor}
                  orientation={orientation}
                />
              )}
              {segment.type === "statement" && segment.visual?.kind === "career-path" && (
                <CareerPathCard
                  title={segment.visual.title}
                  stops={segment.visual.stops}
                  backgroundColor={segment.panelColor}
                  orientation={orientation}
                />
              )}
              {segment.type === "statement" && segment.visual?.kind === "pass-network" && (
                <PassNetworkCard
                  title={segment.visual.title}
                  nodes={segment.visual.nodes}
                  links={segment.visual.links}
                  backgroundColor={segment.panelColor}
                  orientation={orientation}
                />
              )}
              {segment.type === "statement" && segment.visual?.kind === "heat-map" && (
                <HeatMapCard
                  title={segment.visual.title}
                  zones={segment.visual.zones}
                  backgroundColor={segment.panelColor}
                  orientation={orientation}
                />
              )}
              {segment.type === "statement" && segment.visual?.kind === "analysis" && (
                <AnalysisBoard
                  title={segment.visual.title}
                  players={segment.visual.players}
                  gazeLines={segment.visual.gazeLines}
                  revealCaption={segment.visual.revealCaption}
                  backgroundColor={segment.panelColor}
                  orientation={orientation}
                />
              )}
              {segment.audioStaticPath && <Html5Audio src={staticFile(segment.audioStaticPath)} />}
              {segment.sfxStaticPath && <Html5Audio src={staticFile(segment.sfxStaticPath)} volume={0.5} />}
            </TransitionSeries.Sequence>
            {index < segments.length - 1 && (
              <TransitionSeries.Transition
                presentation={presentationFor(segment)}
                timing={linearTiming({ durationInFrames: transitionFramesFor(segment) })}
              />
            )}
          </React.Fragment>
        );
      })}
    </TransitionSeries>
  );
};
