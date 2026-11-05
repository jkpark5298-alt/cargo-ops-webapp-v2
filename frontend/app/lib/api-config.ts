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

/**
 * 알림·자동 확인 같은 보호된 요청에 붙이는 헤더.
 * 백엔드에 API_ACCESS_TOKEN 을 설정했다면 같은 값을 NEXT_PUBLIC_API_TOKEN 으로 설정해야 한다.
 * (브라우저에 포함되는 값이므로 우연한 호출·남용을 막는 수준의 보호이며, 비밀 보관용이 아니다.)
 */
export function apiAuthHeaders(): Record<string, string> {
  const token = (process.env.NEXT_PUBLIC_API_TOKEN || "").trim();
  return token ? { "X-API-Token": token } : {};
}
