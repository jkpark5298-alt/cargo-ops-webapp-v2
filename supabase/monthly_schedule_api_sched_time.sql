-- API 예정 시각 저장용 열 추가 — Supabase SQL Editor에서 1회 실행
alter table public.monthly_schedule_flights
  add column if not exists api_sched_time text not null default '';
