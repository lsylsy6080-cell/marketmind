import { runLongTermTrendSnapshot } from "../src/long-term-trend/run-long-term-trend-snapshot";

const force = process.argv.includes("--force");

try {
  const result = await runLongTermTrendSnapshot({ force });

  if (result.status === "skipped") {
    console.log(
      `[장기추세] ${result.snapshotHour} 이미 저장됨 · id=${result.existingId} · 건너뜀`,
    );
  } else {
    console.log(
      `[장기추세] 저장 완료 · id=${result.id}` +
        ` · ${result.combinedLabel} ${result.combinedScore}/100` +
        ` · 신뢰도 ${result.confidence}/100` +
        ` · 전환경고도 ${result.risk}/100` +
        ` · 현재지지 ${result.currentSupport == null ? "-" : `$${result.currentSupport.toFixed(2)}`}` +
        ` · 현재저항 ${result.currentResistance == null ? "-" : `$${result.currentResistance.toFixed(2)}`}` +
        ` · 횡보 ${result.neutralScenarioState}` +
        ` · BTC $${result.marketPrice.toFixed(2)}`,
    );
  }
} catch (error) {
  console.error(
    "[장기추세] 저장 실패:",
    error instanceof Error ? error.stack ?? error.message : String(error),
  );
  process.exitCode = 1;
}
