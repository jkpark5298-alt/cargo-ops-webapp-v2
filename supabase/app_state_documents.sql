-- 알림 이력 / 푸시 구독 / 자동 푸시 상태 영구 저장용 테이블
-- Supabase SQL Editor에서 1회 실행하세요.
-- Render 서버를 재시작해도 알림 이력, 푸시 구독(알림 받는 기기), 자동 푸시 설정·중복 방지 기록이 사라지지 않게 합니다.
-- (이 테이블이 없으면 서버는 기존처럼 /tmp 임시 파일만 사용합니다. 그 경우 재시작할 때 기록이 사라집니다.)
--
-- doc_key 값: notification_history / push_subscriptions / auto_push_status

create table if not exists public.app_state_documents (
  doc_key text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
