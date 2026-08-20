"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type KlinePayload = { e?: string; k?: { t: number; o: string; h: string; l: string; c: string; v: string } };
type TradeEntryMarker = { opened_at: string; side: "long" | "short"; entry_price: number };

const intervals: { value: Interval; label: string }[] = [
  { value: "1m", label: "1분" },
  { value: "5m", label: "5분" },
  { value: "15m", label: "15분" },
  { value: "1h", label: "1시간" },
  { value: "4h", label: "4시간" },
  { value: "1d", label: "1일" },
];

function emaData(candles: Candle[], period: number) {
  if (!candles.length) return [];
  const multiplier = 2 / (period + 1);
  let current = candles[0].close;
  return candles.flatMap((candle, index) => {
    current = index === 0 ? candle.close : candle.close * multiplier + current * (1 - multiplier);
    if (index < period - 1) return [];
    return [{ time: candle.time as UTCTimestamp, value: current }];
  });
}

function toChartCandle(candle: Candle) {
  return {
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

function nearestCandleTime(candles: Candle[], timestamp: number) {
  if (!candles.length) return null;
  let best = candles[0];
  let distance = Math.abs(best.time - timestamp);
  for (const candle of candles) {
    const nextDistance = Math.abs(candle.time - timestamp);
    if (nextDistance < distance) {
      best = candle;
      distance = nextDistance;
    }
  }
  return best.time as UTCTimestamp;
}

export function LiveBitcoinChart({ entries = [] }: { entries?: TradeEntryMarker[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema60SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema120SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markerPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const loadingOlderRef = useRef(false);
  const hasMoreHistoryRef = useRef(true);
  const intervalRef = useRef<Interval>("1m");

  const [interval, setIntervalValue] = useState<Interval>("1m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<"loading" | "live" | "reconnecting" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  useEffect(() => {
    intervalRef.current = interval;
  }, [interval]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 500,
      layout: {
        background: { type: ColorType.Solid, color: "#0b1020" },
        textColor: "#8892a8",
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.08)" },
        horzLines: { color: "rgba(148, 163, 184, 0.08)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(148, 163, 184, 0.45)", labelBackgroundColor: "#334155" },
        horzLine: { color: "rgba(148, 163, 184, 0.45)", labelBackgroundColor: "#334155" },
      },
      rightPriceScale: {
        borderColor: "rgba(148, 163, 184, 0.16)",
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.16)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 8,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
      priceLineVisible: true,
      lastValueVisible: true,
    });
    const ema20Series = chart.addSeries(LineSeries, { color: "#22c55e", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const ema60Series = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const ema120Series = chart.addSeries(LineSeries, { color: "#8b5cf6", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    ema20SeriesRef.current = ema20Series;
    ema60SeriesRef.current = ema60Series;
    ema120SeriesRef.current = ema120Series;
    markerPluginRef.current = createSeriesMarkers(candleSeries, []);

    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current) return;
      chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      markerPluginRef.current = null;
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      ema20SeriesRef.current = null;
      ema60SeriesRef.current = null;
      ema120SeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const chart = chartRef.current;

    function applyAllSeries(history: Candle[]) {
      candleSeriesRef.current?.setData(history.map(toChartCandle));
      ema20SeriesRef.current?.setData(emaData(history, 20));
      ema60SeriesRef.current?.setData(emaData(history, 60));
      ema120SeriesRef.current?.setData(emaData(history, 120));
    }

    async function fetchOlderHistory() {
      if (disposed || loadingOlderRef.current || !hasMoreHistoryRef.current) return;
      const current = candlesRef.current;
      if (!current.length) return;

      loadingOlderRef.current = true;
      setLoadingOlder(true);
      const visibleRange = chartRef.current?.timeScale().getVisibleLogicalRange() ?? null;

      try {
        // endTime is exclusive enough for our purpose by asking for 1 ms before the oldest candle.
        const endTime = current[0].time * 1000 - 1;
        const response = await fetch(
          `/api/market-chart?symbol=BTCUSDT&interval=${intervalRef.current}&limit=1000&endTime=${endTime}`,
          { cache: "no-store" },
        );
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error ?? "과거 차트 데이터 오류");
        if (disposed || intervalRef.current !== interval) return;

        const older = (payload.candles as Candle[]).filter((item) => item.time < current[0].time);
        hasMoreHistoryRef.current = Boolean(payload.hasMore) && older.length > 0;
        if (!older.length) return;

        const mergedMap = new Map<number, Candle>();
        for (const candle of [...older, ...candlesRef.current]) mergedMap.set(candle.time, candle);
        const merged = Array.from(mergedMap.values()).sort((a, b) => a.time - b.time);
        candlesRef.current = merged;
        setCandles(merged);
        applyAllSeries(merged);

        // Prepending bars changes logical indexes. Shift the viewport by the number of added bars
        // so the user keeps looking at exactly the same candles while older history appears on the left.
        if (visibleRange) {
          chartRef.current?.timeScale().setVisibleLogicalRange({
            from: visibleRange.from + older.length,
            to: visibleRange.to + older.length,
          });
        }
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : "과거 차트를 불러오지 못했습니다.");
      } finally {
        loadingOlderRef.current = false;
        if (!disposed) setLoadingOlder(false);
      }
    }

    const handleVisibleRangeChange = (range: { from: number; to: number } | null) => {
      if (!range || disposed) return;
      // Load the next block before the user actually reaches the first candle.
      if (range.from < 50) void fetchOlderHistory();
    };

    async function loadHistory() {
      setStatus("loading");
      setError(null);
      loadingOlderRef.current = false;
      hasMoreHistoryRef.current = true;
      try {
        const response = await fetch(`/api/market-chart?symbol=BTCUSDT&interval=${interval}&limit=500`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error ?? "차트 데이터 오류");
        if (disposed) return;
        const history = payload.candles as Candle[];
        candlesRef.current = history;
        setCandles(history);
        hasMoreHistoryRef.current = Boolean(payload.hasMore);
        applyAllSeries(history);
        if (history.length) {
          chartRef.current?.timeScale().setVisibleLogicalRange({
            from: Math.max(0, history.length - 120),
            to: history.length + 5,
          });
        }
      } catch (e) {
        if (!disposed) {
          setStatus("error");
          setError(e instanceof Error ? e.message : "차트 데이터를 불러오지 못했습니다.");
        }
        return;
      }
      connect();
    }

    function connect() {
      if (disposed) return;
      socket = new WebSocket(`wss://fstream.binance.com/market/ws/btcusdt@kline_${interval}`);
      socket.onopen = () => { if (!disposed) setStatus("live"); };
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as KlinePayload;
          if (!data.k) return;
          const next: Candle = {
            time: Math.floor(data.k.t / 1000),
            open: Number(data.k.o),
            high: Number(data.k.h),
            low: Number(data.k.l),
            close: Number(data.k.c),
            volume: Number(data.k.v),
          };
          setCandles((current) => {
            if (!current.length) {
              const initial = [next];
              candlesRef.current = initial;
              candleSeriesRef.current?.update(toChartCandle(next));
              return initial;
            }
            const copy = current.slice();
            const last = copy[copy.length - 1];
            if (last.time === next.time) copy[copy.length - 1] = next;
            else if (next.time > last.time) copy.push(next);
            else return current;

            // Keep loaded history. Do not trim old candles when live ticks arrive.
            candlesRef.current = copy;
            candleSeriesRef.current?.update(toChartCandle(next));
            const e20 = emaData(copy, 20);
            const e60 = emaData(copy, 60);
            const e120 = emaData(copy, 120);
            if (e20.length) ema20SeriesRef.current?.update(e20[e20.length - 1]);
            if (e60.length) ema60SeriesRef.current?.update(e60[e60.length - 1]);
            if (e120.length) ema120SeriesRef.current?.update(e120[e120.length - 1]);
            return copy;
          });
        } catch {
          // Ignore malformed stream messages and keep the chart connected.
        }
      };
      socket.onerror = () => { if (!disposed) setStatus("reconnecting"); };
      socket.onclose = () => {
        if (!disposed) {
          setStatus("reconnecting");
          retryTimer = setTimeout(connect, 2500);
        }
      };
    }

    chart?.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
    void loadHistory();
    return () => {
      disposed = true;
      loadingOlderRef.current = false;
      if (retryTimer) clearTimeout(retryTimer);
      chart?.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
      socket?.close();
    };
  }, [interval]);

  const markers = useMemo(() => {
    if (!candles.length) return [] as SeriesMarker<Time>[];
    const first = candles[0].time;
    const last = candles[candles.length - 1].time;
    return entries
      .slice(0, 100)
      .flatMap((entry): SeriesMarker<Time>[] => {
        const timestamp = Math.floor(new Date(entry.opened_at).getTime() / 1000);
        if (!Number.isFinite(timestamp) || timestamp < first || timestamp > last) return [];
        const time = nearestCandleTime(candles, timestamp);
        if (time == null) return [];
        const isLong = entry.side === "long";
        return [{
          time,
          position: isLong ? "belowBar" : "aboveBar",
          color: isLong ? "#22c55e" : "#ef5350",
          shape: isLong ? "arrowUp" : "arrowDown",
          text: `${isLong ? "LONG" : "SHORT"} ENTRY`,
        }];
      })
      .sort((a, b) => Number(a.time) - Number(b.time));
  }, [candles, entries]);

  useEffect(() => {
    markerPluginRef.current?.setMarkers(markers);
  }, [markers]);

  const latest = candles[candles.length - 1] ?? null;
  const firstVisible = candles[Math.max(0, candles.length - 96)] ?? null;
  const change = latest && firstVisible ? ((latest.close - firstVisible.open) / firstVisible.open) * 100 : null;

  return (
    <section className="panel live-chart-panel tradingview-chart-panel">
      <div className="live-chart-header">
        <div>
          <span className="section-kicker">BTCUSDT · PERPETUAL · TRADINGVIEW</span>
          <div className="live-chart-price-row">
            <h2>{latest ? `$${latest.close.toLocaleString("en-US", { maximumFractionDigits: 1 })}` : "BTC 실시간 차트"}</h2>
            {change != null ? <strong className={change >= 0 ? "paper-positive" : "paper-negative"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</strong> : null}
            <span className={`chart-live-state ${status}`}>{status === "live" ? "● LIVE" : status === "loading" ? "불러오는 중" : status === "reconnecting" ? "재연결 중" : "연결 오류"}</span>
          </div>
        </div>
        <div className="chart-intervals" aria-label="차트 시간봉">
          {intervals.map((item) => (
            <button key={item.value} type="button" className={interval === item.value ? "active" : ""} onClick={() => setIntervalValue(item.value)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="chart-error">{error}</div> : null}
      <div className="chart-legend">
        <span className="ema20-label">EMA 20</span>
        <span className="ema60-label">EMA 60</span>
        <span className="ema120-label">EMA 120</span>
        <small>{loadingOlder ? "과거 캔들 불러오는 중…" : "왼쪽으로 드래그하면 과거 캔들 자동 로딩 · 실제 모의매매 진입만 표시"}</small>
      </div>

      <div ref={containerRef} className="tradingview-chart-container" aria-label={`BTCUSDT ${interval} TradingView 실시간 캔들 차트`} />
      <div className="chart-footnote">
        Binance USDⓈ-M Futures 실시간 데이터 · Charting technology by TradingView Lightweight Charts™ · LONG/SHORT 마커는 실제 모의매매 진입 시점만 표시됩니다.
      </div>
    </section>
  );
}
