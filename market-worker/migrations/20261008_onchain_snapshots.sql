-- Apply in the project's Supabase SQL Editor. No existing tables are changed.
create table if not exists public.onchain_snapshots (
  id bigint generated always as identity primary key,
  asset text not null default 'BTC' check (asset = 'BTC'),
  snapshot_hour timestamptz not null,
  calculated_at timestamptz not null default now(),
  onchain_score numeric,
  onchain_confidence numeric not null,
  direction text not null check (direction in ('bullish','neutral','bearish')),
  metrics jsonb not null default '{}'::jsonb,
  signals jsonb not null default '[]'::jsonb,
  sources jsonb not null default '{}'::jsonb,
  raw_data jsonb not null default '{}'::jsonb,
  strategy_version text not null,
  unique (asset, snapshot_hour),
  check (onchain_score is null or onchain_score between 0 and 100),
  check (onchain_confidence between 0 and 100)
);
create index if not exists onchain_snapshots_latest_idx
  on public.onchain_snapshots(asset, snapshot_hour desc);
alter table public.onchain_snapshots enable row level security;
revoke all on public.onchain_snapshots from anon, authenticated;
grant select, insert, update on public.onchain_snapshots to service_role;
grant usage, select on sequence public.onchain_snapshots_id_seq to service_role;
notify pgrst, 'reload schema';
