import { supabase } from "../lib/supabase";
import type {
  ComponentName,
  MarketComponent,
  MarketDirection,
  MarketIntelligenceResult,
} from "./types";

const CONFIGURED_WEIGHTS: Record<ComponentName, number> = {
  funding: 0.4,
  etf: 0.35,
  news: 0.25,
};

const MAX_AGE_HOURS: Record<ComponentName, number> = {
  // v2는 배치 지연을 고려해 핵심 지표의 기준을 48시간으로 통일합니다.
  funding: 48,
  news: 48,
  // ETF는 주말과 미국 휴장일을 고려합니다.
  etf: 120,
};

function asNumber(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} 값이 숫자가 아닙니다: ${String(value)}`);
  }
  return parsed;
}

function asDirection(value: unknown): MarketDirection {
  if (value === "bullish" || value === "bearish" || value === "neutral") {
    return value;
  }
  return "neutral";
}

function ageHours(observedAt: string, now: Date): number {
  const timestamp = new Date(observedAt).getTime();
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - timestamp) / 3_600_000);
}

function freshnessFactor(age: number, maxAge: number): number {
  if (age > maxAge) return 0;
  // 최신 데이터는 1.0, 허용시간 끝에서는 0.55까지 완만히 감소합니다.
  return Math.max(0.55, 1 - (age / maxAge) * 0.45);
}

function makeComponent(input: {
  name: ComponentName;
  score: unknown;
  confidence: unknown;
  direction: unknown;
  observedAt: string;
  sourceId?: string | number | null;
  details?: Record<string, unknown>;
  now: Date;
}): MarketComponent {
  const age = ageHours(input.observedAt, input.now);
  const maxAge = MAX_AGE_HOURS[input.name];

  return {
    name: input.name,
    score: asNumber(input.score, `${input.name}.score`),
    confidence: asNumber(input.confidence, `${input.name}.confidence`),
    direction: asDirection(input.direction),
    observedAt: input.observedAt,
    ageHours: Math.round(age * 100) / 100,
    configuredWeight: CONFIGURED_WEIGHTS[input.name],
    effectiveWeight: 0,
    freshnessFactor: freshnessFactor(age, maxAge),
    isFresh: age <= maxAge,
    sourceId: input.sourceId,
    details: input.details,
  };
}

export async function loadLatestMarketComponents(
  now = new Date(),
): Promise<MarketComponent[]> {
  const [fundingResult, newsResult, etfResult] = await Promise.all([
    supabase
      .from("funding_snapshots")
      .select("id, fetched_at, score, confidence, direction, risk_level, trading_permission, score_details")
      .eq("symbol", "BTCUSDT")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("news_scores")
      .select("id, calculated_at, weighted_score, confidence, direction, risk_level, article_count, score_details")
      .eq("symbol", "BTCUSDT")
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("etf_scores")
      .select("id, flow_date, score, confidence, direction, daily_flow_usd, flow_3d_usd, flow_5d_usd, flow_20d_usd, positive_streak, negative_streak, score_details")
      .eq("asset", "BTC")
      .order("flow_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const failures = [
    ["funding", fundingResult.error],
    ["news", newsResult.error],
    ["etf", etfResult.error],
  ].filter(([, error]) => error);

  if (failures.length > 0) {
    throw new Error(
      failures
        .map(([name, error]) => `${name}: ${(error as { message: string }).message}`)
        .join(" | "),
    );
  }

  const components: MarketComponent[] = [];

  if (fundingResult.data) {
    const row = fundingResult.data as Record<string, unknown>;
    components.push(
      makeComponent({
        name: "funding",
        score: row.score,
        confidence: row.confidence,
        direction: row.direction,
        observedAt: String(row.fetched_at),
        sourceId: row.id as string | number | null,
        details: {
          risk_level: row.risk_level,
          trading_permission: row.trading_permission,
          score_details: row.score_details,
        },
        now,
      }),
    );
  }

  if (newsResult.data) {
    const row = newsResult.data as Record<string, unknown>;
    components.push(
      makeComponent({
        name: "news",
        score: row.weighted_score,
        confidence: row.confidence,
        direction: row.direction,
        observedAt: String(row.calculated_at),
        sourceId: row.id as string | number | null,
        details: {
          risk_level: row.risk_level,
          article_count: row.article_count,
          score_details: row.score_details,
        },
        now,
      }),
    );
  }

  if (etfResult.data) {
    const row = etfResult.data as Record<string, unknown>;
    // 날짜만 있는 값은 미국 거래일 마감 후 확보된 데이터로 보고 UTC 자정 기준 처리합니다.
    const observedAt = `${String(row.flow_date)}T00:00:00.000Z`;
    components.push(
      makeComponent({
        name: "etf",
        score: row.score,
        confidence: row.confidence,
        direction: row.direction,
        observedAt,
        sourceId: row.id as string | number | null,
        details: {
          flow_date: row.flow_date,
          daily_flow_usd: row.daily_flow_usd,
          flow_3d_usd: row.flow_3d_usd,
          flow_5d_usd: row.flow_5d_usd,
          flow_20d_usd: row.flow_20d_usd,
          positive_streak: row.positive_streak,
          negative_streak: row.negative_streak,
          score_details: row.score_details,
        },
        now,
      }),
    );
  }

  return components;
}

export async function saveMarketIntelligence(
  result: MarketIntelligenceResult,
): Promise<number | string> {
  const componentMap = Object.fromEntries(
    result.components.map((component) => [component.name, component]),
  );

  const payload = {
    symbol: result.symbol,
    calculated_at: result.calculatedAt,
    market_score: result.score,
    confidence: result.confidence,
    direction: result.direction,
    signal: result.signal,
    risk_level: result.riskLevel,
    conflict_level: result.conflictLevel,
    consensus_strength: result.consensusStrength,
    raw_score: result.rawScore,
    consensus_adjustment: result.consensusAdjustment,
    direction_votes: result.directionVotes,
    breakdown: Object.fromEntries(
      result.components.map((component) => [component.name, {
        score: component.score,
        confidence: component.confidence,
        direction: component.direction,
        configured_weight: component.configuredWeight,
        effective_weight: component.effectiveWeight,
        freshness_factor: component.freshnessFactor,
        contribution: component.contribution,
        age_hours: component.ageHours,
        observed_at: component.observedAt,
      }]),
    ),
    summary: result.summary,
    reasons: result.reasons,
    funding_score: componentMap.funding?.score ?? null,
    etf_score: componentMap.etf?.score ?? null,
    news_score: componentMap.news?.score ?? null,
    funding_weight: componentMap.funding?.effectiveWeight ?? null,
    etf_weight: componentMap.etf?.effectiveWeight ?? null,
    news_weight: componentMap.news?.effectiveWeight ?? null,
    component_count: result.availableComponentCount,
    score_details: {
      components: result.components,
      configured_weights: CONFIGURED_WEIGHTS,
      freshness_limits_hours: MAX_AGE_HOURS,
      raw_score: result.rawScore,
      consensus_adjustment: result.consensusAdjustment,
      consensus_strength: result.consensusStrength,
      direction_votes: result.directionVotes,
      risk_level: result.riskLevel,
      conflict_level: result.conflictLevel,
      scoring_version: result.strategyVersion,
    },
    strategy_version: result.strategyVersion,
  };

  const { data, error } = await supabase
    .from("market_intelligence_scores")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Market Intelligence 저장 실패: ${error.message}`);
  }

  return (data as { id: number | string }).id;
}
