import { randomUUID } from "node:crypto";
import { supabase } from "../lib/supabase";

const WORKER_NAME = "market-worker-main";

// Phase 7-7R: 네트워크 이동 환경에서 30분 stale lock을 피하기 위해
// TTL을 5분으로 줄이고, 정상 실행 중에는 60초 heartbeat로 연장합니다.
const LOCK_TTL_SECONDS = Number(process.env.WORKER_LOCK_TTL_SECONDS ?? 300);
const HEARTBEAT_INTERVAL_MS = Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? 60_000);
const NETWORK_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000, 30_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function looksTransient(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return [
    "fetch failed",
    "network",
    "socket",
    "econnreset",
    "econnrefused",
    "enotfound",
    "etimedout",
    "timeout",
    "abort",
    "dns",
    "connection",
    "jwt issued at future",
  ].some((needle) => message.includes(needle));
}

async function withNetworkRetry<T>(
  label: string,
  run: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= NETWORK_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!looksTransient(error) || attempt >= NETWORK_RETRY_DELAYS_MS.length) {
        throw error;
      }
      const delay = NETWORK_RETRY_DELAYS_MS[attempt];
      console.error(
        `[Worker Recovery] ${label} 일시 실패 · ${Math.round(delay / 1000)}초 후 재시도 (${attempt + 1}/${NETWORK_RETRY_DELAYS_MS.length}) | ${errorMessage(error)}`,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

export class WorkerExecutionTracker {
  readonly runId = randomUUID();
  private runRowId: number | null = null;
  private startedAt = Date.now();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatInFlight = false;
  private lockOwned = false;

  async start(): Promise<boolean> {
    const acquired = await withNetworkRetry("워커 잠금 획득", async () => {
      const { data, error } = await supabase.rpc("acquire_worker_lock_v2", {
        p_worker_name: WORKER_NAME,
        p_run_id: this.runId,
        p_ttl_seconds: LOCK_TTL_SECONDS,
      });
      if (error) throw new Error(`워커 잠금 획득 실패: ${error.message}`);
      return data === true;
    });

    if (!acquired) return false;
    this.lockOwned = true;

    try {
      // 이전 네트워크/프로세스 단절로 running 이력이 남아 있어도 현재 실행을 막지 않습니다.
      try {
        await withNetworkRetry("stale 실행이력 정리", async () => {
          const { error } = await supabase.rpc("mark_stale_worker_runs_v1", {
            p_worker_name: WORKER_NAME,
            p_stale_minutes: 10,
          });
          if (error) throw new Error(error.message);
        });
      } catch (cleanupError) {
        console.error(`[Worker Recovery] stale 실행이력 정리 실패(본 작업 유지) | ${errorMessage(cleanupError)}`);
      }

      const row = await withNetworkRetry("워커 실행 기록 생성", async () => {
        const { data, error } = await supabase
          .from("worker_execution_runs")
          .insert({
            run_id: this.runId,
            worker_name: WORKER_NAME,
            status: "running",
            trigger_source: process.env.WORKER_TRIGGER_SOURCE ?? "pm2",
            process_id: process.pid,
          })
          .select("id")
          .single();
        if (error) throw new Error(`워커 실행 기록 생성 실패: ${error.message}`);
        return data;
      });

      this.runRowId = Number(row.id);
      this.startHeartbeat();
      return true;
    } catch (error) {
      await this.releaseLock();
      throw error;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeat();
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref?.();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async heartbeat(): Promise<void> {
    if (!this.lockOwned || this.heartbeatInFlight) return;
    this.heartbeatInFlight = true;

    try {
      const renewed = await withNetworkRetry("워커 heartbeat", async () => {
        const { data, error } = await supabase.rpc("heartbeat_worker_lock_v2", {
          p_worker_name: WORKER_NAME,
          p_run_id: this.runId,
          p_ttl_seconds: LOCK_TTL_SECONDS,
        });
        if (error) throw new Error(`heartbeat 실패: ${error.message}`);
        return data === true;
      });

      if (!renewed) {
        // 다른 run_id가 lock을 소유하고 있다면 안전상 더 이상 우리가 lock을 가진 것으로 보지 않습니다.
        this.lockOwned = false;
        this.stopHeartbeat();
        console.error("[Worker Recovery] ⚠️ lock ownership을 잃어 heartbeat를 중단했습니다.");
      }
    } catch (error) {
      // 네트워크가 장시간 끊기면 TTL은 자연 만료됩니다.
      // 여기서 본 작업을 즉시 죽이지 않고, 최종 finish/restart가 lock을 복구하도록 둡니다.
      console.error(`[Worker Recovery] ⚠️ heartbeat 갱신 실패 | ${errorMessage(error)}`);
    } finally {
      this.heartbeatInFlight = false;
    }
  }

  async stage<T>(key: string, label: string, run: () => Promise<T>): Promise<T> {
    if (this.runRowId === null) throw new Error("워커 실행이 시작되지 않았습니다.");
    const stageStartedAt = Date.now();

    const data = await withNetworkRetry(`${label} 단계 기록 시작`, async () => {
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
      return data;
    });

    try {
      const result = await run();

      try {
        await withNetworkRetry(`${label} 단계 완료 기록`, async () => {
          const { error } = await supabase
            .from("worker_execution_stages")
            .update({
              status: "completed",
              finished_at: new Date().toISOString(),
              duration_ms: Date.now() - stageStartedAt,
            })
            .eq("id", data.id);
          if (error) throw new Error(error.message);
        });
      } catch (trackingError) {
        console.error(`[Worker Recovery] 단계 완료 기록 실패(본 작업 유지) | ${errorMessage(trackingError)}`);
      }
      return result;
    } catch (stageError: unknown) {
      const message = errorMessage(stageError);
      try {
        await withNetworkRetry(`${label} 단계 실패 기록`, async () => {
          const { error } = await supabase
            .from("worker_execution_stages")
            .update({
              status: "failed",
              finished_at: new Date().toISOString(),
              duration_ms: Date.now() - stageStartedAt,
              error_message: message.slice(0, 2000),
            })
            .eq("id", data.id);
          if (error) throw new Error(error.message);
        });
      } catch {
        // 원래 stage error를 보존합니다.
      }
      throw stageError;
    }
  }

  async finish(error?: unknown): Promise<void> {
    this.stopHeartbeat();

    const message =
      error === undefined
        ? null
        : error instanceof Error
          ? error.message
          : String(error);

    if (this.runRowId !== null) {
      try {
        await withNetworkRetry("워커 실행 종료 기록", async () => {
          const { error: updateError } = await supabase
            .from("worker_execution_runs")
            .update({
              status: message ? "failed" : "completed",
              finished_at: new Date().toISOString(),
              duration_ms: Date.now() - this.startedAt,
              error_message: message?.slice(0, 4000) ?? null,
            })
            .eq("id", this.runRowId);
          if (updateError) throw new Error(updateError.message);
        });
      } catch (trackingError) {
        console.error(`[Worker Recovery] 종료 이력 저장 실패 | ${errorMessage(trackingError)}`);
      }
    }

    await this.releaseLock();
  }

  private async releaseLock(): Promise<void> {
    if (!this.lockOwned) return;

    try {
      await withNetworkRetry("워커 잠금 해제", async () => {
        const { data, error } = await supabase.rpc("release_worker_lock_v2", {
          p_worker_name: WORKER_NAME,
          p_run_id: this.runId,
        });
        if (error) throw new Error(`워커 잠금 해제 실패: ${error.message}`);
        return data;
      });
    } catch (error) {
      // 해제가 끝내 실패해도 TTL 5분 후 stale takeover가 가능하므로 프로세스를 묶어두지 않습니다.
      console.error(`[Worker Recovery] ⚠️ lock 해제 최종 실패 · TTL 만료 후 자동 복구 | ${errorMessage(error)}`);
    } finally {
      this.lockOwned = false;
    }
  }
}
