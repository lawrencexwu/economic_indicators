import type { EquityBiasBreakdown } from "@/lib/types";

interface Props {
  bias: EquityBiasBreakdown;
  compact?: boolean;
}

const SIGNAL_COLORS: Record<string, string> = {
  BULL: "#4ade80",
  NEUTRAL: "#f5a623",
  BEAR: "#f87171",
};

const SIGNAL_LABELS: Record<string, string> = {
  BULL: "Bullish",
  NEUTRAL: "Neutral",
  BEAR: "Bearish",
};

export default function EquityBiasPanel({ bias, compact = false }: Props) {
  const { bull, neutral, bear, total, signal, pctBull, pctBear } = bias;
  if (total === 0) return null;

  const pctNeutral = 100 - pctBull - pctBear;
  const color = SIGNAL_COLORS[signal];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexDirection: compact ? "row" : "column",
        gap: compact ? 12 : 8,
      }}
    >
      {/* Signal badge */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: compact ? "2px 8px" : "3px 10px",
          borderRadius: 4,
          border: `1px solid ${color}40`,
          background: `${color}12`,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: compact ? 10 : 11,
            fontWeight: 700,
            color,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontFamily: "var(--font-geist-mono), monospace",
          }}
        >
          {SIGNAL_LABELS[signal]}
        </span>
      </div>

      {/* Breakdown bar */}
      <div style={{ flex: 1, minWidth: compact ? 80 : "auto", width: compact ? undefined : "100%" }}>
        {/* Stacked bar */}
        <div
          style={{
            display: "flex",
            height: compact ? 6 : 8,
            borderRadius: 3,
            overflow: "hidden",
            gap: 1,
          }}
        >
          {pctBull > 0 && (
            <div
              style={{ flex: pctBull, background: "#4ade80", minWidth: 2 }}
              title={`Bull: ${bull}`}
            />
          )}
          {pctNeutral > 0 && (
            <div
              style={{ flex: pctNeutral, background: "#6b7280", minWidth: 2 }}
              title={`Neutral: ${neutral}`}
            />
          )}
          {pctBear > 0 && (
            <div
              style={{ flex: pctBear, background: "#f87171", minWidth: 2 }}
              title={`Bear: ${bear}`}
            />
          )}
        </div>

        {/* Count labels */}
        {!compact && (
          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 4,
              fontSize: 10,
              color: "var(--muted)",
              fontFamily: "var(--font-geist-mono), monospace",
            }}
          >
            <span style={{ color: "#4ade80" }}>{bull} Bullish</span>
            <span>{neutral} Neutral</span>
            <span style={{ color: "#f87171" }}>{bear} Bearish</span>
          </div>
        )}
      </div>
    </div>
  );
}
