-- Run after 002_market_candles.sql; inserts then rolls back.
-- Uses the source collector's exact payload columns and ON CONFLICT key.
BEGIN;
INSERT INTO public.market_candles(exchange,market_type,symbol,timeframe,open_time,close_time,open,high,low,close,volume,quote_volume,trade_count,taker_buy_base_volume,taker_buy_quote_volume,is_closed)
VALUES ('buddy4-smoke','spot','BTCUSDT','1m','2000-01-01T00:00:00Z','2000-01-01T00:00:59Z',100,105,99,102,10,1020,3,5,510,true)
ON CONFLICT(exchange,market_type,symbol,timeframe,open_time)
DO UPDATE SET close=excluded.close;
INSERT INTO public.market_candles(exchange,market_type,symbol,timeframe,open_time,close_time,open,high,low,close,volume,quote_volume,trade_count,taker_buy_base_volume,taker_buy_quote_volume,is_closed)
VALUES ('buddy4-smoke','spot','BTCUSDT','1m','2000-01-01T00:00:00Z','2000-01-01T00:00:59Z',100,105,99,103,10,1030,3,5,515,true)
ON CONFLICT(exchange,market_type,symbol,timeframe,open_time)
DO UPDATE SET close=excluded.close;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.market_candles WHERE exchange='buddy4-smoke' AND symbol='BTCUSDT') != 1
  OR (SELECT close FROM public.market_candles WHERE exchange='buddy4-smoke' AND symbol='BTCUSDT') != 103
 THEN RAISE EXCEPTION 'market_candles UPSERT test failed'; END IF;
END $$;
SELECT open_time,close FROM public.market_candles WHERE exchange='buddy4-smoke' AND market_type='spot'
  AND symbol='BTCUSDT' AND timeframe='1m' AND is_closed=true ORDER BY open_time DESC LIMIT 1;
ROLLBACK;
