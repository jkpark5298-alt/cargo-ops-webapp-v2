-- Schedule Flight 초기화면 연동 슬롯 설정 (active | archive)
-- Supabase SQL Editor에서 1회 실행하세요.

create table if not exists public.schedule_flight_config (
  id text primary key default 'default',
  linked_slot text not null default 'active' check (linked_slot in ('active', 'archive')),
  updated_at timestamptz not null default now()
);

insert into public.schedule_flight_config (id, linked_slot)
values ('default', 'active')
on conflict (id) do nothing;
