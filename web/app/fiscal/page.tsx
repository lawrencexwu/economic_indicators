import { loadIndicators } from "@/lib/data";
import { buildPageResult } from "@/lib/composites";
import PageLayout from "@/components/PageLayout";

const INDICATOR_IDS = [
  "debt_to_gdp",
  "interest_to_gdp",
  "interest_to_receipts",
  "primary_deficit_pct",
  "fed_balance_to_gdp",
  "tic_foreign_holdings",
  "dxy_index",
];

export default function FiscalPage() {
  const data = loadIndicators(INDICATOR_IDS);
  const indicators = INDICATOR_IDS.map((id) => data[id] ?? null);
  const page = buildPageResult("fiscal", indicators);

  return (
    <PageLayout
      page={page}
      description="Is fiscal dominance crowding out monetary policy? Are debt dynamics sustainable? What is dollar stress signaling?"
    />
  );
}
