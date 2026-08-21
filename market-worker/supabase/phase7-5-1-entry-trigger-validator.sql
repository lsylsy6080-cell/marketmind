begin;

alter table public.ai_decision_v2_snapshots
  add column if not exists entry_trigger jsonb;

comment on column public.ai_decision_v2_snapshots.entry_trigger is
  'Phase 7-5.1 Entry Trigger Validator: 이전 계획 기준 WATCH/RE_EVALUATE/READY/INVALIDATED 상태와 진입 조건 체크 결과';

commit;
