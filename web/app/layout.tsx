import type { Metadata } from "next";
import { Fira_Sans, Fira_Code } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import GlobalScoreStrip from "@/components/GlobalScoreStrip";

const firaSans = Fira_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const firaCode = Fira_Code({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "US Macro Dashboard",
  description: "US economic indicator dashboard for equity positioning",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${firaSans.variable} ${firaCode.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" style={{ background: "var(--bg)", color: "var(--text)" }}>
        <Nav />
        <GlobalScoreStrip />
        <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
