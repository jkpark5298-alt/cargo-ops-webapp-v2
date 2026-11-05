-- 항공기 등록기호 기록 영구 저장용 테이블
-- Supabase SQL Editor에서 1회 실행하세요.
-- Render 서버를 재배포·재시작해도 엑셀 업로드/매뉴얼 저장한 등록기호가 사라지지 않게 하기 위한 저장소입니다.
-- (이 테이블이 없으면 서버는 기존처럼 /tmp 임시 파일만 사용합니다. 그 경우 재시작할 때 기록이 사라집니다.)

create table if not exists public.aircraft_registration_records (
  -- 일자|편명|출발|도착 (예: 2026-11-06|KJ977|ICN|TSN) — 같은 운항은 한 줄만 유지
  record_key text primary key,
  flight_date text not null,
  flight text not null,
  departure_code text not null default '',
  arrival_code text not null default '',
  registration_no text not null,
  -- 마지막으로 저장한 시각: "나중에 저장한 값이 이긴다" 규칙의 기준
  updated_at timestamptz not null default now(),
  saved_at timestamptz not null default now()
);

create index if not exists aircraft_registration_records_flight_date_idx
  on public.aircraft_registration_records (flight_date);

create index if not exists aircraft_registration_records_flight_idx
  on public.aircraft_registration_records (flight);

create index if not exists aircraft_registration_records_updated_at_idx
  on public.aircraft_registration_records (updated_at desc);
