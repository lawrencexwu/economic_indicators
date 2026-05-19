"use client";

import { LineChart, Line, ResponsiveContainer, ReferenceLine, Tooltip } from "recharts";
import type { DataPoint } from "@/lib/types";

interface Props {
  data: DataPoint[];
  color?: string;
  referenceValue?: number;
  width?: number;
  height?: number;
}

export default function SparkLine({
  data,
  color = "#5b9cf5",
  referenceValue,
  width = 120,
  height = 36,
}: Props) {
  if (!data || data.length < 2) return <span style={{ color: "var(--muted)", fontSize: 11 }}>—</span>;

  // Recharts needs newest-last order
  const chartData = [...data].reverse().map((d) => ({ date: d.date, v: d.value }));

  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        {referenceValue !== undefined && (
          <ReferenceLine y={referenceValue} stroke="var(--border)" strokeDasharray="3 3" />
        )}
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            fontSize: 11,
            padding: "4px 8px",
            color: "var(--text)",
          }}
          itemStyle={{ color: "var(--text)" }}
          labelFormatter={(label) => String(label)}
          formatter={(value) => [typeof value === "number" ? value.toFixed(2) : String(value ?? ""), ""]}
          separator=""
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
