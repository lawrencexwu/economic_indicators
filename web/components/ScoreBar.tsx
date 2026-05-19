import { zoneColor, getScoreZone, zoneLabel } from "@/lib/scoring";
import Link from "next/link";

interface Props {
  label: string;
  score: number | null;
  href?: string;
  showZoneLabel?: boolean;
}

export default function ScoreBar({ label, score, href, showZoneLabel = false }: Props) {
  const zone = getScoreZone(score);
  const color = zoneColor(zone);

  const pct = score !== null ? ((score + 100) / 200) * 100 : 50;

  const inner = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
      }}
    >
      {/* Label */}
      <span
        style={{
          width: 210,
          fontSize: 14,
          color: "var(--text)",
          flexShrink: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </span>

      {/* Score number */}
      <span
        style={{
          width: 40,
          fontSize: 14,
          fontFamily: "var(--font-geist-mono), monospace",
          textAlign: "right",
          color: score !== null ? color : "var(--muted)",
          flexShrink: 0,
        }}
      >
        {score !== null ? (score > 0 ? `+${score}` : String(score)) : "—"}
      </span>

      {/* Bar track */}
      <div
        style={{
          flex: 1,
          height: 12,
          background: "var(--border)",
          borderRadius: 6,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Center marker */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: 1,
            height: "100%",
            background: "var(--muted)",
            opacity: 0.4,
          }}
        />
        {/* Filled portion */}
        {score !== null && (
          <div
            style={{
              position: "absolute",
              left: score >= 0 ? "50%" : `${pct}%`,
              width: `${Math.abs(score) / 2}%`,
              height: "100%",
              background: color,
              borderRadius: 4,
              opacity: 0.85,
            }}
          />
        )}
      </div>

      {/* Zone label */}
      {showZoneLabel && (
        <span
          style={{
            width: 90,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            color,
            flexShrink: 0,
            textAlign: "right",
          }}
        >
          {zoneLabel(zone)}
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: "none", display: "block" }}>
        {inner}
      </Link>
    );
  }
  return inner;
}
