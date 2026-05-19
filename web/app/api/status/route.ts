import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";

export const dynamic = "force-dynamic"; // always fresh, never cached at CDN

export function GET() {
  try {
    const manifestPath = path.join(process.cwd(), "../data/manifest.json");
    const raw = readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(raw) as Record<string, unknown>;
    return NextResponse.json({ ok: true, ...manifest });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
