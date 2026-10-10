import type { Metadata } from "next";
import "./globals.css";
import "./sovereign-theme.css";
export const metadata: Metadata = { title: "sovereignOS — Connected intelligence", description: "OpenAI, Claude, Perplexity, and Grok. One private workspace for independent thinking and shared perspective.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
