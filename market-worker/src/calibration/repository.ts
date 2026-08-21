import { supabase } from "../lib/supabase";
import type { SignalCalibrationResult } from "./types";

export async function loadCalibrationRows(windowHours = 168) {
  const cutoff = new Date(Date.now() - windowHours * 3_600_000).toISOString();
  const [news, funding] = await Promise.all([
    supabase
      .from("news_scores")
      .select("calculated_at,article_count,unique_article_count,weighted_score,confidence,direction")
      .eq("symbol", "BTCUSDT")
      .gte("calculated_at", cutoff)
      .order("calculated_at", { ascending: true })
      .limit(5000),
    supabase
      .from("funding_snapshots")
      .select("fetched_at,funding_rate,score,confidence,direction,risk_level,trading_permission")
      .eq("symbol", "BTCUSDT")
      .gte("fetched_at", cutoff)
      .order("fetched_at", { ascending: true })
      .limit(5000),
  ]);

  if (news.error) throw new Error(`[Signal Calibration] News 조회 실패: ${news.error.message}`);
  if (funding.error) throw new Error(`[Signal Calibration] Funding 조회 실패: ${funding.error.message}`);
  return { newsRows: news.data ?? [], fundingRows: funding.data ?? [] };
}

export async function saveCalibrationSnapshot(result: SignalCalibrationResult): Promise<void> {
  const { error } = await supabase.from("signal_calibration_snapshots").insert({
    symbol: result.symbol,
    calculated_at: result.calculatedAt,
    window_hours: result.windowHours,
    mode: result.mode,
    news_candidate: result.news,
    funding_candidate: result.funding,
    recommendations: result.recommendations,
    strategy_version: result.strategyVersion,
  });
  if (error) throw new Error(`[Signal Calibration] snapshot 저장 실패: ${error.message}`);
}
