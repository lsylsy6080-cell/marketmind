-- Run: psql -X -v ON_ERROR_STOP=1 -d marketmind -f scripts/postgres-compatibility-smoke.sql
-- Transaction rolls back every test write. No real market data is retained.
BEGIN;
CREATE TEMP TABLE buddy4_compat_smoke (
  symbol text NOT NULL,
  observed_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  score numeric,
  PRIMARY KEY (symbol, observed_at)
) ON COMMIT DROP;
INSERT INTO buddy4_compat_smoke(symbol, observed_at, payload, score)
VALUES ('BTCUSDT', '2026-10-15T00:00:00Z', '{"source":"test"}', 50);
INSERT INTO buddy4_compat_smoke(symbol, observed_at, payload, score)
VALUES ('BTCUSDT', '2026-10-15T00:00:00Z', '{"source":"upsert"}', 55)
ON CONFLICT (symbol, observed_at) DO UPDATE
  SET payload=excluded.payload, score=excluded.score;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM buddy4_compat_smoke
    WHERE symbol='BTCUSDT' AND observed_at >= '2026-10-14T00:00:00Z'
      AND payload->>'source'='upsert' AND score=55
  ) THEN
    RAISE EXCEPTION 'PostgreSQL compatibility smoke test failed';
  END IF;
END $$;
SELECT current_database() AS database_name, version() AS postgres_version,
       'TEMP TABLE/JSONB/UPSERT/TIMESTAMPTZ OK' AS smoke_result;
ROLLBACK;
