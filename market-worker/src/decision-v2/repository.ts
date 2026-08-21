import { supabase } from "../lib/supabase";
import type { MarketRegimeResult } from "../regime/types";
import type { DecisionV2Component, DecisionV2Result } from "./types";

interface SourceBundle {
  previousEntryPlan: import("./types").EntryTimingPlan | null;
  previousEntryPlanCalculatedAt: string | null;
  marketStructure: import("./types").EntryMarketStructure | null;
  technical: DecisionV2Component & { id: number };
  news: DecisionV2Component & { id: number };
  funding: DecisionV2Component & { id: number };
  regime: MarketRegimeResult & { sourceId: number };
  v1DecisionId: number | null;
}

const asNumber = (value: unknown, field: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`[Decision V2] ${field} 숫자 변환 실패: ${String(value)}`);
  return parsed;
};

export async function loadDecisionV2Sources(): Promise<SourceBundle> {
  const [technicalResult, newsResult, fundingResult, regimeResult, v1Result, calibrationResult, previousPlanResult, candles15mResult, candles1hResult] = await Promise.all([
    supabase.from("market_scores")
      .select("id,analyzed_at,total_score,confidence,direction,risk_level,trading_permission,score_details")
      .eq("symbol", "BTCUSDT").order("analyzed_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("news_scores")
      .select("id,calculated_at,weighted_score,confidence,direction,risk_level,conflict_score,score_details")
      .eq("symbol", "BTCUSDT").order("calculated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("funding_snapshots")
      .select("id,fetched_at,score,confidence,direction,risk_level,trading_permission,score_details")
      .eq("symbol", "BTCUSDT").order("fetched_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("market_regime_snapshots")
      .select("id,bucket_time,calculated_at,regime,direction_bias,confidence,trend_score,alignment_score,weighted_adx,high_volatility_weight,risk_level,timeframe_details,reasons,strategy_version")
      .eq("symbol", "BTCUSDT").eq("strategy_version", "market-regime-v2.0")
      .order("calculated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("final_market_decisions")
      .select("id").eq("symbol", "BTCUSDT").order("decided_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("signal_calibration_snapshots")
      .select("calculated_at,news_candidate,funding_candidate,strategy_version").eq("symbol", "BTCUSDT")
      .eq("strategy_version", "signal-calibration-v2.3a3").order("calculated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("ai_decision_v2_snapshots")
      .select("calculated_at,entry_plan,entry_trigger,strategy_version").eq("symbol", "BTCUSDT")
      .in("strategy_version", ["decision-engine-v2.5-entry-timing", "decision-engine-v2.5.1-entry-trigger-validator"])
      .not("entry_plan", "is", null).order("calculated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("market_candles")
      .select("open_time,high,low").eq("exchange","binance").eq("market_type","spot").eq("symbol","BTCUSDT")
      .eq("timeframe","15m").eq("is_closed",true).order("open_time",{ascending:false}).limit(20),
    supabase.from("market_candles")
      .select("open_time,high,low").eq("exchange","binance").eq("market_type","spot").eq("symbol","BTCUSDT")
      .eq("timeframe","1h").eq("is_closed",true).order("open_time",{ascending:false}).limit(20),
  ]);

  for (const [label, result] of [
    ["기술", technicalResult], ["뉴스", newsResult], ["펀딩", fundingResult], ["Regime", regimeResult],
  ] as const) {
    if (result.error) throw new Error(`[Decision V2] ${label} 데이터 조회 실패: ${result.error.message}`);
    if (!result.data) throw new Error(`[Decision V2] ${label} 데이터가 없습니다.`);
  }

  const t = technicalResult.data as any;
  const n = newsResult.data as any;
  const f = fundingResult.data as any;
  const r = regimeResult.data as any;
  const calibration = calibrationResult.error ? null : (calibrationResult.data as any);
  const calibrationAgeHours = calibration?.calculated_at ? (Date.now() - new Date(calibration.calculated_at).getTime()) / 3_600_000 : Infinity;
  const newsCandidate = calibrationAgeHours <= 24 ? (calibration?.news_candidate ?? null) : null;
  const fundingCandidate = calibration?.funding_candidate ?? null;

  const previousPlanRow = previousPlanResult.error ? null : (previousPlanResult.data as any);
  const previousTrigger = previousPlanRow?.entry_trigger ?? null;
  const previousWasInvalidated = previousTrigger?.status === "INVALIDATED";
  const previousEntryPlan = (
    previousWasInvalidated
      ? null
      : (previousTrigger?.referencePlan ?? previousPlanRow?.entry_plan ?? null)
  ) as import("./types").EntryTimingPlan | null;

  const structureRows15 = candles15mResult.error ? [] : ((candles15mResult.data ?? []) as any[]);
  const structureRows1h = candles1hResult.error ? [] : ((candles1hResult.data ?? []) as any[]);
  const finiteValues = (rows: any[], key: "high" | "low") =>
    rows.map((row) => Number(row[key])).filter((value) => Number.isFinite(value));
  const highs15 = finiteValues(structureRows15, "high");
  const lows15 = finiteValues(structureRows15, "low");
  const highs1h = finiteValues(structureRows1h, "high");
  const lows1h = finiteValues(structureRows1h, "low");
  const marketStructure = (highs15.length || lows15.length || highs1h.length || lows1h.length) ? {
    swingLow15m: lows15.length ? Math.min(...lows15) : null,
    swingHigh15m: highs15.length ? Math.max(...highs15) : null,
    swingLow1h: lows1h.length ? Math.min(...lows1h) : null,
    swingHigh1h: highs1h.length ? Math.max(...highs1h) : null,
    observedAt: String(structureRows15[0]?.open_time ?? structureRows1h[0]?.open_time ?? "") || null,
  } : null;

  return {
    previousEntryPlan,
    previousEntryPlanCalculatedAt:
      previousTrigger?.referencePlanCalculatedAt ?? previousPlanRow?.calculated_at ?? null,
    marketStructure,
    technical: {
      id: Number(t.id), score: asNumber(t.total_score, "technical.score"),
      confidence: asNumber(t.confidence, "technical.confidence"), direction: t.direction,
      observedAt: t.analyzed_at, riskLevel: t.risk_level, tradingPermission: t.trading_permission,
      details: t.score_details ?? null,
    },
    news: {
      id: Number(n.id), score: asNumber(n.weighted_score, "news.score"),
      confidence: asNumber(n.confidence, "news.confidence"), direction: n.direction,
      observedAt: n.calculated_at, riskLevel: n.risk_level,
      conflictScore: asNumber(n.conflict_score ?? 0, "news.conflict_score"), details: n.score_details ?? null,
      limitedNewsCandidate: newsCandidate ? { status: String(newsCandidate.status ?? "unknown"), bullishThreshold: Number.isFinite(Number(newsCandidate.bullishThreshold)) ? Number(newsCandidate.bullishThreshold) : null, bearishThreshold: Number.isFinite(Number(newsCandidate.bearishThreshold)) ? Number(newsCandidate.bearishThreshold) : null, mode: "bullish_only" } : undefined,
    },
    funding: {
      id: Number(f.id), score: asNumber(f.score, "funding.score"),
      confidence: asNumber(f.confidence, "funding.confidence"), direction: f.direction,
      observedAt: f.fetched_at, riskLevel: f.risk_level, tradingPermission: f.trading_permission,
      details: f.score_details ?? null,
      fundingCrowdingCandidate: fundingCandidate ? {
        status: String(fundingCandidate.status ?? "unknown"),
        sampleCount: Number(fundingCandidate.sampleCount ?? 0),
        p10BasisPoints: Number.isFinite(Number(fundingCandidate.p10BasisPoints)) ? Number(fundingCandidate.p10BasisPoints) : null,
        medianBasisPoints: Number.isFinite(Number(fundingCandidate.medianBasisPoints)) ? Number(fundingCandidate.medianBasisPoints) : null,
        p90BasisPoints: Number.isFinite(Number(fundingCandidate.p90BasisPoints)) ? Number(fundingCandidate.p90BasisPoints) : null,
        p90AbsoluteBasisPoints: Number.isFinite(Number(fundingCandidate.p90AbsoluteBasisPoints)) ? Number(fundingCandidate.p90AbsoluteBasisPoints) : null,
        sourceAgeHours: calibrationAgeHours,
      } : undefined,
    },
    regime: {
      sourceId: Number(r.id), symbol: "BTCUSDT", calculatedAt: r.calculated_at, bucketTime: r.bucket_time,
      regime: r.regime, directionBias: r.direction_bias, confidence: asNumber(r.confidence, "regime.confidence"),
      trendScore: asNumber(r.trend_score, "regime.trend_score"), alignmentScore: asNumber(r.alignment_score, "regime.alignment_score"),
      weightedAdx: asNumber(r.weighted_adx, "regime.weighted_adx"), highVolatilityWeight: asNumber(r.high_volatility_weight, "regime.high_volatility_weight"),
      riskLevel: r.risk_level, timeframeDetails: r.timeframe_details ?? [], reasons: r.reasons ?? [], strategyVersion: "market-regime-v2.0",
    },
    v1DecisionId: v1Result.error ? null : Number(v1Result.data?.id ?? 0) || null,
  };
}

export async function saveDecisionV2(result: DecisionV2Result, source: SourceBundle): Promise<void> {
  const payload = {
    symbol: result.symbol,
    calculated_at: result.calculatedAt,
    technical_score_id: source.technical.id,
    news_score_id: source.news.id,
    funding_score_id: source.funding.id,
    regime_snapshot_id: source.regime.sourceId,
    v1_decision_id: source.v1DecisionId,
    direction_score: result.directionScore,
    market_trend_strength: result.marketTrendStrength,
    direction_strength: result.directionStrength,
    final_score: result.finalScore,
    final_confidence: result.finalConfidence,
    direction: result.direction,
    action: result.action,
    entry_quality_score: result.entryQualityScore,
    entry_quality: result.entryQuality,
    overheat_risk: result.overheatRisk,
    reversal_risk: result.reversalRisk,
    data_reliability: result.dataReliability,
    risk_level: result.riskLevel,
    trading_permission: result.tradingPermission,
    preferred_entry: result.preferredEntry,
    entry_plan: result.entryPlan,
    entry_trigger: result.entryTrigger,
    funding_crowding_risk: result.fundingCrowdingRisk,
    funding_crowding_side: result.fundingCrowdingSide,
    funding_entry_penalty: result.fundingEntryPenalty,
    funding_crowding_status: result.fundingCrowdingStatus,
    weights: result.weights,
    component_contributions: result.componentContributions,
    decision_reasons: result.reasons,
    invalidation_conditions: result.invalidationConditions,
    strategy_version: result.strategyVersion,
  };

  const { error } = await supabase.from("ai_decision_v2_snapshots").upsert(payload, {
    onConflict: "technical_score_id,news_score_id,funding_score_id,regime_snapshot_id,strategy_version",
    ignoreDuplicates: false,
  });
  if (error) throw new Error(`[Decision V2] 저장 실패: ${error.message}`);
}
