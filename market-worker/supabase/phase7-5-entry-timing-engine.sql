begin;

alter table public.ai_decision_v2_snapshots
  add column if not exists entry_plan jsonb;

comment on column public.ai_decision_v2_snapshots.entry_plan is
  'Phase 7-5 Entry Timing Engine: 현재가, 1/2차 관심가, 무효화 가격, 예상 진입점수와 계산 근거';

commit;
