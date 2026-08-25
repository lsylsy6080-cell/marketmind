"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
  LineStyle,
} from "lightweight-charts";
import type { PaperPosition } from "../types";
import { calculateLivePositionMetrics } from "../live-position";

type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type KlinePayload = { e?: string; k?: { t: number; o: string; h: string; l: string; c: string; v: string } };

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


type LiveBitcoinChartProps = { positions?: PaperPosition[]; };

function signed(value: number, digits = 2) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

export function LiveBitcoinChart({ positions = [] }: LiveBitcoinChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema60SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema120SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const entryPriceLineRef = useRef<IPriceLine | null>(null);
  const stopPriceLineRef = useRef<IPriceLine | null>(null);
  const takePriceLineRef = useRef<IPriceLine | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const loadingOlderRef = useRef(false);
  const hasMoreHistoryRef = useRef(true);
  const intervalRef = useRef<Interval>("1m");
  const lastUiRefreshRef = useRef(0);

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

    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current) return;
      chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      entryPriceLineRef.current = null;
      stopPriceLineRef.current = null;
      takePriceLineRef.current = null;
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
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let socket: WebSocket | null = null;
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

    async function loadInitialHistory() {
      const MAX_INITIAL_CANDLES = 1000;
      const PAGE_SIZE = 1000;
      let endTime: number | null = null;
      let all: Candle[] = [];
      let hasMore = true;

      while (!disposed && hasMore && all.length < MAX_INITIAL_CANDLES) {
        const params = new URLSearchParams({
          symbol: "BTCUSDT",
          interval,
          limit: String(PAGE_SIZE),
        });
        if (endTime != null) params.set("endTime", String(endTime));

        const response = await fetch(`/api/market-chart?${params.toString()}`);
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error ?? "차트 데이터 오류");

        const batch = (payload.candles as Candle[] | undefined) ?? [];
        if (!batch.length) break;

        const merged = new Map<number, Candle>();
        for (const candle of [...batch, ...all]) merged.set(candle.time, candle);
        all = Array.from(merged.values()).sort((a, b) => a.time - b.time);

        hasMore = Boolean(payload.hasMore);
        endTime = batch[0].time * 1000 - 1;
        if (batch.length < PAGE_SIZE) hasMore = false;
      }

      return { candles: all, hasMore };
    }

    async function loadHistory() {
      setStatus("loading");
      setError(null);
      loadingOlderRef.current = false;
      hasMoreHistoryRef.current = true;
      try {
        const initial = await loadInitialHistory();
        if (disposed) return;
        const history = initial.candles;
        if (!history.length) throw new Error("표시할 과거 차트 데이터가 없습니다.");
        candlesRef.current = history;
        setCandles(history);
        hasMoreHistoryRef.current = initial.hasMore;
        applyAllSeries(history);
        // 초기에는 최근 1,000개 캔들만 빠르게 로드하고, 왼쪽 이동 시 과거 데이터를 추가합니다.
        // 이후 확대하거나 왼쪽으로 이동하면 기존 무한 과거 로딩도 계속 사용할 수 있습니다.
        chartRef.current?.timeScale().fitContent();
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

      const applyIncoming = (incoming: Candle[]) => {
        if (!incoming.length || disposed || intervalRef.current !== interval) return;

        const mergedMap = new Map<number, Candle>();
        for (const candle of candlesRef.current) mergedMap.set(candle.time, candle);
        for (const candle of incoming) mergedMap.set(candle.time, candle);
        const merged = Array.from(mergedMap.values()).sort((a, b) => a.time - b.time);
        candlesRef.current = merged;

        const latestCandle = merged[merged.length - 1];
        if (latestCandle) candleSeriesRef.current?.update(toChartCandle(latestCandle));

        const now = Date.now();
        if (now - lastUiRefreshRef.current >= 1000) {
          lastUiRefreshRef.current = now;
          const e20 = emaData(merged, 20);
          const e60 = emaData(merged, 60);
          const e120 = emaData(merged, 120);
          if (e20.length) ema20SeriesRef.current?.update(e20[e20.length - 1]);
          if (e60.length) ema60SeriesRef.current?.update(e60[e60.length - 1]);
          if (e120.length) ema120SeriesRef.current?.update(e120[e120.length - 1]);
          setCandles(merged);
        }
      };

      // Paper Trading에서 사용하는 것과 같은 Binance USDⓈ-M Futures WebSocket 계열을 사용합니다.
      // interval별 진행 중인 kline을 받아 마지막 candle을 실시간 갱신합니다.
      const wsInterval = intervalRef.current;
      socket = new WebSocket(
        `wss://fstream.binance.com/market/ws/btcusdt@kline_${wsInterval}`,
      );

      socket.onopen = () => {
        if (disposed || intervalRef.current !== interval) return;
        setStatus("live");
        setError(null);
        if (fallbackTimer) {
          clearInterval(fallbackTimer);
          fallbackTimer = null;
        }
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as KlinePayload;
          const k = payload.k;
          if (!k) return;

          const next: Candle = {
            time: Math.floor(Number(k.t) / 1000),
            open: Number(k.o),
            high: Number(k.h),
            low: Number(k.l),
            close: Number(k.c),
            volume: Number(k.v),
          };

          if (
            !Number.isFinite(next.time) ||
            !Number.isFinite(next.open) ||
            !Number.isFinite(next.high) ||
            !Number.isFinite(next.low) ||
            !Number.isFinite(next.close) ||
            next.close <= 0
          ) return;

          applyIncoming([next]);
          setStatus("live");
          setError(null);
        } catch {
          // malformed exchange payload는 마지막 정상 candle을 유지합니다.
        }
      };

      const pollLatest = async () => {
        if (disposed || intervalRef.current !== interval) return;
        try {
          const response = await fetch(
            `/api/market-chart?symbol=BTCUSDT&interval=${intervalRef.current}&limit=2&_=${Date.now()}`,
            { cache: "no-store" },
          );
          const payload = await response.json();
          if (!response.ok || !payload.ok) throw new Error(payload.error ?? "실시간 차트 데이터 오류");
          applyIncoming((payload.candles as Candle[] | undefined) ?? []);
          if (!socket || socket.readyState !== WebSocket.OPEN) setStatus("reconnecting");
        } catch (e) {
          if (!disposed) {
            setStatus("reconnecting");
            setError(e instanceof Error ? e.message : "실시간 차트를 갱신하지 못했습니다.");
          }
        }
      };

      const startFallbackPolling = () => {
        if (fallbackTimer || disposed) return;
        void pollLatest();
        fallbackTimer = setInterval(pollLatest, 3000);
      };

      socket.onclose = () => {
        if (disposed) return;
        setStatus("reconnecting");
        startFallbackPolling();
        retryTimer = setTimeout(connect, 2500);
      };

      socket.onerror = () => {
        if (disposed) return;
        setStatus("reconnecting");
        startFallbackPolling();
        socket?.close();
      };
    }

    chart?.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
    void loadHistory();
    return () => {
      disposed = true;
      loadingOlderRef.current = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (fallbackTimer) clearInterval(fallbackTimer);
      socket?.close();
      chart?.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
    };
  }, [interval]);

  const primaryPosition = positions[0] ?? null;

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    const removeLines = () => {
      if (entryPriceLineRef.current) series.removePriceLine(entryPriceLineRef.current);
      if (stopPriceLineRef.current) series.removePriceLine(stopPriceLineRef.current);
      if (takePriceLineRef.current) series.removePriceLine(takePriceLineRef.current);
      entryPriceLineRef.current = null;
      stopPriceLineRef.current = null;
      takePriceLineRef.current = null;
    };

    removeLines();
    if (!primaryPosition) return;

    const isLong = primaryPosition.side === "long";
    entryPriceLineRef.current = series.createPriceLine({
      price: primaryPosition.entry_price,
      color: isLong ? "#22c55e" : "#ef5350",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "ENTRY",
    });
    stopPriceLineRef.current = series.createPriceLine({
      price: primaryPosition.stop_loss_price,
      color: "#ef5350",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "SL",
    });
    takePriceLineRef.current = series.createPriceLine({
      price: primaryPosition.take_profit_price,
      color: "#22c55e",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "TP",
    });

    return removeLines;
  }, [primaryPosition]);

  const latest = candles[candles.length - 1] ?? null;
  const firstVisible = candles[Math.max(0, candles.length - 96)] ?? null;
  const change = latest && firstVisible ? ((latest.close - firstVisible.open) / firstVisible.open) * 100 : null;
  const liveMetrics = latest && primaryPosition ? calculateLivePositionMetrics(primaryPosition, latest.close) : null;
  const aggregatePnl = latest
    ? positions.reduce((sum, position) => sum + calculateLivePositionMetrics(position, latest.close).unrealizedPnl, 0)
    : null;

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
        <small>{loadingOlder ? "과거 캔들 불러오는 중…" : "최근 1,000개 우선 로딩 · 현재 포지션 ENTRY / SL / TP · 왼쪽 추가 로딩 지원"}</small>
      </div>

      {primaryPosition && latest && liveMetrics ? (
        <div className={`live-position-strip ${primaryPosition.side}`}>
          <div className="live-position-main">
            <span className="live-position-dot" aria-hidden="true" />
            <div>
              <small>OPEN POSITION</small>
              <strong>{primaryPosition.side === "long" ? "LONG" : "SHORT"}</strong>
            </div>
          </div>
          <div>
            <small>진입가</small>
            <strong>${primaryPosition.entry_price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</strong>
          </div>
          <div>
            <small>현재가</small>
            <strong>${latest.close.toLocaleString("en-US", { maximumFractionDigits: 2 })}</strong>
          </div>
          <div>
            <small>가격 수익률</small>
            <strong className={liveMetrics.priceReturnPercent >= 0 ? "paper-positive" : "paper-negative"}>
              {signed(liveMetrics.priceReturnPercent)}%
            </strong>
          </div>
          <div>
            <small>포지션 ROI</small>
            <strong className={liveMetrics.roiPercent >= 0 ? "paper-positive" : "paper-negative"}>
              {signed(liveMetrics.roiPercent)}%
            </strong>
          </div>
          <div>
            <small>미실현 PnL</small>
            <strong className={(aggregatePnl ?? 0) >= 0 ? "paper-positive" : "paper-negative"}>
              {signed(aggregatePnl ?? liveMetrics.unrealizedPnl, 2)} USDT
            </strong>
          </div>
        </div>
      ) : null}

      <div ref={containerRef} className="tradingview-chart-container" aria-label={`BTCUSDT ${interval} TradingView 실시간 캔들 차트`} />
      <div className="chart-footnote">
        Binance USDⓈ-M Futures WebSocket 실시간 데이터 · 현재 포지션 ENTRY / SL / TP 표시 · 연결 실패 시 Supabase 자동 fallback · Charting technology by TradingView Lightweight Charts™
      </div>
    </section>
  );
}
