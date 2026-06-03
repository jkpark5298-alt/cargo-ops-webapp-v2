-- Daily 업무보고 텍스트 공유 저장용 테이블
-- Supabase SQL Editor에서 1회 실행하세요.
-- 이번 단계는 사진/이미지는 저장하지 않습니다.

create table if not exists public.daily_report_texts (
  id uuid primary key default gen_random_uuid(),
  work_date date not null unique,
  status text not null default 'normal',
  author text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_report_texts_work_date_idx
  on public.daily_report_texts (work_date);
