export type Tone = "positive" | "negative" | "neutral" | "warning" | "accent";

export function formatNumber(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, digits)}%`;
}

export function formatWeight(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${formatNumber(value <= 1 ? value * 100 : value, 0)}%`;
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatRelativeTime(value: string | null): string {
  if (!value) return "시간 정보 없음";

  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return "방금 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}일 전`;
}

const labels: Record<string, string> = {
  bullish: "상승",
  bearish: "하락",
  neutral: "중립",
  strong_buy: "강한 매수",
  buy: "매수",
  wait: "대기",
  reduce: "비중 축소",
  sell: "매도",
  allowed: "허용",
  caution: "주의",
  cautious: "주의",
  blocked: "차단",
  low: "낮음",
  normal: "보통",
  medium: "보통",
  high: "높음",
  critical: "매우 높음",
  strong_alignment: "강한 일치",
  alignment: "일치",
  mixed: "혼합",
  conflict: "충돌",
  volatility_compression: "변동성 압축 구간",
  volatility_expansion: "변동성 확장 구간",
  bullish_trend: "상승 추세 구간",
  bull_trend: "상승 추세 구간",
  bearish_trend: "하락 추세 구간",
  bear_trend: "하락 추세 구간",
  sideways: "횡보 구간",
  range: "박스권 구간",
  accumulation: "매집 구간",
  distribution: "분산 구간",
  breakout: "상승 돌파 구간",
  breakdown: "하락 이탈 구간",
  trend_following: "추세 지속 구간",
  reversal: "추세 전환 구간",
  risk_on: "위험 선호 구간",
  risk_off: "위험 회피 구간",
  completed: "완료",
  pending: "대기",
  in_progress: "진행 중",
  failed: "오류",
  correct: "정답",
  incorrect: "오답",
};

export function normalizeLabel(value: string | null): string {
  if (!value) return "데이터 없음";
  return labels[value.toLowerCase()] ?? value.replaceAll("_", " ");
}

export function getTone(value: string | null): Tone {
  const normalized = value?.toLowerCase() ?? "";

  if (["bullish", "buy", "strong_buy", "allowed", "correct"].includes(normalized)) {
    return "positive";
  }

  if (
    ["bearish", "sell", "reduce", "blocked", "critical", "incorrect", "failed"].includes(
      normalized,
    )
  ) {
    return "negative";
  }

  if (["caution", "cautious", "high", "pending", "in_progress"].includes(normalized)) {
    return "warning";
  }

  if (
    [
      "volatility_compression",
      "volatility_expansion",
      "bull_trend",
      "bear_trend",
      "range",
      "sideways",
      "mixed",
      "conflict",
      "alignment",
      "strong_alignment",
    ].includes(normalized)
  ) {
    return "accent";
  }

  return "neutral";
}

export function getRegimeDescription(regime: string | null): string {
  switch (regime) {
    case "volatility_compression":
      return "추세 돌파 전 에너지가 축적되고 있는 구간입니다.";
    case "volatility_expansion":
      return "변동성이 확대되며 새로운 방향성이 형성될 가능성이 있습니다.";
    case "bullish_trend":
    case "bull_trend":
      return "매수 우위의 상승 흐름이 이어지고 있습니다.";
    case "bearish_trend":
    case "bear_trend":
      return "매도 우위의 하락 흐름이 이어지고 있습니다.";
    case "sideways":
    case "range":
      return "뚜렷한 방향성 없이 일정 가격 범위 안에서 움직이고 있습니다.";
    case "accumulation":
      return "시장 참여자의 매집 가능성이 높아지는 구간입니다.";
    case "distribution":
      return "보유 물량의 분산 가능성이 높아지는 구간입니다.";
    case "risk_on":
      return "위험자산 선호 심리가 강화되는 흐름입니다.";
    case "risk_off":
      return "위험자산 비중을 줄이는 방어적 흐름입니다.";
    default:
      return "현재 시장의 구조와 방향성을 종합 분석하고 있습니다.";
  }
}

export function getMarketPressure(regime: string | null): {
  title: string;
  description: string;
  tag: string;
} {
  switch (regime) {
    case "volatility_compression":
      return {
        title: "변동성 압축",
        description: "변동성이 낮아지며 돌파 전 에너지가 축적되고 있습니다.",
        tag: "낮은 변동성",
      };
    case "volatility_expansion":
      return {
        title: "변동성 확대",
        description: "가격 진폭이 커지며 추세 가속 가능성이 높아지고 있습니다.",
        tag: "높은 변동성",
      };
    case "bullish_trend":
    case "bull_trend":
      return {
        title: "상승 압력",
        description: "매수세가 우위를 보이며 상승 흐름을 지지하고 있습니다.",
        tag: "매수 우위",
      };
    case "bearish_trend":
    case "bear_trend":
      return {
        title: "하락 압력",
        description: "매도세가 우위를 보이며 하락 흐름을 강화하고 있습니다.",
        tag: "매도 우위",
      };
    case "sideways":
    case "range":
      return {
        title: "중립 압력",
        description: "매수와 매도 압력이 균형을 이루며 박스권 흐름이 이어지고 있습니다.",
        tag: "박스권",
      };
    default:
      return {
        title: "균형 상태",
        description: "매수와 매도 압력이 비슷해 추가 방향 확인이 필요합니다.",
        tag: "중립 압력",
      };
  }
}

export function getStrategy(direction: string | null, permission: string | null): {
  title: string;
  description: string;
  tag: string;
} {
  if (permission === "blocked") {
    return {
      title: "거래 제한",
      description: "신규 진입보다 리스크 관리와 신호 재확인을 우선합니다.",
      tag: "리스크 관리",
    };
  }

  if (permission === "caution") {
    return {
      title: "관망 전략",
      description: "명확한 방향성이 확인될 때까지 진입 규모를 보수적으로 유지합니다.",
      tag: "확인 후 진입",
    };
  }

  if (direction === "bullish") {
    return {
      title: "분할 매수 전략",
      description: "상승 흐름을 따르되 과도한 추격 매수는 피합니다.",
      tag: "리스크 관리 우선",
    };
  }

  if (direction === "bearish") {
    return {
      title: "비중 축소 전략",
      description: "반등 시 비중을 줄이고 손실 확대 가능성에 대비합니다.",
      tag: "방어적 대응",
    };
  }

  return {
    title: "관망 전략",
    description: "명확한 방향성 확인 전까지 대기하는 편이 적절합니다.",
    tag: "신호 확인",
  };
}

export function jsonToLines(value: unknown): string[] {
  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === "string" ? item : JSON.stringify(item),
    );
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(
      ([key, item]) =>
        `${key}: ${typeof item === "string" ? item : JSON.stringify(item)}`,
    );
  }

  return [String(value)];
}
