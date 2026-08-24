export type AuditLevel="ok"|"warning"|"critical";
export type AuditStage =
  | "global_futures"
  | "position_cluster"
  | "liquidation_map"
  | "squeeze_probability"
  | "squeeze_warning"
  | "decision_v2"
  | "adaptive_paper";

export interface AuditStageInput{
  stage:AuditStage;
  exists:boolean;
  observedAt:string|null;
  maxAgeMinutes:number;
  strategyVersion:string|null;
  expectedVersionPrefix:string;
  qualityOk?:boolean;
  qualityReason?:string|null;
}

export interface AuditStageResult extends AuditStageInput{
  ageMinutes:number|null;
  level:AuditLevel;
  reasons:string[];
}

export interface Phase7AuditResult{
  status:"healthy"|"degraded"|"blocked";
  calculatedAt:string;
  healthyStages:number;
  warningStages:number;
  criticalStages:number;
  stages:AuditStageResult[];
  reasons:string[];
  strategyVersion:"phase7-pipeline-audit-v7.18";
}

export function auditPhase7Pipeline(input:{now?:Date;stages:AuditStageInput[]}):Phase7AuditResult{
  const now=input.now??new Date();
  const stages=input.stages.map(stage=>{
    const reasons:string[]=[];
    let level:AuditLevel="ok";
    let ageMinutes:number|null=null;

    if(!stage.exists){
      level="critical";
      reasons.push("필수 snapshot 없음");
    }else{
      const ts=stage.observedAt?new Date(stage.observedAt).getTime():NaN;
      ageMinutes=Number.isFinite(ts)?Math.max(0,(now.getTime()-ts)/60_000):null;
      if(ageMinutes==null){
        level="critical";
        reasons.push("snapshot 시각 파싱 실패");
      }else if(ageMinutes>stage.maxAgeMinutes*3){
        level="critical";
        reasons.push(`snapshot 심각한 stale ${ageMinutes.toFixed(1)}m > ${stage.maxAgeMinutes*3}m`);
      }else if(ageMinutes>stage.maxAgeMinutes){
        level="warning";
        reasons.push(`snapshot stale ${ageMinutes.toFixed(1)}m > ${stage.maxAgeMinutes}m`);
      }

      if(!stage.strategyVersion?.startsWith(stage.expectedVersionPrefix)){
        if(level==="ok")level="warning";
        reasons.push(`strategy version 불일치: ${stage.strategyVersion??"null"}`);
      }

      if(stage.qualityOk===false){
        if(level==="ok")level="warning";
        reasons.push(stage.qualityReason??"데이터 품질 경고");
      }
    }

    if(!reasons.length)reasons.push("정상");
    return{...stage,ageMinutes:ageMinutes==null?null:Number(ageMinutes.toFixed(2)),level,reasons};
  });

  const criticalStages=stages.filter(x=>x.level==="critical").length;
  const warningStages=stages.filter(x=>x.level==="warning").length;
  const healthyStages=stages.filter(x=>x.level==="ok").length;
  const status=criticalStages>0?"blocked":warningStages>0?"degraded":"healthy";

  return{
    status,
    calculatedAt:now.toISOString(),
    healthyStages,
    warningStages,
    criticalStages,
    stages,
    reasons:[
      `Phase 7 pipeline ${status} · healthy=${healthyStages} warning=${warningStages} critical=${criticalStages}`,
      criticalStages>0
        ?"Critical stage가 있어 Phase 8 승격 전 원인 확인이 필요합니다."
        : warningStages>0
          ?"Pipeline은 동작하지만 stale/coverage/version 경고를 확인해야 합니다."
          :"Phase 7 핵심 pipeline이 freshness/quality/version 기준을 통과했습니다.",
    ],
    strategyVersion:"phase7-pipeline-audit-v7.18",
  };
}
