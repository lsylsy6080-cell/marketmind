import type {
  ConflictLevel,
  DirectionVotes,
  MarketComponent,
  MarketDirection,
  MarketSignal,
  RiskLevel,
} from "./types";

const componentLabel: Record<MarketComponent["name"], string> = {
  funding: "펀딩",
  etf: "ETF 자금 흐름",
  news: "뉴스 심리",
};

const directionLabel: Record<MarketDirection, string> = {
  bullish: "강세",
  neutral: "중립",
  bearish: "약세",
};

const signalLead: Record<MarketSignal, string> = {
  strong_bullish: "시장 전반에서 매우 강한 상승 우위가 확인됩니다.",
  bullish: "시장 신호는 상승 우위입니다.",
  watch: "시장은 방향을 탐색하는 관찰 구간입니다.",
  caution: "시장 신호가 약해져 주의가 필요한 구간입니다.",
  bearish: "시장 신호는 하락 우위입니다.",
  strong_bearish: "시장 전반의 하락 위험 신호가 매우 강합니다.",
};

const riskLabel: Record<RiskLevel, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
  extreme: "매우 높음",
};

const conflictText: Record<ConflictLevel, string> = {
  low: "지표 간 충돌은 크지 않습니다.",
  medium: "일부 방향성 신호가 섞여 있어 추가 확인이 필요합니다.",
  high: "상승과 하락 신호가 강하게 충돌하고 있습니다.",
};

function buildAgreementText(input: {
  direction: MarketDirection;
  directionVotes: DirectionVotes;
  components: MarketComponent[];
}): string {
  const neutralShare = input.directionVotes.neutral;

  if (input.direction === "neutral") {
    if (neutralShare >= 80) {
      return "주요 지표가 모두 중립권에 모여 방향성은 약하지만 합의 수준은 높습니다.";
    }
    if (neutralShare >= 55) {
      return "중립 신호가 우세해 아직 뚜렷한 상승·하락 방향은 형성되지 않았습니다.";
    }
    return "상승과 하락 신호가 상쇄되어 종합 방향은 중립으로 판단됩니다.";
  }

  const aligned = input.components.filter(
    (item) => item.direction === input.direction,
  );

  return aligned.length >= 2
    ? `${aligned.map((item) => componentLabel[item.name]).join("과 ")}이 ${directionLabel[input.direction]} 방향에 합의했습니다.`
    : `가장 큰 영향력을 가진 지표가 ${directionLabel[input.direction]} 방향을 주도하고 있습니다.`;
}

export function buildMarketSummary(input: {
  score: number;
  confidence: number;
  signal: MarketSignal;
  riskLevel: RiskLevel;
  conflictLevel: ConflictLevel;
  consensusStrength: number;
  directionVotes: DirectionVotes;
  direction: MarketDirection;
  components: MarketComponent[];
}): { summary: string; reasons: string[] } {
  const sorted = [...input.components].sort(
    (left, right) => right.effectiveWeight - left.effectiveWeight,
  );

  const reasons = sorted.map((component) => {
    const label = componentLabel[component.name];
    const direction = directionLabel[component.direction];
    const freshness =
      component.freshnessFactor >= 0.85
        ? "최신"
        : component.freshnessFactor >= 0.65
          ? "다소 경과"
          : "오래된";
    return `${label}은 ${Math.round(component.score)}점으로 ${direction}이며, 신뢰도 ${Math.round(component.confidence)}점의 ${freshness} 데이터입니다.`;
  });

  const agreementText = buildAgreementText({
    direction: input.direction,
    directionVotes: input.directionVotes,
    components: sorted,
  });

  const confidenceText =
    input.confidence >= 80
      ? "데이터 신뢰도는 높은 편입니다."
      : input.confidence >= 60
        ? "데이터 신뢰도는 보통 이상입니다."
        : "데이터 신뢰도가 낮아 추가 확인이 필요합니다.";

  const summary = [
    signalLead[input.signal],
    `종합 점수는 ${Math.round(input.score)}점, 신뢰도는 ${Math.round(input.confidence)}점입니다.`,
    `방향 합의도는 ${Math.round(input.consensusStrength)}%이며 위험 수준은 ${riskLabel[input.riskLevel]}입니다.`,
    agreementText,
    conflictText[input.conflictLevel],
    confidenceText,
  ].join(" ");

  return { summary, reasons };
}
