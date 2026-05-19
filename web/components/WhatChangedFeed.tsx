import type { ScoredIndicator } from "@/lib/types";
import { computeScore, getScoreZone, zoneColor } from "@/lib/scoring";

interface Props {
  indicators: Record<string, ScoredIndicator | null>;
}

interface ChangedItem {
  ind: ScoredIndicator;
  currentScore: number;
  previousScore: number;
  delta: number;
}

function relativeTime(dateStr: string | undefined): string {
  if (!dateStr) return "";
  const diff = Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff <= 7) return `${diff}d ago`;
  return `${Math.round(diff / 7)}w ago`;
}

export default function WhatChangedFeed({ indicators }: Props) {
  const changed: ChangedItem[] = [];

  for (const ind of Object.values(indicators)) {
    if (!ind || ind.previous_value === null || ind.data.length < 2) continue;
    const currentScore = computeScore(ind);
    const prevInd = { ...ind, current_value: ind.previous_value, data: ind.data.slice(1) };
    const previousScore = computeScore(prevInd);
    if (currentScore === null || previousScore === null) continue;
    const delta = currentScore - previousScore;
    if (Math.abs(delta) > 10) {
      changed.push({ ind, currentScore, previousScore, delta });
    }
  }

  changed.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const rows = changed.slice(0, 6);

  return (
    <div className="card">
      <span className="label" style={{ display: "block", marginBottom: 10 }}>
        What Changed
      </span>
      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
          No significant moves since last release.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map(({ ind, currentScore, previousScore, delta }) => {
            const color = zoneColor(getScoreZone(currentScore));
            const arrow = delta > 0 ? "↑" : "↓";
            const when = relativeTime(ind.data[0]?.date);
            return (
              <div
                key={ind.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 14,
                  padding: "7px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ color, fontSize: 16, width: 16, flexShrink: 0 }}>{arrow}</span>
                <span
                  style={{
                    flex: 1,
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {ind.name}
                </span>
                {when && (
                  <span style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {when}
                  </span>
                )}
                <span
                  style={{
                    fontFamily: "var(--font-mono), monospace",
                    color: "var(--muted)",
                    fontSize: 12,
                    whiteSpace: "nowrap",
                  }}
                >
                  {previousScore > 0 ? `+${previousScore}` : previousScore}
                  {" → "}
                  {currentScore > 0 ? `+${currentScore}` : currentScore}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono), monospace",
                    color,
                    fontWeight: 700,
                    fontSize: 14,
                    whiteSpace: "nowrap",
                    minWidth: 40,
                    textAlign: "right",
                  }}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
