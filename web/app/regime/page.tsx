import { loadIndicators } from "@/lib/data";
import { buildPageResult } from "@/lib/composites";
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

  return (
    <PageLayout
      page={page}
      description="Should I be in the market at all? What is the base rate of recession over the next 12 months?"
    />
  );
}
