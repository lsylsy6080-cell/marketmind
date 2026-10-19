-- Buddy4 PostgreSQL migration: faithful portable subset of existing 20261008_onchain_snapshots.sql.
-- Removes Supabase-specific service_role grants, RLS policies and PostgREST notification.
-- Applies only to a NEW, isolated marketmind database. Do not run against a populated DB blindly.
BEGIN;
CREATE TABLE IF NOT EXISTS public.onchain_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset text NOT NULL DEFAULT 'BTC' CHECK (asset = 'BTC'),
  snapshot_hour timestamptz NOT NULL,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  onchain_score numeric,
  onchain_confidence numeric NOT NULL,
  direction text NOT NULL CHECK (direction IN ('bullish','neutral','bearish')),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  strategy_version text NOT NULL,
  UNIQUE (asset, snapshot_hour),
  CHECK (onchain_score IS NULL OR onchain_score BETWEEN 0 AND 100),
  CHECK (onchain_confidence BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS onchain_snapshots_latest_idx
  ON public.onchain_snapshots(asset, snapshot_hour DESC);
COMMIT;
