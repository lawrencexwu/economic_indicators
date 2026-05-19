"use client";

import { zoneColor, getScoreZone } from "@/lib/scoring";
import type { ScoreZone } from "@/lib/types";

interface Props {
  score: number | null;
  size?: number;
}

export default function ScoreGauge({ score, size = 200 }: Props) {
  const zone: ScoreZone = getScoreZone(score);
  const color = zoneColor(zone);

  const cx = size / 2;
  const cy = size * 0.52;
  const r = size * 0.38;
  const strokeW = size * 0.08;

  // Arc path: upper semicircle from left (180°) to right (0°)
  const lx = cx - r; // left end (-100 position)
  const rx = cx + r; // right end (+100 position)

  const arcPath = `M ${lx} ${cy} A ${r} ${r} 0 0 1 ${rx} ${cy}`;
  const totalLen = Math.PI * r;

  const pct = score !== null ? (score + 100) / 200 : 0;
  const filledLen = pct * totalLen;

  // Needle angle: 180° (left) when score=-100, 0° (right) when score=+100
  // In standard math coords: angle = 180 - pct*180 degrees
  const angleDeg = 180 - pct * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  const nx = cx + r * Math.cos(angleRad);
  const ny = cy - r * Math.sin(angleRad);

  return (
    <svg width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size * 0.65}`}>
      {/* Background track */}
      <path
        d={arcPath}
        fill="none"
        stroke="var(--border)"
        strokeWidth={strokeW}
        strokeLinecap="round"
      />

      {/* Colored fill */}
      {score !== null && (
        <path
          d={arcPath}
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeDasharray={`${filledLen} ${totalLen}`}
          style={{ opacity: 0.85 }}
        />
      )}

      {/* Needle */}
      {score !== null && (
        <>
          <line
            x1={cx}
            y1={cy}
            x2={nx}
            y2={ny}
            stroke="var(--text)"
            strokeWidth={size * 0.012}
            strokeLinecap="round"
          />
          <circle cx={cx} cy={cy} r={size * 0.025} fill="var(--text)" />
        </>
      )}

      {/* End labels — positioned below arc endpoints, inside the taller viewBox */}
      <text
        x={lx}
        y={cy + strokeW * 1.6}
        fontSize={size * 0.058}
        fill="var(--muted)"
        textAnchor="middle"
      >
        -100
      </text>
      <text
        x={rx}
        y={cy + strokeW * 1.6}
        fontSize={size * 0.058}
        fill="var(--muted)"
        textAnchor="middle"
      >
        +100
      </text>
    </svg>
  );
}
