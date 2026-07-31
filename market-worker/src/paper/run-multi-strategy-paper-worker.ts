import { runPaperTradingWorker } from "./run-paper-trading-worker";

/**
 * 기존 import 경로를 유지하면서 공통 Paper Trading V2 엔진을 실행합니다.
 * 단일·다중 워커가 같은 로직을 중복 보유하지 않도록 이 파일은 진입점만 담당합니다.
 */
export async function runMultiStrategyPaperWorker(): Promise<void> {
  await runPaperTradingWorker({
    logPrefix: "다중 전략 모의매매 V2",
  });
}

// 이전 호출부와의 하위 호환용 별칭입니다.
export { runPaperTradingWorker };
