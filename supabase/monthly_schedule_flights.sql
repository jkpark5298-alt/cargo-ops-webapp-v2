-- Monthly Scheduled Flight 저장용 테이블 (Supabase SQL Editor에서 1회 실행)
-- 월간 SKD(편명·등록기호·출도착·ETD/ETA)를 일자별로 보관하고, 오늘~모레 편은 인천 API 최신값을 함께 저장한다.
-- 보관: 현재 달 + 다음 달 1~2일. 달이 바뀌면 서버가 지난 기간을 자동 삭제한다.

create table if not exists public.monthly_schedule_flights (
  -- 일자|편명|출발|도착 (예: 2026-11-06|KJ970|HKG|ICN) — 같은 운항은 한 줄만 유지
  record_key text primary key,
  flight_date text not null,              -- SKD 기준 일자 (YYYY-MM-DD, 한국 시각)
  flight text not null,
  departure_code text not null default '',
  arrival_code text not null default '',
  skd_time text not null default '',      -- SKD ETD/ETA (YYYY-MM-DD HH:MM, 한국 시각)
  registration_no text not null default '',
  assignee_slot text not null default '', -- 담당 A/B/C 수동 지정 (비어 있으면 시간순 자동 배정)
  api_time text not null default '',      -- 인천 API 변경시각 (오늘~모레 편만)
  api_remark text not null default '',    -- 인천 API 상태(remark)
  api_gate text not null default '',      -- 인천 API 게이트(주기장)
  api_updated_at timestamptz,
  source text not null default 'manual',  -- excel / paste / manual
  updated_at timestamptz not null default now()
);

create index if not exists monthly_schedule_flights_flight_date_idx
  on public.monthly_schedule_flights (flight_date);

-- 일자·근무조별 담당 A/B/C 이름 (비어 있으면 화면에 'A', 'B', 'C'로 표시)
create table if not exists public.monthly_schedule_assignees (
  assignee_key text primary key,          -- 일자|근무조 (예: 2026-11-06|A)  근무조: A(06:31~14:00) C(14:01~23:59) S(22:01~익일 06:30)
  flight_date text not null,
  shift text not null,
  name_a text not null default '',
  name_b text not null default '',
  name_c text not null default '',
  slot_count integer not null default 2,   -- 담당 칸 수: 2(A·B, 기본) / 3(A·B·C)
  updated_at timestamptz not null default now()
);

-- 이미 테이블을 만든 경우 아래 한 줄만 실행하세요.
alter table public.monthly_schedule_assignees add column if not exists slot_count integer not null default 3;
