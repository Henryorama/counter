import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Automation Console",
  description: "Healthcare automation jobs powered by a self-hosted Skyvern backend",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
