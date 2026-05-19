"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import type { ScoredIndicator } from "@/lib/types";
import { zoneColor } from "@/lib/scoring";

interface Props {
  ind: ScoredIndicator;
  height?: number;
}

// [threshold value, shadedBelow]
// shadedBelow=true  → fill area BELOW threshold red (bad low values)
// shadedBelow=false → fill area ABOVE threshold red (bad high values)
const CHART_THRESHOLDS: Record<string, [number, boolean]> = {
  ism_mfg:             [50, true],
  ism_mfg_new_orders:  [50, true],
  ism_mfg_production:  [50, true],
  ism_mfg_employment:  [50, true],
  ism_services:        [50, true],
  ism_services_new_orders: [50, true],
  nahb_index:          [50, true],
  nahb_traffic:        [50, true],
  yield_curve_10y3m:   [0,  true],
  yield_curve_10y2y:   [0,  true],
  sahm_rule:           [0.5, false],
  cfnai_ma3:           [0,  true],
  ny_fed_recession_prob: [30, false],
};

export default function DetailChart({ ind, height = 160 }: Props) {
  const data = ind.data.slice(0, 60).reverse();
  const color = zoneColor(ind.zone);
  const tier = CHART_THRESHOLDS[ind.id];

  const formatXTick = (dateStr: string) => {
    return String(new Date(dateStr).getFullYear());
  };

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickFormatter={formatXTick}
            tick={{ fontSize: 9, fill: "var(--muted)" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 9, fill: "var(--muted)" }}
            tickLine={false}
            axisLine={false}
            tickCount={4}
            width={36}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              fontSize: 11,
            }}
            labelStyle={{ color: "var(--muted)", fontSize: 9 }}
            itemStyle={{ color }}
            formatter={(value) => {
              if (typeof value === "number") {
                return [value.toFixed(2), ind.name];
              }
              return value;
            }}
            labelFormatter={(label) =>
              new Date(label as string).toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              })
            }
          />
          {tier && (
            <>
              <ReferenceArea
                y1={tier[1] ? undefined : tier[0]}
                y2={tier[1] ? tier[0] : undefined}
                fill="#e74c5c"
                fillOpacity={0.06}
              />
              <ReferenceLine
                y={tier[0]}
                stroke="#5b9cf5"
                strokeDasharray="5 4"
                strokeOpacity={0.7}
                label={{ value: String(tier[0]), fill: "#5b9cf5", fontSize: 9, position: "left" }}
              />
            </>
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: color }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
