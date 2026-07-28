import { supabase } from "../lib/supabase";

type Direction =
  | "bullish"
  | "neutral"
  | "bearish";

type RiskLevel =
  | "low"
  | "normal"
  | "high"
  | "critical";

type TradingPermission =
  | "allowed"
  | "caution"
  | "blocked";

interface BinancePremiumIndexResponse {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  estimatedSettlePrice?: string;
  lastFundingRate: string;
  interestRate?: string;
  nextFundingTime: number;
  time: number;
}

interface FundingAnalysis {
  score: number;
  confidence: number;
  direction: Direction;
  riskLevel: RiskLevel;
  tradingPermission: TradingPermission;
  reasons: string[];
}

const BINANCE_PREMIUM_INDEX_URL =
  "https://fapi.binance.com/fapi/v1/premiumIndex";

const STRATEGY_VERSION = "funding-ai-v1";

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(Math.max(value, min), max);
}

function round(
  value: number,
  digits = 2,
): number {
  const multiplier = 10 ** digits;

  return (
    Math.round(value * multiplier) /
    multiplier
  );
}

function assertFiniteNumber(
  value: string,
  fieldName: string,
): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Binance 응답의 ${fieldName} 값이 올바르지 않습니다: ${value}`,
    );
  }

  return parsed;
}

async function fetchBtcFundingData(): Promise<
  BinancePremiumIndexResponse
> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    10_000,
  );

  try {
    const url = new URL(
      BINANCE_PREMIUM_INDEX_URL,
    );
    url.searchParams.set(
      "symbol",
      "BTCUSDT",
    );

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        `Binance Funding API 실패: HTTP ${response.status} ${body}`,
      );
    }

    const data =
      (await response.json()) as
        BinancePremiumIndexResponse;

    if (
      !data ||
      data.symbol !== "BTCUSDT"
    ) {
      throw new Error(
        "Binance Funding API에서 BTCUSDT 응답을 받지 못했습니다.",
      );
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function analyzeFundingRate(
  fundingRate: number,
): FundingAnalysis {
  // fundingRate 0.0001 = 0.01% = 1bp
  const fundingBasisPoints =
    fundingRate * 10_000;

  // 양수 펀딩은 롱 포지션 과밀로 보고
  // 역발상 관점에서 점수를 낮춥니다.
  const score = clamp(
    50 - fundingBasisPoints * 2.5,
    0,
    100,
  );

  const absoluteBasisPoints =
    Math.abs(fundingBasisPoints);

  const confidence = clamp(
    45 +
      Math.min(
        absoluteBasisPoints * 5,
        40,
      ),
    0,
    85,
  );

  let direction: Direction = "neutral";

  if (score >= 57) {
    direction = "bullish";
  } else if (score <= 43) {
    direction = "bearish";
  }

  let riskLevel: RiskLevel = "low";
  let tradingPermission:
    TradingPermission = "allowed";

  if (absoluteBasisPoints >= 10) {
    riskLevel = "critical";
    tradingPermission = "blocked";
  } else if (absoluteBasisPoints >= 5) {
    riskLevel = "high";
    tradingPermission = "caution";
  } else if (absoluteBasisPoints >= 2) {
    riskLevel = "normal";
  }

  const reasons: string[] = [];

  if (fundingBasisPoints >= 5) {
    reasons.push(
      "펀딩비가 매우 높아 롱 포지션 과밀 위험이 큽니다.",
    );
  } else if (fundingBasisPoints >= 2) {
    reasons.push(
      "양수 펀딩비가 높아 롱 포지션 쏠림 가능성이 있습니다.",
    );
  } else if (fundingBasisPoints > 0.25) {
    reasons.push(
      "펀딩비가 소폭 양수로 롱 우위지만 과열 수준은 아닙니다.",
    );
  } else if (fundingBasisPoints <= -5) {
    reasons.push(
      "펀딩비가 매우 낮아 숏 포지션 과밀과 숏 스퀴즈 가능성이 큽니다.",
    );
  } else if (fundingBasisPoints <= -2) {
    reasons.push(
      "음수 펀딩비가 낮아 숏 포지션 쏠림 가능성이 있습니다.",
    );
  } else if (fundingBasisPoints < -0.25) {
    reasons.push(
      "펀딩비가 소폭 음수로 숏 우위지만 과열 수준은 아닙니다.",
    );
  } else {
    reasons.push(
      "펀딩비가 0에 가까워 포지션 쏠림이 제한적입니다.",
    );
  }

  return {
    score: round(score),
    confidence: round(confidence),
    direction,
    riskLevel,
    tradingPermission,
    reasons,
  };
}

export async function generateBtcFundingSnapshot(): Promise<void> {
  console.log(
    "[Funding AI] BTCUSDT 펀딩 데이터 수집 시작",
  );

  const raw =
    await fetchBtcFundingData();

  const fundingRate =
    assertFiniteNumber(
      raw.lastFundingRate,
      "lastFundingRate",
    );

  const markPrice =
    assertFiniteNumber(
      raw.markPrice,
      "markPrice",
    );

  const indexPrice =
    assertFiniteNumber(
      raw.indexPrice,
      "indexPrice",
    );

  const fundingRatePercent =
    fundingRate * 100;

  // BTCUSDT 무기한 선물의 일반적인 8시간 주기 기준
  // 단순 연율 환산값이며 실제 수익률을 의미하지 않습니다.
  const annualizedRatePercent =
    fundingRate * 3 * 365 * 100;

  const analysis =
    analyzeFundingRate(fundingRate);

  const fetchedAt = new Date(
    raw.time,
  ).toISOString();

  const nextFundingTime =
    raw.nextFundingTime > 0
      ? new Date(
          raw.nextFundingTime,
        ).toISOString()
      : null;

  const fundingTime =
    nextFundingTime
      ? new Date(
          raw.nextFundingTime -
            8 * 60 * 60 * 1000,
        ).toISOString()
      : null;

  const { error } = await supabase
    .from("funding_snapshots")
    .insert({
      symbol: raw.symbol,
      fetched_at: fetchedAt,
      funding_time: fundingTime,
      next_funding_time:
        nextFundingTime,
      funding_rate: fundingRate,
      funding_rate_percent:
        round(fundingRatePercent, 6),
      annualized_rate_percent:
        round(
          annualizedRatePercent,
          4,
        ),
      mark_price: markPrice,
      index_price: indexPrice,
      score: analysis.score,
      confidence:
        analysis.confidence,
      direction:
        analysis.direction,
      risk_level:
        analysis.riskLevel,
      trading_permission:
        analysis.tradingPermission,
      score_details: {
        reasons: analysis.reasons,
        funding_basis_points:
          round(
            fundingRate * 10_000,
            4,
          ),
        interpretation:
          "positive funding lowers the contrarian score; negative funding raises it",
        source:
          "Binance USD-M Futures premiumIndex",
      },
      strategy_version:
        STRATEGY_VERSION,
    });

  if (error) {
    throw new Error(
      `Funding AI 저장 실패: ${error.message}`,
    );
  }

  console.log(
    "[Funding AI] 저장 완료",
    {
      symbol: raw.symbol,
      fundingRatePercent:
        round(
          fundingRatePercent,
          6,
        ),
      annualizedRatePercent:
        round(
          annualizedRatePercent,
          4,
        ),
      score: analysis.score,
      confidence:
        analysis.confidence,
      direction:
        analysis.direction,
      riskLevel:
        analysis.riskLevel,
      tradingPermission:
        analysis.tradingPermission,
    },
  );
}
