export interface FomcMeeting { date: string; label: string; }

export const FOMC_DATES: FomcMeeting[] = [
  { date: "2025-01-29", label: "Jan 29, 2025" },
  { date: "2025-03-19", label: "Mar 19, 2025" },
  { date: "2025-05-07", label: "May 7, 2025" },
  { date: "2025-06-18", label: "Jun 18, 2025" },
  { date: "2025-07-30", label: "Jul 30, 2025" },
  { date: "2025-09-17", label: "Sep 17, 2025" },
  { date: "2025-10-29", label: "Oct 29, 2025" },
  { date: "2025-12-10", label: "Dec 10, 2025" },
  { date: "2026-01-28", label: "Jan 28, 2026" },
  { date: "2026-03-18", label: "Mar 18, 2026" },
  { date: "2026-05-06", label: "May 6, 2026" },
  { date: "2026-06-17", label: "Jun 17, 2026" },
  { date: "2026-07-29", label: "Jul 29, 2026" },
  { date: "2026-09-16", label: "Sep 16, 2026" },
  { date: "2026-10-28", label: "Oct 28, 2026" },
  { date: "2026-12-09", label: "Dec 9, 2026" },
];

export interface NextFomc { label: string; daysUntil: number; isThisWeek: boolean; }

export function getNextFomc(now: Date = new Date()): NextFomc | null {
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (const m of FOMC_DATES) {
    const ms = new Date(m.date).getTime();
    if (ms >= todayMs) {
      const daysUntil = Math.round((ms - todayMs) / 86400000);
      return { label: m.label, daysUntil, isThisWeek: daysUntil <= 7 };
    }
  }
  return null;
}
