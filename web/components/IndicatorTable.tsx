"use client";

import React, { useState, Suspense } from "react";
import type { ScoredIndicator } from "@/lib/types";
import { zoneColor, formatValue, describeScore } from "@/lib/scoring";
import { isStale } from "@/lib/utils";
import SparkLine from "./SparkLine";

const DetailChart = React.lazy(() => import("./DetailChart"));

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

  const colCount = showSparkline ? 5 : 4;

  return (
    <>
      {/* ── Desktop table (hidden on mobile) ── */}
      <div className="hidden sm:block" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Indicator", "Value", "Score", "Wt", ...(showSparkline ? ["Trend"] : [])].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "6px 10px",
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
                                  fontFamily: "var(--font-geist-mono), monospace",
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
                        fontFamily: "var(--font-geist-mono), monospace",
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
                        fontFamily: "var(--font-geist-mono), monospace",
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
                              fontSize: 10,
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
                                fontSize: 10,
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
                                fontFamily: "var(--font-geist-mono), monospace",
                                color: score !== null ? color : "var(--muted)",
                                lineHeight: 1,
                              }}
                            >
                              {formatValue(ind)}
                            </div>
                            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                              {formatDate(ind.last_updated)}
                              {ind.previous_value != null && (
                                <> · prev {ind.previous_value.toFixed(1)}</>
                              )}
                            </div>
                            {ind.next_expected_release && (
                              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                                Next: {formatNextRelease(ind.next_expected_release)}
                              </div>
                            )}
                          </div>

                          {/* Col 2: Why? */}
                          <div
                            style={{
                              background: "var(--border)",
                              borderRadius: 6,
                              padding: "10px 12px",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 10,
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
                            <div style={{ fontSize: 11, color: "var(--text)", lineHeight: 1.7 }}>
                              {description ?? (
                                <span style={{ color: "var(--muted)" }}>No score formula</span>
                              )}
                            </div>
                          </div>

                          {/* Col 3: What it measures */}
                          <div>
                            <div
                              style={{
                                fontSize: 10,
                                color: "var(--muted)",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                marginBottom: 6,
                              }}
                            >
                              What it measures
                            </div>
                            <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
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
                background: isExpanded ? "#111827" : "var(--surface)",
                border: `1px solid ${isExpanded ? "#2a3a5c" : "var(--border)"}`,
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
                      <span style={{ marginLeft: 6, fontSize: 10, color: "#f5a623", fontWeight: 400 }}>
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
                        fontFamily: "var(--font-geist-mono), monospace",
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
                        fontFamily: "var(--font-geist-mono), monospace",
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
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
