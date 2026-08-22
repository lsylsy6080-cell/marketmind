import "dotenv/config";
import { spawn, type ChildProcess } from "node:child_process";

const SUCCESS_INTERVAL_MS =
  Math.max(1, Number(process.env.WORKER_INTERVAL_MINUTES ?? 15)) * 60_000;
const RUN_TIMEOUT_MS =
  Math.max(1, Number(process.env.WORKER_RUN_TIMEOUT_MINUTES ?? 10)) * 60_000;
const SKIP_RETRY_MS =
  Math.max(10, Number(process.env.WORKER_SKIP_RETRY_SECONDS ?? 60)) * 1_000;

const FAILURE_BACKOFF_MS = String(
  process.env.WORKER_FAILURE_BACKOFF_SECONDS ?? "10,30,60,120,300",
)
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0)
  .map((value) => value * 1_000);

const TEMPORARY_LOCK_EXIT_CODE = 75;

let stopping = false;
let child: ChildProcess | null = null;
let failureCount = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatKst(date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function log(message: string): void {
  console.log(`[${formatKst()}] ${message}`);
}

function nextFailureDelay(): number {
  if (FAILURE_BACKOFF_MS.length === 0) return 60_000;
  return FAILURE_BACKOFF_MS[
    Math.min(failureCount, FAILURE_BACKOFF_MS.length - 1)
  ];
}

async function waitUntilNextRun(ms: number, reason: string): Promise<void> {
  if (stopping) return;
  log(`${reason} · 다음 실행까지 ${Math.round(ms / 1000)}초`);
  const chunk = 1_000;
  let remaining = ms;

  while (!stopping && remaining > 0) {
    const wait = Math.min(chunk, remaining);
    await sleep(wait);
    remaining -= wait;
  }
}

async function stopChildGracefully(): Promise<void> {
  const current = child;
  if (!current || current.killed || current.exitCode !== null) return;

  log("실행 중인 worker에 SIGTERM 전달");
  current.kill("SIGTERM");

  const deadline = Date.now() + 8_000;
  while (current.exitCode === null && Date.now() < deadline) {
    await sleep(250);
  }

  if (current.exitCode === null) {
    log("worker 종료 지연 · SIGKILL 전달");
    current.kill("SIGKILL");
  }
}

function runWorkerOnce(): Promise<number> {
  return new Promise((resolve) => {
    if (stopping) {
      resolve(0);
      return;
    }

    log("▶ market-worker 1회 실행 시작");

    // npm start를 자식 프로세스로 실행하되 PM2에는 runner 하나만 상주시킵니다.
    const command = process.platform === "win32" ? "npm.cmd" : "npm";
    child = spawn(command, ["start"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        WORKER_TRIGGER_SOURCE: "persistent-runner",
        WORKER_PERSISTENT_RUNNER: "true",
      },
      stdio: "inherit",
      shell: false,
    });

    let settled = false;
    const startedAt = Date.now();

    const timeout = setTimeout(() => {
      if (settled || !child || child.exitCode !== null) return;
      log(
        `⚠ worker 실행 ${Math.round(RUN_TIMEOUT_MS / 60_000)}분 초과 · 종료 요청`,
      );
      child.kill("SIGTERM");

      setTimeout(() => {
        if (child && child.exitCode === null) child.kill("SIGKILL");
      }, 8_000).unref?.();
    }, RUN_TIMEOUT_MS);
    timeout.unref?.();

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child = null;
      console.error(`[${formatKst()}] ❌ worker 실행 프로세스 오류 | ${error.message}`);
      resolve(1);
    });

    child.on("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child = null;

      const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
      if (signal) {
        log(`⚠ worker 종료 signal=${signal} · ${duration}s`);
        resolve(1);
        return;
      }

      const exitCode = code ?? 1;
      if (exitCode === 0) {
        log(`✅ worker 1회 실행 완료 · ${duration}s`);
      } else if (exitCode === TEMPORARY_LOCK_EXIT_CODE) {
        log(`⏭ worker lock 사용 중 · ${duration}s`);
      } else {
        log(`❌ worker 실행 실패 code=${exitCode} · ${duration}s`);
      }
      resolve(exitCode);
    });
  });
}

async function main(): Promise<void> {
  log(
    `Persistent Runner 시작 · 정상주기=${Math.round(SUCCESS_INTERVAL_MS / 60_000)}분` +
      ` · timeout=${Math.round(RUN_TIMEOUT_MS / 60_000)}분`,
  );

  while (!stopping) {
    const code = await runWorkerOnce();
    if (stopping) break;

    if (code === 0) {
      failureCount = 0;
      await waitUntilNextRun(SUCCESS_INTERVAL_MS, "정상 실행 완료");
      continue;
    }

    if (code === TEMPORARY_LOCK_EXIT_CODE) {
      // stale lock 또는 다른 단일 실행이 끝날 시간을 줍니다.
      await waitUntilNextRun(SKIP_RETRY_MS, "다른 worker lock 감지");
      continue;
    }

    const delay = nextFailureDelay();
    failureCount += 1;
    await waitUntilNextRun(
      delay,
      `실행 실패 ${failureCount}회 · network/process backoff`,
    );
  }

  log("Persistent Runner 종료");
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log(`${signal} 수신 · 안전 종료 시작`);
  await stopChildGracefully();
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

void main().catch((error: unknown) => {
  console.error(
    `[${formatKst()}] ❌ Persistent Runner 치명적 오류 | ${
      error instanceof Error ? error.stack ?? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
