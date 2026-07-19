import type { FORMATION_NAMES } from "../model/Segment";

export type FormationName = (typeof FORMATION_NAMES)[number];

// Position slots in canonical GK -> DEF -> MID -> FWD order, in the 0-100
// pitch coordinate space, attacking left-to-right (higher x = more advanced).
// Home team renders as-is; away team mirrors x (100 - x) in Formation.tsx.
// `role` is a short FM-style position code (rendered inside each pod in
// Formation.tsx) — a reasonable default for the shape, overridable per
// player via formationPlayerSchema's optional `role` field.
export const FORMATION_TEMPLATES: Record<FormationName, { x: number; y: number; role: string }[]> = {
  "4-3-3": [
    { x: 5, y: 50, role: "GK" },
    { x: 20, y: 15, role: "DR" }, { x: 20, y: 38, role: "CD" }, { x: 20, y: 62, role: "CD" }, { x: 20, y: 85, role: "DL" },
    { x: 45, y: 30, role: "CM" }, { x: 45, y: 50, role: "DM" }, { x: 45, y: 70, role: "CM" },
    { x: 75, y: 20, role: "IF" }, { x: 80, y: 50, role: "TF" }, { x: 75, y: 80, role: "IF" },
  ],
  "4-2-3-1": [
    { x: 5, y: 50, role: "GK" },
    { x: 20, y: 15, role: "DR" }, { x: 20, y: 38, role: "CD" }, { x: 20, y: 62, role: "CD" }, { x: 20, y: 85, role: "DL" },
    { x: 38, y: 35, role: "DM" }, { x: 38, y: 65, role: "DM" },
    { x: 60, y: 20, role: "IF" }, { x: 60, y: 50, role: "AM" }, { x: 60, y: 80, role: "IF" },
    { x: 85, y: 50, role: "TF" },
  ],
  "3-4-2-1": [
    { x: 5, y: 50, role: "GK" },
    { x: 20, y: 25, role: "CD" }, { x: 20, y: 50, role: "CD" }, { x: 20, y: 75, role: "CD" },
    { x: 45, y: 12, role: "WB" }, { x: 45, y: 38, role: "CM" }, { x: 45, y: 62, role: "CM" }, { x: 45, y: 88, role: "WB" },
    { x: 65, y: 35, role: "AM" }, { x: 65, y: 65, role: "AM" },
    { x: 85, y: 50, role: "TF" },
  ],
  "5-4-1": [
    { x: 5, y: 50, role: "GK" },
    { x: 20, y: 10, role: "WB" }, { x: 20, y: 30, role: "CD" }, { x: 20, y: 50, role: "CD" }, { x: 20, y: 70, role: "CD" }, { x: 20, y: 90, role: "WB" },
    { x: 50, y: 15, role: "CM" }, { x: 50, y: 40, role: "CM" }, { x: 50, y: 60, role: "CM" }, { x: 50, y: 85, role: "CM" },
    { x: 85, y: 50, role: "TF" },
  ],
  "4-4-2": [
    { x: 5, y: 50, role: "GK" },
    { x: 20, y: 15, role: "DR" }, { x: 20, y: 38, role: "CD" }, { x: 20, y: 62, role: "CD" }, { x: 20, y: 85, role: "DL" },
    { x: 50, y: 15, role: "MR" }, { x: 50, y: 38, role: "CM" }, { x: 50, y: 62, role: "CM" }, { x: 50, y: 85, role: "ML" },
    { x: 80, y: 35, role: "TF" }, { x: 80, y: 65, role: "TF" },
  ],
};
