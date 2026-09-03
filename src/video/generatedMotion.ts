import type React from "react";

// ---------------------------------------------------------------------------
// The contract an AI-GENERATED motion component is written against.
//
// Why this exists: the schema-driven path (src/ai/authorScene.ts) can only
// assemble the ~30 mediums that already exist, so every video is built from the
// same pre-made looks and a topic that fits none of them gets shoehorned into
// the nearest one. This is the escape hatch — the model writes an actual
// Remotion component instead of filling in a schema, so the animation can be
// whatever the concept genuinely needs.
//
// The trade is real and worth stating: schema output is validated by Zod before
// it can do any damage, whereas generated code is validated by the TypeScript
// compiler and then by looking at what it actually rendered. That is a slower
// loop, but it is a STRONGER one — `tsc` catches a whole class of errors a
// JSON schema cannot express, and a rendered frame is the only thing that can
// answer "does this read as anything at all".
//
// Kept deliberately small. Every field here is something a generated component
// can rely on forever; anything richer belongs inside the component itself,
// where it can be regenerated freely without breaking a contract.
// ---------------------------------------------------------------------------

export interface GeneratedMotionProps {
  /** Total frames this scene occupies. Generated components MUST derive all
   * timing from this and `useCurrentFrame()` rather than hard-coding frame
   * numbers — the narration fit rescales every scene against real measured
   * TTS audio, so a component that assumes a fixed length desynchronizes the
   * moment the voice is a little slower than the estimate. */
  durationInFrames: number;
  /** "portrait" (9:16) or "landscape" (16:9). These are separate composition
   * targets, not one layout at two sizes — a component is expected to branch
   * on this, never to lay out horizontally and hope it crops. */
  orientation: "portrait" | "landscape";
  /** The line being spoken over this scene, so a component can key its beats
   * to the narration's clause order rather than to arbitrary timings. */
  narrationText?: string;
}

export type GeneratedMotionComponent = React.FC<GeneratedMotionProps>;
