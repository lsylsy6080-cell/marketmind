import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MarketMind AI", template: "%s · MarketMind AI" },
  description: "BTC Intelligence Terminal",
  applicationName: "MarketMind AI",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/marketmind-logo.svg", apple: "/marketmind-logo.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0B0F19",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
