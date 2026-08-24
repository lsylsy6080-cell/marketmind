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
import { analyzeBtcTechnical } from "../src/analyzers/btc-technical";
import { generateBtcMarketScore } from "../src/analyzers/btc-market-score";
import { runMarketRegimeV2 } from "../src/regime/run-market-regime-v2";
import { collectBtcNews } from "../src/news/collect-news";
import { analyzePendingBtcNewsByRules } from "../src/news/analyze-news-rules";
import { generateBtcNewsScore } from "../src/news/btc-news-score";
import { enrichLatestBtcNewsScore } from "../src/news/btc-news-intelligence-v2";
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
const NEWS_INTERVAL_MS = Math.max(
  5,
  Number(process.env.WORKER_NEWS_INTERVAL_MINUTES ?? 15),
) * 60_000;
const PERFORMANCE_INTERVAL_MS = Math.max(
  15,
  Number(process.env.WORKER_PERFORMANCE_INTERVAL_MINUTES ?? 60),
) * 60_000;

const INITIAL_ONE_MINUTE_LIMIT = 1000;
const INITIAL_MTF_LIMIT = 500;
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
    log(`✓ ${label} · ${((Date.now() - started) / 1000).toFixed(1)}s`);
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
  const mtf = await safeTask("MTF 캔들 동기화", () =>
    collectBtcChartTimeframes(mtfLimit),
  );
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

  if (oneMinute.ok && mtf.ok) {
    const mtfCount = Object.values(mtf.value).reduce(
      (sum, count) => sum + Number(count),
      0,
    );
    log(`📡 수집 완료 · 1m=${oneMinute.value} · MTF=${mtfCount}`);
  }
}

async function runNewsFundingCycle(): Promise<void> {
  log("📰 News/Funding cycle 시작");
  await safeTask("뉴스 수집", () => collectBtcNews());
  await safeTask("뉴스 룰 분석", () => analyzePendingBtcNewsByRules(50));
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

    log("🧠 Core analysis cycle 시작");

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

    if (trackingStarted) await tracker.finish();

    log(`✅ Core analysis 완료 · ${((Date.now() - started) / 1000).toFixed(1)}s`);
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
  log("📊 Performance cycle 시작");
  await safeTask("Final Backtests", () => runFinalMarketBacktests());
  await safeTask("Performance Engine", () => runPerformanceEngine());
  await safeTask("V1/V2 Battle", () => runPerformanceBattle());
  await safeTask("Fixed vs Adaptive Battle", () => runFixedVsAdaptiveBattle());
  lastPerformanceAt = Date.now();
}

async function runPipelineCycle(initial = false): Promise<void> {
  cycleNumber += 1;
  const cycleStarted = Date.now();
  log(`──── Cycle #${cycleNumber} 시작${initial ? " (BOOT)" : ""} ────`);

  await collectContinuous(initial);

  const now = Date.now();
  if (initial || now - lastNewsAt >= NEWS_INTERVAL_MS) {
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
      ` · news=${NEWS_INTERVAL_MS / 60_000}m` +
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
