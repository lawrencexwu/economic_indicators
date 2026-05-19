import { zoneColor, zoneLabel } from "@/lib/scoring";
import type { PageResult } from "@/lib/types";
import IndicatorTable from "./IndicatorTable";
import EquityBiasPanel from "./EquityBiasPanel";

interface Props {
  page: PageResult;
  description?: string;
  children?: React.ReactNode;
}

export default function PageLayout({ page, description, children }: Props) {
  const color = zoneColor(page.zone);
  const score = page.score;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Page header */}
      <div
        className="card"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px" }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "var(--text)" }}>
            {page.name}
          </h1>
          {description && (
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 0", lineHeight: 1.5 }}>
              {description}
            </p>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 24 }}>
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              fontFamily: "var(--font-geist-mono), monospace",
              color,
              lineHeight: 1,
            }}
          >
            {score !== null ? (score > 0 ? `+${score}` : String(score)) : "—"}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color, marginTop: 2 }}>
            {zoneLabel(page.zone)}
          </div>
          <div style={{ marginTop: 8 }}>
            <EquityBiasPanel bias={page.equityBias} compact />
          </div>
        </div>
      </div>

      {/* Optional extra content (clusters, etc.) */}
      {children}

      {/* Indicator table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <span className="label">Indicators</span>
        </div>
        <IndicatorTable indicators={page.indicators} />
      </div>
    </div>
  );
}
