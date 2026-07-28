import { supabase } from "../lib/supabase";

const STRATEGY_VERSION = "final-market-ai-v2.3-semantic-dedup";
const SEMANTIC_DEDUP_WINDOW_MINUTES = 5;
const SCORE_TOLERANCE = 0.01;

type Direction =
  | "bullish"
  | "neutral"
  | "bearish";

type FinalAction =
  | "strong_buy"
  | "buy"
  | "wait"
  | "reduce"
  | "sell";

type RiskLevel =
  | "low"
  | "normal"
  | "high"
  | "critical";

type TradingPermission =
  | "allowed"
  | "caution"
  | "blocked";

type SignalAlignment =
  | "strong_alignment"
  | "alignment"
  | "mixed"
  | "conflict";

interface LatestTechnicalScore {
  id: number;
  analyzed_at: string;
  total_score: number | string;
  confidence: number | string;
  direction: Direction;
  market_regime: string;
  trading_permission: string;
  risk_level: string;
  score_details: Record<string, unknown> | null;
}

interface LatestNewsScore {
  id: number;
  calculated_at: string;
  weighted_score: number | string;
  confidence: number | string;
  direction: Direction;
  risk_level: string;
  market_pressure: string;
  dominant_category: string | null;
  conflict_score: number | string;
  event_summary: unknown[];
  score_details: Record<string, unknown> | null;
}

interface LatestFundingSnapshot {
  id: number;
  fetched_at: string;
  funding_rate: number | string;
  funding_rate_percent: number | string;
  annualized_rate_percent: number | string;
  score: number | string;
  confidence: number | string;
  direction: Direction;
  risk_level: string;
  trading_permission: string;
  score_details: Record<string, unknown> | null;
}

interface DynamicWeights {
  technical: number;
  news: number;
  funding: number;
  reason: string;
}

interface RecentFinalDecision {
  id: number;
  decided_at: string;
  final_score: number | string;
  final_confidence: number | string;
  direction: Direction;
  action: FinalAction;
  risk_level: RiskLevel;
  trading_permission: TradingPermission;
}

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(Math.max(value, min), max);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function isWithinTolerance(
  left: number,
  right: number,
  tolerance = SCORE_TOLERANCE,
): boolean {
  return Math.abs(left - right) <= tolerance;
}

function scoreToDirection(
  score: number,
): Direction {
  if (score >= 57) {
    return "bullish";
  }

  if (score <= 43) {
    return "bearish";
  }

  return "neutral";
}

function normalizeRiskLevel(
  value: string,
): RiskLevel {
  if (
    value === "low" ||
    value === "normal" ||
    value === "high" ||
    value === "critical"
  ) {
    return value;
  }

  return "normal";
}

function calculateDynamicWeights(
  newsConfidence: number,
  conflictScore: number,
  marketPressure: string,
  articleCount: number,
  fundingConfidence: number,
  fundingRatePercent: number,
  fundingRisk: RiskLevel,
): DynamicWeights {
  let newsWeight = 0.2;
  let fundingWeight = 0.1;
  const reasons: string[] = [];

  if (newsConfidence >= 80) {
    newsWeight += 0.15;
    reasons.push("뉴스 신뢰도 매우 높음");
  } else if (newsConfidence >= 65) {
    newsWeight += 0.1;
    reasons.push("뉴스 신뢰도 높음");
  } else if (newsConfidence >= 50) {
    newsWeight += 0.05;
    reasons.push("뉴스 신뢰도 보통");
  } else {
    newsWeight -= 0.05;
    reasons.push("뉴스 신뢰도 낮음");
  }

  if (
    marketPressure === "strong_bullish" ||
    marketPressure === "strong_bearish"
  ) {
    newsWeight += 0.08;
    reasons.push("강한 뉴스 압력");
  }

  if (articleCount >= 8) {
    newsWeight += 0.06;
    reasons.push("충분한 기사 수");
  } else if (articleCount <= 2) {
    newsWeight -= 0.05;
    reasons.push("기사 수 부족");
  }

  if (conflictScore >= 70) {
    newsWeight -= 0.1;
    reasons.push("뉴스 방향 충돌 매우 큼");
  } else if (conflictScore >= 40) {
    newsWeight -= 0.05;
    reasons.push("뉴스 방향 충돌 존재");
  }

  if (fundingConfidence >= 70) {
    fundingWeight += 0.08;
    reasons.push("펀딩 신뢰도 높음");
  } else if (fundingConfidence >= 55) {
    fundingWeight += 0.04;
    reasons.push("펀딩 신뢰도 보통");
  } else {
    fundingWeight -= 0.02;
    reasons.push("펀딩 신뢰도 낮음");
  }

  const absoluteFundingRate =
    Math.abs(fundingRatePercent);

  if (absoluteFundingRate >= 0.05) {
    fundingWeight += 0.07;
    reasons.push("펀딩 과열 신호 강함");
  } else if (absoluteFundingRate >= 0.02) {
    fundingWeight += 0.04;
    reasons.push("펀딩 쏠림 신호 존재");
  }

  if (
    fundingRisk === "high" ||
    fundingRisk === "critical"
  ) {
    fundingWeight += 0.03;
    reasons.push("펀딩 위험도 상승");
  }

  newsWeight = clamp(
    newsWeight,
    0.1,
    0.42,
  );

  fundingWeight = clamp(
    fundingWeight,
    0.06,
    0.22,
  );

  const combinedNonTechnical =
    newsWeight + fundingWeight;

  if (combinedNonTechnical > 0.6) {
    const scale =
      0.6 / combinedNonTechnical;

    newsWeight *= scale;
    fundingWeight *= scale;
  }

  const technicalWeight =
    1 - newsWeight - fundingWeight;

  return {
    technical: round4(technicalWeight),
    news: round4(newsWeight),
    funding: round4(fundingWeight),
    reason: reasons.join(", "),
  };
}

function calculateAlignment(
  technicalScore: number,
  newsScore: number,
  fundingScore: number,
): SignalAlignment {
  const directions = [
    scoreToDirection(technicalScore),
    scoreToDirection(newsScore),
    scoreToDirection(fundingScore),
  ];

  const bullishCount =
    directions.filter(
      (direction) =>
        direction === "bullish",
    ).length;

  const bearishCount =
    directions.filter(
      (direction) =>
        direction === "bearish",
    ).length;

  const neutralCount =
    directions.filter(
      (direction) =>
        direction === "neutral",
    ).length;

  const scoreSpread =
    Math.max(
      technicalScore,
      newsScore,
      fundingScore,
    ) -
    Math.min(
      technicalScore,
      newsScore,
      fundingScore,
    );

  if (
    (bullishCount === 3 ||
      bearishCount === 3) &&
    scoreSpread <= 12
  ) {
    return "strong_alignment";
  }

  if (
    bullishCount >= 2 ||
    bearishCount >= 2
  ) {
    return neutralCount > 0
      ? "alignment"
      : scoreSpread <= 20
        ? "alignment"
        : "mixed";
  }

  if (
    bullishCount > 0 &&
    bearishCount > 0
  ) {
    return "conflict";
  }

  return "mixed";
}

function calculateFinalConfidence(
  technicalConfidence: number,
  newsConfidence: number,
  fundingConfidence: number,
  technicalWeight: number,
  newsWeight: number,
  fundingWeight: number,
  alignment: SignalAlignment,
  conflictScore: number,
): number {
  const baseConfidence =
    technicalConfidence * technicalWeight +
    newsConfidence * newsWeight +
    fundingConfidence * fundingWeight;

  const alignmentAdjustment: Record<
    SignalAlignment,
    number
  > = {
    strong_alignment: 8,
    alignment: 4,
    mixed: -3,
    conflict: -12,
  };

  const newsConflictPenalty =
    conflictScore * 0.08;

  return clamp(
    baseConfidence +
      alignmentAdjustment[alignment] -
      newsConflictPenalty,
    0,
    100,
  );
}

function determineFinalRisk(
  technicalRisk: RiskLevel,
  newsRisk: RiskLevel,
  fundingRisk: RiskLevel,
  conflictScore: number,
  alignment: SignalAlignment,
): RiskLevel {
  if (
    technicalRisk === "critical" ||
    newsRisk === "critical" ||
    fundingRisk === "critical"
  ) {
    return "critical";
  }

  if (
    technicalRisk === "high" ||
    newsRisk === "high" ||
    fundingRisk === "high" ||
    conflictScore >= 70 ||
    alignment === "conflict"
  ) {
    return "high";
  }

  if (
    technicalRisk === "low" &&
    newsRisk === "low" &&
    fundingRisk === "low" &&
    conflictScore < 20
  ) {
    return "low";
  }

  return "normal";
}

function determinePermission(
  technicalPermission: string,
  fundingPermission: string,
  finalRisk: RiskLevel,
  finalConfidence: number,
  alignment: SignalAlignment,
): TradingPermission {
  // 기술 신호 차단 또는 최종 위험도 critical은 실제 거래를 차단합니다.
  if (
    technicalPermission === "blocked" ||
    finalRisk === "critical"
  ) {
    return "blocked";
  }

  // Funding의 blocked는 단독 차단 조건이 아니라 경고 조건으로 취급합니다.
  if (
    technicalPermission === "caution" ||
    fundingPermission === "caution" ||
    fundingPermission === "blocked" ||
    finalRisk === "high" ||
    finalConfidence < 45 ||
    alignment === "conflict"
  ) {
    return "caution";
  }

  return "allowed";
}

function determineAction(
  finalScore: number,
  finalConfidence: number,
  permission: TradingPermission,
  risk: RiskLevel,
): FinalAction {
  if (permission === "blocked") {
    return "wait";
  }

  if (
    finalScore >= 75 &&
    finalConfidence >= 70 &&
    risk !== "high"
  ) {
    return "strong_buy";
  }

  if (
    finalScore >= 60 &&
    finalConfidence >= 55
  ) {
    return "buy";
  }

  if (
    finalScore <= 25 &&
    finalConfidence >= 70
  ) {
    return "sell";
  }

  if (
    finalScore <= 40 &&
    finalConfidence >= 55
  ) {
    return "reduce";
  }

  return "wait";
}

function buildDecisionSummary(
  action: FinalAction,
  finalScore: number,
  finalConfidence: number,
  alignment: SignalAlignment,
  risk: RiskLevel,
  technicalDirection: Direction,
  newsDirection: Direction,
  fundingDirection: Direction,
  fundingRatePercent: number,
  tradingPermission: TradingPermission,
): string {
  const directionLabels: Record<Direction, string> = {
    bullish: "강세",
    neutral: "중립",
    bearish: "약세",
  };

  const actionLabels: Record<FinalAction, string> = {
    strong_buy: "강한 매수 우위",
    buy: "매수 우위",
    wait: "관망",
    reduce: "비중 축소",
    sell: "매도 우위",
  };

  const alignmentLabels: Record<SignalAlignment, string> = {
    strong_alignment: "세 신호가 강하게 일치합니다.",
    alignment: "세 신호가 대체로 같은 방향입니다.",
    mixed: "세 신호가 혼재되어 있습니다.",
    conflict: "세 신호가 서로 충돌하고 있습니다.",
  };

  const permissionLabels: Record<TradingPermission, string> = {
    allowed: "거래 가능",
    caution: "주의 필요",
    blocked: "거래 차단",
  };

  const absoluteFundingRate = Math.abs(fundingRatePercent);
  const fundingCondition =
    absoluteFundingRate >= 0.05
      ? "강한 과열"
      : absoluteFundingRate >= 0.03
        ? "과열"
        : absoluteFundingRate >= 0.01
          ? "약한 쏠림"
          : "중립";

  return [
    `기술 신호는 ${directionLabels[technicalDirection]}, 뉴스는 ${directionLabels[newsDirection]}, 펀딩은 ${directionLabels[fundingDirection]}이며 ${fundingCondition} 상태입니다.`,
    alignmentLabels[alignment],
    `최종 판단은 ${actionLabels[action]}이고 점수 ${round2(finalScore)}점, 신뢰도 ${round2(finalConfidence)}%, 위험도 ${risk}, 거래 상태는 ${permissionLabels[tradingPermission]}입니다.`,
  ].join(" ");
}

function getNewsArticleCount(
  scoreDetails:
    Record<string, unknown> | null,
): number {
  const weightedArticles =
    scoreDetails?.weighted_articles;

  return Array.isArray(weightedArticles)
    ? weightedArticles.length
    : 0;
}

function assertFiniteValue(
  value: number,
  label: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `${label} 값이 올바르지 않습니다.`,
    );
  }
}

export async function generateFinalMarketDecision(): Promise<void> {
  console.log(
    "[Final Market AI] 최종 판단 계산 시작",
  );

  const {
    data: technicalRaw,
    error: technicalError,
  } = await supabase
    .from("market_scores")
    .select(
      `
      id,
      analyzed_at,
      total_score,
      confidence,
      direction,
      market_regime,
      trading_permission,
      risk_level,
      score_details
      `,
    )
    .eq("symbol", "BTCUSDT")
    .order("analyzed_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (technicalError) {
    throw new Error(
      `최신 기술점수 조회 실패: ${technicalError.message}`,
    );
  }

  if (!technicalRaw) {
    console.log(
      "[Final Market AI] 기술점수가 없습니다.",
    );
    return;
  }

  const {
    data: newsRaw,
    error: newsError,
  } = await supabase
    .from("news_scores")
    .select(
      `
      id,
      calculated_at,
      weighted_score,
      confidence,
      direction,
      risk_level,
      market_pressure,
      dominant_category,
      conflict_score,
      event_summary,
      score_details
      `,
    )
    .eq("symbol", "BTCUSDT")
    .order("calculated_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (newsError) {
    throw new Error(
      `최신 뉴스점수 조회 실패: ${newsError.message}`,
    );
  }

  if (!newsRaw) {
    console.log(
      "[Final Market AI] 뉴스점수가 없습니다.",
    );
    return;
  }

  const {
    data: fundingRaw,
    error: fundingError,
  } = await supabase
    .from("funding_snapshots")
    .select(
      `
      id,
      fetched_at,
      funding_rate,
      funding_rate_percent,
      annualized_rate_percent,
      score,
      confidence,
      direction,
      risk_level,
      trading_permission,
      score_details
      `,
    )
    .eq("symbol", "BTCUSDT")
    .order("fetched_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (fundingError) {
    throw new Error(
      `최신 펀딩점수 조회 실패: ${fundingError.message}`,
    );
  }

  if (!fundingRaw) {
    console.log(
      "[Final Market AI] 펀딩점수가 없습니다.",
    );
    return;
  }

  const technical =
    technicalRaw as unknown as
      LatestTechnicalScore;

  const news =
    newsRaw as unknown as
      LatestNewsScore;

  const funding =
    fundingRaw as unknown as
      LatestFundingSnapshot;

  const technicalScore =
    Number(technical.total_score);

  const technicalConfidence =
    Number(technical.confidence);

  const newsScore =
    Number(news.weighted_score);

  const newsConfidence =
    Number(news.confidence);

  const conflictScore =
    Number(news.conflict_score);

  const fundingScore =
    Number(funding.score);

  const fundingConfidence =
    Number(funding.confidence);

  const fundingRate =
    Number(funding.funding_rate);

  const fundingRatePercent =
    Number(
      funding.funding_rate_percent,
    );

  const annualizedFundingRatePercent =
    Number(
      funding.annualized_rate_percent,
    );

  assertFiniteValue(
    technicalScore,
    "기술점수",
  );
  assertFiniteValue(
    technicalConfidence,
    "기술 신뢰도",
  );
  assertFiniteValue(
    newsScore,
    "뉴스점수",
  );
  assertFiniteValue(
    newsConfidence,
    "뉴스 신뢰도",
  );
  assertFiniteValue(
    conflictScore,
    "뉴스 충돌점수",
  );
  assertFiniteValue(
    fundingScore,
    "펀딩점수",
  );
  assertFiniteValue(
    fundingConfidence,
    "펀딩 신뢰도",
  );
  assertFiniteValue(
    fundingRatePercent,
    "펀딩비",
  );

  const articleCount =
    getNewsArticleCount(
      news.score_details,
    );

  const fundingRisk =
    normalizeRiskLevel(
      funding.risk_level,
    );

  const weights =
    calculateDynamicWeights(
      newsConfidence,
      conflictScore,
      news.market_pressure,
      articleCount,
      fundingConfidence,
      fundingRatePercent,
      fundingRisk,
    );

  const finalScore =
    technicalScore *
      weights.technical +
    newsScore *
      weights.news +
    fundingScore *
      weights.funding;

  const alignment =
    calculateAlignment(
      technicalScore,
      newsScore,
      fundingScore,
    );

  const finalConfidence =
    calculateFinalConfidence(
      technicalConfidence,
      newsConfidence,
      fundingConfidence,
      weights.technical,
      weights.news,
      weights.funding,
      alignment,
      conflictScore,
    );

  const finalRisk =
    determineFinalRisk(
      normalizeRiskLevel(
        technical.risk_level,
      ),
      normalizeRiskLevel(
        news.risk_level,
      ),
      fundingRisk,
      conflictScore,
      alignment,
    );

  const tradingPermission =
    determinePermission(
      technical.trading_permission,
      funding.trading_permission,
      finalRisk,
      finalConfidence,
      alignment,
    );

  const action =
    determineAction(
      finalScore,
      finalConfidence,
      tradingPermission,
      finalRisk,
    );

  const finalDirection =
    scoreToDirection(finalScore);

  const decisionReasons = [
    {
      type: "technical",
      score: round2(technicalScore),
      confidence:
        round2(technicalConfidence),
      direction:
        technical.direction,
      regime:
        technical.market_regime,
    },
    {
      type: "news",
      score: round2(newsScore),
      confidence:
        round2(newsConfidence),
      direction:
        news.direction,
      pressure:
        news.market_pressure,
      dominant_category:
        news.dominant_category,
      conflict_score:
        round2(conflictScore),
    },
    {
      type: "funding",
      score: round2(fundingScore),
      confidence:
        round2(fundingConfidence),
      direction:
        funding.direction,
      funding_rate:
        fundingRate,
      funding_rate_percent:
        fundingRatePercent,
      annualized_rate_percent:
        annualizedFundingRatePercent,
      risk_level:
        funding.risk_level,
      trading_permission:
        funding.trading_permission,
    },
    {
      type: "permission",
      technical_permission:
        technical.trading_permission,
      funding_permission:
        funding.trading_permission,
      final_permission:
        tradingPermission,
      funding_block_policy:
        funding.trading_permission === "blocked"
          ? "caution_only"
          : "normal",
    },
    {
      type: "weighting",
      technical_weight:
        weights.technical,
      news_weight:
        weights.news,
      funding_weight:
        weights.funding,
      reason:
        weights.reason,
    },
  ];

  const decisionSummary =
    buildDecisionSummary(
      action,
      finalScore,
      finalConfidence,
      alignment,
      finalRisk,
      technical.direction,
      news.direction,
      funding.direction,
      fundingRatePercent,
      tradingPermission,
    );

  // 동일한 기술·뉴스·펀딩 입력 조합은 전략 버전별로 한 번만 저장합니다.
  const { data: existingDecision, error: existingDecisionError } =
    await supabase
      .from("final_market_decisions")
      .select("id, decided_at")
      .eq("symbol", "BTCUSDT")
      .eq("technical_score_id", technical.id)
      .eq("news_score_id", news.id)
      .eq("funding_score_id", funding.id)
      .eq("strategy_version", STRATEGY_VERSION)
      .limit(1)
      .maybeSingle();

  if (existingDecisionError) {
    throw new Error(
      `기존 최종 시장판단 확인 실패: ${existingDecisionError.message}`,
    );
  }

  if (existingDecision) {
    console.log(
      "[Final Market AI] 동일한 입력 조합의 판단이 이미 존재하여 건너뜁니다.",
      {
        existingDecisionId: existingDecision.id,
        existingDecidedAt: existingDecision.decided_at,
        technicalScoreId: technical.id,
        newsScoreId: news.id,
        fundingScoreId: funding.id,
        strategyVersion: STRATEGY_VERSION,
      },
    );
    return;
  }

  // 입력 ID가 달라도 최근 일정 시간 안에 핵심 판단 결과가 같으면 저장하지 않습니다.
  const semanticDedupCutoff = new Date(
    Date.now() -
      SEMANTIC_DEDUP_WINDOW_MINUTES *
        60 *
        1000,
  ).toISOString();

  const {
    data: recentDecisionRaw,
    error: recentDecisionError,
  } = await supabase
    .from("final_market_decisions")
    .select(
      `
      id,
      decided_at,
      final_score,
      final_confidence,
      direction,
      action,
      risk_level,
      trading_permission
      `,
    )
    .eq("symbol", "BTCUSDT")
    .eq("strategy_version", STRATEGY_VERSION)
    .gte("decided_at", semanticDedupCutoff)
    .order("decided_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (recentDecisionError) {
    throw new Error(
      `최근 최종 시장판단 확인 실패: ${recentDecisionError.message}`,
    );
  }

  const recentDecision =
    recentDecisionRaw as unknown as
      RecentFinalDecision | null;

  if (recentDecision) {
    const recentFinalScore = Number(
      recentDecision.final_score,
    );
    const recentFinalConfidence = Number(
      recentDecision.final_confidence,
    );

    const hasValidRecentScores =
      Number.isFinite(recentFinalScore) &&
      Number.isFinite(recentFinalConfidence);

    const isSemanticallySame =
      hasValidRecentScores &&
      isWithinTolerance(
        recentFinalScore,
        round2(finalScore),
      ) &&
      isWithinTolerance(
        recentFinalConfidence,
        round2(finalConfidence),
      ) &&
      recentDecision.direction ===
        finalDirection &&
      recentDecision.action === action &&
      recentDecision.risk_level ===
        finalRisk &&
      recentDecision.trading_permission ===
        tradingPermission;

    if (isSemanticallySame) {
      console.log(
        "[Final Market AI] 최근 판단과 핵심 결과가 동일하여 저장을 건너뜁니다.",
        {
          recentDecisionId:
            recentDecision.id,
          recentDecidedAt:
            recentDecision.decided_at,
          dedupWindowMinutes:
            SEMANTIC_DEDUP_WINDOW_MINUTES,
          finalScore: round2(finalScore),
          finalConfidence:
            round2(finalConfidence),
          direction: finalDirection,
          action,
          riskLevel: finalRisk,
          tradingPermission,
          strategyVersion: STRATEGY_VERSION,
        },
      );
      return;
    }
  }

  const { error: insertError } =
    await supabase
      .from("final_market_decisions")
      .insert({
        symbol: "BTCUSDT",
        decided_at:
          new Date().toISOString(),

        technical_score_id:
          technical.id,
        news_score_id:
          news.id,
        funding_score_id:
          funding.id,

        technical_score:
          round2(technicalScore),
        technical_confidence:
          round2(technicalConfidence),
        news_score:
          round2(newsScore),
        news_confidence:
          round2(newsConfidence),
        funding_score:
          round2(fundingScore),
        funding_confidence:
          round2(fundingConfidence),

        technical_weight:
          weights.technical,
        news_weight:
          weights.news,
        funding_weight:
          weights.funding,

        final_score:
          round2(finalScore),
        final_confidence:
          round2(finalConfidence),

        direction:
          finalDirection,
        action,
        market_regime:
          technical.market_regime,
        risk_level:
          finalRisk,
        trading_permission:
          tradingPermission,

        signal_alignment:
          alignment,
        conflict_score:
          round2(conflictScore),

        decision_summary:
          decisionSummary,
        decision_reasons:
          decisionReasons,
        score_details: {
          technical:
            technical.score_details,
          news:
            news.score_details,
          funding:
            funding.score_details,
          news_event_summary:
            news.event_summary,
          formula:
            "technical_score * technical_weight + news_score * news_weight + funding_score * funding_weight",
          weights: {
            technical:
              weights.technical,
            news:
              weights.news,
            funding:
              weights.funding,
          },
          funding_metrics: {
            funding_rate:
              fundingRate,
            funding_rate_percent:
              fundingRatePercent,
            annualized_rate_percent:
              annualizedFundingRatePercent,
          },
        },

        strategy_version:
          STRATEGY_VERSION,
      });

  if (insertError) {
    // 여러 워커가 동시에 실행된 경우 DB UNIQUE 인덱스가 중복을 막을 수 있습니다.
    if (insertError.code === "23505") {
      console.log(
        "[Final Market AI] 동시 실행 중 동일 입력 조합이 먼저 저장되어 건너뜁니다.",
        {
          technicalScoreId: technical.id,
          newsScoreId: news.id,
          fundingScoreId: funding.id,
          strategyVersion: STRATEGY_VERSION,
        },
      );
      return;
    }

    throw new Error(
      `최종 시장판단 저장 실패: ${insertError.message}`,
    );
  }

  console.log(
    "[Final Market AI] 저장 완료",
    {
      technicalScore:
        round2(technicalScore),
      newsScore:
        round2(newsScore),
      fundingScore:
        round2(fundingScore),
      technicalWeight:
        weights.technical,
      newsWeight:
        weights.news,
      fundingWeight:
        weights.funding,
      finalScore:
        round2(finalScore),
      finalConfidence:
        round2(finalConfidence),
      direction:
        finalDirection,
      action,
      alignment,
      riskLevel:
        finalRisk,
      tradingPermission,
    },
  );
}
