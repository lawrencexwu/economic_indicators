"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/regime", label: "Regime" },
  { href: "/fed", label: "Fed" },
  { href: "/pulse", label: "Pulse" },
  { href: "/cycle", label: "Cycle" },
  { href: "/rotation", label: "Rotation" },
  { href: "/fiscal", label: "Fiscal" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        overflow: "hidden", // prevent page-level horizontal scroll on mobile
      }}
    >
      {/* Inner row: scrollable on small screens, hidden scrollbar */}
      <div
        className="no-scrollbar"
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          gap: 2,
          height: 48,
          overflowX: "auto",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.12em",
            color: "var(--accent)",
            marginRight: 16,
            textTransform: "uppercase",
            textShadow: "var(--glow-accent)",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          US MACRO
        </span>
        {LINKS.map(({ href, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              style={{
                // Full nav height = 48px touch target (meets 44pt minimum)
                height: 48,
                display: "inline-flex",
                alignItems: "center",
                padding: "0 12px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? "var(--text)" : "var(--muted)",
                background: active ? "rgba(91,156,245,0.10)" : "transparent",
                textDecoration: "none",
                transition: "color 0.15s, background 0.15s",
                borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
