import type { ScoredIndicator } from "@/lib/types";

interface Props {
  indicators: Record<string, ScoredIndicator | null>;
}

export default function UpcomingReleases({ indicators }: Props) {
  const now = Date.now();
  const MS_24H = 24 * 60 * 60 * 1000;

  const upcoming = Object.values(indicators)
    .filter(
      (ind): ind is ScoredIndicator => !!ind && typeof ind.next_expected_release === "string"
    )
    .filter((ind) => new Date(ind.next_expected_release!).getTime() > now)
    .sort(
      (a, b) =>
        new Date(a.next_expected_release!).getTime() -
        new Date(b.next_expected_release!).getTime()
    )
    .slice(0, 5);

  return (
    <div className="card">
      <span className="label" style={{ display: "block", marginBottom: 10 }}>
        Upcoming Releases
      </span>
      {upcoming.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
          No scheduled releases available.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {upcoming.map((ind) => {
            const releaseMs = new Date(ind.next_expected_release!).getTime();
            const isImminent = releaseMs - now < MS_24H;
            const weight = ind.weight ?? 1;
            const priority = weight >= 3 ? "HIGH" : weight >= 2 ? "MED" : "LOW";
            const priorityColor = weight >= 3 ? "#e74c5c" : weight >= 2 ? "#f5a623" : "var(--muted)";
            const dateLabel = new Date(ind.next_expected_release!).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              timeZone: "Asia/Taipei",
            });

            return (
              <div
                key={ind.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "4px 8px",
                  borderRadius: 4,
                  background: isImminent ? "rgba(245,166,35,0.08)" : "transparent",
                  border: isImminent
                    ? "1px solid rgba(245,166,35,0.3)"
                    : "1px solid transparent",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 11,
                    color: isImminent ? "#f5a623" : "var(--muted)",
                    whiteSpace: "nowrap",
                    minWidth: 90,
                  }}
                >
                  {dateLabel}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {ind.name}
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    paddingLeft: 8,
                    flexShrink: 0,
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: "var(--font-geist-mono), monospace",
                    color: priorityColor,
                    letterSpacing: "0.06em",
                  }}
                >
                  [{priority}]
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
