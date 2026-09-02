"use client";

import { useMemo } from "react";
import { useLiveBtcPrice } from "../hooks/useLiveBtcPrice";
import { formatDateTime } from "../format";

function isFresh(value: string | null | undefined, minutes: number) {
  if (!value) return false;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) && Date.now() - ts <= minutes * 60_000;
}

export function ShellMarketStatus({ updatedAt, workerUpdatedAt }: { updatedAt: string; workerUpdatedAt?: string | null }) {
  const { price, status } = useLiveBtcPrice(null);
  const workerOk = useMemo(() => isFresh(workerUpdatedAt ?? updatedAt, 30), [workerUpdatedAt, updatedAt]);
  const dataOk = useMemo(() => isFresh(updatedAt, 90), [updatedAt]);
  const apiOk = status === "live";

  return (
    <>
      <div className="mm-live-btc-chip">
        <span className="btc-dot">₿</span>
        <b>BTC</b>
        <strong>{price ? `$${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "연결 중"}</strong>
        <em className={apiOk ? "up" : "muted"}>{apiOk ? "LIVE" : "SYNC"}</em>
      </div>
      <div className="mm-last-update">
        <span>마지막 업데이트</span>
        <b>◷ {formatDateTime(updatedAt)}</b>
      </div>
      <div className="mm-system-health">
        <span><small>워커</small><b className={workerOk ? "ok" : "warn"}><i />{workerOk ? "정상" : "확인"}</b></span>
        <span><small>데이터</small><b className={dataOk ? "ok" : "warn"}><i />{dataOk ? "정상" : "지연"}</b></span>
        <span><small>API</small><b className={apiOk ? "ok" : "warn"}><i />{apiOk ? "정상" : "연결"}</b></span>
      </div>
    </>
  );
}
