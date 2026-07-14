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
  // See tacticalArrowSchema in visualDefinitions.ts — "run" (default when
  // omitted) glides the role's own marker; "pass" leaves it in place and
  // animates only the ball. None of the named patterns below currently
  // represent a pass (they're all runs/duels), so this is unused today —
  // present for when a future named pattern needs it.
  kind?: "run" | "pass";
}

/** A follow-on beat for a pattern that genuinely has more than one sequential
 * step (a turnover then a swarm, a build-up shape then a switch) — mirrors
 * TacticalBoardData's own `phases` shape, but role-keyed instead of
 * name-keyed, since a pattern doesn't know the real player names until
 * parseSceneScript.ts substitutes them from Focus/Supporting Players. Only
 * roles present in THIS phase's `roles` render that phase — a role missing
 * here simply isn't drawn (same "phases don't have to repeat everyone"
 * behavior TacticalBoard.tsx already has for hand-authored Data phases). */
export interface TacticalPatternPhase {
  roles: Partial<Record<PatternRole, PatternRoleTemplate>>;
  arrows?: PatternArrowTemplate[];
  highlightZone?: { x: number; y: number; width: number; height: number };
  caption?: string;
  dataPoint?: string;
}

export interface TacticalPatternTemplate {
  roles: Partial<Record<PatternRole, PatternRoleTemplate>> & { focus: PatternRoleTemplate };
  arrows?: PatternArrowTemplate[];
  highlightZone?: { x: number; y: number; width: number; height: number };
  /** Optional follow-on beats after this template's own top-level roles/
   * arrows/highlightZone (phase 0). Most concepts here are still a single
   * arrow (a run, a duel) — reach for `phases` only when the concept is
   * genuinely sequential (a turnover THEN a swarm, a build-up shape THEN a
   * switch), the same judgment call TacticalBoard.tsx's own docs make for
   * hand-authored Data blocks. */
  phases?: TacticalPatternPhase[];
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

  // --- 2026-07-13 batch, audited via `remotion still` the same way as the
  // batch above: overlap, underlap, high line, double pivot, channel run,
  // and switch of play ALL initially shipped with their opposition marker on
  // `supporting2` — which rendered fine in a still with 2 supporting names
  // given, but silently vanished with only 1 (the natural amount to write,
  // e.g. "Supporting Players: FullBackA" alone). Moved to `supporting3`
  // (guaranteed fallback) for all six after catching this via a real
  // rendered frame, not just re-reading the coordinates. False nine,
  // third-man run, pressing trigger, low block, inverted full-back, and
  // counter press were also each rendered and checked; no direction/opposition
  // issues found in those six.
  overlap: {
    // Focus (winger, home) holds the ball wide; supporting (the full-back)
    // starts deeper/inside and runs AROUND the outside — ending further
    // forward (higher x) AND wider (lower y, closer to the touchline) than
    // the winger, the defining shape of an overlapping run. The opposition
    // marker is `supporting3` (guaranteed "Defender" fallback), not
    // `supporting2` — a still-render check on the first draft of this
    // pattern found the marker silently vanishing whenever a script named
    // only one supporting player (the full-back), which is the natural
    // thing to write; `supporting2` only renders with an explicit 2nd name.
    roles: {
      focus: { x: 70, y: 15, side: "home" },
      supporting: { x: 50, y: 18, side: "home" },
      supporting3: { x: 72, y: 12, side: "away" },
    },
    arrows: [{ from: "supporting", toX: 88, toY: 4 }],
  },
  underlap: {
    // Same starting shape as Overlap (including the supporting3 fix — see
    // its comment above), but the full-back's run goes UNDER (inside) the
    // winger instead — forward AND infield (higher y, toward the
    // half-space) rather than wider.
    roles: {
      focus: { x: 70, y: 15, side: "home" },
      supporting: { x: 50, y: 18, side: "home" },
      supporting3: { x: 72, y: 12, side: "away" },
    },
    arrows: [{ from: "supporting", toX: 88, toY: 32 }],
  },
  "third-man run": {
    // Focus (the third man) is tightly marked by supporting3 while
    // supporting/supporting2 look like the two players involved in the
    // buildup — focus's run goes forward AND past supporting3, arriving
    // beyond supporting2's position entirely unmarked.
    roles: {
      supporting: { x: 35, y: 50, side: "home" },
      supporting2: { x: 60, y: 45, side: "home" },
      focus: { x: 45, y: 65, side: "home" },
      supporting3: { x: 50, y: 63, side: "away" },
    },
    arrows: [{ from: "focus", toX: 78, toY: 55 }],
  },
  "pressing trigger": {
    // Focus is the presser (away) — closing down supporting (home) the
    // instant they take a heavy touch. Away's own goal sits at x=100 in
    // this library's convention, so a press is away moving AWAY from their
    // own goal (decreasing x) to close the ball down, same physical
    // direction as any other away forward action.
    roles: {
      supporting: { x: 55, y: 50, side: "home" },
      focus: { x: 68, y: 52, side: "away" },
    },
    arrows: [{ from: "focus", toX: 56, toY: 50 }],
  },
  "low block": {
    // Static shape, no arrows — the whole point is that the defensive block
    // (supporting/supporting2/supporting3, away) holds a deep, narrow line
    // near their own goal (high x, tight y-range) while focus (home) probes
    // from distance without penetrating.
    roles: {
      focus: { x: 45, y: 50, side: "home" },
      supporting: { x: 85, y: 40, side: "away" },
      supporting2: { x: 85, y: 60, side: "away" },
      supporting3: { x: 88, y: 50, side: "away" },
    },
    highlightZone: { x: 78, y: 30, width: 18, height: 44 },
  },
  "high line": {
    // Phase 0: the defensive line is `supporting3` (guaranteed "Defender"
    // fallback, same reasoning as Overlap/Underlap above) pushed high up the
    // pitch, well clear of their own goal (x=100) — a static shape, no
    // caption yet. `supporting` (optional, needs a 2nd name) adds a second
    // center-back alongside it when named. Phase 1: focus (home) runs beyond
    // the line into the space it leaves behind, landing inside the
    // highlighted zone between the line and the away goal — with a real
    // on-screen caption explaining the mechanism, not just the narration.
    roles: {
      focus: { x: 50, y: 50, side: "home" },
      supporting3: { x: 60, y: 40, side: "away" },
      supporting: { x: 60, y: 60, side: "away" },
    },
    phases: [
      {
        roles: {
          focus: { x: 50, y: 50, side: "home" },
          supporting3: { x: 60, y: 40, side: "away" },
          supporting: { x: 60, y: 60, side: "away" },
        },
        arrows: [{ from: "focus", toX: 85, toY: 50 }],
        highlightZone: { x: 65, y: 25, width: 30, height: 50 },
        caption: "Line pushed high, space opens in behind",
        dataPoint: "Run in behind exploits the space",
      },
    ],
  },
  "inverted full-back": {
    // Focus (the full-back, home) tucks inside from a wide starting slot
    // into a central midfield channel during build-up, instead of holding
    // width — a lateral/infield repositioning, not a forward attacking run,
    // so it deliberately doesn't increase x much (this isn't the same
    // "beats the marker forward" shape as Overlap/Underlap).
    roles: {
      focus: { x: 30, y: 12, side: "home" },
      supporting: { x: 32, y: 15, side: "away" },
    },
    arrows: [{ from: "focus", toX: 35, toY: 45 }],
    highlightZone: { x: 20, y: 4, width: 20, height: 20 },
  },
  "false nine": {
    // Focus (the nominal striker, home) drops OFF the front line to link
    // play — deliberately decreasing x (moving away from goal, not toward
    // it), the opposite of every attacking-run pattern above, because
    // dropping deep IS the mechanism. supporting (the marking center-back,
    // away) is dragged out of the defensive line following focus, shown by
    // its own shorter arrow toward the same area.
    roles: {
      focus: { x: 85, y: 50, side: "home" },
      supporting: { x: 83, y: 50, side: "away" },
    },
    arrows: [
      { from: "focus", toX: 60, toY: 50 },
      { from: "supporting", toX: 65, toY: 50 },
    ],
  },
  "double pivot": {
    // Focus and supporting (home) sit side by side screening the zone in
    // front of the back four; focus shifts slightly toward the away
    // attacker (supporting3 — guaranteed "Defender"/generic-attacker
    // fallback, same reasoning as Overlap/Underlap above) looking to
    // receive between the lines, to cut off that passing lane.
    roles: {
      focus: { x: 45, y: 40, side: "home" },
      supporting: { x: 45, y: 60, side: "home" },
      supporting3: { x: 55, y: 50, side: "away" },
    },
    arrows: [{ from: "focus", toX: 50, toY: 52 }],
    highlightZone: { x: 35, y: 25, width: 20, height: 50 },
  },
  "channel run": {
    // Focus (home) runs forward into the gap between supporting3 (the
    // center-back — guaranteed fallback, same reasoning as above) and
    // supporting (the full-back, optional 2nd defender), landing inside the
    // highlighted channel between them, beyond both defenders' starting x.
    roles: {
      focus: { x: 65, y: 35, side: "home" },
      supporting3: { x: 80, y: 50, side: "away" },
      supporting: { x: 80, y: 20, side: "away" },
    },
    arrows: [{ from: "focus", toX: 88, toY: 35 }],
    highlightZone: { x: 75, y: 25, width: 15, height: 20 },
  },
  "switch of play": {
    // Phase 0: play builds on one side (supporting, home) while focus (the
    // far-side winger, home) sits isolated 1v1 against supporting3 (away —
    // guaranteed fallback; a still-render check found this pattern's first
    // draft used supporting2 here, which silently dropped the marker
    // whenever a script named only the home-side initiator, the natural
    // thing to write) — an underloaded weak side. Phase 1: the ball
    // switches; focus attacks supporting3 down the line (forward =
    // increasing x), and supporting3 reacts by retreating toward their own
    // goal — the SAME direction (also increasing x), per the
    // defender-retreat rule.
    roles: {
      focus: { x: 70, y: 85, side: "home" },
      supporting: { x: 50, y: 15, side: "home" },
      supporting3: { x: 72, y: 88, side: "away" },
    },
    phases: [
      {
        roles: {
          focus: { x: 70, y: 85, side: "home" },
          supporting3: { x: 72, y: 88, side: "away" },
        },
        arrows: [{ from: "focus", toX: 85, toY: 90 }, { from: "supporting3", toX: 80, toY: 92 }],
        caption: "Switch finds the winger in space",
        dataPoint: "1v1 isolates the full-back",
      },
    ],
  },
  "counter press": {
    // Phase 0: the ball is lost near the halfway line — focus (away) is the
    // new ball carrier, with supporting/supporting2 (home) already poised
    // close by. Phase 1: both home players swarm the ball carrier within a
    // couple of yards, illustrating an immediate press rather than
    // retreating into shape.
    roles: {
      focus: { x: 55, y: 50, side: "away" },
      supporting: { x: 50, y: 45, side: "home" },
      supporting2: { x: 50, y: 55, side: "home" },
    },
    phases: [
      {
        roles: {
          focus: { x: 55, y: 50, side: "away" },
          supporting: { x: 56, y: 48, side: "home" },
          supporting2: { x: 56, y: 52, side: "home" },
        },
        caption: "Both players counter-press instantly",
        dataPoint: "Regains the ball within seconds",
      },
    ],
  },

  // --- 2026-07-13, second batch: added for "educational demonstration"
  // scripts (one scene per football responsibility, e.g. a Center-Back or
  // Goalkeeper explainer) — each chosen because it's reusable across
  // multiple positions, not tied to one. Rendered and checked via
  // `remotion still` the same way as every pattern above.
  // All four below are 2-phase (a static "before" shape, then the beat that
  // actually demonstrates the responsibility, with a real on-screen caption/
  // dataPoint) rather than one static arrow — a still-image render of the
  // single-phase first draft of these looked like "two small discs on an
  // empty pitch with no supporting text," which read as barely a visual at
  // all next to narration carrying the whole explanation. The phase split
  // also means the board visibly builds the mechanism instead of presenting
  // the answer immediately.
  "aerial duel": {
    // Phase 0: focus (home defender) and supporting3 (away attacker,
    // guaranteed fallback) both close in on a cross near the six-yard box,
    // no caption yet. Phase 1: focus wins it and clears — AWAY from home's
    // own goal (x=0 in this defensive scenario), i.e. increasing x, same
    // "clearing the danger" direction any defensive header should read as.
    roles: {
      focus: { x: 12, y: 44, side: "home" },
      supporting3: { x: 12, y: 58, side: "away" },
    },
    phases: [
      {
        roles: {
          focus: { x: 12, y: 48, side: "home" },
          supporting3: { x: 12, y: 52, side: "away" },
        },
        arrows: [{ from: "focus", toX: 28, toY: 42 }],
        highlightZone: { x: 4, y: 38, width: 12, height: 24 },
        caption: "Attacks the ball at its highest point",
        dataPoint: "Clears the danger before the striker can connect",
      },
    ],
  },
  "covering run": {
    // Phase 0: focus (home center-back) starts central; supporting (the
    // home full-back) is pinned wide near the touchline; supporting3 (away
    // winger, guaranteed) is the threat in behind. Phase 1: focus shifts
    // across to cover — a lateral shift (large y change), not a forward
    // attacking run, so x barely moves. Endpoint kept well separated in y
    // from supporting's own position (26 vs. 6) — the first draft placed
    // these close enough that their name labels overlapped once the scene's
    // camera zoomed in, confirmed via a real render, not just reasoned about.
    roles: {
      focus: { x: 15, y: 50, side: "home" },
      supporting: { x: 22, y: 6, side: "home" },
      supporting3: { x: 18, y: 10, side: "away" },
    },
    phases: [
      {
        roles: {
          focus: { x: 15, y: 50, side: "home" },
          supporting3: { x: 18, y: 10, side: "away" },
        },
        arrows: [{ from: "focus", toX: 18, toY: 26 }],
        caption: "Center-back shifts across to cover",
        dataPoint: "Closes the space the full-back left behind",
      },
    ],
  },
  "building from the back": {
    // Phase 0: focus (home center-back, or a goalkeeper distributing) sits
    // deep in their own third with supporting3 (away presser, guaranteed)
    // pressing up to cut the lane, no caption yet. Phase 1: focus carries/
    // passes forward beyond the presser — progressing the ball toward
    // home's attacking goal (increasing x), splitting the first line of
    // pressure rather than going long.
    roles: {
      focus: { x: 8, y: 50, side: "home" },
      supporting3: { x: 20, y: 48, side: "away" },
    },
    phases: [
      {
        roles: {
          focus: { x: 8, y: 50, side: "home" },
          supporting3: { x: 20, y: 48, side: "away" },
        },
        arrows: [{ from: "focus", toX: 38, toY: 52 }],
        caption: "Carries beyond the first line of pressure",
        dataPoint: "Progresses play through midfield instead of going long",
      },
    ],
  },
  "tracking run": {
    // Phase 0: supporting3 (away attacker, guaranteed) and focus (the home
    // defender whose responsibility this scene teaches) sit level, higher up
    // the pitch, no caption yet. Phase 1: supporting3 makes a run toward
    // home's own goal (decreasing x, since this is a defensive scenario);
    // focus tracks goal-side and alongside — the SAME direction, per the
    // defender-retreat rule, arriving still tight to the attacker rather
    // than losing them.
    roles: {
      focus: { x: 42, y: 32, side: "home" },
      supporting3: { x: 40, y: 30, side: "away" },
    },
    phases: [
      {
        roles: {
          focus: { x: 42, y: 32, side: "home" },
          supporting3: { x: 40, y: 30, side: "away" },
        },
        arrows: [
          { from: "focus", toX: 17, toY: 47 },
          { from: "supporting3", toX: 15, toY: 45 },
        ],
        caption: "Defender tracks the run stride for stride",
        dataPoint: "Stays goal-side the entire way",
      },
    ],
  },
};

export function resolvePattern(patternName: string): TacticalPatternTemplate | null {
  return TACTICAL_PATTERNS[patternName.trim().toLowerCase()] ?? null;
}
