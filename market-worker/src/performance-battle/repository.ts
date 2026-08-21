import { supabase } from "../lib/supabase";
import type {
  BattleDecision,
  BattlePair,
  PerformanceBattleResult,
} from "./types";

const MAX_V2_SNAPSHOTS = 1500;
export const MAX_PAIRING_LAG_MINUTES = 5;
export const CURRENT_V2_BATTLE_VERSION = "decision-engine-v2.5.1-entry-trigger-validator";

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function maybeNum(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

export async function loadBattlePairs(): Promise<{
  pairs: BattlePair[];
  candidateV2Snapshots: number;
  excludedLaggedPairs: number;
}> {
  const { data: v2Raw, error: v2Error } = await supabase
    .from("ai_decision_v2_snapshots")
    .select(`
      id, calculated_at, v1_decision_id, regime_snapshot_id,
      direction, action, trading_permission, final_score, final_confidence,
      overheat_risk, entry_quality_score, preferred_entry,
      funding_crowding_status, decision_reasons, strategy_version
    `)
    .eq("symbol", "BTCUSDT")
    .eq("strategy_version", CURRENT_V2_BATTLE_VERSION)
    .not("v1_decision_id", "is", null)
    .order("calculated_at", { ascending: true })
    .limit(MAX_V2_SNAPSHOTS);

  if (v2Error) throw new Error(`[Performance Battle] V2 조회 실패: ${v2Error.message}`);

  const allV2 = (v2Raw ?? []) as any[];

  // 같은 V1 decision에 연결된 V2가 여러 번 저장되더라도 최초 V2만 사용한다.
  const firstV2ByV1 = new Map<number, any>();
  for (const row of allV2) {
    const id = Number(row.v1_decision_id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (!firstV2ByV1.has(id)) firstV2ByV1.set(id, row);
  }

  const v1Ids = [...firstV2ByV1.keys()];
  if (v1Ids.length === 0) {
    return { pairs: [], candidateV2Snapshots: allV2.length, excludedLaggedPairs: 0 };
  }

  const [{ data: v1Raw, error: v1Error }, { data: backtestRaw, error: backtestError }] =
    await Promise.all([
      supabase
        .from("final_market_decisions")
        .select(`
          id, decided_at, direction, action, trading_permission,
          final_score, final_confidence, strategy_version
        `)
        .in("id", v1Ids),
      supabase
        .from("final_market_backtests")
        .select(`
          decision_id, return_1h, return_4h, return_24h
        `)
        .in("decision_id", v1Ids),
    ]);

  if (v1Error) throw new Error(`[Performance Battle] V1 조회 실패: ${v1Error.message}`);
  if (backtestError) throw new Error(`[Performance Battle] Backtest 조회 실패: ${backtestError.message}`);

  const v1ById = new Map<number, any>(
    ((v1Raw ?? []) as any[]).map((row) => [Number(row.id), row]),
  );
  const backtestByDecision = new Map<number, any>(
    ((backtestRaw ?? []) as any[]).map((row) => [Number(row.decision_id), row]),
  );

  const regimeIds = [...new Set(
    [...firstV2ByV1.values()]
      .map((row) => Number(row.regime_snapshot_id))
      .filter((id) => Number.isFinite(id) && id > 0),
  )];

  const regimeById = new Map<number, string>();
  if (regimeIds.length > 0) {
    const { data, error } = await supabase
      .from("market_regime_snapshots")
      .select("id,regime")
      .in("id", regimeIds);
    if (error) throw new Error(`[Performance Battle] Regime 조회 실패: ${error.message}`);
    for (const row of (data ?? []) as any[]) {
      regimeById.set(Number(row.id), String(row.regime));
    }
  }

  const pairs: BattlePair[] = [];
  let excludedLaggedPairs = 0;

  for (const [v1Id, v2Row] of firstV2ByV1) {
    const v1Row = v1ById.get(v1Id);
    const backtest = backtestByDecision.get(v1Id);
    if (!v1Row || !backtest) continue;

    const v1Time = new Date(v1Row.decided_at).getTime();
    const v2Time = new Date(v2Row.calculated_at).getTime();
    if (!Number.isFinite(v1Time) || !Number.isFinite(v2Time)) continue;

    const lagMinutes = (v2Time - v1Time) / 60_000;
    if (lagMinutes < 0 || lagMinutes > MAX_PAIRING_LAG_MINUTES) {
      excludedLaggedPairs += 1;
      continue;
    }

    const reasons = asArray(v2Row.decision_reasons);
    const regimeId = Number(v2Row.regime_snapshot_id);

    const v1: BattleDecision = {
      engine: "v1",
      id: Number(v1Row.id),
      linkedV1DecisionId: Number(v1Row.id),
      decidedAt: String(v1Row.decided_at),
      direction: v1Row.direction,
      action: v1Row.action,
      tradingPermission: v1Row.trading_permission,
      finalScore: num(v1Row.final_score),
      finalConfidence: num(v1Row.final_confidence),
      strategyVersion: String(v1Row.strategy_version ?? "unknown"),
    };

    const v2: BattleDecision = {
      engine: "v2",
      id: Number(v2Row.id),
      linkedV1DecisionId: v1Id,
      decidedAt: String(v2Row.calculated_at),
      direction: v2Row.direction,
      action: v2Row.action,
      tradingPermission: v2Row.trading_permission,
      finalScore: num(v2Row.final_score),
      finalConfidence: num(v2Row.final_confidence),
      strategyVersion: String(v2Row.strategy_version ?? "unknown"),
      regime: regimeById.get(regimeId) ?? null,
      overheatRisk: maybeNum(v2Row.overheat_risk),
      entryQualityScore: maybeNum(v2Row.entry_quality_score),
      preferredEntry: v2Row.preferred_entry == null ? null : String(v2Row.preferred_entry),
      newsLimitedApplied: reasons.some((r) => r.includes("News limited bullish candidate")),
      fundingCrowdingStatus:
        v2Row.funding_crowding_status == null ? null : String(v2Row.funding_crowding_status),
    };

    pairs.push({
      v1,
      v2,
      returns: {
        "1h": maybeNum(backtest.return_1h),
        "4h": maybeNum(backtest.return_4h),
        "24h": maybeNum(backtest.return_24h),
      },
      pairingLagMinutes: Math.round(lagMinutes * 100) / 100,
    });
  }

  return {
    pairs,
    candidateV2Snapshots: allV2.length,
    excludedLaggedPairs,
  };
}

export async function savePerformanceBattle(result: PerformanceBattleResult): Promise<void> {
  const payload = {
    symbol: result.symbol,
    calculated_at: result.calculatedAt,
    linked_pairs: result.pairing.linkedPairs,
    candidate_v2_snapshots: result.pairing.candidateV2Snapshots,
    excluded_lagged_pairs: result.pairing.excludedLaggedPairs,
    verdict: result.verdict,
    verdict_reason: result.verdictReason,
    overall_metrics: result.overall,
    regime_metrics: result.regimes,
    v2_diagnostics: result.v2Diagnostics,
    methodology: result.methodology,
    strategy_version: result.strategyVersion,
  };

  const { error } = await supabase
    .from("performance_battle_snapshots")
    .insert(payload);

  if (error) throw new Error(`[Performance Battle] 결과 저장 실패: ${error.message}`);
}
