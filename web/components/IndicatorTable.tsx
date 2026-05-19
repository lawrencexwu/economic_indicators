import type { ScoredIndicator } from "@/lib/types";
import { zoneColor, formatValue } from "@/lib/scoring";
import SparkLine from "./SparkLine";

interface Props {
  indicators: ScoredIndicator[];
  showSparkline?: boolean;
}

export default function IndicatorTable({ indicators, showSparkline = true }: Props) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {["Indicator", "Value", "Score", "Wt", ...(showSparkline ? ["Trend"] : [])].map((h) => (
              <th
                key={h}
                style={{
                  padding: "6px 10px",
                  textAlign: "left",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {indicators.map((ind) => {
            const score = ind.computed_score;
            const color = zoneColor(ind.zone);
            return (
              <tr
                key={ind.id}
                style={{ borderBottom: "1px solid var(--border)", lineHeight: 1.4 }}
              >
                {/* Name */}
                <td style={{ padding: "8px 10px", color: "var(--text)", maxWidth: 240 }}>
                  <div style={{ fontWeight: 500 }}>{ind.name}</div>
                  {ind.metadata?.what_it_measures && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--muted)",
                        marginTop: 2,
                        maxWidth: 240,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {ind.metadata.what_it_measures.replace(/\s+/g, " ").trim().slice(0, 100)}
                    </div>
                  )}
                </td>
                {/* Value */}
                <td
                  style={{
                    padding: "8px 10px",
                    fontFamily: "var(--font-geist-mono), monospace",
                    color: "var(--text)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatValue(ind)}
                </td>
                {/* Score */}
                <td
                  style={{
                    padding: "8px 10px",
                    fontFamily: "var(--font-geist-mono), monospace",
                    color: score !== null ? color : "var(--muted)",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {score !== null ? (score > 0 ? `+${score}` : String(score)) : "—"}
                </td>
                {/* Weight */}
                <td
                  style={{
                    padding: "8px 10px",
                    color: "var(--muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  ×{ind.weight}
                </td>
                {/* Sparkline */}
                {showSparkline && (
                  <td style={{ padding: "4px 10px" }}>
                    <SparkLine
                      data={ind.data.slice(0, 24)}
                      color={score !== null ? color : "var(--muted)"}
                      width={100}
                      height={32}
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
