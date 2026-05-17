const DEFAULT_API_BASE_URL = "https://cargo-ops-backend.onrender.com";

export function getApiBaseUrl(): string {
  const rawBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    DEFAULT_API_BASE_URL;

  return rawBaseUrl.replace(/\/+$/, "");
}
