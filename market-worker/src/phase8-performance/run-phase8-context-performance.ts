import { supabase } from "../lib/supabase";
import { evaluateContextPerformance } from "./ContextPerformanceMonitor";
import type { ContextOutcomeSample, Phase88ContextPerformanceResult } from "./types";

export async function runPhase88ContextPerformance():Promise<Phase88ContextPerformanceResult>{
  const {data,error}=await supabase.from("context_execution_outcome_snapshots")
    .select("outcome_label,quality_score,directional_return_percent,permission")
    .eq("symbol","BTCUSDT")
    .order("calculated_at",{ascending:false})
    .limit(200);

  if(error) throw new Error(`[8-8] Outcome 조회 실패: ${error.message}`);

  const samples:ContextOutcomeSample[]=(data??[]).map((row:any)=>({
    label:row.outcome_label,
    qualityScore:Number(row.quality_score),
    directionalReturnPercent:Number(row.directional_return_percent),
    permission:row.permission,
  }));

  const result=evaluateContextPerformance(samples);

  const {error:saveError}=await supabase.from("context_performance_snapshots").insert({
    symbol:"BTCUSDT",
    calculated_at:new Date().toISOString(),
    sample_count:result.sampleCount,
    decisive_sample_count:result.decisiveSampleCount,
    positive_count:result.positiveCount,
    negative_count:result.negativeCount,
    neutral_count:result.neutralCount,
    success_rate:result.successRate,
    average_quality_score:result.averageQualityScore,
    average_directional_return_percent:result.averageDirectionalReturnPercent,
    avoided_loss_count:result.avoidedLossCount,
    missed_opportunity_count:result.missedOpportunityCount,
    status:result.status,
    auto_tuning_allowed:result.autoTuningAllowed,
    reasons:result.reasons,
    strategy_version:result.strategyVersion,
  });

  if(saveError) throw new Error(`[8-8] snapshot 저장 실패: ${saveError.message}`);
  return result;
}
