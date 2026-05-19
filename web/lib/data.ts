import fs from "fs";
import path from "path";
import type { Indicator } from "./types";

const DATA_DIR = path.join(process.cwd(), "../data/indicators");

export function loadIndicator(id: string): Indicator | null {
  const filePath = path.join(DATA_DIR, `${id}.json`);
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as Indicator;
  } catch {
    return null;
  }
}

export function loadIndicators(ids: string[]): Record<string, Indicator | null> {
  const result: Record<string, Indicator | null> = {};
  for (const id of ids) {
    result[id] = loadIndicator(id);
  }
  return result;
}

export function loadAllIndicators(): Record<string, Indicator | null> {
  let files: string[] = [];
  try {
    files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return {};
  }
  const result: Record<string, Indicator | null> = {};
  for (const file of files) {
    const id = file.replace(".json", "");
    result[id] = loadIndicator(id);
  }
  return result;
}

export function getLastUpdated(indicators: Record<string, Indicator | null>): string {
  let latest = "";
  for (const ind of Object.values(indicators)) {
    if (ind?.last_updated && ind.last_updated > latest) {
      latest = ind.last_updated;
    }
  }
  if (!latest) return "unknown";
  return new Date(latest).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

