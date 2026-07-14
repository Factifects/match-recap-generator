import type { ICON_KEYS } from "../model/Segment";

export type IconKey = (typeof ICON_KEYS)[number];

// Simple line-icon glyphs, 48x48 viewBox, stroke-only so the draw-in animation
// (stroke-dasharray) reads cleanly. Deliberately minimal shapes, not detailed
// illustrations — consistent with the rest of the video's flat broadcast style.
export const ICON_PATHS: Record<IconKey, string> = {
  goal: "M6 10h36v28H6z M6 18h36 M6 26h36 M14 10v28 M22 10v28 M30 10v28",
  card: "M10 6h20a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z",
  save: "M24 4 L42 12 V24 C42 34 34 42 24 44 C14 42 6 34 6 24 V12 Z M16 24 L21 29 L32 18",
  whistle: "M6 20a10 10 0 1 0 20 0 10 10 0 1 0-20 0z M26 20h14v8h-8z M16 20v0",
  clock: "M24 4a20 20 0 1 0 0.1 0z M24 12v12l9 6",
  star: "M24 3 L29.5 18 L45 18 L32.5 27.5 L37.5 43 L24 33.5 L10.5 43 L15.5 27.5 L3 18 L18.5 18 Z",
  assist: "M6 30 C16 8 32 8 42 20 M42 20 L30 20 M42 20 L42 32",
  sub: "M14 6 L14 30 M14 6 L7 13 M14 6 L21 13 M34 42 L34 18 M34 42 L27 35 M34 42 L41 35",
  // Added for memorabilia/collectible content (limited-edition merchandise,
  // pieces of the pitch, tickets) — the original 8 icons above are all
  // football-ACTION glyphs (a goal, a card, a save), so this content had
  // nothing to reach for except the generic "star" for every single item.
  trophy: "M14 6h20v8c0 9-5 16-10 16s-10-7-10-16z M14 10c-5 0-8 3-8 7s3 7 8 7 M34 10c5 0 8 3 8 7s-3 7-8 7 M24 30v6 M16 40h16 M18 36h12v4h-12z",
  ticket: "M8 8h32a2 2 0 0 1 2 2v28a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z M8 24a4 4 0 0 0 0-8 M28 12v6 M28 22v6 M28 32v6",
  grass: "M10 42V24c0-6 4-10 4-16 M18 42V20c0-8 3-12 3-18 M24 42V22c0-7 4-11 4-17 M30 42V20c0-8 3-12 3-18 M38 42V24c0-6 4-10 4-16",
  case: "M8 16h28v22H8z M8 16l6-8h28l-6 8z M36 16l6-8v22l-6 8z",
};

// Keyword -> icon, checked in order (first match wins). Deliberately narrow
// patterns so a mismatch (showing "goal" on a sentence that isn't about a goal)
// is rare — a sentence that matches nothing gets the generic motif instead of a
// wrong icon.
const ICON_KEYWORDS: [RegExp, IconKey][] = [
  [/\bgoals?\b|\bscored\b|\bscoring\b|\bstrike\b|\bfinish(ed)?\b|\bnet\b/i, "goal"],
  [/\bcard(s|ed)?\b|\bbook(ed|ing)?\b|\byellow\b|\bred card\b/i, "card"],
  [/\bsave(d|s)?\b|\bsmother(ed)?\b|\bdenied\b|\bkeeper\b|\bgoalkeeper\b/i, "save"],
  [/\bwhistle\b|\breferee\b|\bvar\b|\breview\b|\bpenalty\b/i, "whistle"],
  [/\bminute\b|\bhalftime\b|\bhalf-time\b|\bclock\b|\blate\b|\bhour mark\b/i, "clock"],
  [/\bmasterclass\b|\bbrilliant(ce)?\b|\belite\b|\bgolden boot\b|\bmagnificent\b/i, "star"],
  [/\bassist(ed)?\b|\blaid it back\b|\bsquared\b|\bset up\b|\bteed up\b/i, "assist"],
  [/\bsubstitut(e|ed|ion)\b|\bbrought on\b|\breplaced\b/i, "sub"],
  [/\btrophy\b|\btrophies\b|\bchampions?\b|\btitle-winning\b/i, "trophy"],
  [/\bticket(s)?\b/i, "ticket"],
  [/\bturf\b|\bthe grass\b/i, "grass"],
  [/\bdisplay case\b|\bresin case\b|\bcollector'?s case\b/i, "case"],
];

export function matchIconForText(text: string): IconKey | null {
  for (const [pattern, icon] of ICON_KEYWORDS) {
    if (pattern.test(text)) return icon;
  }
  return null;
}
