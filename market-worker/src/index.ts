import { generateBtcMarketScore } from "./analyzers/btc-market-score";
import { runFinalMarketBacktests } from "./backtest/run-final-market-backtests";
import { analyzeBtcTechnical } from "./analyzers/btc-technical";
import { collectBinanceBtcCandles } from "./collectors/binance-btc";
import { generateFinalMarketDecision } from "./final/generate-final-market-decision";
import { runPerformanceEngine } from "./performance/run-performance-engine";
import { generateBtcFundingSnapshot } from "./funding/generate-btc-funding-snapshot";
import { analyzePendingBtcNewsByRules } from "./news/analyze-news-rules";
import { collectBtcNews } from "./news/collect-news";
import { enrichLatestBtcNewsScore } from "./news/btc-news-intelligence-v2";
import { generateBtcNewsScore } from "./news/btc-news-score";
import { runMultiStrategyPaperWorker } from "./paper/run-multi-strategy-paper-worker";
import { runStrategyPerformanceAnalyzer } from "./optimization/run-strategy-performance-analyzer";
import { runStrategyCandidateComparison } from "./optimization/run-strategy-candidate-comparison";
import { runStrategyWalkForwardValidation } from "./optimization/run-strategy-walk-forward-validation";
import { runStrategyRecommendation } from "./optimization/run-strategy-recommendation";
import { runOptimizationReadiness } from "./optimization/run-optimization-readiness";
import { WorkerExecutionTracker } from "./operations/WorkerExecutionTracker";

async function main(): Promise<void> {
  const tracker = new WorkerExecutionTracker();
  const acquired = await tracker.start();
  if (!acquired) {
    console.log("이전 워커가 실행 중이므로 이번 실행을 안전하게 건너뜁니다.");
    return;
  }

  try {
    await tracker.stage("candles", "BTCUSDT 1분봉 수집", async () => {
      const savedCount = await collectBinanceBtcCandles(1000);
      console.log(`${savedCount}개의 완료된 캔들을 Supabase에 반영했습니다.`);
    });
    await tracker.stage("technical", "기술지표 계산", analyzeBtcTechnical);
    await tracker.stage("market_score", "시장점수 계산", generateBtcMarketScore);
    await tracker.stage("news_collect", "BTC 뉴스 수집", collectBtcNews);
    await tracker.stage("news_rules", "뉴스 규칙 분석", () =>
      analyzePendingBtcNewsByRules(50),
    );
    await tracker.stage("news_score", "뉴스 종합점수", () =>
      generateBtcNewsScore(24),
    );
    await tracker.stage("news_v2", "뉴스 인텔리전스 V2", enrichLatestBtcNewsScore);
    await tracker.stage("funding", "Funding AI", generateBtcFundingSnapshot);
    await tracker.stage("decision", "Final Market AI", generateFinalMarketDecision);
    await tracker.stage("paper", "다중 전략 모의매매", runMultiStrategyPaperWorker);
    await tracker.stage("backtest", "Final Market Backtest", runFinalMarketBacktests);
    await tracker.stage("performance", "Performance Engine", runPerformanceEngine);
    await tracker.stage("phase5_1", "전략 성과 분석", runStrategyPerformanceAnalyzer);
    const candidateObservations = await tracker.stage(
      "phase5_2",
      "전략 후보 비교",
      runStrategyCandidateComparison,
    );
    const validation = await tracker.stage(
      "phase5_3",
      "학습·검증 기간 분리",
      () => runStrategyWalkForwardValidation(candidateObservations),
    );
    await tracker.stage("phase5_4", "안전 전략 추천", () =>
      runStrategyRecommendation(validation),
    );
    await tracker.stage("phase5_5", "최적화 통합 상태", runOptimizationReadiness);
    await tracker.finish();
    console.log("워커 실행이 완료되었습니다.");
  } catch (error: unknown) {
    await tracker.finish(error);
    throw error;
  }
}
main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("워커 실행 실패:", message);
  console.error(error);
  process.exitCode = 1;
});
