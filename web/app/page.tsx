import { loadAllIndicators, getLastUpdated } from "@/lib/data";
import { computeScore, getScoreZone, zoneColor, zoneLabel } from "@/lib/scoring";
import {
  buildDashboard,
  CYCLE_PHASE_LABELS,
  CYCLE_PHASE_DESCRIPTIONS,
  PAGE_IDS,
  PAGE_NAMES,
} from "@/lib/composites";
import ScoreGauge from "@/components/ScoreGauge";
import ScoreBar from "@/components/ScoreBar";
import type { Indicator, ScoredIndicator } from "@/lib/types";
import WhatChangedFeed from "@/components/WhatChangedFeed";
import UpcomingReleases from "@/components/UpcomingReleases";
import StateBadge from "@/components/StateBadge";
import EquityBiasPanel from "@/components/EquityBiasPanel";

const PAGE_HREFS: Record<string, string> = {
  regime: "/regime",
  fed: "/fed",
  pulse: "/pulse",
  cycle: "/cycle",
  rotation: "/rotation",
  fiscal: "/fiscal",
};

const PAGE_INDICATOR_IDS: Record<string, string[]> = {
  regime: [
    "yield_curve_10y3m", "yield_curve_10y2y", "claims_4wma",
    "lei", "cfnai_ma3", "sahm_rule", "nahb_index",
    "ny_fed_recession_prob", "unemp_longterm",
  ],
  fed: [
    "cpi_core", "cpi_headline", "core_pce", "pce_deflator",
    "ppi_final_demand", "ppi_crude_ex_food_energy", "eci",
    "breakeven_5y", "unemployment_rate", "unemployment_u6",
    "labor_force_participation", "avg_hourly_earnings", "fed_funds_rate",
  ],
  pulse: [
    "initial_claims", "continuing_claims", "mba_purchase", "mba_refi",
    "aar_carloads", "ci_loans", "total_loans",
    "empire_state_mfg", "philly_fed_mfg",
    "challenger_layoffs", "cass_freight",
  ],
  cycle: [
    "ism_mfg", "ism_mfg_new_orders", "ism_mfg_production",
    "ism_mfg_employment", "ism_mfg_customer_inv", "ism_mfg_prices_paid",
    "ism_services", "ism_services_new_orders", "ism_services_prices_paid",
    "industrial_production", "capacity_utilization",
    "durable_goods_orders", "core_capex_orders", "durable_goods_ex_transport",
    "factory_orders", "business_inventories", "inventory_sales_ratio",
    "nfib_optimism", "nfp_payrolls", "nfp_temp_help", "avg_weekly_hours_mfg",
    "jolts_openings", "jolts_quits_rate", "gdp_real", "gdp_growth_rate",
  ],
  rotation: [
    "nfp_trucks", "housing_permits_1f", "housing_starts", "housing_starts_1f",
    "existing_home_sales", "new_home_sales", "case_shiller_hpi", "nahb_traffic",
    "retail_sales", "pce", "pce_real_durable",
    "consumer_confidence", "umich_sentiment", "consumer_credit",
  ],
  fiscal: [
    "debt_to_gdp", "interest_to_gdp", "interest_to_receipts",
    "primary_deficit_pct", "fed_balance_to_gdp",
    "tic_foreign_holdings", "dxy_index",
  ],
};

export default function HomePage() {
  const all = loadAllIndicators();
  const lastUpdated = getLastUpdated(all);

  const pageIndicators: Record<string, (Indicator | null)[]> = {};
  for (const pageId of PAGE_IDS) {
    pageIndicators[pageId] = (PAGE_INDICATOR_IDS[pageId] ?? []).map((id) => all[id] ?? null);
  }

  const dashboard = buildDashboard(all, pageIndicators, lastUpdated);
  const { masterScore, masterZone, cyclePhase, pages, verdict, equityBias } = dashboard;

  const allScored: Record<string, ScoredIndicator | null> = {};
  for (const [id, ind] of Object.entries(all)) {
    if (!ind) { allScored[id] = null; continue; }
    const computed_score = computeScore(ind);
    const zone = getScoreZone(computed_score);
    allScored[id] = { ...ind, computed_score, zone };
  }

  const masterColor = zoneColor(masterZone);
  const masterLabel = zoneLabel(masterZone);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header row: Master Composite + Cycle Phase */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Master Composite */}
        <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "24px 32px" }}>
          <span className="label">Master Composite</span>
          <ScoreGauge score={masterScore} size={200} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginTop: -8 }}>
            <span
              style={{
                fontSize: 48,
                fontWeight: 700,
                fontFamily: "var(--font-geist-mono), monospace",
                color: masterColor,
                lineHeight: 1,
              }}
            >
              {masterScore !== null ? (masterScore > 0 ? `+${masterScore}` : String(masterScore)) : "—"}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: masterColor,
                textTransform: "uppercase",
              }}
            >
              {masterLabel}
            </span>
            <div style={{ marginTop: 8, width: "100%", maxWidth: 200 }}>
              <EquityBiasPanel bias={equityBias} />
            </div>
          </div>
        </div>

        {/* Cycle Phase */}
        <div
          className="card"
          style={{ display: "flex", flexDirection: "column", gap: 12, padding: "24px 28px" }}
        >
          <span className="label">Business Cycle Phase</span>
          {cyclePhase ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: 1,
                  padding: "16px",
                  borderRadius: 8,
                  background: "var(--border)",
                  marginTop: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    color: "var(--text)",
                    textAlign: "center",
                  }}
                >
                  {CYCLE_PHASE_LABELS[cyclePhase]}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>
                {CYCLE_PHASE_DESCRIPTIONS[cyclePhase]}
              </p>
            </>
          ) : (
            <span style={{ color: "var(--muted)", fontSize: 14 }}>Insufficient data</span>
          )}
          <div
            style={{
              marginTop: "auto",
              paddingTop: 12,
              borderTop: "1px solid var(--border)",
              fontSize: 11,
              color: "var(--muted)",
            }}
          >
            Updated: {lastUpdated} ET
          </div>
        </div>
      </div>

      {/* Page Scores */}
      <div className="card">
        <span className="label" style={{ display: "block", marginBottom: 12 }}>Page Scores</span>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {PAGE_IDS.map((pageId) => {
            const page = pages[pageId];
            return (
              <ScoreBar
                key={pageId}
                label={PAGE_NAMES[pageId]}
                score={page?.score ?? null}
                href={PAGE_HREFS[pageId]}
                showZoneLabel
              />
            );
          })}
        </div>
      </div>

      {/* Verdict */}
      <div className="card">
        <span className="label" style={{ display: "block", marginBottom: 10 }}>Verdict</span>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text)", margin: 0 }}>
          {verdict}
        </p>
      </div>

      {/* What Changed + Upcoming Releases */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <WhatChangedFeed indicators={allScored} />
        <UpcomingReleases indicators={allScored} />
      </div>

      {/* Quick stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
        {[
          { id: "yield_curve_10y3m", label: "10Y-3M Curve", unit: "%" },
          { id: "claims_4wma", label: "Claims 4wMA", format: (v: number) => `${(v / 1000).toFixed(0)}k` },
          { id: "cfnai_ma3", label: "CFNAI-MA3", format: (v: number) => v.toFixed(2) },
          { id: "sahm_rule", label: "Sahm Rule", format: (v: number) => v.toFixed(2) },
          { id: "ism_mfg", label: "ISM Mfg", format: (v: number) => v.toFixed(1) },
          { id: "ism_services", label: "ISM Services", format: (v: number) => v.toFixed(1) },
          { id: "unemployment_rate", label: "Unemployment", unit: "%" },
          { id: "breakeven_5y", label: "5Y Breakeven", unit: "%" },
        ].map(({ id, label, unit, format }) => {
          const ind = all[id];
          const score = ind ? computeScore(ind) : null;
          const zone = getScoreZone(score);
          const color = zoneColor(zone);
          const v = ind?.current_value;
          const displayVal = v !== null && v !== undefined
            ? format
              ? format(v)
              : unit
              ? `${v.toFixed(2)}${unit}`
              : v.toFixed(1)
            : "—";

          return (
            <div
              key={id}
              className="card"
              style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}
            >
              <span className="label">{label}</span>
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  fontFamily: "var(--font-geist-mono), monospace",
                  color,
                }}
              >
                {displayVal}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {score !== null && (
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>
                    Score: {score > 0 ? `+${score}` : score}
                  </span>
                )}
                {ind?.level_trend_state && (
                  <StateBadge state={ind.level_trend_state} size="sm" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
