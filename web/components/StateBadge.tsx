"use client";

import type { LevelTrendState, ZScoreBlock } from "@/lib/types";

export function stateColor(state: LevelTrendState | undefined): string {
  switch (state) {
    case "Strong":       return "var(--green)";
    case "Recovering":   return "var(--accent)";
    case "Neutral":      return "var(--muted)";
    case "Peaking":      return "var(--amber)";
    case "Deteriorating":return "var(--red)";
    default:             return "var(--muted)";
  }
}

export function describeState(
  state: LevelTrendState,
  z: ZScoreBlock
): string {
  const lz = `z=${z.level_z > 0 ? "+" : ""}${z.level_z.toFixed(2)}`;
  const tz = `z=${z.trend_z > 0 ? "+" : ""}${z.trend_z.toFixed(2)}`;
  const win = z.window === "full" ? "historical" : "10-year";
  switch (state) {
    case "Strong":
      return `Above ${win} average (${lz}) AND 3-month trend accelerating (${tz}). Strong reading on both level and momentum.`;
    case "Peaking":
      return `Above ${win} average (${lz}) but 3-month trend decelerating (${tz}). Potential turning point — level elevated, momentum fading.`;
    case "Recovering":
      return `Below ${win} average (${lz}) but 3-month trend improving (${tz}). Potential turning point — level depressed, momentum building.`;
    case "Deteriorating":
      return `Below ${win} average (${lz}) AND 3-month trend decelerating (${tz}). Weak reading on both level and momentum.`;
    case "Neutral":
      return `Near ${win} average (${lz}). No strong directional signal from level or momentum.`;
  }
}

interface BadgeProps {
  state: LevelTrendState | undefined;
  size?: "sm" | "md";
}

/** Inline pill badge — use size="sm" for table rows, "md" for detail cards. */
export default function StateBadge({ state, size = "sm" }: BadgeProps) {
  if (!state) return null;
  const color = stateColor(state);
  const fontSize = size === "md" ? 11 : 9;
  const padding = size === "md" ? "3px 8px" : "1px 5px";

  return (
    <span
      style={{
        display: "inline-block",
        fontSize,
        fontWeight: 600,
        fontFamily: "var(--font-mono), monospace",
        letterSpacing: "0.04em",
        color,
        border: `1px solid ${color}`,
        borderRadius: 3,
        padding,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        opacity: 0.9,
      }}
    >
      {state}
    </span>
  );
}
