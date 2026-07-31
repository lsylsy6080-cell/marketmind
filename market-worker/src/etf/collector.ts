import { config } from "./config";
import { fetchFarsideEtfRows } from "./farside";
import { saveEtfRecord, saveEtfScore } from "./repository";
import { calculateEtfScore } from "./score";
import type { EtfFlowRecord } from "./types";

function toEtfFlowRecord(
  row: Awaited<ReturnType<typeof fetchFarsideEtfRows>>[number],
): EtfFlowRecord {
  return {
    asset: config.asset,
    market: config.market,
    flowDate: row.flowDate,
    totalFlowUsd: row.totalFlowUsd,
    priceUsd: null,
    source: config.source,
    sourceTimestamp: null,
    rawData: row.rawData,
    details: row.details,
  };
}

function selectSyncTargets(records: EtfFlowRecord[]): EtfFlowRecord[] {
  const syncDays = Number.isFinite(config.syncDays)
    ? Math.max(1, Math.floor(config.syncDays))
    : 7;

  return records.slice(-syncDays);
}

export async function runEtfCollector() {
  if (config.source.toLowerCase() !== "farside") {
    throw new Error(
      `지원하지 않는 ETF_SOURCE입니다: ${config.source}. 현재는 farside만 지원합니다.`,
    );
  }

  const rows = await fetchFarsideEtfRows();
  const records = rows
    .map(toEtfFlowRecord)
    .sort((a, b) => a.flowDate.localeCompare(b.flowDate));

  const targets = selectSyncTargets(records);

  if (config.dryRun) {
    const preview = targets.map((record) => ({
      record,
      score: calculateEtfScore(record, records),
    }));

    console.log(JSON.stringify(preview, null, 2));
    return {
      fetched: records.length,
      selected: targets.length,
      saved: 0,
      dryRun: true,
    };
  }

  let saved = 0;

  for (const record of targets) {
    await saveEtfRecord(record);

    const score = calculateEtfScore(record, records);
    await saveEtfScore(score);

    saved += 1;

    console.log(
      `[ETF] ${record.flowDate} 저장 완료 / flow=${record.totalFlowUsd} / score=${score.score}`,
    );
  }

  return {
    fetched: records.length,
    selected: targets.length,
    saved,
    dryRun: false,
  };
}
