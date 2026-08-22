import { generateBtcMarketScore } from "./analyzers/btc-market-score";
import { runFinalMarketBacktests } from "./backtest/run-final-market-backtests";
import { analyzeBtcTechnical } from "./analyzers/btc-technical";
import { collectBinanceBtcCandles } from "./collectors/binance-btc";
import { collectBtcChartTimeframes } from "./collectors/binance-multi-timeframe";
import { generateFinalMarketDecision } from "./final/generate-final-market-decision";
import { runPerformanceEngine } from "./performance/run-performance-engine";
import { runPerformanceBattle } from "./performance-battle/run-performance-battle";
import { generateBtcFundingSnapshot } from "./funding/generate-btc-funding-snapshot";
import { analyzePendingBtcNewsByRules } from "./news/analyze-news-rules";
import { collectBtcNews } from "./news/collect-news";
import { enrichLatestBtcNewsScore } from "./news/btc-news-intelligence-v2";
import { generateBtcNewsScore } from "./news/btc-news-score";
import { runPaperTradingWorker } from "./paper/run-paper-trading-worker";
import { runMarketRegimeV2 } from "./regime/run-market-regime-v2";
import { runDecisionV2 } from "./decision-v2/run-decision-v2";
import { runAdaptiveSizing } from "./position-sizing/run-adaptive-sizing";
import { refreshSignalCalibrationIfStale } from "./calibration/refresh-signal-calibration";
import { WorkerExecutionTracker } from "./operations/WorkerExecutionTracker";
import { supabase } from "./lib/supabase";

const rootLog = console.log.bind(console);
const rootError = console.error.bind(console);
const verboseLogs = process.env.WORKER_VERBOSE_LOGS === "true";

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
  })
    .format(date)
    .replace(" ", " ");
}

function roundSeconds(startedAt: number): string {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

async function getLatestDecisionSummary(): Promise<string> {
  const { data, error } = await supabase
    .from("final_market_decisions")
    .select("action,final_score,final_confidence")
    .eq("symbol", "BTCUSDT")
    .order("decided_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return "AI N/A";

  const action = String(data.action ?? "N/A").toUpperCase();
  const score = Number(data.final_score);
  const confidence = Number(data.final_confidence);
  const scoreText = Number.isFinite(score) ? score.toFixed(1) : "-";
  const confidenceText = Number.isFinite(confidence) ? `${confidence.toFixed(1)}%` : "-";
  return `AI ${action} score=${scoreText} conf=${confidenceText}`;
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const tracker = new WorkerExecutionTracker();
  let trackingStarted = false;

  try {
    try {
      trackingStarted = await tracker.start();
      if (!trackingStarted) {
        rootLog(`[${formatKst()}] ⏭️ SKIP | 이미 다른 market-worker 실행이 진행 중입니다.`);
        // Persistent Runner에서는 lock busy를 정상 완료와 구분해 즉시 재실행 루프를 막습니다.
        if (process.env.WORKER_PERSISTENT_RUNNER === "true") {
          process.exitCode = 75;
        }
        return;
      }
    } catch (trackingError) {
      // 실행 이력 테이블/잠금 RPC 문제로 본 작업까지 멈추지는 않습니다.
      const message =
        trackingError instanceof Error ? trackingError.message : String(trackingError);
      rootError(`[${formatKst()}] ⚠️ Heartbeat 비활성 | ${message}`);
    }

    // 평상시 PM2 로그를 한 줄 요약으로 유지합니다.
    // 개발 중 전체 세부 로그가 필요하면 WORKER_VERBOSE_LOGS=true 를 사용합니다.
    if (!verboseLogs) console.log = () => undefined;

    const savedCount = await collectBinanceBtcCandles(1000);
    const timeframeResult = await collectBtcChartTimeframes(500);
    const multiTimeframeCount = Object.values(timeframeResult).reduce(
      (sum, value) => sum + value,
      0,
    );

    await analyzeBtcTechnical();

    let regimeSummary = "Regime N/A";
    try {
      const regime = await runMarketRegimeV2();
      regimeSummary =
        `Regime ${regime.regime} ${regime.directionBias} conf=${regime.confidence.toFixed(1)}%`;
    } catch (regimeError) {
      const message =
        regimeError instanceof Error ? regimeError.message : String(regimeError);
      rootError(`[${formatKst()}] ⚠️ Regime V2 비활성 | ${message}`);
    }

    await generateBtcMarketScore();
    await collectBtcNews();
    await analyzePendingBtcNewsByRules(50);
    await generateBtcNewsScore(24);
    await enrichLatestBtcNewsScore();
    await generateBtcFundingSnapshot();

    // Phase 7-3C: dynamic News threshold / Funding crowding percentile이 오래되지 않도록
    // 1시간에 한 번만 최근 168시간 분포를 갱신합니다.
    try {
      await refreshSignalCalibrationIfStale();
    } catch (calibrationError) {
      const message = calibrationError instanceof Error ? calibrationError.message : String(calibrationError);
      rootError(`[${formatKst()}] ⚠️ Signal Calibration 갱신 실패 | ${message}`);
    }

    await generateFinalMarketDecision();

    let decisionV2Summary = "V2 N/A";
    try {
      const decisionV2 = await runDecisionV2();
      try {
        await runAdaptiveSizing();
      } catch (sizingError) {
        const sizingMessage = sizingError instanceof Error ? sizingError.message : String(sizingError);
        rootError(`[${formatKst()}] ⚠️ Adaptive Sizing shadow 비활성 | ${sizingMessage}`);
      }
      decisionV2Summary =
        `V2 ${decisionV2.action.toUpperCase()} ${decisionV2.direction}` +
        ` trend=${decisionV2.marketTrendStrength.toFixed(0)}` +
        ` dir=${decisionV2.directionStrength.toFixed(0)}` +
        ` entry=${decisionV2.entryQualityScore.toFixed(0)}` +
        ` heat=${decisionV2.overheatRisk.toFixed(0)}` +
        ` fund=${decisionV2.fundingCrowdingSide}/${decisionV2.fundingCrowdingRisk.toFixed(0)}` +
        (decisionV2.entryPlan.firstInterestPrice != null
          ? ` plan=${decisionV2.entryPlan.firstInterestPrice}/${decisionV2.entryPlan.secondInterestPrice}`
          : "") +
        ` trigger=${decisionV2.entryTrigger.status}`;
    } catch (decisionV2Error) {
      const message =
        decisionV2Error instanceof Error ? decisionV2Error.message : String(decisionV2Error);
      rootError(`[${formatKst()}] ⚠️ Decision V2 비활성 | ${message}`);
    }

    const paper = await runPaperTradingWorker();
    await runFinalMarketBacktests();
    await runPerformanceEngine();

    // Phase 7-4: V1/V2 성과 비교 snapshot. 평가 테이블 문제로 본 worker를 중단하지 않는다.
    try {
      const { data: latestBattle } = await supabase
        .from("performance_battle_snapshots")
        .select("calculated_at")
        .eq("symbol", "BTCUSDT")
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const ageMs = latestBattle?.calculated_at
        ? Date.now() - new Date(latestBattle.calculated_at).getTime()
        : Infinity;
      if (ageMs >= 60 * 60_000) await runPerformanceBattle();
    } catch (battleError) {
      const message = battleError instanceof Error ? battleError.message : String(battleError);
      rootError(`[${formatKst()}] ⚠️ Performance Battle 비활성 | ${message}`);
    }

    const aiSummary = await getLatestDecisionSummary();
    const paperActions = paper.actions;
    const paperSummary =
      `Paper ${paper.succeeded}/${paper.total} OK` +
      ` (open=${paperActions.opened_long + paperActions.opened_short}` +
      ` close=${paperActions.closed}` +
      ` hold=${paperActions.held}` +
      ` skip=${paperActions.skipped}` +
      ` fail=${paper.failed})`;

    const state = paper.failed > 0 ? "⚠️ DONE" : "✅ SUCCESS";
    rootLog(
      `[${formatKst()}] ${state} | ${roundSeconds(startedAt)} | ` +
        `Candles 1m=${savedCount}, MTF=${multiTimeframeCount} | ` +
        `${paperSummary} | ${regimeSummary} | ${aiSummary} | ${decisionV2Summary}`,
    );

    if (trackingStarted) await tracker.finish();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    rootError(
      `[${formatKst()}] ❌ FAILED | ${roundSeconds(startedAt)} | ${message}`,
    );

    if (verboseLogs && error instanceof Error && error.stack) {
      rootError(error.stack);
    }

    if (trackingStarted) {
      try {
        await tracker.finish(error);
      } catch (trackingError) {
        rootError("워커 실행 실패 상태 기록도 실패했습니다:", trackingError);
      }
    }

    process.exitCode = 1;
  } finally {
    console.log = rootLog;
  }
}

void main();
