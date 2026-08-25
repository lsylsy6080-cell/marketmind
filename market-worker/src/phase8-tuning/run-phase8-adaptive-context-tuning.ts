import { supabase } from "../lib/supabase";
import { buildAdaptiveContextTuningCandidate } from "./AdaptiveContextTuner";
import type { Phase810TuningCandidate } from "./types";

const DEFAULTS={
  minimumSuccessRate:65,
  minimumAverageQualityScore:60,
  cautionMarginMultiplier:0.5,
};

export async function runPhase810AdaptiveContextTuning():Promise<Phase810TuningCandidate>{
  const [promotion,performance]=await Promise.all([
    supabase.from("context_promotion_snapshots")
      .select("eligible,status")
      .eq("symbol","BTCUSDT").order("calculated_at",{ascending:false}).limit(1).maybeSingle(),
    supabase.from("context_performance_snapshots")
      .select("status,success_rate,average_quality_score,avoided_loss_count,missed_opportunity_count")
      .eq("symbol","BTCUSDT").order("calculated_at",{ascending:false}).limit(1).maybeSingle(),
  ]);

  if(promotion.error||!promotion.data) throw new Error(`[8-10] Promotion 조회 실패: ${promotion.error?.message??"데이터 없음"}`);
  if(performance.error||!performance.data) throw new Error(`[8-10] Performance 조회 실패: ${performance.error?.message??"데이터 없음"}`);

  const p:any=promotion.data;
  const f:any=performance.data;

  const result=buildAdaptiveContextTuningCandidate({
    promotionEligible:Boolean(p.eligible),
    performanceStatus:f.status,
    successRate:f.success_rate==null?null:Number(f.success_rate),
    averageQualityScore:f.average_quality_score==null?null:Number(f.average_quality_score),
    avoidedLossCount:Number(f.avoided_loss_count),
    missedOpportunityCount:Number(f.missed_opportunity_count),
    current:DEFAULTS,
  });

  const {error:saveError}=await supabase.from("context_tuning_candidates").insert({
    symbol:"BTCUSDT",
    calculated_at:new Date().toISOString(),
    status:result.status,
    candidate:result.candidate,
    deltas:result.deltas,
    auto_apply_allowed:result.autoApplyAllowed,
    reasons:result.reasons,
    strategy_version:result.strategyVersion,
  });

  if(saveError) throw new Error(`[8-10] candidate 저장 실패: ${saveError.message}`);
  return result;
}
