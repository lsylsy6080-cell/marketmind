import { createClient } from "@supabase/supabase-js";
import { config } from "./config";
import type { EtfFlowRecord } from "./types";

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function saveEtfRecord(record: EtfFlowRecord): Promise<number> {
  const { data, error } = await supabase
    .from("etf_flow_snapshots")
    .upsert(
      {
        asset: record.asset,
        market: record.market,
        flow_date: record.flowDate,
        total_flow_usd: record.totalFlowUsd,
        price_usd: record.priceUsd,
        source: record.source,
        source_timestamp: record.sourceTimestamp,
        fetched_at: new Date().toISOString(),
        raw_data: record.rawData,
      },
      { onConflict: "asset,market,flow_date,source" },
    )
    .select("id")
    .single();

  if (error) throw new Error(`ETF 스냅샷 저장 실패: ${error.message}`);

  const snapshotId = Number(data.id);
  if (record.details.length) {
    const { error: detailError } = await supabase
      .from("etf_flow_details")
      .upsert(
        record.details.map((item) => ({
          snapshot_id: snapshotId,
          ticker: item.ticker,
          flow_usd: item.flowUsd,
        })),
        { onConflict: "snapshot_id,ticker" },
      );

    if (detailError) throw new Error(`ETF 상세 저장 실패: ${detailError.message}`);
  }

  return snapshotId;
}

export async function saveEtfScore(
  score: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from("etf_scores")
    .upsert(score, {
      onConflict: "asset,flow_date",
    });

  if (error) {
    throw new Error(
      `ETF 점수 저장 실패: ${error.message}`,
    );
  }
}