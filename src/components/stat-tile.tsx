export function StatTile({
  label,
  value,
  sublabel,
  tone,
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: "good" | "warning" | "critical";
}) {
  const toneColor = tone === "good" ? "var(--status-good)" : tone === "warning" ? "var(--status-warning)" : tone === "critical" ? "var(--status-critical)" : undefined;
  return (
    <div className="card p-5">
      <div className="text-sm text-[var(--text-secondary)]">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold" style={toneColor ? { color: toneColor } : undefined}>
        {value}
      </div>
      {sublabel && <div className="mt-1 text-xs text-[var(--text-muted)]">{sublabel}</div>}
    </div>
  );
}

export function DataQualityPanel({ issues }: { issues: Array<{ severity: "info" | "warning"; message: string }> }) {
  if (issues.length === 0) {
    return (
      <div className="card flex items-center gap-2 p-4 text-sm" style={{ color: "var(--status-good)" }}>
        <span aria-hidden>●</span> All tracked data is current and complete.
      </div>
    );
  }
  return (
    <div className="card p-4">
      <h2 className="text-sm font-medium text-[var(--text-secondary)]">Data quality</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {issues.map((issue, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span
              aria-hidden
              className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: issue.severity === "warning" ? "var(--status-warning)" : "var(--series-1)" }}
            />
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
