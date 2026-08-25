import { createHash } from "node:crypto";

const BTC_TERMS = [
  "bitcoin", "btc", "spot bitcoin etf", "bitcoin etf", "satoshi",
  "microstrategy", "strategy", "bitcoin mining", "bitcoin miner",
  "bitcoin treasury", "bitcoin reserve",
];

const MARKET_TERMS = [
  "federal reserve", "fed", "interest rate", "inflation", "cpi", "pce",
  "sec", "etf", "crypto regulation", "liquidity", "dollar", "treasury yield",
];

export function normalizeNewsText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function calculateBtcRelevance(title: string, summary: string): number {
  const text = `${title} ${summary}`.toLowerCase();
  let score = 0;
  for (const term of BTC_TERMS) if (text.includes(term)) score += term === "bitcoin" || term === "btc" ? 35 : 20;
  for (const term of MARKET_TERMS) if (text.includes(term)) score += 8;
  if (/ethereum|solana|xrp|dogecoin/.test(text) && !/bitcoin|btc/.test(text)) score -= 25;
  return Math.max(0, Math.min(100, score));
}

export function buildEventFingerprint(title: string): string {
  const normalized = title
    .toLowerCase()
    .replace(/bitcoin|btc|crypto|cryptocurrency/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .filter((token) => !["the","and","for","with","from","that","this","after","amid","into","says","could","would","will"].includes(token))
    .slice(0, 12)
    .sort()
    .join("|");
  return createHash("sha256").update(normalized || title.toLowerCase()).digest("hex").slice(0, 24);
}

export function impactLevel(importance: number, relevance: number): "low" | "medium" | "high" {
  const combined = importance * 7 + relevance * 0.3;
  if (combined >= 75) return "high";
  if (combined >= 48) return "medium";
  return "low";
}
