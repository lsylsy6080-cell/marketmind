import assert from "node:assert/strict";
import {auditPhase7Pipeline,type AuditStageInput} from "./Phase7PipelineAudit";

const now=new Date("2026-08-24T04:00:00.000Z");
const base:AuditStageInput[]=[
  ["global_futures","global-futures-intelligence-v7.11"],
  ["position_cluster","position-cluster-map-v7.12"],
  ["liquidation_map","estimated-liquidation-map-v7.13"],
  ["squeeze_probability","squeeze-probability-v7.14"],
  ["squeeze_warning","squeeze-early-warning-v7.15"],
  ["decision_v2","decision-engine-v2.8"],
  ["adaptive_paper","adaptive-paper"],
].map(([stage,version])=>({
  stage:stage as AuditStageInput["stage"],
  exists:true,
  observedAt:"2026-08-24T03:59:30.000Z",
  maxAgeMinutes:3,
  strategyVersion:version,
  expectedVersionPrefix:version,
  qualityOk:true,
}));

const healthy=auditPhase7Pipeline({now,stages:base});
assert.equal(healthy.status,"healthy");
assert.equal(healthy.healthyStages,7);
console.log("[PASS] 전체 pipeline 최신/정상 → healthy");

const stale=structuredClone(base);
stale[3].observedAt="2026-08-24T03:55:00.000Z";
const degraded=auditPhase7Pipeline({now,stages:stale});
assert.equal(degraded.status,"degraded");
assert.equal(degraded.stages[3].level,"warning");
console.log("[PASS] Squeeze Probability stale → degraded");

const missing=structuredClone(base);
missing[4].exists=false;
missing[4].observedAt=null;
const blocked=auditPhase7Pipeline({now,stages:missing});
assert.equal(blocked.status,"blocked");
assert.equal(blocked.stages[4].level,"critical");
console.log("[PASS] Early Warning snapshot 없음 → blocked");

const badCoverage=structuredClone(base);
badCoverage[0].qualityOk=false;
badCoverage[0].qualityReason="healthy exchange 3/5";
const coverage=auditPhase7Pipeline({now,stages:badCoverage});
assert.equal(coverage.status,"degraded");
console.log("[PASS] Global Futures coverage 저하 → degraded");

const version=structuredClone(base);
version[5].strategyVersion="decision-engine-v2.7-liquidation";
const versionResult=auditPhase7Pipeline({now,stages:version});
assert.equal(versionResult.status,"degraded");
console.log("[PASS] 구버전 Decision 감지 → degraded");
