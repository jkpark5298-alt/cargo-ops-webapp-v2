-- 담당 인원 수(1/2/3명) 저장용 열 추가 — Supabase SQL Editor에서 1회 실행
alter table public.monthly_schedule_assignees
  add column if not exists slot_count integer not null default 3;
