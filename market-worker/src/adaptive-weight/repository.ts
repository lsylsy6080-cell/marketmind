import { supabase } from "../lib/supabase";
import type { MarketRegime } from "../regime/types";
import type { AdvisorWeights, ComponentPerformanceSample, WeightAdvisorResult } from "./types";

interface PerformanceRow {
  decision_id: number;
  market_return: number | string;
  evaluated_at: string;
}

interface DecisionRow {
  id: number;
  technical_score: number | string;
  news_score: number | string;
  funding_score: number | string;
}

const numberOf = (value: unknown, label: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`[Weight Advisor] ${label} 숫자 변환 실패: ${String(value)}`);
  return parsed;
};

export async function loadCurrentRegimeAndBaseline(): Promise<{ regime: MarketRegime; baseline: AdvisorWeights }> {
  const { data, error } = await supabase
    .from("market_regime_snapshots")
    .select("regime")
    .eq("symbol", "BTCUSDT")
    .eq("strategy_version", "market-regime-v2.0")
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`[Weight Advisor] Regime 조회 실패: ${error.message}`);
  if (!data) throw new Error("[Weight Advisor] 최신 Regime 데이터가 없습니다.");

  const regime = data.regime as MarketRegime;
  switch (regime) {
    case "strong_bull_trend":
    case "strong_bear_trend":
      return { regime, baseline: { technical: 0.34, news: 0.16, funding: 0.14, regime: 0.36 } };
    case "bull_trend":
    case "bear_trend":
      return { regime, baseline: { technical: 0.34, news: 0.19, funding: 0.16, regime: 0.31 } };
    case "range":
      return { regime, baseline: { technical: 0.27, news: 0.25, funding: 0.23, regime: 0.25 } };
    case "high_volatility":
      return { regime, baseline: { technical: 0.24, news: 0.26, funding: 0.22, regime: 0.28 } };
    case "transition":
    default:
      return { regime, baseline: { technical: 0.29, news: 0.24, funding: 0.18, regime: 0.29 } };
  }
}

export async function loadPerformanceSamples(limit = 200): Promise<ComponentPerformanceSample[]> {
  const { data: performanceData, error: performanceError } = await supabase
    .from("final_market_performance")
    .select("decision_id,market_return,evaluated_at")
    .eq("symbol", "BTCUSDT")
    .eq("evaluation_horizon", "24h")
    .eq("evaluation_status", "completed")
    .order("evaluated_at", { ascending: false })
    .limit(limit);
  if (performanceError) throw new Error(`[Weight Advisor] Performance 조회 실패: ${performanceError.message}`);

  const performances = (performanceData ?? []) as unknown as PerformanceRow[];
  const decisionIds = [...new Set(performances.map((row) => Number(row.decision_id)).filter(Number.isFinite))];
  if (decisionIds.length === 0) return [];

  const { data: decisionData, error: decisionError } = await supabase
    .from("final_market_decisions")
    .select("id,technical_score,news_score,funding_score")
    .in("id", decisionIds);
  if (decisionError) throw new Error(`[Weight Advisor] Decision source 조회 실패: ${decisionError.message}`);

  const decisionMap = new Map<number, DecisionRow>();
  for (const row of (decisionData ?? []) as unknown as DecisionRow[]) decisionMap.set(Number(row.id), row);

  const samples: ComponentPerformanceSample[] = [];
  for (const perf of performances) {
    const decision = decisionMap.get(Number(perf.decision_id));
    if (!decision) continue;
    try {
      samples.push({
        evaluatedAt: perf.evaluated_at,
        marketReturn: numberOf(perf.market_return, "market_return"),
        technicalScore: numberOf(decision.technical_score, "technical_score"),
        newsScore: numberOf(decision.news_score, "news_score"),
        fundingScore: numberOf(decision.funding_score, "funding_score"),
      });
    } catch {
      // 손상된 과거 한 행 때문에 전체 advisor가 중단되지 않도록 해당 행만 제외한다.
    }
  }
  return samples;
}

export async function saveWeightAdvice(result: WeightAdvisorResult): Promise<void> {
  const { error } = await supabase.from("adaptive_weight_advisor_snapshots").insert({
    symbol: result.symbol,
    calculated_at: result.calculatedAt,
    regime: result.regime,
    baseline_weights: result.baselineWeights,
    candidate_weights: result.candidateWeights,
    recommended_weights: result.recommendedWeights,
    evidence: result.evidence,
    sample_count: result.sampleCount,
    status: result.status,
    status_reason: result.statusReason,
    validation_summary: result.validationSummary,
    max_adjustment: result.maxAdjustment,
    methodology: result.methodology,
    strategy_version: result.strategyVersion,
  });
  if (error) throw new Error(`[Weight Advisor] 저장 실패: ${error.message}`);
}
