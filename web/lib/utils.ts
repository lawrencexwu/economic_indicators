import type { Indicator } from "./types";

const STALENESS_MS: Record<string, number> = {
  weekly:    10 * 24 * 60 * 60 * 1000,
  monthly:   45 * 24 * 60 * 60 * 1000,
  quarterly: 100 * 24 * 60 * 60 * 1000,
};

export function isStale(ind: Indicator): boolean {
  if (!ind.last_updated) return true;
  const threshold = STALENESS_MS[ind.frequency] ?? STALENESS_MS.monthly;
  return Date.now() - new Date(ind.last_updated).getTime() > threshold;
}
