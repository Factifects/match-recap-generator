import React from "react";

/** Shared backdrop. The HUD-style corner brackets that used to draw in here
 * were removed 2026-08-10: on a technical diagram they read as broadcast
 * decoration competing with the content, and they framed every scene
 * identically regardless of what it was showing. Kept as a component so every
 * card's `SceneFrame` wiring stays unchanged and a real backdrop can be
 * reintroduced here later without touching 16 call sites. */
export const MotionBackdrop: React.FC = () => null;
