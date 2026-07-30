import "dotenv/config";

import { config } from "../src/etf/config.js";
import { fetchFarsideEtfRows } from "../src/etf/farside.js";
import {
  saveEtfRecord,
  saveEtfScore,
} from "../src/etf/repository.js";
import { calculateEtfScore } from "../src/etf/score.js";
import type { EtfFlowRecord } from "../src/etf/types.js";

async function main() {
  try {
    console.log("[ETF] Collector v2 시작");

    const rows = await fetchFarsideEtfRows();

    /*
     * 수집된 전체 과거 데이터를 EtfFlowRecord 형식으로 변환한다.
     * ETF 가격은 Farside 표에 없으므로 null로 저장한다.
     */
    const allRecords: EtfFlowRecord[] = rows.map((row) => ({
      asset: config.asset,
      market: config.market,
      flowDate: row.flowDate,
      totalFlowUsd: row.totalFlowUsd,
      priceUsd: null,
      source: config.source,
      sourceTimestamp: null,
      rawData: row.rawData,
      details: row.details,
    }));

    const syncDays = Number.isFinite(config.syncDays)
      ? Math.max(1, Math.floor(config.syncDays))
      : 7;

    const targetRecords = allRecords.slice(-syncDays);

    console.log(
      `[ETF] 전체 ${allRecords.length}거래일 중 최근 ${targetRecords.length}거래일을 처리합니다.`,
    );

    for (const record of targetRecords) {
      const scoreResult = calculateEtfScore(
        record,
        allRecords,
      );

      if (config.dryRun) {
        console.log(
          `[ETF][DRY RUN] ${record.flowDate}`,
          JSON.stringify(
            {
              dailyFlowUsd: scoreResult.daily_flow_usd,
              flow3dUsd: scoreResult.flow_3d_usd,
              flow5dUsd: scoreResult.flow_5d_usd,
              flow20dUsd: scoreResult.flow_20d_usd,
              positiveStreak: scoreResult.positive_streak,
              negativeStreak: scoreResult.negative_streak,
              score: scoreResult.score,
              confidence: scoreResult.confidence,
              direction: scoreResult.direction,
              summary: scoreResult.summary,
            },
            null,
            2,
          ),
        );

        continue;
      }

      const snapshotId = await saveEtfRecord(record);
      await saveEtfScore(scoreResult);

      console.log(
        [
          `✅ ${record.flowDate} 저장 완료`,
          `(Snapshot ${snapshotId}`,
          `Score ${scoreResult.score}`,
          `Confidence ${scoreResult.confidence}`,
          `${scoreResult.direction})`,
        ].join(" "),
      );
    }

    console.log("[ETF] Collector v2 완료");
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.stack ?? error.message
        : error,
    );

    process.exitCode = 1;
  }
}

void main();