"use client";

import { useEffect, useState } from "react";

type KlineMessage = {
  k?: {
    c?: string;
  };
};

export function useLiveBtcPrice(initialPrice: number | null) {
  const [price, setPrice] = useState<number | null>(initialPrice);
  const [status, setStatus] = useState<"connecting" | "live" | "reconnecting">("connecting");

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (disposed) return;
      setStatus((current) => (current === "connecting" ? "connecting" : "reconnecting"));
      socket = new WebSocket("wss://fstream.binance.com/market/ws/btcusdt@kline_1m");

      socket.onopen = () => {
        if (!disposed) setStatus("live");
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as KlineMessage;
          const next = Number(payload.k?.c);
          if (!disposed && Number.isFinite(next) && next > 0) setPrice(next);
        } catch {
          // Ignore malformed exchange messages and keep the last valid price.
        }
      };

      socket.onclose = () => {
        if (disposed) return;
        setStatus("reconnecting");
        retryTimer = setTimeout(connect, 2500);
      };

      socket.onerror = () => {
        if (!disposed) setStatus("reconnecting");
      };
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  return { price, status };
}
