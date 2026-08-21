"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { formatDateTime, formatRelativeTime } from "../format";

type Props = {
  workerUpdatedAt: string | null;
};

export function DashboardRefreshControl({ workerUpdatedAt }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="mm-refresh-control">
      <div className="mm-worker-updated">
        <span>워커 업데이트</span>
        <strong>{workerUpdatedAt ? formatRelativeTime(workerUpdatedAt) : "확인 불가"}</strong>
        <small>{workerUpdatedAt ? formatDateTime(workerUpdatedAt) : "worker_execution_runs 데이터 없음"}</small>
      </div>
      <button
        type="button"
        className={isPending ? "refreshing" : ""}
        onClick={() => startTransition(() => router.refresh())}
        disabled={isPending}
        aria-label="대시보드 데이터 새로고침"
      >
        <i aria-hidden="true">↻</i>
        <span>{isPending ? "갱신 중" : "새로고침"}</span>
      </button>
    </div>
  );
}
