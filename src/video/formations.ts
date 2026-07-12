import type { FORMATION_NAMES } from "../model/Segment";

export type FormationName = (typeof FORMATION_NAMES)[number];

// Position slots in canonical GK -> DEF -> MID -> FWD order, in the 0-100
// pitch coordinate space, attacking left-to-right (higher x = more advanced).
// Home team renders as-is; away team mirrors x (100 - x) in Formation.tsx.
export const FORMATION_TEMPLATES: Record<FormationName, { x: number; y: number }[]> = {
  "4-3-3": [
    { x: 5, y: 50 },
    { x: 20, y: 15 }, { x: 20, y: 38 }, { x: 20, y: 62 }, { x: 20, y: 85 },
    { x: 45, y: 30 }, { x: 45, y: 50 }, { x: 45, y: 70 },
    { x: 75, y: 20 }, { x: 80, y: 50 }, { x: 75, y: 80 },
  ],
  "4-2-3-1": [
    { x: 5, y: 50 },
    { x: 20, y: 15 }, { x: 20, y: 38 }, { x: 20, y: 62 }, { x: 20, y: 85 },
    { x: 38, y: 35 }, { x: 38, y: 65 },
    { x: 60, y: 20 }, { x: 60, y: 50 }, { x: 60, y: 80 },
    { x: 85, y: 50 },
  ],
  "3-4-2-1": [
    { x: 5, y: 50 },
    { x: 20, y: 25 }, { x: 20, y: 50 }, { x: 20, y: 75 },
    { x: 45, y: 12 }, { x: 45, y: 38 }, { x: 45, y: 62 }, { x: 45, y: 88 },
    { x: 65, y: 35 }, { x: 65, y: 65 },
    { x: 85, y: 50 },
  ],
  "5-4-1": [
    { x: 5, y: 50 },
    { x: 20, y: 10 }, { x: 20, y: 30 }, { x: 20, y: 50 }, { x: 20, y: 70 }, { x: 20, y: 90 },
    { x: 50, y: 15 }, { x: 50, y: 40 }, { x: 50, y: 60 }, { x: 50, y: 85 },
    { x: 85, y: 50 },
  ],
  "4-4-2": [
    { x: 5, y: 50 },
    { x: 20, y: 15 }, { x: 20, y: 38 }, { x: 20, y: 62 }, { x: 20, y: 85 },
    { x: 50, y: 15 }, { x: 50, y: 38 }, { x: 50, y: 62 }, { x: 50, y: 85 },
    { x: 80, y: 35 }, { x: 80, y: 65 },
  ],
};
