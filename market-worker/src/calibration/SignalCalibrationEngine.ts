import type {
  ContrarianBias,
  CrowdingSide,
  FundingCrowdingCandidate,
  NewsCalibrationCandidate,
  NewsDirection,
  SignalCalibrationResult,
} from "./types";

type Row = Record<string, unknown>;
const MIN_SAMPLES = 100;
const MIN_NEWS_SPREAD = 0.75;
const round = (value: number, digits = 4): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
const clamp = (value: number, min = 0, max = 100): number => Math.min(Math.max(value, min), max);

function finite(values: number[]): number[] {
  return values.filter(Number.isFinite).sort((a, b) => a - b);
}

function quantile(values: number[], p: number): number | null {
  const sorted = finite(values);
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  const weight = index - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

function mean(values: number[]): number | null {
  const clean = finite(values);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function stdDev(values: number[]): number | null {
  const clean = finite(values);
  if (!clean.length) return null;
  const avg = mean(clean) ?? 0;
  return Math.sqrt(clean.reduce((sum, value) => sum + (value - avg) ** 2, 0) / clean.length);
}

export function classifyNewsScore(score: number, bearishThreshold: number, bullishThreshold: number): NewsDirection {
  if (score >= bullishThreshold) return "bullish";
  if (score <= bearishThreshold) return "bearish";
  return "neutral";
}

export function calibrateNewsThresholds(newsRows: Row[]): NewsCalibrationCandidate {
  const scores = finite(newsRows.map((row) => Number(row.weighted_score)));
  if (!scores.length) {
    return {
      sampleCount: 0,
      scoreMin: null,
      scoreMax: null,
      scoreMean: null,
      scoreStdDev: null,
      bearishThreshold: null,
      bullishThreshold: null,
      expectedBearishRate: 0,
      expectedNeutralRate: 0,
      expectedBullishRate: 0,
      actualSpread: null,
      minimumSpreadRequired: MIN_NEWS_SPREAD,
      status: "source_inactive",
      reason: "News score 표본이 없습니다.",
    };
  }

  const bearish = quantile(scores, 0.1)!;
  const bullish = quantile(scores, 0.9)!;
  const spread = bullish - bearish;
  const status = scores.length < MIN_SAMPLES || spread < MIN_NEWS_SPREAD ? "insufficient_data" : "candidate_ready";
  const classified = scores.map((score) => classifyNewsScore(score, bearish, bullish));
  const bearishCount = classified.filter((value) => value === "bearish").length;
  const bullishCount = classified.filter((value) => value === "bullish").length;
  const neutralCount = scores.length - bearishCount - bullishCount;

  return {
    sampleCount: scores.length,
    scoreMin: round(scores[0]),
    scoreMax: round(scores.at(-1)!),
    scoreMean: round(mean(scores)!),
    scoreStdDev: round(stdDev(scores)!),
    bearishThreshold: round(bearish),
    bullishThreshold: round(bullish),
    expectedBearishRate: round(bearishCount / scores.length),
    expectedNeutralRate: round(neutralCount / scores.length),
    expectedBullishRate: round(bullishCount / scores.length),
    actualSpread: round(spread),
    minimumSpreadRequired: MIN_NEWS_SPREAD,
    status,
    reason:
      status === "candidate_ready"
        ? "최근 score 분포의 P10/P90을 후보 threshold로 사용합니다. 기존 43/57은 변경하지 않습니다."
        : scores.length < MIN_SAMPLES
          ? `News 표본이 ${scores.length}건으로 최소 ${MIN_SAMPLES}건 미만입니다.`
          : `P10/P90 간격 ${round(spread)}가 최소 spread ${MIN_NEWS_SPREAD}보다 좁아 자동 후보 적용을 보류합니다.`,
  };
}

function percentileRank(values: number[], current: number): number {
  const sorted = finite(values);
  if (!sorted.length) return 0.5;
  const below = sorted.filter((value) => value < current).length;
  const equal = sorted.filter((value) => value === current).length;
  return (below + equal * 0.5) / sorted.length;
}

function absoluteSeverity(bp: number): number {
  const x = Math.abs(bp);
  if (x >= 10) return 100;
  if (x >= 5) return 75 + ((x - 5) / 5) * 25;
  if (x >= 2) return 45 + ((x - 2) / 3) * 30;
  if (x >= 1) return 20 + (x - 1) * 25;
  return x * 20;
}

export function buildFundingCrowdingModel(fundingRows: Row[]): FundingCrowdingCandidate {
  const rows = fundingRows
    .map((row) => ({ at: String(row.fetched_at ?? ""), bp: Number(row.funding_rate) * 10_000 }))
    .filter((row) => Number.isFinite(row.bp))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const bps = rows.map((row) => row.bp);

  if (!bps.length) {
    return {
      sampleCount: 0,
      currentFundingBasisPoints: null,
      signedPercentile: null,
      absolutePercentile: null,
      crowdingSide: "balanced",
      crowdingRisk: 0,
      contrarianBias: "neutral",
      contrarianAdjustment: 0,
      p10BasisPoints: null,
      medianBasisPoints: null,
      p90BasisPoints: null,
      p90AbsoluteBasisPoints: null,
      status: "source_inactive",
      reason: "Funding 표본이 없습니다.",
    };
  }

  const current = rows.at(-1)!.bp;
  const signedP = percentileRank(bps, current);
  const absolute = bps.map(Math.abs);
  const absP = percentileRank(absolute, Math.abs(current));
  const empiricalExtreme = clamp(Math.abs(signedP - 0.5) * 200);
  const risk = clamp(empiricalExtreme * 0.6 + absoluteSeverity(current) * 0.4);

  let side: CrowdingSide = "balanced";
  let bias: ContrarianBias = "neutral";
  if (current > 0 && signedP >= 0.8) {
    side = "long_crowded";
    bias = "bearish";
  } else if (current < 0 && signedP <= 0.2) {
    side = "short_crowded";
    bias = "bullish";
  }

  // 방향 score 대체가 아니라 risk 보정용 후보값. 최대 ±8점으로 제한한다.
  const adjustmentMagnitude = Math.min(8, risk * 0.08);
  const adjustment = bias === "bullish" ? adjustmentMagnitude : bias === "bearish" ? -adjustmentMagnitude : 0;
  const status = bps.length < MIN_SAMPLES ? "insufficient_data" : "candidate_ready";

  return {
    sampleCount: bps.length,
    currentFundingBasisPoints: round(current),
    signedPercentile: round(signedP),
    absolutePercentile: round(absP),
    crowdingSide: side,
    crowdingRisk: round(risk, 2),
    contrarianBias: bias,
    contrarianAdjustment: round(adjustment, 2),
    p10BasisPoints: round(quantile(bps, 0.1)!),
    medianBasisPoints: round(quantile(bps, 0.5)!),
    p90BasisPoints: round(quantile(bps, 0.9)!),
    p90AbsoluteBasisPoints: round(quantile(absolute, 0.9)!),
    status,
    reason:
      status === "candidate_ready"
        ? "Funding을 방향 신호가 아닌 crowding/contrarian risk 후보로 해석합니다. Decision V2에는 아직 자동 적용하지 않습니다."
        : `Funding 표본이 ${bps.length}건으로 최소 ${MIN_SAMPLES}건 미만입니다.`,
  };
}

export function buildSignalCalibration(newsRows: Row[], fundingRows: Row[], windowHours = 168): SignalCalibrationResult {
  const news = calibrateNewsThresholds(newsRows);
  const funding = buildFundingCrowdingModel(fundingRows);
  const recommendations: string[] = [];

  if (news.status === "candidate_ready") {
    recommendations.push(`News 후보 threshold: bearish ≤ ${news.bearishThreshold}, bullish ≥ ${news.bullishThreshold}. 기존 43/57과 병렬 비교합니다.`);
  } else {
    recommendations.push(`News calibration 보류: ${news.reason}`);
  }
  if (funding.status === "candidate_ready") {
    recommendations.push(`Funding 현재 crowding=${funding.crowdingSide}, risk=${funding.crowdingRisk}/100, contrarian adjustment=${funding.contrarianAdjustment}. 관찰용으로만 저장합니다.`);
  } else {
    recommendations.push(`Funding crowding calibration 보류: ${funding.reason}`);
  }
  recommendations.push("7-3A.3은 observation_only입니다. 기존 News/Funding score와 Decision V2 가중치는 변경하지 않습니다.");

  return {
    symbol: "BTCUSDT",
    calculatedAt: new Date().toISOString(),
    windowHours,
    mode: "observation_only",
    news,
    funding,
    recommendations,
    strategyVersion: "signal-calibration-v2.3a3",
  };
}
