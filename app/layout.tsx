import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentLedger — audit & evals for AI SDRs",
  description: "Capture, score and gate every message your AI SDR sends.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
