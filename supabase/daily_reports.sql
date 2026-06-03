-- Daily 업무보고 Supabase 공유 저장용 테이블
-- Supabase SQL Editor에서 1회 실행하세요.

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  work_date date not null unique,
  status text not null default 'normal',
  author text not null default '',
  note text not null default '',
  images jsonb not null default '[]'::jsonb,
  issue_flight text not null default '',
  issue_route text not null default '',
  issue_hlnbr text not null default '',
  issue_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_reports_work_date_idx
  on public.daily_reports (work_date);

-- service_role 키를 backend에서 쓰는 구조라 RLS 정책 없이도 서버 저장/조회가 가능합니다.
-- anon/public 클라이언트에서 직접 접근하게 만들지 않는 것을 권장합니다.
