import { createAdminClient } from "../lib/supabase/admin";
import type { WorkerOperationsData, WorkerRun, WorkerStage } from "./types";

export async function getWorkerOperationsData(): Promise<WorkerOperationsData> {
  try {
    const supabase = createAdminClient();
    const { data: runs, error } = await supabase
      .from("worker_execution_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(10);
    if (error) throw error;

    const latestRunId = runs?.[0]?.id;
    const stagesResult = latestRunId
      ? await supabase
          .from("worker_execution_stages")
          .select("*")
          .eq("execution_run_id", latestRunId)
          .order("started_at", { ascending: true })
      : { data: [], error: null };
    if (stagesResult.error) throw stagesResult.error;

    return {
      runs: (runs ?? []).map((row) => ({
        ...row,
        id: Number(row.id),
        duration_ms: row.duration_ms === null ? null : Number(row.duration_ms),
      })) as WorkerRun[],
      stages: (stagesResult.data ?? []).map((row) => ({
        ...row,
        id: Number(row.id),
        execution_run_id: Number(row.execution_run_id),
        duration_ms: row.duration_ms === null ? null : Number(row.duration_ms),
      })) as WorkerStage[],
      error: null,
    };
  } catch (error: unknown) {
    return {
      runs: [],
      stages: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
