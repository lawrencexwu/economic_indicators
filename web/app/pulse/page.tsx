import { loadIndicators } from "@/lib/data";
import { buildPageResult } from "@/lib/composites";
import PageLayout from "@/components/PageLayout";
import ScoreBar from "@/components/ScoreBar";
import { zoneColor, getScoreZone } from "@/lib/scoring";

const CLUSTERS: Record<string, string[]> = {
  "Weekly Labor (Thu 8:30)": ["initial_claims", "continuing_claims"],
  "Weekly Housing (Wed 7:00)": ["mba_purchase", "mba_refi"],
  "Weekly Rail (Wed)": ["aar_carloads"],
  "Weekly Bank Credit (Fri 16:15)": ["ci_loans", "total_loans"],
  "Regional Fed Manufacturing": ["empire_state_mfg", "philly_fed_mfg", "richmond_fed_mfg", "kc_fed_mfg", "dallas_fed_mfg"],
  "Other Monthly": ["challenger_layoffs", "cass_freight"],
};

const ALL_IDS = Object.values(CLUSTERS).flat();

export default function PulsePage() {
  const data = loadIndicators(ALL_IDS);
  const indicators = ALL_IDS.map((id) => data[id] ?? null);
  const page = buildPageResult("pulse", indicators);

  const clusterScores = Object.entries(CLUSTERS).map(([name, ids]) => {
    const result = buildPageResult(`cluster_${name}`, ids.map((id) => data[id] ?? null));
    return { name, score: result.score };
  });

  // 5-Fed ISM Mfg Nowcast
  const fedIds = ["empire_state_mfg", "philly_fed_mfg", "richmond_fed_mfg", "kc_fed_mfg", "dallas_fed_mfg"];
  const fedVals = fedIds.map(id => data[id]?.current_value).filter((v): v is number => v !== null && v !== undefined);
  const composite = fedVals.length > 0 ? fedVals.reduce((a, b) => a + b, 0) / fedVals.length : null;
  const ismNowcast = composite !== null ? Math.max(38, Math.min(62, 50 + composite * 0.35)) : null;
  const ismScore = ismNowcast !== null ? (ismNowcast > 52 ? 30 : ismNowcast < 48 ? -30 : 0) : null;
  const ismColor = zoneColor(getScoreZone(ismScore));

  return (
    <PageLayout
      page={page}
      description="What is happening this week? Real-time confirmation or divergence vs. slower monthly indicators."
    >
      {/* 5-Fed ISM Nowcast */}
      {ismNowcast !== null && (
        <div className="card" style={{ borderLeft: `3px solid ${ismColor}`, padding: "12px 16px" }}>
          <span className="label">5-Fed ISM Mfg Nowcast</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 36, fontWeight: 700, fontFamily: "var(--font-mono), monospace", color: ismColor }}>
              {ismNowcast.toFixed(1)}
            </span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              est. ({fedVals.length}/5 Feds available)
            </span>
          </div>
          <span style={{ fontSize: 11, color: "var(--muted)", display: "block", marginTop: 4 }}>
            Regional composite avg: {composite !== null ? (composite > 0 ? "+" : "") + composite.toFixed(1) : "—"} · {ismNowcast > 50 ? "Expansion" : "Contraction"} signal
          </span>
        </div>
      )}

      <div className="card">
        <span className="label" style={{ display: "block", marginBottom: 12 }}>By Frequency / Source</span>
        {clusterScores.map(({ name, score }) => (
          <ScoreBar key={name} label={name} score={score} showZoneLabel />
        ))}
      </div>
    </PageLayout>
  );
}
