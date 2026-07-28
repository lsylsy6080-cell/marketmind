export interface TechnicalSnapshotInput {
  close_price: number;
  ema_20: number;
  ema_60: number;
  ema_120: number;
  ema_240: number;
  rsi_14: number;
  macd: number;
  macd_signal: number;
  macd_histogram: number;
  atr_14: number;
  adx_14: number;
  bollinger_width: number;
  volume_ratio: number;
  mfi_14: number;
  market_structure: string;
  trend_direction: string;
  momentum_direction: string;
  volatility_state: string;
}

export interface MarketScoreResult {
  marketRegime: string;
  direction: "bullish" | "neutral" | "bearish";
  totalScore: number;
  confidence: number;
  trendScore: number;
  momentumScore: number;
  volumeScore: number;
  structureScore: number;
  volatilityScore: number;
  derivativesScore: number;
  tradingPermission: "allowed" | "caution" | "blocked";
  riskLevel: "low" | "normal" | "high" | "critical";
  reasons: string[];
  details: Record<string, unknown>;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function scoreTrend(snapshot: TechnicalSnapshotInput): {
  score: number;
  reasons: string[];
} {
  let score = 50;
  const reasons: string[] = [];

  const bullishStack =
    snapshot.close_price > snapshot.ema_20 &&
    snapshot.ema_20 > snapshot.ema_60 &&
    snapshot.ema_60 > snapshot.ema_120 &&
    snapshot.ema_120 > snapshot.ema_240;

  const bearishStack =
    snapshot.close_price < snapshot.ema_20 &&
    snapshot.ema_20 < snapshot.ema_60 &&
    snapshot.ema_60 < snapshot.ema_120 &&
    snapshot.ema_120 < snapshot.ema_240;

  if (bullishStack) {
    score += 35;
    reasons.push("EMA 20·60·120·240이 정배열입니다.");
  } else if (bearishStack) {
    score -= 35;
    reasons.push("EMA 20·60·120·240이 역배열입니다.");
  } else if (
    snapshot.close_price > snapshot.ema_20 &&
    snapshot.ema_20 > snapshot.ema_60
  ) {
    score += 18;
    reasons.push("가격이 단기 EMA 위에 있고 단기 추세가 상승입니다.");
  } else if (
    snapshot.close_price < snapshot.ema_20 &&
    snapshot.ema_20 < snapshot.ema_60
  ) {
    score -= 18;
    reasons.push("가격이 단기 EMA 아래에 있고 단기 추세가 하락입니다.");
  } else {
    reasons.push("EMA 배열이 혼조 상태입니다.");
  }

  if (snapshot.adx_14 >= 30) {
    const directionBonus = score >= 50 ? 10 : -10;
    score += directionBonus;
    reasons.push("ADX가 30 이상으로 추세 강도가 높습니다.");
  } else if (snapshot.adx_14 >= 20) {
    const directionBonus = score >= 50 ? 5 : -5;
    score += directionBonus;
    reasons.push("ADX가 20 이상으로 추세가 형성되고 있습니다.");
  } else {
    score += (50 - score) * 0.25;
    reasons.push("ADX가 낮아 현재 추세의 신뢰도는 제한적입니다.");
  }

  return {
    score: round(clamp(score)),
    reasons,
  };
}

function scoreMomentum(snapshot: TechnicalSnapshotInput): {
  score: number;
  reasons: string[];
} {
  let score = 50;
  const reasons: string[] = [];

  if (snapshot.rsi_14 >= 70) {
    score += 8;
    reasons.push("RSI가 과매수 구간에 있어 상승 힘과 조정 위험이 함께 존재합니다.");
  } else if (snapshot.rsi_14 >= 60) {
    score += 18;
    reasons.push("RSI가 상승 모멘텀 구간입니다.");
  } else if (snapshot.rsi_14 <= 30) {
    score -= 8;
    reasons.push("RSI가 과매도 구간에 있어 하락 압력과 반등 가능성이 함께 존재합니다.");
  } else if (snapshot.rsi_14 <= 40) {
    score -= 18;
    reasons.push("RSI가 하락 모멘텀 구간입니다.");
  } else {
    reasons.push("RSI는 중립 구간입니다.");
  }

  if (
    snapshot.macd > snapshot.macd_signal &&
    snapshot.macd_histogram > 0
  ) {
    score += 20;
    reasons.push("MACD가 시그널 위에 있고 히스토그램이 양수입니다.");
  } else if (
    snapshot.macd < snapshot.macd_signal &&
    snapshot.macd_histogram < 0
  ) {
    score -= 20;
    reasons.push("MACD가 시그널 아래에 있고 히스토그램이 음수입니다.");
  } else {
    reasons.push("MACD 방향성이 뚜렷하지 않습니다.");
  }

  if (snapshot.mfi_14 >= 80) {
    score -= 5;
    reasons.push("MFI가 과열 구간입니다.");
  } else if (snapshot.mfi_14 >= 60) {
    score += 8;
    reasons.push("MFI가 양호한 자금 유입을 나타냅니다.");
  } else if (snapshot.mfi_14 <= 20) {
    score += 5;
    reasons.push("MFI가 과매도 구간으로 반등 여지가 있습니다.");
  } else if (snapshot.mfi_14 <= 40) {
    score -= 8;
    reasons.push("MFI가 약한 자금 흐름을 나타냅니다.");
  }

  return {
    score: round(clamp(score)),
    reasons,
  };
}

function scoreVolume(snapshot: TechnicalSnapshotInput): {
  score: number;
  reasons: string[];
} {
  let score = 50;
  const reasons: string[] = [];

  const direction =
    snapshot.macd_histogram > 0
      ? 1
      : snapshot.macd_histogram < 0
        ? -1
        : 0;

  if (snapshot.volume_ratio >= 2.5) {
    score += 25 * direction;
    reasons.push(
      direction > 0
        ? "평균 대비 거래량이 크게 증가하며 상승 모멘텀을 확인했습니다."
        : direction < 0
          ? "평균 대비 거래량이 크게 증가하며 하락 모멘텀을 확인했습니다."
          : "거래량이 급증했지만 방향은 아직 불명확합니다.",
    );
  } else if (snapshot.volume_ratio >= 1.5) {
    score += 15 * direction;
    reasons.push(
      direction > 0
        ? "거래량 증가가 상승 방향을 보강합니다."
        : direction < 0
          ? "거래량 증가가 하락 방향을 보강합니다."
          : "거래량은 증가했지만 방향 확인이 필요합니다.",
    );
  } else if (snapshot.volume_ratio < 0.6) {
    score += (50 - score) * 0.5;
    reasons.push("거래량이 평균보다 낮아 현재 신호의 신뢰도가 약합니다.");
  } else {
    reasons.push("거래량은 평소 범위입니다.");
  }

  return {
    score: round(clamp(score)),
    reasons,
  };
}

function scoreStructure(snapshot: TechnicalSnapshotInput): {
  score: number;
  reasons: string[];
} {
  switch (snapshot.market_structure) {
    case "higher_high_higher_low":
      return {
        score: 80,
        reasons: ["고점과 저점이 함께 높아지는 상승 구조입니다."],
      };
    case "lower_high_lower_low":
      return {
        score: 20,
        reasons: ["고점과 저점이 함께 낮아지는 하락 구조입니다."],
      };
    case "range":
      return {
        score: 50,
        reasons: ["최근 가격 구조는 박스권입니다."],
      };
    default:
      return {
        score: 50,
        reasons: ["가격 구조를 명확히 분류하지 못했습니다."],
      };
  }
}

function scoreVolatility(snapshot: TechnicalSnapshotInput): {
  score: number;
  reasons: string[];
} {
  const width = snapshot.bollinger_width;
  const atrPercent =
    snapshot.close_price === 0
      ? 0
      : (snapshot.atr_14 / snapshot.close_price) * 100;

  let score = 55;
  const reasons: string[] = [];

  if (width <= 0.002) {
    score = 58;
    reasons.push("볼린저밴드 폭이 매우 좁아 변동성 압축 상태입니다.");
  } else if (width <= 0.01) {
    score = 65;
    reasons.push("변동성이 안정적인 범위입니다.");
  } else if (width <= 0.03) {
    score = 55;
    reasons.push("변동성이 보통 수준입니다.");
  } else if (width <= 0.06) {
    score = 38;
    reasons.push("변동성이 높아 진입 위험이 증가했습니다.");
  } else {
    score = 20;
    reasons.push("변동성이 매우 높아 보수적인 대응이 필요합니다.");
  }

  if (atrPercent >= 1) {
    score -= 15;
    reasons.push("ATR 비율이 높아 단기 가격 흔들림이 큽니다.");
  } else if (atrPercent <= 0.1) {
    score += 3;
    reasons.push("ATR 비율이 낮아 단기 가격 범위가 좁습니다.");
  }

  return {
    score: round(clamp(score)),
    reasons,
  };
}

function determineMarketRegime(
  snapshot: TechnicalSnapshotInput,
): string {
  const isTrending = snapshot.adx_14 >= 20;

  if (
    isTrending &&
    (snapshot.trend_direction === "strong_bullish" ||
      snapshot.trend_direction === "bullish")
  ) {
    return "bull_trend";
  }

  if (
    isTrending &&
    (snapshot.trend_direction === "strong_bearish" ||
      snapshot.trend_direction === "bearish")
  ) {
    return "bear_trend";
  }

  if (
    snapshot.volatility_state === "high" ||
    snapshot.bollinger_width >= 0.04
  ) {
    return "high_volatility";
  }

  if (snapshot.bollinger_width <= 0.002) {
    return "volatility_compression";
  }

  return "range";
}

function determineRiskLevel(
  snapshot: TechnicalSnapshotInput,
  volatilityScore: number,
  confidence: number,
): MarketScoreResult["riskLevel"] {
  const atrPercent =
    snapshot.close_price === 0
      ? 0
      : (snapshot.atr_14 / snapshot.close_price) * 100;

  if (
    snapshot.bollinger_width >= 0.08 ||
    atrPercent >= 2
  ) {
    return "critical";
  }

  if (
    volatilityScore < 35 ||
    confidence < 40 ||
    snapshot.bollinger_width >= 0.04
  ) {
    return "high";
  }

  if (
    volatilityScore >= 65 &&
    confidence >= 70
  ) {
    return "low";
  }

  return "normal";
}

export function calculateTechnicalMarketScore(
  snapshot: TechnicalSnapshotInput,
): MarketScoreResult {
  const trend = scoreTrend(snapshot);
  const momentum = scoreMomentum(snapshot);
  const volume = scoreVolume(snapshot);
  const structure = scoreStructure(snapshot);
  const volatility = scoreVolatility(snapshot);

  const derivativesScore = 50;

  const totalScore = round(
    trend.score * 0.30 +
      momentum.score * 0.25 +
      volume.score * 0.15 +
      structure.score * 0.15 +
      volatility.score * 0.15,
  );

  const directionalScores = [
    trend.score,
    momentum.score,
    volume.score,
    structure.score,
  ];

  const bullishVotes = directionalScores.filter(
    (score) => score >= 60,
  ).length;

  const bearishVotes = directionalScores.filter(
    (score) => score <= 40,
  ).length;

  const agreement = Math.max(bullishVotes, bearishVotes) / 4;
  const trendStrength = clamp(snapshot.adx_14 / 40, 0, 1);
  const distanceFromNeutral = Math.abs(totalScore - 50) / 50;

  const confidence = round(
    clamp(
      40 +
        agreement * 25 +
        trendStrength * 20 +
        distanceFromNeutral * 15,
    ),
  );

  const direction: MarketScoreResult["direction"] =
    totalScore >= 60
      ? "bullish"
      : totalScore <= 40
        ? "bearish"
        : "neutral";

  const marketRegime = determineMarketRegime(snapshot);
  const riskLevel = determineRiskLevel(
    snapshot,
    volatility.score,
    confidence,
  );

  let tradingPermission: MarketScoreResult["tradingPermission"];
  let permissionReason: string;

  const hasInvalidMarketData =
    snapshot.close_price <= 0 ||
    snapshot.ema_20 <= 0 ||
    snapshot.ema_60 <= 0 ||
    snapshot.ema_120 <= 0 ||
    snapshot.ema_240 <= 0;

  if (hasInvalidMarketData) {
    tradingPermission = "blocked";
    permissionReason =
      "가격 또는 EMA 데이터가 올바르지 않아 거래 판단을 차단했습니다.";
  } else if (riskLevel === "critical") {
    tradingPermission = "blocked";
    permissionReason =
      "시장 위험도가 critical이므로 거래 판단을 차단했습니다.";
  } else if (
    riskLevel === "high" ||
    confidence < 55 ||
    direction === "neutral" ||
    (totalScore > 45 && totalScore < 55)
  ) {
    tradingPermission = "caution";
    permissionReason =
      direction === "neutral"
        ? "방향성이 중립이므로 신규 진입은 주의가 필요합니다."
        : riskLevel === "high"
          ? "시장 위험도가 높아 보수적인 거래가 필요합니다."
          : confidence < 55
            ? "기술 신호 신뢰도가 낮아 거래에 주의가 필요합니다."
            : "점수가 중립 구간에 가까워 거래에 주의가 필요합니다.";
  } else {
    tradingPermission = "allowed";
    permissionReason =
      "시장 위험도와 신뢰도가 거래 허용 기준을 충족했습니다.";
  }

  const reasons = [
    ...trend.reasons,
    ...momentum.reasons,
    ...volume.reasons,
    ...structure.reasons,
    ...volatility.reasons,
    permissionReason,
  ];

  return {
    marketRegime,
    direction,
    totalScore,
    confidence,
    trendScore: trend.score,
    momentumScore: momentum.score,
    volumeScore: volume.score,
    structureScore: structure.score,
    volatilityScore: volatility.score,
    derivativesScore,
    tradingPermission,
    riskLevel,
    reasons,
    details: {
      weights: {
        trend: 0.30,
        momentum: 0.25,
        volume: 0.15,
        structure: 0.15,
        volatility: 0.15,
      },
      source_indicators: {
        close_price: snapshot.close_price,
        ema_20: snapshot.ema_20,
        ema_60: snapshot.ema_60,
        ema_120: snapshot.ema_120,
        ema_240: snapshot.ema_240,
        rsi_14: snapshot.rsi_14,
        macd: snapshot.macd,
        macd_signal: snapshot.macd_signal,
        macd_histogram: snapshot.macd_histogram,
        atr_14: snapshot.atr_14,
        adx_14: snapshot.adx_14,
        bollinger_width: snapshot.bollinger_width,
        volume_ratio: snapshot.volume_ratio,
        mfi_14: snapshot.mfi_14,
        market_structure: snapshot.market_structure,
      },
      vote_summary: {
        bullish_votes: bullishVotes,
        bearish_votes: bearishVotes,
        agreement: round(agreement * 100),
      },
      permission_policy: {
        permission: tradingPermission,
        reason: permissionReason,
        blocked_only_when: [
          "invalid_market_data",
          "critical_risk",
        ],
      },
      reasons,
    },
  };
}
