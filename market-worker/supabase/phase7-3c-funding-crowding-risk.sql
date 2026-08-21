begin;

alter table public.ai_decision_v2_snapshots
  add column if not exists funding_crowding_risk numeric(8,4) not null default 0,
  add column if not exists funding_crowding_side text not null default 'unavailable',
  add column if not exists funding_entry_penalty numeric(8,4) not null default 0,
  add column if not exists funding_crowding_status text not null default 'inactive';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_decision_v2_funding_crowding_side_check'
  ) then
    alter table public.ai_decision_v2_snapshots
      add constraint ai_decision_v2_funding_crowding_side_check
      check (funding_crowding_side in ('long_crowded','balanced','short_crowded','unavailable'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ai_decision_v2_funding_crowding_status_check'
  ) then
    alter table public.ai_decision_v2_snapshots
      add constraint ai_decision_v2_funding_crowding_status_check
      check (funding_crowding_status in ('active','inactive','distribution_saturated','insufficient_data','stale'));
  end if;
end $$;

comment on column public.ai_decision_v2_snapshots.funding_crowding_risk is
  'Phase 7-3C Funding crowding risk 0-100. 방향 점수와 분리된 진입 위험 지표';
comment on column public.ai_decision_v2_snapshots.funding_entry_penalty is
  'Phase 7-3C 현재 방향과 crowding이 충돌할 때 Entry Quality에 적용한 제한 감점(최대 12)';

commit;
