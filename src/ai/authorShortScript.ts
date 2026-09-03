import { z } from "zod";
import { withRetries, type LlmProvider } from "./provider";
import { extractJson } from "./extractJson";

// ---------------------------------------------------------------------------
// Narration for a footage-backed short.
//
// A different writing job from authorOutline, not a variant of it. That one
// plans SCENES — which medium, what the visual must demonstrate, how the
// composition evolves. Here there is no visual to plan: the background is
// ambient and the captions are the picture, so the entire job is the words and
// their rhythm.
//
// Which makes the writing constraints tighter, not looser. With no diagram to
// carry an idea, every line has to land on its own, and the format's retention
// comes almost entirely from the first two seconds and the pace of the turns.
// ---------------------------------------------------------------------------

export const shortScriptSchema = z.object({
  title: z.string().min(1),
  /** One spoken line per caption beat. Kept as separate lines rather than one
   * blob because each becomes its own audio clip with its own measured
   * duration — which is what lets captions land on the beat instead of being
   * spread evenly across a guess. */
  lines: z.array(z.string().min(1)).min(3).max(40),
});

export type ShortScript = z.infer<typeof shortScriptSchema>;

const SHORT_SYSTEM = `You write narration for short vertical videos — the kind watched on a phone, in a feed, usually on mute with captions doing the work.

# The format

There is no diagram and no illustration. Looping background footage plays behind big word-by-word captions. Your words ARE the video, so every line has to carry itself.

# Rules

- The FIRST line decides everything. It must state something concrete and surprising in under 12 words. Never open with a question, never with "did you know", never by announcing the topic.
- One idea per line. A line is a caption beat, roughly 1-3 seconds of speech.
- Short lines. 4-12 words. Vary the length so the rhythm does not flatten.
- Plain spoken English. Contractions. No jargon you have not just explained, no "furthermore", no "in this video".
- Build a chain: each line should make the next one feel necessary. If two lines could swap places without loss, they are not doing work.
- Land a real payoff — the thing the viewer did not know when they started.
- No filler scaffolding: cut "here's the thing", "but wait", "let me explain".
- The content must be genuinely non-obvious. If a viewer already knows it in five seconds, it does not earn the video.

# Length

Aim for 25-40 lines — roughly 45-75 seconds spoken. Shorter is better than padded.

# Output

Return ONLY JSON, no prose and no code fence:
{"title": "string", "lines": ["...", "..."]}`;

export interface AuthorShortOptions {
  topic: string;
  targetLines?: number;
  onLog?: (message: string) => void;
}

export async function authorShortScript(
  provider: LlmProvider,
  options: AuthorShortOptions,
): Promise<ShortScript> {
  const { topic, targetLines, onLog } = options;

  const user = `Topic: ${topic}
${targetLines ? `Target: about ${targetLines} lines.` : ""}

Write the narration.`;

  const result = await withRetries(
    () => provider.complete({ system: SHORT_SYSTEM, user, cacheSystem: true, maxOutputTokens: 4_000, temperature: 0.9 }),
    onLog,
  );

  const parsed = shortScriptSchema.safeParse(extractJson(result.text));
  if (!parsed.success) {
    throw new Error(
      `Short script did not match the expected shape: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }

  onLog?.(`  short script: "${parsed.data.title}" — ${parsed.data.lines.length} lines`);
  return parsed.data;
}
