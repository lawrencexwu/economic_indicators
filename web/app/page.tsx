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
  PAGE_INDICATOR_IDS,
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
  const GLOW_MAP: Record<string, string> = {
    strong_bull: "var(--glow-green)",
    bull:        "var(--glow-green)",
    neutral:     "var(--glow-amber)",
    bear:        "var(--glow-red)",
    strong_bear: "var(--glow-red)",
  };
  const masterGlow = GLOW_MAP[masterZone] ?? "none";

  // Page-level bull/bear split
  const pageValues = Object.values(pages);
  const pageBull = pageValues.filter(p => p.score !== null && p.score >= 20).length;
  const pageBear = pageValues.filter(p => p.score !== null && p.score <= -20).length;
  const pageNeutral = pageValues.filter(p => p.score !== null && p.score > -20 && p.score < 20).length;

  // Key Risk: most bearish high-weight indicator
  const keyRisk = Object.values(allScored)
    .filter((ind): ind is ScoredIndicator =>
      !!ind && ind.computed_score !== null && (ind.weight ?? 1) >= 2 && ind.computed_score < 0
    )
    .sort((a, b) => (a.computed_score ?? 0) - (b.computed_score ?? 0))[0] ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Key Risk banner */}
      {keyRisk && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 20px",
            borderRadius: 8,
            border: "1px solid rgba(231,76,92,0.35)",
            background: "rgba(231,76,92,0.06)",
            borderLeft: "4px solid #e74c5c",
          }}
        >
          <span style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
          <span
            style={{
              fontSize: 10,
              color: "#e74c5c",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            Key Risk
          </span>
          <span style={{ flex: 1, fontSize: 14, color: "var(--text)", fontWeight: 500 }}>
            {keyRisk.name}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: 20,
              fontWeight: 700,
              color: "#e74c5c",
              flexShrink: 0,
            }}
          >
            {keyRisk.computed_score}
          </span>
        </div>
      )}

      {/* Header row: Master Composite + Cycle Phase */}
      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 16 }}>
        {/* Master Composite */}
        <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "24px 32px" }}>
          <span className="label">Master Composite</span>
          <ScoreGauge score={masterScore} size={200} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginTop: -8 }}>
            {/* Page-level bull/bear split instead of single score */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 22, fontWeight: 700, color: "#2ecc71" }}>
                {pageBull}↑
              </span>
              <span style={{ fontSize: 16, color: "var(--muted)" }}>·</span>
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 22, fontWeight: 700, color: "#f5a623" }}>
                {pageNeutral}≈
              </span>
              <span style={{ fontSize: 16, color: "var(--muted)" }}>·</span>
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 22, fontWeight: 700, color: "#e74c5c" }}>
                {pageBear}↓
              </span>
            </div>
            <span style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Bull · Neutral · Bear pages
            </span>
            <div style={{ marginTop: 6, width: "100%", maxWidth: 240, textAlign: "center" }}>
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
                        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#2ecc71", marginBottom: 6, fontWeight: 700 }}>Favor</div>
                        {a.favor.map(item => <div key={item} style={{ fontSize: 11, color: "var(--text)", lineHeight: 1.6 }}>• {item}</div>)}
                      </div>
                      <div>
                        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#e74c5c", marginBottom: 6, fontWeight: 700 }}>Avoid</div>
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
        </div>
      </div>

      {/* Positioning Tilt — prominent standalone card */}
      {verdictParts.tilt && (
        <div
          className="card"
          style={{
            padding: "20px 24px",
            borderLeft: `4px solid ${masterColor}`,
            background: `${masterColor}0d`,
          }}
        >
          <span className="label" style={{ display: "block", marginBottom: 10 }}>Positioning Tilt</span>
          <p
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: masterColor,
              margin: 0,
              lineHeight: 1.4,
              textShadow: masterGlow,
            }}
          >
            {verdictParts.tilt}
          </p>
        </div>
      )}

      {/* What Changed + Upcoming Releases */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <WhatChangedFeed indicators={allScored} />
        <UpcomingReleases indicators={allScored} />
      </div>

      {/* Quick stats grid — 2 rows of 4, with momentum arrows */}
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
          const prev = ind?.previous_value;
          const displayVal = v !== null && v !== undefined
            ? format
              ? format(v)
              : unit
              ? `${v.toFixed(2)}${unit}`
              : v.toFixed(1)
            : "—";
          const arrow =
            v !== null && v !== undefined && prev !== null && prev !== undefined
              ? v > prev ? "▲" : v < prev ? "▼" : null
              : null;

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
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
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
                {arrow && (
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color,
                      opacity: 0.85,
                    }}
                  >
                    {arrow}
                  </span>
                )}
              </div>
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
