import { supabase } from "../lib/supabase";
import { evaluateAutoRollbackProtection } from "./AutoRollbackProtection";
import type { Phase811RollbackResult, RollbackPerformancePoint } from "./types";

function mapPerformance(row:any):RollbackPerformancePoint{
  return {
    sampleCount:Number(row.sample_count),
    successRate:row.success_rate==null?null:Number(row.success_rate),
    averageQualityScore:row.average_quality_score==null?null:Number(row.average_quality_score),
    missedOpportunityCount:Number(row.missed_opportunity_count),
    avoidedLossCount:Number(row.avoided_loss_count),
    status:row.status,
  };
}

export async function runPhase811AutoRollbackProtection():Promise<Phase811RollbackResult>{
  const [tuning,performance]=await Promise.all([
    supabase.from("context_tuning_candidates")
      .select("id,status,auto_apply_allowed,calculated_at")
      .eq("symbol","BTCUSDT").order("calculated_at",{ascending:false}).limit(1).maybeSingle(),
    supabase.from("context_performance_snapshots")
      .select("sample_count,success_rate,average_quality_score,missed_opportunity_count,avoided_loss_count,status,calculated_at")
      .eq("symbol","BTCUSDT").order("calculated_at",{ascending:false}).limit(2),
  ]);

  if(tuning.error||!tuning.data) throw new Error(`[8-11] Tuning candidate 조회 실패: ${tuning.error?.message??"데이터 없음"}`);
  if(performance.error||!performance.data?.length) throw new Error(`[8-11] Performance 조회 실패: ${performance.error?.message??"데이터 없음"}`);

  const current=mapPerformance(performance.data[0]);
  const baseline=performance.data[1] ? mapPerformance(performance.data[1]) : current;

  // 8-10은 candidate-only 단계이므로 현재는 실제 적용 상태가 아닙니다.
  // 향후 apply 단계에서 true로 연결되기 전까지 rollback은 절대 자동 발동하지 않습니다.
  const tuningApplied=false;

  const result=evaluateAutoRollbackProtection({
    tuningApplied,
    baseline,
    current,
  });

  const {error:saveError}=await supabase.from("context_rollback_snapshots").insert({
    symbol:"BTCUSDT",
    calculated_at:new Date().toISOString(),
    tuning_candidate_id:Number((tuning.data as any).id),
    status:result.status,
    rollback_recommended:result.rollbackRecommended,
    success_rate_drop:result.successRateDrop,
    quality_score_drop:result.qualityScoreDrop,
    minimum_post_apply_samples:result.minimumPostApplySamples,
    reasons:result.reasons,
    auto_rollback_allowed:result.autoRollbackAllowed,
    strategy_version:result.strategyVersion,
  });

  if(saveError) throw new Error(`[8-11] rollback snapshot 저장 실패: ${saveError.message}`);
  return result;
}
