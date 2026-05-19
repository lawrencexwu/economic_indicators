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
      }}
    >
      <div
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          height: "48px",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: "13px",
            letterSpacing: "0.12em",
            color: "var(--accent)",
            marginRight: "16px",
            textTransform: "uppercase",
            textShadow: "var(--glow-accent)",
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
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: active ? 600 : 400,
                color: active ? "var(--text)" : "var(--muted)",
                background: active ? "rgba(91,156,245,0.10)" : "transparent",
                textDecoration: "none",
                transition: "color 0.15s, background 0.15s",
                borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
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
