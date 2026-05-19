"use client";

import { useState, useMemo } from "react";

const N_BINS = 20;
const PAD = { l: 4, r: 4, t: 4, b: 0 };

interface Bin {
  lo: number;
  hi: number;
  count: number;
  cumPct: number; // percentile at the top of this bin (0–100)
}

function buildBins(values: number[]): Bin[] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const range = hi - lo;
  if (range === 0) return [];
  const w = range / N_BINS;
  const bins: Bin[] = Array.from({ length: N_BINS }, (_, i) => ({
    lo: lo + i * w,
    hi: lo + (i + 1) * w,
    count: 0,
    cumPct: 0,
  }));
  for (const v of values) {
    const idx = Math.min(Math.floor((v - lo) / w), N_BINS - 1);
    bins[idx].count++;
  }
  let cum = 0;
  for (const b of bins) {
    cum += b.count;
    b.cumPct = Math.round((cum / values.length) * 100);
  }
  return bins;
}

/** Current-value percentile (% of values <= currentValue). */
function computePercentile(values: number[], current: number): number {
  const below = values.filter((v) => v <= current).length;
  return Math.round((below / values.length) * 100);
}

/** Map a data-domain value to an SVG x pixel coordinate. */
function toX(v: number, domainMin: number, domainMax: number, svgWidth: number): number {
  const chartW = svgWidth - PAD.l - PAD.r;
  return PAD.l + ((v - domainMin) / (domainMax - domainMin)) * chartW;
}

interface Props {
  values: number[];
  currentValue: number;
  mean: number;
  std: number;
  levelZ: number;
  formatVal?: (v: number) => string;
  width?: number;
  height?: number;
}

export default function IndicatorHistogram({
  values,
  currentValue,
  mean,
  std,
  levelZ,
  formatVal = (v) => v.toFixed(2),
  width = 480,
  height = 96,
}: Props) {
  const [hoveredBin, setHoveredBin] = useState<number | null>(null);

  const bins = useMemo(() => buildBins(values), [values]);
  const domainMin = useMemo(() => Math.min(...values), [values]);
  const domainMax = useMemo(() => Math.max(...values), [values]);
  const maxCount = useMemo(() => Math.max(...bins.map((b) => b.count), 1), [bins]);
  const currentPct = useMemo(() => computePercentile(values, currentValue), [values, currentValue]);

  if (bins.length === 0) return null;

  const chartH = height - PAD.t - PAD.b;
  const binW = (width - PAD.l - PAD.r) / N_BINS;

  // ± band x coordinates (clamped to chart area)
  const clampX = (x: number) => Math.max(PAD.l, Math.min(width - PAD.r, x));
  const x1s = clampX(toX(mean - std,     domainMin, domainMax, width));
  const x2s = clampX(toX(mean + std,     domainMin, domainMax, width));
  const x1d = clampX(toX(mean - 2 * std, domainMin, domainMax, width));
  const x2d = clampX(toX(mean + 2 * std, domainMin, domainMax, width));
  const xCurrent = toX(currentValue, domainMin, domainMax, width);

  const barFill = (i: number): string => {
    const binCenter = bins[i].lo + (bins[i].hi - bins[i].lo) / 2;
    const bz = Math.abs((binCenter - mean) / (std || 1));
    if (i === hoveredBin) return "rgba(255,255,255,0.55)";
    if (bz <= 1) return "rgba(91,156,245,0.55)";   // ±1σ — accent blue
    if (bz <= 2) return "rgba(245,166,35,0.45)";   // ±2σ — amber
    return "rgba(231,76,92,0.45)";                  // tail — red
  };

  const hovered = hoveredBin !== null ? bins[hoveredBin] : null;

  return (
    <div style={{ width: "100%" }}>
      <div style={{ position: "relative" }}>
        {/* Hover tooltip */}
        {hovered && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "50%",
              transform: "translateX(-50%)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 9,
              color: "var(--text)",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            {hovered.count} values · {hovered.cumPct}th pct
          </div>
        )}

        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ display: "block", overflow: "visible", width: "100%", maxWidth: width, height: "auto" }}
          onMouseLeave={() => setHoveredBin(null)}
        >
          {/* ±2σ band (red, behind bars) */}
          <rect
            x={x1d}
            y={PAD.t}
            width={Math.max(0, x2d - x1d)}
            height={chartH}
            fill="rgba(231,76,92,0.08)"
          />
          {/* ±1σ band (amber, behind bars) */}
          <rect
            x={x1s}
            y={PAD.t}
            width={Math.max(0, x2s - x1s)}
            height={chartH}
            fill="rgba(245,166,35,0.10)"
          />

          {/* Histogram bars */}
          {bins.map((bin, i) => {
            const barH = (bin.count / maxCount) * chartH;
            const x = PAD.l + i * binW;
            return (
              <rect
                key={i}
                x={x + 0.5}
                y={PAD.t + chartH - barH}
                width={Math.max(0, binW - 1)}
                height={barH}
                fill={barFill(i)}
                onMouseEnter={() => setHoveredBin(i)}
                style={{ cursor: "default" }}
              />
            );
          })}

          {/* Current value line */}
          {xCurrent >= PAD.l && xCurrent <= width - PAD.r && (
            <line
              x1={xCurrent}
              y1={PAD.t - 2}
              x2={xCurrent}
              y2={PAD.t + chartH + 2}
              stroke="#5b9cf5"
              strokeWidth={1.5}
              strokeDasharray="3 2"
            />
          )}
        </svg>
      </div>

      {/* Caption */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted)", lineHeight: 1.6, marginTop: 4, flexWrap: "wrap", gap: 4 }}>
        <span>
          <span style={{ color: "#5b9cf5" }}>Current: {formatVal(currentValue)}</span>
          {" · "}
          <span>z = {levelZ > 0 ? `+${levelZ.toFixed(2)}` : levelZ.toFixed(2)} · {currentPct}th percentile</span>
        </span>
        <span>Range: {formatVal(domainMin)} – {formatVal(domainMax)}</span>
      </div>
    </div>
  );
}
