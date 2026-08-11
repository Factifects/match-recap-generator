// The shared report shape both validateGeometry.ts (overlap/connectivity
// checks) and validateScene.ts (dead-time/richness/contract-realization
// checks) emit into — a plain string warning has no severity and no level,
// which is exactly what let the reverse-proxy Scene 1 problem go unnoticed:
// a warning nobody's UI ever showed, with no way to say "this one should
// actually block the render." Split into its own file (not declared in
// either producer) so validateGeometry.ts and validateScene.ts can both
// import it without one having to import the other.

/** Which of the five quality levels a finding belongs to — see the
 * architecture assessment memory (project_video_engine_architecture_assessment)
 * for the full table. Level 5 (educational effectiveness) has no automated
 * check; the mute test stays human. */
export type DiagnosticLevel =
  | 1 // technical validity — geometry/overlap
  | 2 // visual quality — composition (density, orphan labels, primary size)
  | 3 // animation richness — explanatory motion vs decorative/entrance-only
  | 4; // semantic fidelity — does authored Data realize the declared contract

/** "hard" aborts `generateVideo` before any audio/render cost is spent
 * (overridable with --force); "soft" is reported everywhere but never
 * blocks. See generate.ts's enforcement wiring. */
export type DiagnosticSeverity = "hard" | "soft";

export interface SceneDiagnostic {
  /** 0-based index into the segments array — matches array position, not
   * the original script's `### SCENE N` numbering (a merged Canvas/
   * TacticalBoard continuity passage collapses several script scenes into
   * one segment; this indexes what will actually render). */
  sceneIndex: number;
  /** 1-based, human-facing — "Scene 3". */
  sceneLabel: string;
  level: DiagnosticLevel;
  severity: DiagnosticSeverity;
  /** Short kebab-case slug — "overlap" | "unconnected-entities" |
   * "low-density" | "dead-time" | "low-richness" | "contract-unrealized" |
   * "orphan-label" | "primary-size" | "no-contract-declared". */
  category: string;
  message: string;
}

export function sceneLabelFor(sceneIndex: number): string {
  return `Scene ${sceneIndex + 1}`;
}

export function diagnostic(
  sceneIndex: number,
  level: DiagnosticLevel,
  severity: DiagnosticSeverity,
  category: string,
  message: string,
): SceneDiagnostic {
  return { sceneIndex, sceneLabel: sceneLabelFor(sceneIndex), level, severity, category, message };
}

/** True when anything in the report should stop `generateVideo` before it
 * spends real audio/render cost — see generate.ts's enforcement wiring and
 * its `--force`/`force: true` override. */
export function hasHardFailures(diagnostics: SceneDiagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "hard");
}

/** Stable read order for a combined report: by scene, then hard before
 * soft within a scene (the failures that actually matter for enforcement
 * surface first). */
export function sortDiagnostics(diagnostics: SceneDiagnostic[]): SceneDiagnostic[] {
  return [...diagnostics].sort((a, b) => a.sceneIndex - b.sceneIndex || (a.severity === b.severity ? 0 : a.severity === "hard" ? -1 : 1));
}
