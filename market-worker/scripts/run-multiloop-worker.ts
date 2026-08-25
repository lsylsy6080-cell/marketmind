import { runSqueezeOpportunity } from "../src/squeeze-opportunity/run-squeeze-opportunity";
import { runPhase7PipelineAudit } from "../src/phase7-audit/run-phase7-pipeline-audit";
import { runSqueezeEarlyWarning } from "../src/squeeze-warning/run-squeeze-early-warning";
import { runSqueezeProbability } from "../src/squeeze/run-squeeze-probability";
import { runEstimatedLiquidationMap } from "../src/liquidation-map/run-estimated-liquidation-map";
import { runPositionClusterMap } from "../src/position-cluster/run-position-cluster";
import { collectGlobalFuturesSnapshot } from "../src/global-futures/GlobalFuturesCollector";
import "dotenv/config";
import { open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { collectBinanceBtcCandles } from "../src/collectors/binance-btc";
import { collectBtcChartTimeframes } from "../src/collectors/binance-multi-timeframe";
import { collectBtcFuturesTimeframes } from "../src/collectors/binance-futures-timeframe";
import { runPhase81MarketStructure } from "../src/phase8-market-structure/run-phase8-market-structure";
import { runPhase82Correlation } from "../src/phase8-correlation/run-phase8-correlation";
import { runPhase83MarketContext } from "../src/phase8-context/run-phase8-market-context";
import { runPhase84ContextDecisionGate } from "../src/phase8-decision-gate/run-phase8-context-decision-gate";
import { runPhase85ContextActivation } from "../src/phase8-activation/run-phase8-context-activation";
import { runPhase87ContextOutcome } from "../src/phase8-outcome/run-phase8-context-outcome";
import { runPhase88ContextPerformance } from "../src/phase8-performance/run-phase8-context-performance";
import { runPhase89SafetyPromotion } from "../src/phase8-promotion/run-phase8-safety-promotion";
import { runPhase810AdaptiveContextTuning } from "../src/phase8-tuning/run-phase8-adaptive-context-tuning";
import { runPhase811AutoRollbackProtection } from "../src/phase8-rollback/run-phase8-auto-rollback-protection";
import { analyzeBtcTechnical } from "../src/analyzers/btc-technical";
import { generateBtcMarketScore } from "../src/analyzers/btc-market-score";
import { runMarketRegimeV2 } from "../src/regime/run-market-regime-v2";
import { collectBtcNews } from "../src/news/collect-news";
import { analyzePendingBtcNewsByRules } from "../src/news/analyze-news-rules";
import { generateBtcNewsScore } from "../src/news/btc-news-score";
import { enrichLatestBtcNewsScore } from "../src/news/btc-news-intelligence-v2";
import { markRecentNewsDuplicates } from "../src/news/news-dedupe-worker";
import { editPendingNewsToKorean } from "../src/news/korean-news-editor";
import { resolveNewsIntervalMinutes, shouldRunNewsCycle } from "../src/news/news-schedule";
import { generateBtcFundingSnapshot } from "../src/funding/generate-btc-funding-snapshot";
import { collectOpenInterestSnapshot } from "../src/open-interest/collect-open-interest";
import { LiquidationStreamCollector } from "../src/liquidation/LiquidationStreamCollector";
import { refreshSignalCalibrationIfStale } from "../src/calibration/refresh-signal-calibration";
import { generateFinalMarketDecision } from "../src/final/generate-final-market-decision";
import { runDecisionV2 } from "../src/decision-v2/run-decision-v2";
import { runAdaptiveSizing } from "../src/position-sizing/run-adaptive-sizing";
import { runPaperTradingWorker } from "../src/paper/run-paper-trading-worker";
import { runAdaptivePaperTrading } from "../src/adaptive-paper/run-adaptive-paper-trading";
import { runFinalMarketBacktests } from "../src/backtest/run-final-market-backtests";
import { runPerformanceEngine } from "../src/performance/run-performance-engine";
import { runPerformanceBattle } from "../src/performance-battle/run-performance-battle";
import { runFixedVsAdaptiveBattle } from "../src/adaptive-battle/run-fixed-vs-adaptive-battle";
import { WorkerExecutionTracker } from "../src/operations/WorkerExecutionTracker";

const CYCLE_INTERVAL_MS = Math.max(
  30,
  Number(process.env.WORKER_PIPELINE_INTERVAL_SECONDS ?? 60),
) * 1_000;
const NEWS_INTERVAL_MINUTES = resolveNewsIntervalMinutes(process.env.WORKER_NEWS_INTERVAL_MINUTES);
const NEWS_INTERVAL_MS = NEWS_INTERVAL_MINUTES * 60_000;
const PERFORMANCE_INTERVAL_MS = Math.max(
  15,
  Number(process.env.WORKER_PERFORMANCE_INTERVAL_MINUTES ?? 60),
) * 60_000;

const INITIAL_ONE_MINUTE_LIMIT = 1000;
const INITIAL_MTF_LIMIT = 1000;
const CONTINUOUS_ONE_MINUTE_LIMIT = 10;
const CONTINUOUS_MTF_LIMIT = 3;

const RUNNER_LOCK_PATH = path.join(process.cwd(), ".market-worker-runner.lock");

const liquidationStream = new LiquidationStreamCollector();

let stopping = false;
let cycleNumber = 0;
let lastNewsAt = 0;
let lastPerformanceAt = 0;

function formatKst(date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function log(message: string): void {
  console.log(`[${formatKst()}] ${message}`);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitInterruptibly(ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (!stopping && Date.now() < until) {
    await sleep(Math.min(1_000, until - Date.now()));
  }
}

async function acquireLocalRunnerLock(): Promise<void> {
  try {
    const handle = await open(RUNNER_LOCK_PATH, "wx");
    await handle.writeFile(String(process.pid));
    await handle.close();
    return;
  } catch (error: any) {
    if (error?.code !== "EEXIST") throw error;
  }

  let oldPid = 0;
  try {
    oldPid = Number((await readFile(RUNNER_LOCK_PATH, "utf8")).trim());
  } catch {
    // unreadable lock은 아래에서 stale로 정리
  }

  if (Number.isFinite(oldPid) && oldPid > 0) {
    try {
      process.kill(oldPid, 0);
      throw new Error(
        `이미 market-worker-runner PID ${oldPid}가 실행 중입니다. 중복 runner를 시작하지 않습니다.`,
      );
    } catch (error: any) {
      if (error instanceof Error && error.message.includes("중복 runner")) throw error;
      if (error?.code !== "ESRCH") {
        throw new Error(`기존 runner PID 확인 실패: ${errorText(error)}`);
      }
    }
  }

  await unlink(RUNNER_LOCK_PATH).catch(() => undefined);
  const handle = await open(RUNNER_LOCK_PATH, "wx");
  await handle.writeFile(String(process.pid));
  await handle.close();
}

async function releaseLocalRunnerLock(): Promise<void> {
  try {
    const current = Number((await readFile(RUNNER_LOCK_PATH, "utf8")).trim());
    if (current === process.pid) await unlink(RUNNER_LOCK_PATH);
  } catch {
    // 종료 중 lock 파일 정리 실패는 다음 시작에서 stale PID로 복구
  }
}

async function safeTask<T>(
  label: string,
  task: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  const started = Date.now();
  try {
    const value = await task();
    return { ok: true, value };
  } catch (error) {
    console.error(
      `[${formatKst()}] ⚠ ${label} 실패 · 다음 cycle에서 자동 재시도 | ${errorText(error)}`,
    );
    return { ok: false, error };
  }
}

async function collectContinuous(initial: boolean): Promise<void> {
  const oneMinuteLimit = initial
    ? INITIAL_ONE_MINUTE_LIMIT
    : CONTINUOUS_ONE_MINUTE_LIMIT;
  const mtfLimit = initial ? INITIAL_MTF_LIMIT : CONTINUOUS_MTF_LIMIT;

  const oneMinute = await safeTask("1m 캔들 수집", () =>
    collectBinanceBtcCandles(oneMinuteLimit),
  );
  const mtf = await safeTask("Spot MTF 동기화", () => collectBtcChartTimeframes(mtfLimit));
  const futuresMtf = await safeTask("Futures MTF 동기화", () => collectBtcFuturesTimeframes(mtfLimit));
  await safeTask("Open Interest 수집/분석", () => collectOpenInterestSnapshot());
  await safeTask("Global Futures 5개 거래소 수집", () => collectGlobalFuturesSnapshot());
  await safeTask("Position Cluster Map", () => runPositionClusterMap());
  await safeTask("Estimated Liquidation Map", () => runEstimatedLiquidationMap());
  await safeTask("Squeeze Probability", () => runSqueezeProbability());
  await safeTask("Squeeze Early Warning", () => runSqueezeEarlyWarning());
  const squeezeOpportunity = await safeTask("Squeeze Opportunity", () => runSqueezeOpportunity());
  if (squeezeOpportunity.ok && squeezeOpportunity.value.status === "ok" && squeezeOpportunity.value.result?.permission === "paper_candidate") {
    const o=squeezeOpportunity.value.result;
    log(`⚡ Squeeze Opportunity ${o.preferredDirection.toUpperCase()} · LONG=${o.longOpportunity.status}/${o.longOpportunity.score.toFixed(0)} · SHORT=${o.shortOpportunity.status}/${o.shortOpportunity.score.toFixed(0)}`);
  }

  if (oneMinute.ok && mtf.ok && futuresMtf.ok && initial) {
    const spotCount = Object.values(mtf.value).reduce((sum, count) => sum + Number(count), 0);
    const futuresCount = Object.values(futuresMtf.value).reduce((sum, count) => sum + Number(count), 0);
    log(`📡 BOOT 동기화 · spot=${oneMinute.value + spotCount} · futures=${futuresCount}`);
  }
}

async function runNewsFundingCycle(): Promise<void> {
  await safeTask("뉴스 수집", () => collectBtcNews());
  await safeTask("뉴스 룰 분석", () => analyzePendingBtcNewsByRules(50));
  await safeTask("뉴스 사건 중복 정리", () => markRecentNewsDuplicates(48));
  await safeTask("뉴스 한국어 속보 편집", () => editPendingNewsToKorean(20));
  await safeTask("뉴스 점수", () => generateBtcNewsScore(24));
  await safeTask("뉴스 인텔리전스", () => enrichLatestBtcNewsScore());
  await safeTask("Funding snapshot", () => generateBtcFundingSnapshot());
  lastNewsAt = Date.now();
}

async function runCoreAnalysisCycle(): Promise<void> {
  const tracker = new WorkerExecutionTracker();
  let trackingStarted = false;
  const started = Date.now();

  try {
    try {
      trackingStarted = await tracker.start();
      if (!trackingStarted) {
        log("⏭ 분석 cycle SKIP · 다른 분석 lock이 활성 상태입니다. 다음 1분 cycle에서 재확인합니다.");
        return;
      }
    } catch (error) {
      console.error(
        `[${formatKst()}] ⚠ 분석 실행이력/lock 추적 비활성 · 본 분석은 계속 | ${errorText(error)}`,
      );
    }

    await safeTask("Technical", () => analyzeBtcTechnical());
    await safeTask("Regime V2", () => runMarketRegimeV2());
    await safeTask("Market Score", () => generateBtcMarketScore());
    await safeTask("Signal Calibration", () => refreshSignalCalibrationIfStale());
    await safeTask("Final Decision V1", () => generateFinalMarketDecision());

    const decisionResult = await safeTask("Decision V2 / Entry Trigger", () =>
      runDecisionV2(),
    );

    if (decisionResult.ok) {
      const d = decisionResult.value;
      log(
        `🎯 V2 ${d.action.toUpperCase()} ${d.direction}` +
          ` · dir=${d.directionStrength.toFixed(0)}` +
          ` · entry=${d.entryQualityScore.toFixed(0)}` +
          ` · heat=${d.overheatRisk.toFixed(0)}` +
          ` · trigger=${d.entryTrigger.status}`,
      );
    }

    if (decisionResult.ok) {
      const gate = await safeTask("Phase 8-4 Context Decision Gate", () => runPhase84ContextDecisionGate());
      if (gate.ok) {
        const g = gate.value;
        log(`🚦 Context Gate · ${g.gatePermission.toUpperCase()} · ${g.alignment.toUpperCase()} · ${g.baseAction.toUpperCase()}→${g.shadowAction.toUpperCase()} · Δentry=${g.entryScoreDelta.toFixed(1)}`);
      }
    }

    if (decisionResult.ok) {
      const activation = await safeTask("Phase 8-5 Context Activation", () => runPhase85ContextActivation());
      if (activation.ok) {
        const a = activation.value;
        log(`🟢 Context Activation · ${a.mode.toUpperCase()} · ${a.baseAction.toUpperCase()}→${a.effectiveAction.toUpperCase()} · permission=${a.effectiveTradingPermission.toUpperCase()} · applied=${a.applied}`);
      }
    }

    const phase7Audit = await safeTask("Phase 7 Pipeline Audit", () => runPhase7PipelineAudit());
    if (phase7Audit.ok && phase7Audit.value.status !== "healthy") {
      log(
        `🛡 Phase 7 Audit ${phase7Audit.value.status.toUpperCase()}` +
          ` · warning=${phase7Audit.value.warningStages}` +
          ` · critical=${phase7Audit.value.criticalStages}`,
      );
    }

    await safeTask("Adaptive Sizing", () => runAdaptiveSizing());
    await safeTask("Fixed Paper Trading", () => runPaperTradingWorker());
    const adaptivePaper = await safeTask("Adaptive Paper Trading", () => runAdaptivePaperTrading());
    if (adaptivePaper.ok && adaptivePaper.value.action !== "skipped") {
      log(`💰 Adaptive Paper ${adaptivePaper.value.action} · ${adaptivePaper.value.reason}`);
    }

    const contextOutcome = await safeTask("Phase 8-7 Context Execution Outcome", () => runPhase87ContextOutcome());
    if (contextOutcome.ok && contextOutcome.value.status === "evaluated") {
      const o = contextOutcome.value.result;
      log(`📈 Context Outcome · ${o.label.toUpperCase()} · ${o.side.toUpperCase()} · return=${o.directionalReturnPercent.toFixed(3)}% · quality=${o.qualityScore.toFixed(0)}`);
    }

    if (trackingStarted) await tracker.finish();


  } catch (error) {
    if (trackingStarted) {
      try {
        await tracker.finish(error);
      } catch {
        // 원래 오류를 유지
      }
    }
    throw error;
  }
}

async function runPerformanceCycle(): Promise<void> {
  await safeTask("Final Backtests", () => runFinalMarketBacktests());
  await safeTask("Performance Engine", () => runPerformanceEngine());
  await safeTask("V1/V2 Battle", () => runPerformanceBattle());
  await safeTask("Fixed vs Adaptive Battle", () => runFixedVsAdaptiveBattle());
  const contextPerformance = await safeTask("Phase 8-8 Context Performance", () => runPhase88ContextPerformance());
  if (contextPerformance.ok) {
    const p = contextPerformance.value;
    log(`📊 Context Performance · ${p.status.toUpperCase()} · sample=${p.sampleCount} · decisive=${p.decisiveSampleCount} · success=${p.successRate == null ? "-" : `${p.successRate.toFixed(1)}%`}`);

    const promotion = await safeTask("Phase 8-9 Safety Promotion Gate", () => runPhase89SafetyPromotion());
    if (promotion.ok) {
      const g = promotion.value;
      log(`🛡 Safety Promotion · ${g.status.toUpperCase()} · eligible=${g.eligible} · autoApply=${g.autoApplyAllowed}`);

      const tuning = await safeTask("Phase 8-10 Adaptive Context Tuning", () => runPhase810AdaptiveContextTuning());
      if (tuning.ok) {
        const t = tuning.value;
        log(`🧪 Context Tuning · ${t.status.toUpperCase()} · Δsuccess=${t.deltas.minimumSuccessRate} · Δquality=${t.deltas.minimumAverageQualityScore} · Δmargin=${t.deltas.cautionMarginMultiplier}`);

        const rollback = await safeTask("Phase 8-11 Auto Rollback Protection", () => runPhase811AutoRollbackProtection());
        if (rollback.ok) {
          const r = rollback.value;
          log(`↩ Context Rollback · ${r.status.toUpperCase()} · recommended=${r.rollbackRecommended} · auto=${r.autoRollbackAllowed}`);
        }
      }
    }
  }
  lastPerformanceAt = Date.now();
}

async function runPipelineCycle(initial = false): Promise<void> {
  cycleNumber += 1;
  const cycleStarted = Date.now();
  log(`──── Cycle #${cycleNumber} 시작${initial ? " (BOOT)" : ""} ────`);

  await collectContinuous(initial);

  const structure = await safeTask("Phase 8-1 Market Structure", () => runPhase81MarketStructure());
  if (structure.ok) {
    const r = structure.value;
    const s = r.nearestSupport, x = r.nearestResistance;
    log(`🧱 S/R · $${r.currentPrice.toFixed(0)} · S=${s ? `$${s.price.toFixed(0)}/${s.strength}` : "-"} · R=${x ? `$${x.price.toFixed(0)}/${x.strength}` : "-"} · ${r.performance.totalMs}ms · RSS=${r.performance.rssMb}MB`);
  }

  const correlation = await safeTask("Phase 8-2 Market Correlation", () => runPhase82Correlation());
  if (correlation.ok) {
    const r = correlation.value;
    log(`🔗 Correlation · ${r.state.toUpperCase()} · corr=${r.overallCorrelation.toFixed(3)} · divergence=${r.overallDivergenceScore.toFixed(0)} · risk=${r.riskLevel.toUpperCase()} · ${r.performance.totalMs}ms`);
  }

  if (structure.ok && correlation.ok) {
    const context = await safeTask("Phase 8-3 Market Context", () =>
      runPhase83MarketContext({ structure: structure.value, correlation: correlation.value }),
    );
    if (context.ok) {
      const r = context.value;
      log(`🧭 Context · ${r.permission.toUpperCase()} · ${r.preferredDirection.toUpperCase()} · score=${r.contextScore.toFixed(0)} · risk=${r.riskScore.toFixed(0)} · ${r.performance.totalMs}ms`);
    }
  }

  const now = Date.now();
  if (shouldRunNewsCycle({ initial, now, lastRunAt: lastNewsAt, intervalMinutes: NEWS_INTERVAL_MINUTES })) {
    await runNewsFundingCycle();
  }

  // 핵심 분석/Entry/Paper는 매 1분 pipeline마다 실행합니다.
  await runCoreAnalysisCycle();

  if (now - lastPerformanceAt >= PERFORMANCE_INTERVAL_MS) {
    await runPerformanceCycle();
  }

  log(
    `──── Cycle #${cycleNumber} 완료 · ${((Date.now() - cycleStarted) / 1000).toFixed(1)}s ────`,
  );
}

async function main(): Promise<void> {
  await acquireLocalRunnerLock();
  await liquidationStream.start();
  log("Liquidation forceOrder stream 시작");

  log(
    `Multi-Loop Worker 시작 · pipeline=${CYCLE_INTERVAL_MS / 1000}s` +
      ` · news=${NEWS_INTERVAL_MINUTES}m` +
      ` · performance=${PERFORMANCE_INTERVAL_MS / 60_000}m`,
  );

  try {
    // 부팅 시 과거 데이터부터 충분히 동기화한 뒤 분석 시작
    await runPipelineCycle(true);

    while (!stopping) {
      const nextAt =
        Math.ceil(Date.now() / CYCLE_INTERVAL_MS) * CYCLE_INTERVAL_MS;
      await waitInterruptibly(Math.max(1_000, nextAt - Date.now()));
      if (stopping) break;

      try {
        // 단일 while loop이므로 수집/분석이 절대로 서로 중복 실행되지 않습니다.
        await runPipelineCycle(false);
      } catch (error) {
        console.error(
          `[${formatKst()}] ❌ Pipeline cycle 오류 · 프로세스 유지, 다음 cycle 재시도 | ${errorText(error)}`,
        );
      }
    }
  } finally {
    await liquidationStream.stop().catch((error) =>
      console.error(`[${formatKst()}] ⚠ Liquidation stream 종료 실패 | ${errorText(error)}`)
    );
    await releaseLocalRunnerLock();
    log("Multi-Loop Worker 종료");
  }
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log(`${signal} 수신 · 현재 작업 완료 후 안전 종료합니다.`);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

void main().catch(async (error: unknown) => {
  console.error(
    `[${formatKst()}] ❌ Multi-Loop Worker 치명적 오류 | ${
      error instanceof Error ? error.stack ?? error.message : String(error)
    }`,
  );
  await releaseLocalRunnerLock();
  process.exitCode = 1;
});
