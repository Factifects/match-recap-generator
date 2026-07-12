// "supporting3" exists specifically for a guaranteed-visible opposition
// marker (see "half-space overload" below) — unlike "supporting"/
// "supporting2", which only render when a script supplies a name for them,
// parseSceneScript.ts falls back to a generic label for supporting3 so a
// pattern can require an opposition presence without depending on the
// script author remembering to name one.
export type PatternRole = "focus" | "supporting" | "supporting2" | "supporting3";

export interface PatternRoleTemplate {
  x: number;
  y: number;
  side: "home" | "away";
}

export interface PatternArrowTemplate {
  from: PatternRole;
  toX: number;
  toY: number;
}

export interface TacticalPatternTemplate {
  roles: Partial<Record<PatternRole, PatternRoleTemplate>> & { focus: PatternRoleTemplate };
  arrows?: PatternArrowTemplate[];
  highlightZone?: { x: number; y: number; width: number; height: number };
}

// Named tactical concept -> a generic relative-position template. The parser
// fills in the real player names from a scene's Focus/Supporting Players
// fields; positions are illustrative (what the narration is asserting), not
// literal tracking data — same epistemic status as ZoneMapCard/SequenceCard.
// Scoped to the patterns actually used by analyses/france-morocco-tactical.txt,
// not a speculative library for concepts nobody's asked for.
//
// Audited for arrow direction (2026-07-11): every arrow below was rendered
// and visually checked, not just reasoned about — "half-space" and
// "half-space overload" were both found to glide the focus player BEHIND
// the marker they're supposed to beat into space, and "half-space overload"
// had zero opposition markers at all despite being a 3-player recap. Fixed
// here; see feedback_tacticalboard_direction memory for the full story.
export const TACTICAL_PATTERNS: Record<string, TacticalPatternTemplate> = {
  "half-space": {
    // Focus drifts infield from a wide position, ending AHEAD of (higher x)
    // and inside (higher y) the marker — beating them into the pocket, not
    // arriving behind them. Was toX:68/toY:32, which visually landed the
    // focus player behind-and-below the still-static marker at (75,20) —
    // the opposite of "beats the marker into space."
    roles: {
      focus: { x: 78, y: 15, side: "home" },
      supporting: { x: 75, y: 20, side: "away" },
    },
    arrows: [{ from: "focus", toX: 85, toY: 35 }],
  },
  "full-back dragged inside": {
    // Focus (the full-back) starts marking the winger closely, inside the
    // wide zone that's about to be vacated — then gets pulled inside,
    // clearly exiting that zone's y-range (8-28) by the time the arrow
    // finishes, leaving the winger (supporting) alone in the space. Was
    // toY:25, which never actually left the highlighted zone at all (still
    // inside its 8-28 y-range), so "vacating" wasn't visible.
    roles: {
      focus: { x: 80, y: 18, side: "away" },
      supporting: { x: 85, y: 12, side: "home" },
    },
    arrows: [{ from: "focus", toX: 68, toY: 50 }],
    highlightZone: { x: 70, y: 8, width: 22, height: 20 },
  },
  "wing overload": {
    // Focus receives in the vacated wide space, isolated 1v1 against
    // supporting — separated enough from the defender's position to read as
    // "isolated in space," not crowding them. Was toX:80/toY:20, which
    // landed almost on top of supporting at (78,15).
    roles: {
      focus: { x: 60, y: 40, side: "home" },
      supporting: { x: 78, y: 15, side: "away" },
    },
    arrows: [{ from: "focus", toX: 88, toY: 35 }],
  },
  "penalty duel": {
    // Focus (taker) mid run-up toward the spot; supporting (keeper) set on the line.
    roles: {
      focus: { x: 80, y: 50, side: "home" },
      supporting: { x: 98, y: 50, side: "away" },
    },
    arrows: [{ from: "focus", toX: 88, toY: 50 }],
  },
  save: {
    // Focus (keeper) parries the ball away from supporting (taker).
    roles: {
      focus: { x: 98, y: 50, side: "away" },
      supporting: { x: 85, y: 50, side: "home" },
    },
    arrows: [{ from: "focus", toX: 95, toY: 35 }],
  },
  "decoy run": {
    // Focus draws the marker before continuing the run past them.
    roles: {
      focus: { x: 82, y: 50, side: "home" },
      supporting: { x: 78, y: 45, side: "away" },
    },
    arrows: [{ from: "focus", toX: 90, toY: 60 }],
  },
  "late arrival": {
    // Focus arrives unmarked into the space the defenders (supporting2) just
    // stepped out of — positioned close to supporting2's own starting spot
    // (80,55) so the "arriving into that exact space" claim reads clearly.
    // Was (88,68), a good 8-13 units away from the vacated spot, reading as
    // an unrelated, disconnected position rather than "arriving there."
    roles: {
      focus: { x: 84, y: 60, side: "home" },
      supporting: { x: 82, y: 50, side: "home" },
      supporting2: { x: 80, y: 55, side: "away" },
    },
    arrows: [{ from: "supporting2", toX: 78, toY: 45 }],
  },
  "compact block": {
    // Focus isolated centrally with no second threat; supporting (the back line) holds deep, unmoved.
    roles: {
      focus: { x: 75, y: 50, side: "away" },
      supporting: { x: 25, y: 50, side: "home" },
    },
    highlightZone: { x: 10, y: 8, width: 20, height: 84 },
  },
  "penalty delay": {
    // Same physical standoff as a penalty duel — the delay is about time, not positioning.
    roles: {
      focus: { x: 85, y: 50, side: "home" },
      supporting: { x: 98, y: 50, side: "away" },
    },
  },
  "half-space overload": {
    // Recap: the half-space run plus the wide runner arriving late, both
    // from France's left — same focus-arrow fix as "half-space" above.
    // Also adds a `supporting3` opposition marker (a covering defender
    // scrambling between both threats): this pattern previously had THREE
    // home players and zero opposition, which reads as disconnected dots
    // rather than a mechanism beating a real defense (see
    // feedback_tacticalboard_opposition memory) — `supporting3` renders
    // even without a script-provided name (falls back to "Defender"),
    // specifically so a recap pattern like this can't ship without one.
    roles: {
      focus: { x: 78, y: 15, side: "home" },
      supporting: { x: 60, y: 40, side: "home" },
      supporting2: { x: 85, y: 70, side: "home" },
      supporting3: { x: 70, y: 50, side: "away" },
    },
    arrows: [
      { from: "focus", toX: 85, toY: 35 },
      { from: "supporting2", toX: 92, toY: 60 },
    ],
    highlightZone: { x: 70, y: 8, width: 25, height: 84 },
  },
};

export function resolvePattern(patternName: string): TacticalPatternTemplate | null {
  return TACTICAL_PATTERNS[patternName.trim().toLowerCase()] ?? null;
}
