// Words-per-minute for a clear, deliberate narration read — deliberately on the
// slower/safer side (typical conversational speech is 150-160 wpm; sports
// commentary/analysis tends to be a bit more measured) so estimated on-screen time
// doesn't undershoot what a real voiceover will need.
const WORDS_PER_MINUTE = 140;
const MIN_SECONDS = 1.5;
const CHAPTER_MIN_SECONDS = 2.5; // chapter cards are brief but shouldn't flash by

export function estimateDurationSeconds(text: string, type: "chapter" | "statement"): number {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const estimated = (wordCount / WORDS_PER_MINUTE) * 60;
  const floor = type === "chapter" ? CHAPTER_MIN_SECONDS : MIN_SECONDS;
  return Math.max(floor, estimated);
}
