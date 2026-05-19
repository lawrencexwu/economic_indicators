import { loadAllIndicators, getLastUpdated } from "@/lib/data";
import { computeScore, getScoreZone, zoneColor, zoneLabel } from "@/lib/scoring";
import {
  buildDashboard,
  generateVerdictParts,
  CYCLE_PHASE_LABELS,
  CYCLE_PHASE_DESCRIPTIONS,
  CYCLE_PHASE_ASSETS,
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
import SparkLine from "@/components/SparkLine";

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
    "hy_credit_spread", "ig_credit_spread", "nfci",
  ],
  fed: [
    "cpi_core", "cpi_headline", "core_pce", "pce_deflator",
    "ppi_final_demand", "ppi_crude_ex_food_energy", "eci",
    "breakeven_5y", "unemployment_rate", "unemployment_u6",
    "labor_force_participation", "avg_hourly_earnings", "fed_funds_rate",
    "tips_real_yield",
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
  const { masterScore, masterZone, cyclePhase, pages, equityBias } = dashboard;
  const verdictParts = generateVerdictParts(masterScore, cyclePhase, pages);

  const allScored: Record<string, ScoredIndicator | null> = {};
  for (const [id, ind] of Object.entries(all)) {
    if (!ind) { allScored[id] = null; continue; }
    const computed_score = computeScore(ind);
    const zone = getScoreZone(computed_score);
    allScored[id] = { ...ind, computed_score, zone };
  }

  const masterColor = zoneColor(masterZone);
  const masterLabel = zoneLabel(masterZone);
  const GLOW_MAP: Record<string, string> = {
    strong_bull: "var(--glow-green)",
    bull:        "var(--glow-green)",
    neutral:     "var(--glow-amber)",
    bear:        "var(--glow-red)",
    strong_bear: "var(--glow-red)",
  };
  const masterGlow = GLOW_MAP[masterZone] ?? "none";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header row: Master Composite + Cycle Phase */}
      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 16 }}>
        {/* Master Composite */}
        <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "24px 32px" }}>
          <span className="label">Master Composite</span>
          <ScoreGauge score={masterScore} size={200} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginTop: -8 }}>
            <span
              style={{
                fontSize: 48,
                fontWeight: 700,
                fontFamily: "var(--font-mono), monospace",
                color: masterColor,
                lineHeight: 1,
                textShadow: masterGlow,
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
            <div style={{ marginTop: 10, width: "100%", maxWidth: 240, textAlign: "center" }}>
              <span className="label" style={{ display: "block", marginBottom: 4, fontSize: 9 }}>
                Indicator Bias
              </span>
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
                  background: `${masterColor}14`,
                  border: `1px solid ${masterColor}33`,
                  marginTop: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: "var(--text)",
                    textAlign: "center",
                  }}
                >
                  {CYCLE_PHASE_LABELS[cyclePhase]}
                </span>
              </div>
              <p style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6, margin: 0, fontWeight: 600, textAlign: "center" }}>
                {CYCLE_PHASE_DESCRIPTIONS[cyclePhase]}
              </p>
              {CYCLE_PHASE_ASSETS[cyclePhase] && (() => {
                const a = CYCLE_PHASE_ASSETS[cyclePhase];
                return (
                  <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12, width: "100%" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--green, #2ecc71)", marginBottom: 6, fontWeight: 700 }}>Favor</div>
                        {a.favor.map(item => <div key={item} style={{ fontSize: 11, color: "var(--text)", lineHeight: 1.6 }}>• {item}</div>)}
                      </div>
                      <div>
                        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--red, #e74c5c)", marginBottom: 6, fontWeight: 700 }}>Avoid</div>
                        {a.avoid.map(item => <div key={item} style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>• {item}</div>)}
                      </div>
                    </div>
                    <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, marginBottom: 0, fontStyle: "italic" }}>{a.theme}</p>
                  </div>
                );
              })()}
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
              textAlign: "right",
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
        <span className="label" style={{ display: "block", marginBottom: 16 }}>Market Verdict</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", marginBottom: 6 }}>
              Cycle Assessment
            </div>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: "var(--text)", margin: 0 }}>
              {verdictParts.assessment}
            </p>
          </div>
          {verdictParts.fedText && (
            <div>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", marginBottom: 6 }}>
                Fed Stance
              </div>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: "var(--text)", margin: 0 }}>
                {verdictParts.fedText}
              </p>
            </div>
          )}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", marginBottom: 6 }}>
              Positioning
            </div>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: masterColor, margin: 0, fontWeight: 600 }}>
              {verdictParts.tilt}
            </p>
          </div>
        </div>
      </div>

      {/* What Changed + Upcoming Releases */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <WhatChangedFeed indicators={allScored} />
        <UpcomingReleases indicators={allScored} />
      </div>

      {/* Quick stats grid — 2 rows of 4 */}
      <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 14 }}>
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
              style={{
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                borderLeft: `3px solid ${color}`,
              }}
            >
              <span className="label">{label}</span>
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  fontFamily: "var(--font-mono), monospace",
                  color,
                  lineHeight: 1,
                }}
              >
                {displayVal}
              </span>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {score !== null && (
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      Score: {score > 0 ? `+${score}` : score}
                    </span>
                  )}
                  {ind?.level_trend_state && (
                    <StateBadge state={ind.level_trend_state} size="sm" />
                  )}
                </div>
                {ind && ind.data.length >= 2 && (
                  <SparkLine
                    data={ind.data.slice(0, 24)}
                    color={color}
                    width={60}
                    height={24}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
