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
      score: page.score,
      color: zoneColor(page.zone),
      href: PAGE_HREFS[pageId],
    };
  });

  return (
    <nav
      aria-label="Page scores"
      className="no-scrollbar"
      style={{
        background: "rgba(10,14,26,0.97)",
        borderBottom: "1px solid var(--border)",
        height: 30,
        display: "flex",
        alignItems: "center",
        paddingInline: 16,
        overflowX: "auto",
      }}
    >
      {scores.flatMap(({ id, score, color, href }, i) => {
        const item = (
          <a
            key={id}
            href={href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              textDecoration: "none",
              padding: "0 10px",
              height: "100%",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {/* Colored status dot */}
            <span
              style={{
                display: "inline-block",
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: color,
                boxShadow: `0 0 4px ${color}aa`,
                flexShrink: 0,
              }}
            />
            {/* Page name */}
            <span
              style={{
                fontSize: 11,
                color: "var(--muted)",
                whiteSpace: "nowrap",
                lineHeight: 1,
              }}
            >
              {SHORT_NAMES[id]}
            </span>
            {/* Score */}
            {score !== null && (
              <span
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 11,
                  fontWeight: 700,
                  color,
                  whiteSpace: "nowrap",
                  lineHeight: 1,
                }}
              >
                {score > 0 ? `+${score}` : score}
              </span>
            )}
          </a>
        );

        // Separator as a standalone element outside the link
        if (i < scores.length - 1) {
          return [
            item,
            <span
              key={`sep-${i}`}
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 1,
                height: 12,
                background: "var(--border)",
                flexShrink: 0,
                alignSelf: "center",
              }}
            />,
          ];
        }
        return [item];
      })}
    </nav>
  );
}
