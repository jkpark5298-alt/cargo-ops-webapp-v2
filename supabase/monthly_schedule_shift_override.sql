-- 편별 근무조 직접 지정 (Monthly Scheduled Flight)
-- '' = 시간 기준 자동, 'YYYY-MM-DD|A' / '|C' / '|S' = 그 업무일자의 그 조에만 표시
alter table public.monthly_schedule_flights
  add column if not exists shift_override text not null default '';
