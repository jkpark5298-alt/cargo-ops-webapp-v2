-- Schedule Flight 2슬롯 저장 (active + archive)
-- Supabase SQL Editor에서 1회 실행하세요.
-- active: 초기화면/AFOCS/푸시 연동  |  archive: 직전 보관

create table if not exists public.schedule_flight_slots (
  slot text primary key check (slot in ('active', 'archive')),
  name text not null default '',
  room jsonb not null,
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists schedule_flight_slots_updated_at_idx
  on public.schedule_flight_slots (updated_at desc);
