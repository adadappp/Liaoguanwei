import type { Metadata, Viewport } from "next";
import { CursorTrail } from "@/components/cursor-trail";
import { StartupTransition } from "@/components/startup-transition";
import { startupStyles } from "@/lib/startup-styles";
import "./globals.css";
import "./atlas.css";
import "./motion.css";
import "./refinements.css";
import "./timetable.css";

export const metadata: Metadata = {
  title: "求职学习图鉴 · 把方向变成下一步",
  description: "从真实招聘要求发现岗位技能，自主选择学习内容，写下你的求职学习计划。",
  applicationName: "求职学习图鉴",
  appleWebApp: { capable: true, title: "求职图鉴", statusBarStyle: "black-translucent" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icons/apple-touch-icon-v2.png",
  },
};

export const viewport: Viewport = { themeColor: "#000000", colorScheme: "dark" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" style={{ backgroundColor: "#000000", colorScheme: "dark" }}>
      <head><link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" /><style>{startupStyles}</style></head>
      <body className="antialiased" style={{ backgroundColor: "#000000", color: "#f5f5f7", margin: 0 }}><StartupTransition />{children}<CursorTrail /></body>
    </html>
  );
}
