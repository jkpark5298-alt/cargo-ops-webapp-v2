import { ImageSlotKey, WeatherInfo } from "./types";

export const IMAGE_SLOTS: Array<{
  key: ImageSlotKey;
  title: string;
  description: string;
}> = [
  {
    key: "daily-schedule",
    title: "1. 업무일정 이미지",
    description: "당일 업무일정, Cargo Plan, 작업 순서 이미지를 저장합니다.",
  },
  {
    key: "aircraft-check",
    title: "2. 화물기 CHECK 사항 이미지",
    description: "화물기 CHECK 대상과 확인 사항 이미지를 저장합니다.",
  },
  {
    key: "inspection-result",
    title: "3. 점검 대상 결과 이미지",
    description: "점검 대상 결과, 확인 완료 화면, 결과 이미지를 저장합니다.",
  },
];

export const ISSUE_IMAGE_SLOT: {
  key: ImageSlotKey;
  title: string;
  description: string;
} = {
  key: "issue",
  title: "4. 특이사항 이미지",
  description: "특이사항 발생 시 증빙용 현장 이미지 또는 캡처를 저장합니다.",
};

export const IMAGE_SLOT_PROPERTY_NAME: Record<ImageSlotKey, string> = {
  "daily-schedule": "업무일정 이미지",
  "aircraft-check": "화물기 CHECK 이미지",
  "inspection-result": "점검 대상 결과 이미지",
  issue: "이미지",
};

export const APP_VERSION = "v1.0.2";

export const APP_VERSION_DATE = "2026.05.19";

/** 불러오기 전 상태. 예시 숫자는 넣지 않습니다(가짜 값이 실제 날씨처럼 보이지 않도록). */
export const DEFAULT_WEATHER: WeatherInfo = {
  success: false,
  source: "loading",
  message: "날씨 정보를 불러오는 중입니다.",
};

export const DAILY_WORK_DATE_STORAGE_KEY = "cargo_ops_daily_work_date_v1";
