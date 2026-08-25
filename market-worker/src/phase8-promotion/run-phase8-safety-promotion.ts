import { supabase } from "../lib/supabase";
import { evaluateSafetyPromotion } from "./SafetyPromotionGate";
import type { Phase89PromotionResult } from "./types";

export async function runPhase89SafetyPromotion():Promise<Phase89PromotionResult>{
  const {data,error}=await supabase.from("context_performance_snapshots")
    .select("sample_count,decisive_sample_count,success_rate,average_quality_score,avoided_loss_count,missed_opportunity_count,status")
    .eq("symbol","BTCUSDT").order("calculated_at",{ascending:false}).limit(1).maybeSingle();

  if(error||!data) throw new Error(`[8-9] Context Performance 조회 실패: ${error?.message??"데이터 없음"}`);

  const x:any=data;
  const result=evaluateSafetyPromotion({
    sampleCount:Number(x.sample_count),
    decisiveSampleCount:Number(x.decisive_sample_count),
    successRate:x.success_rate==null?null:Number(x.success_rate),
    averageQualityScore:x.average_quality_score==null?null:Number(x.average_quality_score),
    avoidedLossCount:Number(x.avoided_loss_count),
    missedOpportunityCount:Number(x.missed_opportunity_count),
    performanceStatus:x.status,
  });

  const {error:saveError}=await supabase.from("context_promotion_snapshots").insert({
    symbol:"BTCUSDT",
    calculated_at:new Date().toISOString(),
    status:result.status,
    eligible:result.eligible,
    minimum_sample_count:result.minimumSampleCount,
    minimum_decisive_sample_count:result.minimumDecisiveSampleCount,
    minimum_success_rate:result.minimumSuccessRate,
    minimum_average_quality_score:result.minimumAverageQualityScore,
    missed_opportunity_ratio:result.missedOpportunityRatio,
    reasons:result.reasons,
    auto_apply_allowed:result.autoApplyAllowed,
    strategy_version:result.strategyVersion,
  });

  if(saveError) throw new Error(`[8-9] snapshot 저장 실패: ${saveError.message}`);
  return result;
}
