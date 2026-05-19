"use client";

import React, { useState, Suspense } from "react";
import type { ScoredIndicator, ForecastPoint } from "@/lib/types";
import { zoneColor, formatValue, describeScore, getHistogramValues } from "@/lib/scoring";
import { isStale } from "@/lib/utils";
import SparkLine from "./SparkLine";
import StateBadge, { stateColor, describeState } from "./StateBadge";

const DetailChart = React.lazy(() => import("./DetailChart"));
const IndicatorHistogram = React.lazy(() => import("./IndicatorHistogram"));

interface Props {
  indicators: ScoredIndicator[];
  showSparkline?: boolean;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Taipei",
  });
}

function formatNextRelease(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Taipei",
  });
}

function makeHistFormatVal(transform: string | undefined): (v: number) => string {
  if (transform === "yoy") return (v) => `${(v * 100).toFixed(2)}%`;
  return (v) => v.toFixed(2);
}

function formatForecastDate(iso: string, freq?: string): string {
  const d = new Date(iso);
  if (freq === "daily" || freq === "weekly") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }
  if (freq === "quarterly") {
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    return `Q${q} '${String(d.getUTCFullYear()).slice(2)}`;
  }
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function formatForecastValue(v: number, ind: ScoredIndicator): string {
  const id = ind.id;
  if (["claims_4wma", "initial_claims", "continuing_claims"].includes(id)) {
    return `${(v / 1000).toFixed(0)}k`;
  }
  const unit = ind.unit ?? "";
  if (unit === "percent" || unit === "percent_yoy") return `${v.toFixed(1)}%`;
  if (unit === "index") return v.toFixed(1);
  if (unit === "billions") return v.toFixed(1);
  if (unit === "millions") return v.toFixed(0);
  if (unit === "thousands" || unit === "thousands_saar") return `${(v / 1000).toFixed(0)}k`;
  return v.toFixed(1);
}

function ForecastStrip({ ind }: { ind: ScoredIndicator }) {
  const fc = ind.forecast;
  if (!fc || fc.values.length === 0) return null;
  const chipAccent = zoneColor(ind.zone);
  return (
    <div style={{ padding: "0 16px 12px" }}>
      <div
        style={{
          fontSize: 11,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 6,
        }}
      >
        {fc.horizon}-Period Outlook · {fc.model}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {fc.values.map((pt: ForecastPoint) => (
          <div
            key={pt.date}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--border)",
              borderTop: `2px solid ${chipAccent}`,
              borderRadius: 5,
              padding: "5px 10px",
              minWidth: 76,
            }}
          >
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 3, whiteSpace: "nowrap" }}>
              {formatForecastDate(pt.date, ind.frequency)}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "var(--font-mono), monospace",
                color: "var(--text)",
                lineHeight: 1,
              }}
            >
              {formatForecastValue(pt.mean, ind)}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3, whiteSpace: "nowrap" }}>
              {formatForecastValue(pt.lo80, ind)}–{formatForecastValue(pt.hi80, ind)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function IndicatorTable({ indicators, showSparkline = true }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(id);
    }
    if (e.key === "Escape") setExpandedId(null);
  }

  const colCount = showSparkline ? 6 : 5;

  return (
    <>
      {/* ── Desktop table (hidden on mobile) ── */}
      <div className="hidden sm:block" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Indicator", "Value", "Score", "State", "Wt", ...(showSparkline ? ["Trend"] : [])].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {indicators.map((ind) => {
              const score = ind.computed_score;
              const color = zoneColor(ind.zone);
              const isExpanded = expandedId === ind.id;
              const stale = isStale(ind);
              const description = isExpanded ? describeScore(ind) : null;

              return (
                <React.Fragment key={ind.id}>
                  <tr
                    className="ind-row"
                    style={{
                      borderBottom: isExpanded ? "none" : "1px solid var(--border)",
                      background: isExpanded ? "var(--surface)" : "transparent",
                      lineHeight: 1.4,
                    }}
                  >
                    {/* Name cell — clickable */}
                    <td style={{ padding: "8px 10px", color: "var(--text)", maxWidth: 240 }}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onClick={() => toggle(ind.id)}
                        onKeyDown={(e) => handleKeyDown(e, ind.id)}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 6,
                          cursor: "pointer",
                          userSelect: "none",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            color: "#5b9cf5",
                            width: 10,
                            flexShrink: 0,
                            paddingTop: 2,
                          }}
                        >
                          {isExpanded ? "▼" : "▶"}
                        </span>
                        <div>
                          <div style={{ fontWeight: 500 }}>
                            {ind.name}
                            {stale && (
                              <span
                                style={{
                                  marginLeft: 6,
                                  fontSize: 10,
                                  color: "#f5a623",
                                  fontWeight: 400,
                                  fontFamily: "var(--font-mono), monospace",
                                }}
                              >
                                ⚠ stale
                              </span>
                            )}
                          </div>
                          {ind.metadata?.what_it_measures && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--muted)",
                                marginTop: 2,
                                maxWidth: 220,
                                overflow: "hidden",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                              }}
                            >
                              {ind.metadata.what_it_measures.trim().slice(0, 100)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Value */}
                    <td
                      style={{
                        padding: "8px 10px",
                        fontFamily: "var(--font-mono), monospace",
                        color: ind.current_value === null ? "var(--muted)" : "var(--text)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ind.current_value === null ? (
                        <span style={{ fontSize: 11 }}>no data</span>
                      ) : (
                        formatValue(ind)
                      )}
                    </td>

                    {/* Score */}
                    <td
                      style={{
                        padding: "8px 10px",
                        fontFamily: "var(--font-mono), monospace",
                        color: score !== null ? color : "var(--muted)",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ind.current_value === null
                        ? "—"
                        : score !== null
                        ? score > 0
                          ? `+${score}`
                          : String(score)
                        : "—"}
                    </td>

                    {/* State */}
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      <StateBadge state={ind.level_trend_state} size="sm" />
                    </td>

                    {/* Weight */}
                    <td style={{ padding: "8px 10px", color: "var(--muted)", whiteSpace: "nowrap" }}>
                      ×{ind.weight}
                    </td>

                    {/* Sparkline */}
                    {showSparkline && (
                      <td style={{ padding: "4px 10px" }}>
                        <SparkLine
                          data={ind.data.slice(0, 24)}
                          color={score !== null ? color : "var(--muted)"}
                          width={100}
                          height={32}
                        />
                      </td>
                    )}
                  </tr>

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <tr>
                      <td
                        colSpan={colCount}
                        style={{
                          padding: 0,
                          background: "var(--surface)",
                          borderBottom: "2px solid var(--border)",
                        }}
                      >
                        {/* Chart area */}
                        <div style={{ padding: "16px 16px 0" }}>
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                              marginBottom: 8,
                            }}
                          >
                            5-Year History · Hover to inspect
                          </div>
                          <Suspense
                            fallback={
                              <div
                                style={{
                                  height: 160,
                                  background: "var(--border)",
                                  borderRadius: 6,
                                }}
                              />
                            }
                          >
                            <DetailChart ind={ind} height={160} />
                          </Suspense>
                        </div>

                        {/* Distribution histogram */}
                        {(() => {
                          const histVals = getHistogramValues(ind);
                          const zb = ind.zscore;
                          if (!histVals || !zb) return null;
                          const fmt = makeHistFormatVal(zb.transform);
                          return (
                            <div style={{ padding: "0 16px 12px" }}>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "var(--muted)",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.08em",
                                  marginBottom: 6,
                                }}
                              >
                                Distribution · {zb.window === "full" ? "Full history" : "10-year window"}
                              </div>
                              <Suspense fallback={<div style={{ height: 108, background: "var(--border)", borderRadius: 4 }} />}>
                                <IndicatorHistogram
                                  values={histVals}
                                  currentValue={zb.level_value_used}
                                  mean={zb.level_mean}
                                  std={zb.level_std}
                                  levelZ={zb.level_z}
                                  formatVal={fmt}
                                  width={520}
                                  height={96}
                                />
                              </Suspense>
                            </div>
                          );
                        })()}

                        {/* State callout */}
                        {ind.level_trend_state && ind.zscore && (
                          <div style={{ padding: "0 16px 12px" }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 10,
                                background: "var(--border)",
                                borderRadius: 6,
                                padding: "8px 12px",
                                borderLeft: `3px solid ${stateColor(ind.level_trend_state)}`,
                              }}
                            >
                              <StateBadge state={ind.level_trend_state} size="md" />
                              <div style={{ fontSize: 12, color: "var(--text)", opacity: 0.7, lineHeight: 1.6 }}>
                                {describeState(ind.level_trend_state, ind.zscore)}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Forecast strip */}
                        <ForecastStrip ind={ind} />

                        {/* Bottom 3-column strip */}
                        <div
                          style={{
                            padding: "12px 16px 16px",
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr",
                            gap: 16,
                          }}
                        >
                          {/* Col 1: Current */}
                          <div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--muted)",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                marginBottom: 6,
                              }}
                            >
                              Current
                            </div>
                            <div
                              style={{
                                fontSize: 32,
                                fontWeight: 700,
                                fontFamily: "var(--font-mono), monospace",
                                color: score !== null ? color : "var(--muted)",
                                lineHeight: 1,
                              }}
                            >
                              {formatValue(ind)}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                              {formatDate(ind.last_updated)}
                              {ind.previous_value != null && (
                                <> · prev {ind.previous_value.toFixed(1)}</>
                              )}
                            </div>
                            {ind.next_expected_release && (
                              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                                Next: {formatNextRelease(ind.next_expected_release)}
                              </div>
                            )}
                          </div>

                          {/* Col 2: Why? */}
                          <div
                            style={{
                              background: "rgba(255,255,255,0.04)",
                              borderRadius: 6,
                              padding: "10px 12px",
                              borderLeft: `3px solid ${color}`,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--muted)",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                marginBottom: 6,
                              }}
                            >
                              Why{" "}
                              {score !== null
                                ? score > 0
                                  ? `+${score}`
                                  : String(score)
                                : "?"}
                              ?
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.7 }}>
                              {description ?? (
                                <span style={{ color: "var(--muted)" }}>No score formula</span>
                              )}
                            </div>
                          </div>

                          {/* Col 3: What it measures */}
                          <div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--muted)",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                marginBottom: 6,
                              }}
                            >
                              What it measures
                            </div>
                            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                              {ind.metadata?.what_it_measures
                                ? ind.metadata.what_it_measures.trim().slice(0, 150)
                                : "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Mobile card list (hidden on desktop) ── */}
      <div className="flex flex-col gap-2 sm:hidden">
        {indicators.map((ind) => {
          const score = ind.computed_score;
          const color = zoneColor(ind.zone);
          const isExpanded = expandedId === ind.id;
          const stale = isStale(ind);
          const description = isExpanded ? describeScore(ind) : null;

          return (
            <div
              key={ind.id}
              style={{
                background: "var(--surface)",
                border: `1px solid ${isExpanded ? "rgba(91,156,245,0.25)" : "var(--border)"}`,
                borderLeft: isExpanded ? `3px solid ${zoneColor(ind.zone)}` : "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {/* Card header — tappable */}
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={() => toggle(ind.id)}
                onKeyDown={(e) => handleKeyDown(e, ind.id)}
                style={{
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  borderBottom: isExpanded ? "1px solid var(--border)" : "none",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text)" }}>
                    {ind.name}
                    {stale && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: "var(--amber)", fontWeight: 400 }}>
                        ⚠ stale
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>
                    {ind.frequency} · ×{ind.weight}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  {showSparkline && (
                    <SparkLine
                      data={ind.data.slice(0, 24)}
                      color={score !== null ? color : "var(--muted)"}
                      width={56}
                      height={24}
                    />
                  )}
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        fontFamily: "var(--font-mono), monospace",
                        color: "var(--text)",
                        lineHeight: 1,
                      }}
                    >
                      {ind.current_value === null ? "—" : formatValue(ind)}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: score !== null ? color : "var(--muted)",
                        fontFamily: "var(--font-mono), monospace",
                      }}
                    >
                      {score !== null ? (score > 0 ? `+${score}` : String(score)) : "—"}
                    </div>
                  </div>
                  <span style={{ color: isExpanded ? "#5b9cf5" : "var(--muted)", fontSize: 12 }}>
                    {isExpanded ? "▼" : "▶"}
                  </span>
                </div>
              </div>

              {/* Expanded card content */}
              {isExpanded && (
                <div style={{ padding: "10px 12px" }}>
                  <Suspense
                    fallback={
                      <div style={{ height: 80, background: "var(--border)", borderRadius: 6 }} />
                    }
                  >
                    <DetailChart ind={ind} height={80} />
                  </Suspense>
                  {(() => {
                    const histVals = getHistogramValues(ind);
                    const zb = ind.zscore;
                    if (!histVals || !zb) return null;
                    const fmt = makeHistFormatVal(zb.transform);
                    return (
                      <div style={{ marginTop: 8 }}>
                        <Suspense fallback={<div style={{ height: 80, background: "var(--border)", borderRadius: 4 }} />}>
                          <IndicatorHistogram
                            values={histVals}
                            currentValue={zb.level_value_used}
                            mean={zb.level_mean}
                            std={zb.level_std}
                            levelZ={zb.level_z}
                            formatVal={fmt}
                            width={360}
                            height={80}
                          />
                        </Suspense>
                      </div>
                    );
                  })()}
                  {description && (
                    <div
                      style={{
                        marginTop: 8,
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        padding: "8px 10px",
                        fontSize: 11,
                        color: "var(--text)",
                        lineHeight: 1.6,
                      }}
                    >
                      <span style={{ color: "var(--muted)" }}>Why </span>
                      <span style={{ color, fontWeight: 700 }}>
                        {score !== null ? (score > 0 ? `+${score}` : String(score)) : "?"}
                      </span>
                      <span style={{ color: "var(--muted)" }}>? </span>
                      {description}
                    </div>
                  )}
                  {ind.metadata?.what_it_measures && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 10,
                        color: "var(--muted)",
                        lineHeight: 1.5,
                      }}
                    >
                      {ind.metadata.what_it_measures.trim().slice(0, 150)}
                    </div>
                  )}
                  {ind.forecast && ind.forecast.values.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <ForecastStrip ind={ind} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
