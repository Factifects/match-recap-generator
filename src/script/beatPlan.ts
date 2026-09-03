import { z } from "zod";

// ---------------------------------------------------------------------------
// The Visual Beat Plan — a script author's DECLARATION of the visual EVENT a
// scene stages, separate from (and checkable against) the medium Data that
// realizes it. Same role as SceneContract (sceneContract.ts): the author
// writes it, the application parses and validates it, and later stages consume
// it. It is NOT produced by any model in this codebase — whoever writes the
// script writes it, as an optional `**Visual Event:**` field, the same way
// `**Thesis:**` / `**Entities:**` / `**Flow:**` are authored by hand.
//
// It is the structured home for the doctrine's BEFORE / TRIGGER / EVENT /
// AFTER beat design (src/ai/doctrine.ts) — which otherwise exists only as
// prose. The point of writing the event down is the same as the point of a
// SceneContract: "does the animation demonstrate the narration" becomes a
// mechanical check (`checkVisualEvent` in validateScene.ts) instead of an
// unfalsifiable one.
//
// Serialized onto one line as JSON — the same "structured content packed onto
// one line" convention `**Data:**` uses — so parseSceneScript's shared
// space-joining field parser leaves it intact. Node-safe: imports only `zod`.
// ---------------------------------------------------------------------------

export const visualEventSchema = z.object({
  /** What the viewer currently believes they are looking at, before this beat. */
  before: z.string().min(1),
  /** The belief the trigger is about to challenge. Optional — not every beat
   * sets up an expectation to violate; some just extend understanding. */
  viewerExpectation: z.string().optional(),
  /** The new information or action that changes the visual world. */
  trigger: z.string().min(1),
  /** A PHYSICAL description of what happens on screen — "the tile splits along
   * faint seams and the pieces drift apart", never a timeline verb like
   * "split the tile". The verb is an implementation detail, chosen last. */
  action: z.string().min(1),
  /** Present only when the world TRANSFORMS rather than merely moving — one
   * representation becoming another. Absent for a beat that is pure motion. */
  transformation: z.string().optional(),
  /** The visible result on screen once the action settles. */
  consequence: z.string().min(1),
  /** What the viewer now understands that they did not before this beat. */
  viewerRealization: z.string().min(1),
});
export type VisualEvent = z.infer<typeof visualEventSchema>;

/** A medium-INDEPENDENT statement of what the beat needs from its
 * representation. Nothing consumes it yet — it is authored and persisted so a
 * later representation-selection step has the artifact. Expected to grow. */
export const representationNeedSchema = z.enum([
  "follow-a-chain",
  "experience-a-contradiction",
  "watch-one-thing-transform",
  "compare-two-outcomes",
  "trace-a-process",
  "see-structure-appear",
  "watch-a-value-change",
  "establish-a-situation",
]);
export type RepresentationNeed = z.infer<typeof representationNeedSchema>;

export const beatPlanSchema = z
  .object({
    /** The single idea this scene must land. */
    semanticGoal: z.string().min(1),
    /** The one entity the scene is about — the thing every beat serves. */
    primarySubject: z.string().min(1),
    /** The recognizable situation on screen. */
    visualWorld: z.string().min(1),
    /** What the viewer knows before this scene — ideally the previous scene's
     * `viewerKnowledgeAfter`, so the script builds a backbone. */
    viewerKnowledgeBefore: z.string().min(1),
    /** What the viewer must know after this scene. */
    viewerKnowledgeAfter: z.string().min(1),
    representationNeed: representationNeedSchema,
    /** The staged event. `null` ONLY for a declared establishing or CTA beat
     * that legitimately has no before -> after transformation. */
    event: visualEventSchema.nullable(),
    /** Required (by the refine below) whenever `event` is null. */
    establishingReason: z.string().optional(),
  })
  .refine((v) => v.event !== null || (v.establishingReason?.trim().length ?? 0) > 0, {
    message: "event may be null only when establishingReason explains why (an establishing or CTA beat)",
    path: ["event"],
  });
export type BeatPlan = z.infer<typeof beatPlanSchema>;
