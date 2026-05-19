import { loadIndicators } from "@/lib/data";
import { buildPageResult } from "@/lib/composites";
import { zoneColor, getScoreZone } from "@/lib/scoring";
import PageLayout from "@/components/PageLayout";

const INDICATOR_IDS = [
  "yield_curve_10y3m",
  "yield_curve_10y2y",
  "claims_4wma",
  "lei",
  "cfnai_ma3",
  "cfnai",
  "sahm_rule",
  "nahb_index",
  "ny_fed_recession_prob",
  "unemp_longterm",
];

export default function RegimePage() {
  const data = loadIndicators(INDICATOR_IDS);
  const indicators = INDICATOR_IDS.map((id) => data[id] ?? null);
  const page = buildPageResult("regime", indicators);

  const nyFedProb = data["ny_fed_recession_prob"]?.current_value ?? null;
  const probColor = nyFedProb !== null
    ? zoneColor(getScoreZone(nyFedProb > 30 ? -80 : nyFedProb > 15 ? -30 : nyFedProb > 5 ? 0 : 30))
    : "var(--muted)";

  return (
    <PageLayout
      page={page}
      description="Should I be in the market? Tracks recession risk via leading indicators, yield curve, labor market, and probabilistic models."
    >
      {nyFedProb !== null && (
        <div
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            padding: "20px 28px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--muted)",
                marginBottom: 6,
              }}
            >
              12-Month Recession Probability
            </div>
            <div
              style={{
                fontSize: 40,
                fontWeight: 700,
                fontFamily: "var(--font-geist-mono), monospace",
                color: probColor,
                lineHeight: 1,
              }}
            >
              {nyFedProb.toFixed(1)}%
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
              NY Fed model · FRED series RECPROUSM156N
            </div>
          </div>
          <div
            style={{
              flex: 1,
              fontSize: 13,
              color: "var(--muted)",
              lineHeight: 1.7,
              borderLeft: "1px solid var(--border)",
              paddingLeft: 24,
            }}
          >
            {nyFedProb >= 30
              ? "Elevated recession probability. Historically, readings above 30% have preceded NBER-dated recessions within 6–12 months. Consider reducing equity beta."
              : nyFedProb >= 15
              ? "Moderate recession risk. The model signals caution — growth is slowing but a recession is not yet the base case. Monitor yield curve and Sahm Rule."
              : nyFedProb >= 5
              ? "Low recession probability. The model sees contained risk, consistent with mid-expansion conditions."
              : "Very low recession probability. Expansion firmly intact by this model's reading."}
          </div>
        </div>
      )}
    </PageLayout>
  );
}
