-- Reconstructed from src/collectors/binance-btc.ts,
-- src/collectors/binance-multi-timeframe.ts, and marketmind-ai/app/api/market-chart/route.ts.
-- Only apply to a test database; not a verified export of the original Supabase DDL.
BEGIN;
CREATE TABLE IF NOT EXISTS public.market_candles (
  exchange text NOT NULL,
  market_type text NOT NULL,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  open_time timestamptz NOT NULL,
  close_time timestamptz NOT NULL,
  open numeric NOT NULL,
  high numeric NOT NULL,
  low numeric NOT NULL,
  close numeric NOT NULL,
  volume numeric NOT NULL,
  quote_volume numeric NOT NULL,
  trade_count bigint NOT NULL,
  taker_buy_base_volume numeric NOT NULL,
  taker_buy_quote_volume numeric NOT NULL,
  is_closed boolean NOT NULL,
  CONSTRAINT market_candles_dedup UNIQUE(exchange, market_type, symbol, timeframe, open_time),
  CONSTRAINT market_candles_prices_positive CHECK(open > 0 AND high > 0 AND low > 0 AND close > 0),
  CONSTRAINT market_candles_volume_nonnegative CHECK(volume >= 0 AND quote_volume >= 0 AND trade_count >= 0
    AND taker_buy_base_volume >= 0 AND taker_buy_quote_volume >= 0)
);
CREATE INDEX IF NOT EXISTS market_candles_chart_idx ON public.market_candles
  (exchange, market_type, symbol, timeframe, is_closed, open_time DESC);
COMMIT;
