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

const LABELS: Record<string, string> = {
  bullish: "상승",
  neutral: "중립",
  bearish: "하락",
  strong_buy: "강한 매수",
  buy: "매수",
  wait: "관망",
  hold: "관망",
  reduce: "비중 축소",
  sell: "매도",
  allowed: "거래 가능",
  caution: "주의 필요",
  blocked: "거래 차단",
  low: "낮음",
  normal: "보통",
  medium: "보통",
  high: "높음",
  critical: "매우 높음",
  extreme: "극단",
  strong_alignment: "강한 일치",
  alignment: "일치",
  mixed: "혼재",
  conflict: "충돌",
  bull_trend: "상승 추세",
  bear_trend: "하락 추세",
  range: "횡보 구간",
  volatility_compression: "변동성 압축",
  volatility_expansion: "변동성 확대",
};

export function normalizeLabel(value: string | null | undefined): string {
  if (!value) return "데이터 없음";
  return LABELS[value] ?? value.replaceAll("_", " ");
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatWeight(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  const normalized = Number(value) <= 1 ? Number(value) * 100 : Number(value);
  return `${normalized.toFixed(1)}%`;
}

export function getTone(
  value: string | null | undefined,
): "positive" | "negative" | "warning" | "neutral" | "accent" {
  if (
    value === "bullish" ||
    value === "strong_buy" ||
    value === "buy" ||
    value === "allowed" ||
    value === "low"
  ) {
    return "positive";
  }

  if (
    value === "bearish" ||
    value === "sell" ||
    value === "blocked" ||
    value === "critical" ||
    value === "extreme"
  ) {
    return "negative";
  }

  if (
    value === "reduce" ||
    value === "caution" ||
    value === "high" ||
    value === "conflict"
  ) {
    return "warning";
  }

  if (value === "bull_trend" || value === "bear_trend") {
    return "accent";
  }

  return "neutral";
}

export function getRegimeDescription(
  regime: string | null | undefined,
): string {
  const descriptions: Record<string, string> = {
    bull_trend: "상승 추세가 유지되는 구간입니다. 과도한 추격 진입은 주의합니다.",
    bear_trend: "하락 압력이 우세한 구간입니다. 반등 시 위험 관리가 필요합니다.",
    range: "방향성이 약한 횡보 구간입니다. 임계값 돌파를 기다립니다.",
    volatility_compression: "변동성이 수축 중이며 이후 방향성 확대 가능성이 있습니다.",
    volatility_expansion: "변동성이 커진 구간으로 포지션 크기 관리가 중요합니다.",
  };

  return regime
    ? descriptions[regime] ?? "현재 기술 지표를 기준으로 시장 국면을 분류했습니다."
    : "시장 국면 데이터가 아직 없습니다.";
}

export function getMarketPressure(regime: string | null | undefined): {
  title: string;
  description: string;
  tag: string;
} {
  if (regime === "bull_trend") {
    return {
      title: "상승 압력 우세",
      description: "매수 방향의 추세 신호가 상대적으로 우세합니다.",
      tag: "BULL PRESSURE",
    };
  }

  if (regime === "bear_trend") {
    return {
      title: "하락 압력 우세",
      description: "매도 방향의 추세 신호가 상대적으로 우세합니다.",
      tag: "BEAR PRESSURE",
    };
  }

  if (regime === "volatility_expansion") {
    return {
      title: "변동성 확대",
      description: "가격 변동 폭이 커져 손절·익절 기준 관리가 중요합니다.",
      tag: "HIGH VOLATILITY",
    };
  }

  return {
    title: "중립 압력",
    description: "뚜렷한 방향보다 추가 확인이 필요한 시장 상태입니다.",
    tag: "NEUTRAL PRESSURE",
  };
}

export function getStrategy(
  direction: string | null | undefined,
  permission: string | null | undefined,
): {
  title: string;
  description: string;
  tag: string;
} {
  if (permission === "blocked") {
    return {
      title: "신규 진입 중단",
      description: "위험도가 높아 새로운 포지션보다 기존 위험 관리가 우선입니다.",
      tag: "ENTRY BLOCKED",
    };
  }

  if (direction === "bullish") {
    return {
      title: permission === "caution" ? "보수적 분할 매수" : "분할 매수",
      description: "신뢰도와 손절 기준을 확인하며 나누어 진입하는 전략입니다.",
      tag: permission === "caution" ? "CAUTIOUS LONG" : "LONG BIAS",
    };
  }

  if (direction === "bearish") {
    return {
      title: permission === "caution" ? "보수적 분할 매도" : "분할 매도",
      description: "하락 추세 확인 후 위험 한도 안에서 나누어 대응합니다.",
      tag: permission === "caution" ? "CAUTIOUS SHORT" : "SHORT BIAS",
    };
  }

  return {
    title: "관망",
    description: "신호 정렬과 방향성이 개선될 때까지 신규 진입을 기다립니다.",
    tag: "WAIT",
  };
}
