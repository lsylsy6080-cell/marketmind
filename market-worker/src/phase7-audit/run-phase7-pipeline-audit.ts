import "dotenv/config";
import {supabase} from "../lib/supabase";
import {auditPhase7Pipeline,type AuditStageInput} from "./Phase7PipelineAudit";

const n=(v:unknown):number|null=>{
  const x=Number(v);
  return Number.isFinite(x)?x:null;
};
const s=(v:unknown):string|null=>v==null?null:String(v);

async function latest(table:string,select:string,orderColumn:string){
  const {data,error}=await supabase.from(table)
    .select(select)
    .eq("symbol","BTCUSDT")
    .order(orderColumn,{ascending:false})
    .limit(1)
    .maybeSingle();
  if(error)throw new Error(`[Phase7 Audit] ${table} 조회 실패: ${error.message}`);
  return data as any;
}

export async function runPhase7PipelineAudit(){
  const [gf,pc,lm,sp,sw,dv2,account,equity]=await Promise.all([
    latest("global_futures_snapshots","fetched_at,healthy_exchange_count,exchange_count,taker_source_coverage_percent,strategy_version","fetched_at"),
    latest("position_cluster_maps","calculated_at,source_exchange_count,source_snapshot_count,strategy_version","calculated_at"),
    latest("estimated_liquidation_maps","calculated_at,strategy_version","calculated_at"),
    latest("squeeze_probability_snapshots","calculated_at,strategy_version","calculated_at"),
    latest("squeeze_early_warning_snapshots","calculated_at,strategy_version","calculated_at"),
    latest("ai_decision_v2_snapshots","calculated_at,strategy_version","calculated_at"),
    supabase.from("adaptive_paper_accounts")
      .select("id,is_active")
      .eq("is_active",true)
      .order("id",{ascending:true})
      .limit(1)
      .maybeSingle(),
    latest("adaptive_paper_equity_snapshots","created_at,account_id,equity,market_price","created_at"),
  ]);

  if(account.error)throw new Error(`[Phase7 Audit] adaptive account 조회 실패: ${account.error.message}`);

  const adaptiveObservedAt=s(equity?.created_at);
  const stages:AuditStageInput[]=[
    {
      stage:"global_futures",exists:!!gf,observedAt:s(gf?.fetched_at),maxAgeMinutes:3,
      strategyVersion:s(gf?.strategy_version),expectedVersionPrefix:"global-futures-intelligence-v7.11",
      qualityOk:n(gf?.healthy_exchange_count)!==null && n(gf?.healthy_exchange_count)!>=4,
      qualityReason:`healthy exchange ${n(gf?.healthy_exchange_count)??0}/${n(gf?.exchange_count)??0} · taker coverage ${n(gf?.taker_source_coverage_percent)??0}%`,
    },
    {
      stage:"position_cluster",exists:!!pc,observedAt:s(pc?.calculated_at),maxAgeMinutes:3,
      strategyVersion:s(pc?.strategy_version),expectedVersionPrefix:"position-cluster-map-v7.12",
      qualityOk:(n(pc?.source_exchange_count)??0)>=4 && (n(pc?.source_snapshot_count)??0)>=2,
      qualityReason:`source exchange ${n(pc?.source_exchange_count)??0} · snapshots ${n(pc?.source_snapshot_count)??0}`,
    },
    {
      stage:"liquidation_map",exists:!!lm,observedAt:s(lm?.calculated_at),maxAgeMinutes:3,
      strategyVersion:s(lm?.strategy_version),expectedVersionPrefix:"estimated-liquidation-map-v7.13",
    },
    {
      stage:"squeeze_probability",exists:!!sp,observedAt:s(sp?.calculated_at),maxAgeMinutes:3,
      strategyVersion:s(sp?.strategy_version),expectedVersionPrefix:"squeeze-probability-v7.14",
    },
    {
      stage:"squeeze_warning",exists:!!sw,observedAt:s(sw?.calculated_at),maxAgeMinutes:3,
      strategyVersion:s(sw?.strategy_version),expectedVersionPrefix:"squeeze-early-warning-v7.15",
    },
    {
      stage:"decision_v2",exists:!!dv2,observedAt:s(dv2?.calculated_at),maxAgeMinutes:3,
      strategyVersion:s(dv2?.strategy_version),expectedVersionPrefix:"decision-engine-v2.8",
    },
    {
      stage:"adaptive_paper",
      exists:!!account.data && !!equity,
      observedAt:adaptiveObservedAt,
      maxAgeMinutes:10,
      strategyVersion:"adaptive-paper-squeeze-v7.17",
      expectedVersionPrefix:"adaptive-paper",
      qualityOk:!!account.data && !!equity,
      qualityReason:!account.data
        ? "활성 Adaptive Paper account 없음"
        : !equity
          ? "Adaptive Paper equity snapshot 없음"
          : null,
    },
  ];

  const result=auditPhase7Pipeline({stages});
  const bucket=new Date(Math.floor(Date.now()/60_000)*60_000).toISOString();
  const {error:saveError}=await supabase.from("phase7_pipeline_audit_snapshots").upsert({
    symbol:"BTCUSDT",
    bucket_time:bucket,
    calculated_at:result.calculatedAt,
    status:result.status,
    healthy_stages:result.healthyStages,
    warning_stages:result.warningStages,
    critical_stages:result.criticalStages,
    stages:result.stages,
    reasons:result.reasons,
    strategy_version:result.strategyVersion,
  },{onConflict:"symbol,bucket_time"});
  if(saveError)throw new Error(`[Phase7 Audit] 저장 실패: ${saveError.message}`);

  return result;
}
