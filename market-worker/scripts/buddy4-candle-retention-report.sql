-- READ ONLY: show count of candles older than 30/90/180 days.
-- Does not remove records. Retention must be approved before enabling deletion.
SELECT timeframe,
       count(*) AS total_rows,
       count(*) FILTER (WHERE open_time < now()-interval '30 days') AS older_30d,
       count(*) FILTER (WHERE open_time < now()-interval '90 days') AS older_90d,
       count(*) FILTER (WHERE open_time < now()-interval '180 days') AS older_180d,
       pg_size_pretty(pg_total_relation_size('public.market_candles')) AS total_table_size
FROM public.market_candles GROUP BY timeframe ORDER BY timeframe;
