import { loadIndicators } from "@/lib/data";
import { buildPageResult, PAGE_IDS, PAGE_NAMES, PAGE_INDICATOR_IDS } from "@/lib/composites";
import { zoneColor } from "@/lib/scoring";

const SHORT_NAMES: Record<string, string> = {
  regime: "Regime",
  fed: "Fed",
  pulse: "Pulse",
  cycle: "Cycle",
  rotation: "Rotation",
  fiscal: "Fiscal",
};

const PAGE_HREFS: Record<string, string> = {
  regime: "/regime",
  fed: "/fed",
  pulse: "/pulse",
  cycle: "/cycle",
  rotation: "/rotation",
  fiscal: "/fiscal",
};

export default function GlobalScoreStrip() {
  const allIds = [...new Set(Object.values(PAGE_INDICATOR_IDS).flat())];
  const data = loadIndicators(allIds);

  const scores = PAGE_IDS.map((pageId) => {
    const ids = PAGE_INDICATOR_IDS[pageId] ?? [];
    const indicators = ids.map((id) => data[id] ?? null);
    const page = buildPageResult(pageId, indicators);
    return {
      id: pageId,
      name: PAGE_NAMES[pageId],
      score: page.score,
      color: zoneColor(page.zone),
      href: PAGE_HREFS[pageId],
    };
  });

  return (
    <div
      style={{
        background: "rgba(10,14,26,0.97)",
        borderBottom: "1px solid var(--border)",
        padding: "5px 16px",
        display: "flex",
        alignItems: "center",
        gap: 4,
        overflowX: "auto",
        scrollbarWidth: "none",
      }}
    >
      <span
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--muted)",
          flexShrink: 0,
          marginRight: 8,
          whiteSpace: "nowrap",
        }}
      >
        Pages
      </span>
      {scores.map(({ id, score, color, href }, i) => (
        <a
          key={id}
          href={href}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            textDecoration: "none",
            flexShrink: 0,
            padding: "3px 10px",
            borderRadius: 20,
            background: "transparent",
            border: "1px solid transparent",
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: color,
              boxShadow: `0 0 5px ${color}99`,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 11,
              color: "var(--muted)",
              whiteSpace: "nowrap",
            }}
          >
            {SHORT_NAMES[id]}
          </span>
          {score !== null && (
            <span
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: 11,
                fontWeight: 700,
                color,
                whiteSpace: "nowrap",
              }}
            >
              {score > 0 ? `+${score}` : score}
            </span>
          )}
          {i < scores.length - 1 && (
            <span style={{ fontSize: 10, color: "var(--border)", marginLeft: 4 }}>│</span>
          )}
        </a>
      ))}
    </div>
  );
}
