const DEFAULT_API_BASE_URL = "https://cargo-ops-backend.onrender.com";

export function getApiBaseUrl(): string {
  const rawBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    DEFAULT_API_BASE_URL;

  return rawBaseUrl.replace(/\/+$/, "");
}

/** 모든 화면이 공통으로 쓰는 백엔드 주소 (환경변수 3종 중 먼저 설정된 값) */
export const BACKEND_URL = getApiBaseUrl();
