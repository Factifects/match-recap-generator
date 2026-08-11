import type { SceneDiagnostic } from "../../../src/script/sceneDiagnostics";

/** Renders the report validateGeometry.ts + validateScene.ts produce (see
 * POST /parse in server.ts) — the actual "make the invisible visible" half
 * of the fix: these checks already existed in some form before, but nothing
 * ever showed them to a user, so a scene like a floating icon with no
 * connections, or a 20-second scene whose animation finishes in 4, shipped
 * silently. Kept deliberately simple (a list, not a scene-by-scene redesign
 * of Timeline.tsx) — showing the report at all is what closes the loop; a
 * richer per-scene inline treatment is a reasonable follow-up, not required
 * to get real value from this. */
export const SceneDiagnosticsPanel: React.FC<{ diagnostics: SceneDiagnostic[] }> = ({ diagnostics }) => {
  if (diagnostics.length === 0) {
    return <div className="text-[12.5px] text-text-dim">No issues detected.</div>;
  }

  const hardCount = diagnostics.filter((d) => d.severity === "hard").length;

  return (
    <div className="flex flex-col gap-2">
      {hardCount > 0 && (
        <div className="text-[12px] font-bold text-danger">
          {hardCount} issue{hardCount > 1 ? "s" : ""} will block generation until fixed (or Generate is run with force).
        </div>
      )}
      <ul className="flex flex-col gap-1.5">
        {diagnostics.map((d, i) => (
          <li
            key={i}
            className={`text-[12.5px] leading-snug flex gap-2 ${d.severity === "hard" ? "text-danger" : "text-text-dim"}`}
          >
            <span className="shrink-0 font-bold" aria-hidden>
              {d.severity === "hard" ? "✕" : "⚠"}
            </span>
            <span>{d.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
