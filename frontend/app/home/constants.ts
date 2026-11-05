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

export const DEFAULT_WEATHER: WeatherInfo = {
  success: false,
  location: "인천시 중구 운서동",
  temperature: "19.6",
  condition: "맑음",
  feelsLike: "18.0",
  humidity: "32",
  windSpeed: "3.3",
  pm10Grade: "좋음",
  pm25Grade: "좋음",
  hourly: [
    { time: "18시", condition: "맑음", temperature: "19", icon: "☀️" },
    { time: "21시", condition: "구름많음", temperature: "17", icon: "⛅" },
    { time: "00시", condition: "흐림", temperature: "15", icon: "☁️" },
    { time: "03시", condition: "맑음", temperature: "14", icon: "☀️" },
  ],
  baseTime: "14:00",
  icon: "☀️",
  source: "fallback",
  message: "실시간 날씨 정보를 불러오면 자동으로 갱신됩니다.",
};

export const DAILY_WORK_DATE_STORAGE_KEY = "cargo_ops_daily_work_date_v1";
