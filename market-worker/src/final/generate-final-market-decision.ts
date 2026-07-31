import { assertFiniteValue, runDecisionEngine, round2 } from "../decision";
import { supabase } from "../lib/supabase";

const STRATEGY_VERSION = "final-market-ai-v2.3-semantic-dedup";
const SEMANTIC_DEDUP_WINDOW_MINUTES = 5;
const SCORE_TOLERANCE = 0.01;

type Direction = "bullish" | "neutral" | "bearish";
type FinalAction = "strong_buy" | "buy" | "wait" | "reduce" | "sell";
type RiskLevel = "low" | "normal" | "high" | "critical";
type TradingPermission = "allowed" | "caution" | "blocked";

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

function isWithinTolerance(
  left: number,
  right: number,
  tolerance = SCORE_TOLERANCE,
): boolean {
  return Math.abs(left - right) <= tolerance;
}

function getNewsArticleCount(
  scoreDetails: Record<string, unknown> | null,
): number {
  const weightedArticles = scoreDetails?.weighted_articles;
  return Array.isArray(weightedArticles) ? weightedArticles.length : 0;
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

  const articleCount = getNewsArticleCount(news.score_details);

  const decision = runDecisionEngine({
    technical: {
      score: technicalScore,
      confidence: technicalConfidence,
      direction: technical.direction,
      riskLevel: technical.risk_level,
      tradingPermission: technical.trading_permission,
      marketRegime: technical.market_regime,
    },
    news: {
      score: newsScore,
      confidence: newsConfidence,
      direction: news.direction,
      riskLevel: news.risk_level,
      conflictScore,
      marketPressure: news.market_pressure,
      articleCount,
      dominantCategory: news.dominant_category,
    },
    funding: {
      score: fundingScore,
      confidence: fundingConfidence,
      direction: funding.direction,
      riskLevel: funding.risk_level,
      tradingPermission: funding.trading_permission,
      fundingRate,
      fundingRatePercent,
      annualizedRatePercent: annualizedFundingRatePercent,
    },
  });

  const {
    finalScore,
    finalConfidence,
    direction: finalDirection,
    action,
    riskLevel: finalRisk,
    tradingPermission,
    alignment,
    weights,
    summary: decisionSummary,
    reasons: decisionReasons,
  } = decision;

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
