-- Scheduled Flight 최신 저장방 영구 저장용 테이블
-- Supabase SQL Editor에서 1회 실행하세요.
-- Render / 서버 재배포 후에도 초기화면 Scheduled Flight를 유지하기 위한 저장소입니다.

create table if not exists public.latest_schedule_rooms (
  id text primary key default 'default',
  room jsonb not null,
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists latest_schedule_rooms_updated_at_idx
  on public.latest_schedule_rooms (updated_at desc);
