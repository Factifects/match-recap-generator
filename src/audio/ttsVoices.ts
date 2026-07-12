/** Curated subset of Microsoft Edge's Neural voices — not the full ~400-voice
 * catalog, just a handful of natural-sounding English options worth trying.
 * Shared between the backend (edgeTts.ts's caller) and the frontend voice
 * picker so there's one list to keep in sync, not two. Pure data, no Node
 * imports, so the Vite frontend can import it directly across the
 * public-ui/src root boundary. */
export interface EdgeVoiceOption {
  id: string;
  label: string;
}

export const EDGE_VOICES: EdgeVoiceOption[] = [
  { id: "en-US-GuyNeural", label: "Guy (US Male)" },
  { id: "en-US-AriaNeural", label: "Aria (US Female)" },
  { id: "en-GB-RyanNeural", label: "Ryan (UK Male)" },
  { id: "en-GB-SoniaNeural", label: "Sonia (UK Female)" },
  { id: "en-AU-WilliamNeural", label: "William (Australian Male)" },
];
