import { randomUUID } from "node:crypto";
import { supabase } from "../lib/supabase";

const WORKER_NAME = "market-worker-main";
const LOCK_TTL_SECONDS = 1_800;

export class WorkerExecutionTracker {
  readonly runId = randomUUID();
  private runRowId: number | null = null;
  private startedAt = Date.now();

  async start(): Promise<boolean> {
    const { data, error } = await supabase.rpc("acquire_worker_lock_v1", {
      p_worker_name: WORKER_NAME,
      p_run_id: this.runId,
      p_ttl_seconds: LOCK_TTL_SECONDS,
    });
    if (error) throw new Error(`워커 잠금 획득 실패: ${error.message}`);
    if (data !== true) return false;

    const { data: row, error: insertError } = await supabase
      .from("worker_execution_runs")
      .insert({
        run_id: this.runId,
        worker_name: WORKER_NAME,
        status: "running",
        trigger_source: process.env.WORKER_TRIGGER_SOURCE ?? "manual",
        process_id: process.pid,
      })
      .select("id")
      .single();
    if (insertError) {
      await this.releaseLock();
      throw new Error(`워커 실행 기록 생성 실패: ${insertError.message}`);
    }
    this.runRowId = Number(row.id);
    return true;
  }

  async stage<T>(key: string, label: string, run: () => Promise<T>): Promise<T> {
    if (this.runRowId === null) throw new Error("워커 실행이 시작되지 않았습니다.");
    const stageStartedAt = Date.now();
    const { data, error } = await supabase
      .from("worker_execution_stages")
      .insert({
        execution_run_id: this.runRowId,
        stage_key: key,
        stage_label: label,
        status: "running",
      })
      .select("id")
      .single();
    if (error) throw new Error(`${label} 단계 기록 실패: ${error.message}`);

    try {
      const result = await run();
      await supabase
        .from("worker_execution_stages")
        .update({
          status: "completed",
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - stageStartedAt,
        })
        .eq("id", data.id);
      return result;
    } catch (stageError: unknown) {
      const message =
        stageError instanceof Error ? stageError.message : String(stageError);
      await supabase
        .from("worker_execution_stages")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - stageStartedAt,
          error_message: message.slice(0, 2000),
        })
        .eq("id", data.id);
      throw stageError;
    }
  }

  async finish(error?: unknown): Promise<void> {
    const message =
      error === undefined
        ? null
        : error instanceof Error
          ? error.message
          : String(error);
    if (this.runRowId !== null) {
      await supabase
        .from("worker_execution_runs")
        .update({
          status: message ? "failed" : "completed",
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - this.startedAt,
          error_message: message?.slice(0, 4000) ?? null,
        })
        .eq("id", this.runRowId);
    }
    await this.releaseLock();
  }

  private async releaseLock(): Promise<void> {
    const { error } = await supabase.rpc("release_worker_lock_v1", {
      p_worker_name: WORKER_NAME,
      p_run_id: this.runId,
    });
    if (error) console.error("워커 잠금 해제 실패:", error.message);
  }
}
