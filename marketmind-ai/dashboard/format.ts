import type {
  ComponentName,
  ConflictLevel,
  MarketDirection,
  MarketSignal,
  RiskLevel,
} from "./types";

export const componentLabels: Record<ComponentName, string> = {
  funding: "Funding",
  etf: "ETF Flow",
  news: "News",
};

export function formatNumber(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return Number(value).toFixed(digits);
}

export function formatPercent(value: number | null | undefined, digits = 0) {
  return `${formatNumber(value, digits)}%`;
}


export function formatPrice(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatRelativeTime(value: string | null | undefined) {
  if (!value) return "-";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "-";
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60_000));
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function directionLabel(direction: MarketDirection) {
  return ({ bullish: "상승", neutral: "중립", bearish: "하락" })[direction];
}

export function signalLabel(signal: MarketSignal) {
  return ({
    strong_bullish: "STRONG BUY",
    bullish: "BUY",
    watch: "WATCH",
    caution: "CAUTION",
    bearish: "SELL",
    strong_bearish: "STRONG SELL",
  })[signal];
}

export function riskLabel(risk: RiskLevel | null) {
  if (!risk) return "-";
  return ({ low: "낮음", medium: "보통", high: "높음", extreme: "극단" })[risk];
}

export function conflictLabel(level: ConflictLevel | null) {
  if (!level) return "-";
  return ({ low: "낮음", medium: "보통", high: "높음" })[level];
}

export function toneClass(value: MarketDirection | MarketSignal | RiskLevel | ConflictLevel | null) {
  if (!value) return "tone-neutral";
  if (value === "bullish" || value === "strong_bullish" || value === "low") return "tone-positive";
  if (value === "bearish" || value === "strong_bearish" || value === "high" || value === "extreme") return "tone-negative";
  if (value === "caution" || value === "medium") return "tone-warning";
  return "tone-neutral";
}
