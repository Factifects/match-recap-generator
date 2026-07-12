import { z } from "zod";

// The single source of truth for every visual template type: what it's
// called, which category it groups under, what "Scene Type:" string a
// script uses to select it, and the Zod shape of its Data JSON. Segment.ts's
// visualSchema is DERIVED from this list (z.discriminatedUnion over each
// entry's `schema`) rather than hand-duplicated — adding a 22nd visual type
// means adding one entry here (plus a component + a VISUAL_COMPONENTS map
// entry in src/video/visualComponents.tsx), not editing four separate files
// that have to be kept in sync by hand. See the "Visual Registry" plan this
// was built from for the full rationale.
export type VisualCategory = "pitch-tactics" | "stats-dataviz" | "narrative-callouts";

const beatSchema = z.object({
  marker: z.string(),
  label: z.string(),
});

const barSchema = z.object({
  label: z.string(),
  value: z.number(),
});

const tableRowSchema = z.object({
  rank: z.number(),
  label: z.string(),
  value: z.number(),
  highlight: z.boolean().optional(),
});

const careerStopSchema = z.object({
  label: z.string(),
  period: z.string(),
});

const networkNodeSchema = z.object({
  id: z.string(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  team: z.enum(["home", "away"]),
  label: z.string(),
});

const networkLinkSchema = z.object({
  from: z.string(),
  to: z.string(),
  weight: z.number().min(0),
});

export const ICON_KEYS = ["goal", "card", "save", "whistle", "clock", "star", "assist", "sub"] as const;
export const ZONE_KEYS = ["defensive", "middle", "attacking"] as const;
export const FORMATION_NAMES = ["4-3-3", "4-2-3-1", "3-4-2-1", "5-4-1", "4-4-2"] as const;

const formationPlayerSchema = z.object({ name: z.string() });

const formationSideSchema = z.object({
  team: z.string(),
  formationName: z.enum(FORMATION_NAMES),
  players: z.array(formationPlayerSchema).min(1),
  side: z.enum(["home", "away"]).default("home"),
});

const pitchPointSchema = z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) });

const tacticalPlayerSchema = z.object({
  id: z.string(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  team: z.enum(["home", "away"]),
  label: z.string(),
});

const tacticalArrowSchema = z.object({
  from: z.string(),
  to: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
});

// Kept separate from tacticalPlayerSchema/tacticalArrowSchema rather than
// reused — VerticalTacticalBoard is its own Scene Type with its own fields
// (`role`, per-arrow `curve`/`bow`), not a variant of TacticalBoard's.
const verticalPlayerSchema = z.object({
  id: z.string(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  team: z.enum(["home", "away"]),
  label: z.string(),
  role: z.string().optional(),
});

const verticalArrowSchema = z.object({
  from: z.string(),
  to: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
  curve: z.boolean().optional(),
  bow: z.number().optional(),
});

const analysisPlayerSchema = z.object({
  id: z.string(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  team: z.enum(["home", "away"]),
  label: z.string(),
  revealed: z.boolean().optional(),
});

const gazeLineSchema = z.object({
  from: z.string(),
  to: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
});

const heatZoneSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  intensity: z.number().min(0).max(1),
});

const tacticalZoneSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(0).max(100),
  height: z.number().min(0).max(100),
});

const tacticalAnnotationSchema = z.object({
  text: z.string(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

const shotSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  team: z.enum(["home", "away"]),
  result: z.enum(["goal", "saved", "blocked", "off-target"]),
  xg: z.number().min(0).max(1).optional(),
});

const comparisonStatRowSchema = z.object({
  label: z.string(),
  left: z.number(),
  right: z.number(),
});

export interface VisualDefinition<Schema extends z.ZodTypeAny = z.ZodTypeAny> {
  kind: string;
  category: VisualCategory;
  label: string;
  description: string;
  /** Normalized (lowercased, whitespace-stripped) "Scene Type:" match key —
   * kept explicit rather than derived from `label` since several existing
   * scripts' Scene Type strings don't match their display name 1:1 (e.g.
   * "shape" is authored as "Donut", "single-stat" as "Stat"). */
  sceneTypeKey: string;
  schema: Schema;
}

// A "visual" is a graphic that replaces the default caption for one narration
// beat. It never carries its own timing — the beat's real narration audio (or,
// pre-audio, its word-count estimate) always drives how long it's on screen, so
// swapping the caption for a graphic never silently drops narration content.
export const VISUAL_DEFINITIONS = [
  {
    kind: "tactical-board",
    category: "pitch-tactics",
    label: "Tactical Board",
    description: "Named players as jersey-colored discs on a pitch, with movement arrows and an optional highlighted zone.",
    sceneTypeKey: "tacticalboard",
    schema: z.object({
      kind: z.literal("tactical-board"),
      title: z.string(),
      players: z.array(tacticalPlayerSchema).min(1),
      arrows: z.array(tacticalArrowSchema).optional(),
      highlight: z.array(z.string()).optional(),
      highlightZone: tacticalZoneSchema.optional(),
      annotations: z.array(tacticalAnnotationSchema).optional(),
    }),
  },
  {
    kind: "vertical-tactical-board",
    category: "pitch-tactics",
    label: "Vertical Tactical Board",
    description: "Portrait pitch (goal-to-goal running top-to-bottom) with role-pill player labels and curved arrows, plus a side-text caption.",
    sceneTypeKey: "verticaltacticalboard",
    schema: z.object({
      kind: z.literal("vertical-tactical-board"),
      title: z.string(),
      players: z.array(verticalPlayerSchema).min(1),
      arrows: z.array(verticalArrowSchema).optional(),
      sideText: z.string().optional(),
    }),
  },
  {
    kind: "formation",
    category: "pitch-tactics",
    label: "Formation",
    description: "One or two full lineups shown as a compressed formation shape facing each other.",
    sceneTypeKey: "formation",
    schema: z.object({
      kind: z.literal("formation"),
      title: z.string().optional(),
      sides: z.array(formationSideSchema).min(1).max(2),
    }),
  },
  {
    kind: "shot-map",
    category: "pitch-tactics",
    label: "Shot Map",
    description: "Every shot from a match as a marker on the pitch, styled by result and optionally sized by xG.",
    sceneTypeKey: "shotmap",
    schema: z.object({
      kind: z.literal("shot-map"),
      title: z.string(),
      shots: z.array(shotSchema).min(1),
    }),
  },
  {
    kind: "pass-network",
    category: "pitch-tactics",
    label: "Pass Network",
    description: "Player nodes connected by weighted lines showing how a team built play.",
    sceneTypeKey: "passnetwork",
    schema: z.object({
      kind: z.literal("pass-network"),
      title: z.string(),
      nodes: z.array(networkNodeSchema).min(2),
      links: z.array(networkLinkSchema).min(1),
    }),
  },
  {
    kind: "heat-map",
    category: "pitch-tactics",
    label: "Heat Map",
    description: "Where a player/team operated most, as blurred color blobs of author-decided intensity.",
    sceneTypeKey: "heatmap",
    schema: z.object({
      kind: z.literal("heat-map"),
      title: z.string(),
      zones: z.array(heatZoneSchema).min(1),
    }),
  },
  {
    kind: "zone",
    category: "pitch-tactics",
    label: "Zone",
    description: "An abstract pitch diagram with one attacking/middle/defensive third highlighted.",
    sceneTypeKey: "zone",
    schema: z.object({
      kind: z.literal("zone"),
      zone: z.enum(ZONE_KEYS),
      label: z.string(),
      caption: z.string(),
    }),
  },
  {
    kind: "goal-sequence",
    category: "pitch-tactics",
    label: "Goal Sequence",
    description: "A single shot/touch as a ball-path animation from one pitch point to another, with an optional keeper.",
    sceneTypeKey: "goalsequence",
    schema: z.object({
      kind: z.literal("goal-sequence"),
      title: z.string(),
      shooter: z.string(),
      from: pitchPointSchema,
      to: pitchPointSchema,
      keeper: z.string().optional(),
      keeperAt: pitchPointSchema.optional(),
      curve: z.boolean().default(false),
    }),
  },
  {
    kind: "analysis",
    category: "pitch-tactics",
    label: "Analysis",
    description: "Revisits an already-shown moment: freeze the shape, draw gaze lines, then reveal the element the defense's attention missed.",
    sceneTypeKey: "analysis",
    schema: z.object({
      kind: z.literal("analysis"),
      title: z.string(),
      players: z.array(analysisPlayerSchema).min(1),
      gazeLines: z.array(gazeLineSchema).optional(),
      revealCaption: z.string().optional(),
    }),
  },
  {
    kind: "statburst",
    category: "stats-dataviz",
    label: "Stat Burst",
    description: "Two-value head-to-head with a proportional bar — the simple version of Player Comparison.",
    sceneTypeKey: "statburst",
    schema: z.object({
      kind: z.literal("statburst"),
      label: z.string(),
      leftLabel: z.string(),
      leftValue: z.number(),
      rightLabel: z.string(),
      rightValue: z.number(),
      format: z.enum(["integer", "decimal"]).default("integer"),
    }),
  },
  {
    kind: "barchart",
    category: "stats-dataviz",
    label: "Bar Chart",
    description: "A row of labeled bars, minimum two.",
    sceneTypeKey: "barchart",
    schema: z.object({
      kind: z.literal("barchart"),
      title: z.string(),
      bars: z.array(barSchema).min(2),
    }),
  },
  {
    kind: "shape",
    category: "stats-dataviz",
    label: "Donut Chart",
    description: "Proportional segments of a whole, minimum two.",
    sceneTypeKey: "donut",
    schema: z.object({
      kind: z.literal("shape"),
      title: z.string(),
      segments: z.array(barSchema).min(2),
    }),
  },
  {
    kind: "radar",
    category: "stats-dataviz",
    label: "Radar Chart",
    description: "A multi-axis profile (3+ axes) for one or two entities, every value pre-normalized 0-100.",
    sceneTypeKey: "radar",
    schema: z.object({
      kind: z.literal("radar"),
      title: z.string(),
      axes: z.array(z.string()).min(3),
      series: z
        .array(
          z.object({
            label: z.string(),
            values: z.array(z.number().min(0).max(100)),
            color: z.string().optional(),
          }),
        )
        .min(1)
        .max(2),
    }),
  },
  {
    kind: "single-stat",
    category: "stats-dataviz",
    label: "Single Stat",
    description: "One climbing counter with optional secondary context text.",
    sceneTypeKey: "stat",
    schema: z.object({
      kind: z.literal("single-stat"),
      title: z.string(),
      value: z.number(),
      context: z.string().optional(),
    }),
  },
  {
    kind: "momentum-timeline",
    category: "stats-dataviz",
    label: "Momentum Timeline",
    description: "A match's rhythm across the minute axis — named stretches arch up (rise) or down (fall) from a baseline.",
    sceneTypeKey: "momentumtimeline",
    schema: z.object({
      kind: z.literal("momentum-timeline"),
      title: z.string(),
      matchMinutes: z.number().min(1),
      phases: z
        .array(
          z.object({
            startMinute: z.number().min(0),
            endMinute: z.number().min(0),
            direction: z.enum(["rise", "fall"]).default("rise"),
            label: z.string(),
          }),
        )
        .min(1),
    }),
  },
  {
    kind: "league-table",
    category: "stats-dataviz",
    label: "League Table",
    description: "A full ranked multi-row table (standings, top-scorer charts), minimum two rows.",
    sceneTypeKey: "leaguetable",
    schema: z.object({
      kind: z.literal("league-table"),
      title: z.string(),
      columnLabel: z.string(),
      rowLabel: z.string().optional(),
      rows: z.array(tableRowSchema).min(2),
    }),
  },
  {
    kind: "player-comparison",
    category: "stats-dataviz",
    label: "Player Comparison",
    description: "A multi-row stat table comparing two players in genuinely comparable roles.",
    sceneTypeKey: "playercomparison",
    schema: z.object({
      kind: z.literal("player-comparison"),
      leftPlayer: z.string(),
      rightPlayer: z.string(),
      stats: z.array(comparisonStatRowSchema).min(1),
    }),
  },
  {
    kind: "sequence",
    category: "narrative-callouts",
    label: "Sequence",
    description: "A chain of connected moments/minutes building on each other, stacked vertically.",
    sceneTypeKey: "sequence",
    schema: z.object({
      kind: z.literal("sequence"),
      title: z.string(),
      beats: z.array(beatSchema).min(1),
    }),
  },
  {
    kind: "quote",
    category: "narrative-callouts",
    label: "Quote",
    description: "A quoted statement with attribution — for reporting what someone said, not a fact about them.",
    sceneTypeKey: "quote",
    schema: z.object({
      kind: z.literal("quote"),
      quote: z.string(),
      attribution: z.string(),
    }),
  },
  {
    kind: "career-path",
    category: "narrative-callouts",
    label: "Career Path",
    description: "A player's or manager's history as a left-to-right journey across years, minimum two stops.",
    sceneTypeKey: "careerpath",
    schema: z.object({
      kind: z.literal("career-path"),
      title: z.string(),
      stops: z.array(careerStopSchema).min(2),
    }),
  },
  {
    kind: "icon",
    category: "narrative-callouts",
    label: "Icon",
    description: "A single fact paired with a matching symbolic icon (goal/card/save/etc).",
    sceneTypeKey: "icon",
    schema: z.object({
      kind: z.literal("icon"),
      icon: z.enum(ICON_KEYS),
      headline: z.string(),
      caption: z.string(),
    }),
  },
] as const satisfies readonly VisualDefinition[];

export type VisualKind = (typeof VISUAL_DEFINITIONS)[number]["kind"];
