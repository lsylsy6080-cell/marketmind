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

async function main(): Promise<void> {
  console.log("BTCUSDT 1분봉 수집을 시작합니다.");
  const savedCount = await collectBinanceBtcCandles(1000);
  console.log(`${savedCount}개의 완료된 캔들을 Supabase에 반영했습니다.`);
  console.log("BTCUSDT 기술지표 계산을 시작합니다.");
  await analyzeBtcTechnical();
  console.log("BTCUSDT 시장점수 계산을 시작합니다.");
  await generateBtcMarketScore();
  console.log("BTC 관련 뉴스 수집을 시작합니다.");
  await collectBtcNews();
  console.log("BTC 뉴스 규칙 기반 분석을 시작합니다.");
  await analyzePendingBtcNewsByRules(50);
  console.log("BTC 뉴스 종합점수 계산을 시작합니다.");
  await generateBtcNewsScore(24);
  console.log("BTC 뉴스 인텔리전스 V2 계산을 시작합니다.");
  await enrichLatestBtcNewsScore();
  console.log("BTC Funding AI 계산을 시작합니다.");
  await generateBtcFundingSnapshot();
  console.log("Final Market AI 계산을 시작합니다.");
  await generateFinalMarketDecision();
  console.log("다중 전략 Paper Trading 처리를 시작합니다.");
  await runMultiStrategyPaperWorker();
  console.log("Final Market Backtest V1 처리를 시작합니다.");
  await runFinalMarketBacktests();
  console.log("Performance Engine V1 평가를 시작합니다.");
  await runPerformanceEngine();
  console.log("Phase 5-1 전략 성과 분석을 시작합니다.");
  await runStrategyPerformanceAnalyzer();
  console.log("Phase 5-2 전략 후보 비교를 시작합니다.");
  const candidateObservations = await runStrategyCandidateComparison();
  console.log("Phase 5-3 학습·검증 기간 분리를 시작합니다.");
  const validation = await runStrategyWalkForwardValidation(
    candidateObservations,
  );
  console.log("Phase 5-4 최적 전략 추천 평가를 시작합니다.");
  await runStrategyRecommendation(validation);
  console.log("Phase 5-5 전략 최적화 통합 상태를 점검합니다.");
  await runOptimizationReadiness();
  console.log("워커 실행이 완료되었습니다.");
}
main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("워커 실행 실패:", message);
  console.error(error);
  process.exitCode = 1;
});
