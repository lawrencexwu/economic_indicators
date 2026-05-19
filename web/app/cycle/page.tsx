import { loadIndicators } from "@/lib/data";
import { buildPageResult } from "@/lib/composites";
import PageLayout from "@/components/PageLayout";
import ScoreBar from "@/components/ScoreBar";

const CLUSTERS: Record<string, string[]> = {
  "ISM Manufacturing": [
    "ism_mfg", "ism_mfg_new_orders", "ism_mfg_production",
    "ism_mfg_employment", "ism_mfg_customer_inv", "ism_mfg_prices_paid",
  ],
  "ISM Services": ["ism_services", "ism_services_new_orders", "ism_services_prices_paid"],
  "Industrial Activity": ["industrial_production", "capacity_utilization"],
  "Capex & Orders": [
    "durable_goods_orders", "core_capex_orders", "durable_goods_ex_transport", "factory_orders",
  ],
  "Inventories": ["business_inventories", "inventory_sales_ratio"],
  "Small Business": ["nfib_optimism"],
  "Employment": ["nfp_payrolls", "nfp_temp_help", "jolts_openings", "jolts_quits_rate"],
  "GDP": ["gdp_real", "gdp_growth_rate"],
};

const ALL_IDS = Object.values(CLUSTERS).flat();

export default function CyclePage() {
  const data = loadIndicators(ALL_IDS);
  const indicators = ALL_IDS.map((id) => data[id] ?? null);
  const page = buildPageResult("cycle", indicators);

  const clusterScores = Object.entries(CLUSTERS).map(([name, ids]) => {
    const result = buildPageResult(`cluster_${name}`, ids.map((id) => data[id] ?? null));
    return { name, score: result.score };
  });

  return (
    <PageLayout
      page={page}
      description="Where are we in the economic cycle? Is the 'E' in P/E growing or shrinking?"
    >
      <div className="card">
        <span className="label" style={{ display: "block", marginBottom: 12 }}>By Category</span>
        {clusterScores.map(({ name, score }) => (
          <ScoreBar key={name} label={name} score={score} showZoneLabel />
        ))}
      </div>
    </PageLayout>
  );
}
