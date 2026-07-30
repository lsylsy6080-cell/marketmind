import { createClient } from "@supabase/supabase-js";
import { fetchEtfPayload } from "./coinglass";
import { config } from "./config";
import { parseEtfPayload } from "./parser";
import { saveEtfRecord } from "./repository";
import { calculateEtfScore } from "./score";

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function runEtfCollector() {
  const payload = await fetchEtfPayload();
  const records = parseEtfPayload(payload);

  if (config.dryRun) {
    console.log(JSON.stringify(records, null, 2));
    return { fetched: records.length, saved: 0, dryRun: true };
  }

  for (const record of records) {
    await saveEtfRecord(record);

    const score = calculateEtfScore(record);
    const { error } = await supabase
      .from("etf_scores")
      .upsert(score, { onConflict: "asset,flow_date" });

    if (error) throw new Error(`ETF 점수 저장 실패: ${error.message}`);

    console.log(
      `[ETF] ${record.flowDate} 저장 완료 / flow=${record.totalFlowUsd} / score=${score.score}`,
    );
  }

  return { fetched: records.length, saved: records.length, dryRun: false };
}
