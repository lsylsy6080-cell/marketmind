import { supabase } from "../lib/supabase";
import { buildSignalCalibration } from "./SignalCalibrationEngine";
import { loadCalibrationRows, saveCalibrationSnapshot } from "./repository";

const REFRESH_INTERVAL_MINUTES = 60;
const WINDOW_HOURS = 168;

export async function refreshSignalCalibrationIfStale(): Promise<{ refreshed: boolean; calculatedAt: string | null }> {
  const { data, error } = await supabase
    .from("signal_calibration_snapshots")
    .select("calculated_at")
    .eq("symbol", "BTCUSDT")
    .eq("strategy_version", "signal-calibration-v2.3a3")
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`[Signal Calibration Refresh] 최신 snapshot 조회 실패: ${error.message}`);

  const latestAt = data?.calculated_at ? new Date(data.calculated_at).getTime() : 0;
  const ageMinutes = latestAt > 0 ? (Date.now() - latestAt) / 60_000 : Infinity;
  if (ageMinutes < REFRESH_INTERVAL_MINUTES) {
    return { refreshed: false, calculatedAt: data?.calculated_at ?? null };
  }

  const { newsRows, fundingRows } = await loadCalibrationRows(WINDOW_HOURS);
  const result = buildSignalCalibration(newsRows, fundingRows, WINDOW_HOURS);
  await saveCalibrationSnapshot(result);
  return { refreshed: true, calculatedAt: result.calculatedAt };
}
