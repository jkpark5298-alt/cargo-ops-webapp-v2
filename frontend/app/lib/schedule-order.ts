/** Schedule Flight 목록의 사용자 지정(드래그) 순서 저장 — AFOCS SKD 화면과 홈 요약 카드가 함께 사용합니다. */
import type { MonitorRoom } from "./flight-types";

export function normalizeSummaryFlightKey(value: string) {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function getScheduleFlightOrderStorageKey(room: MonitorRoom | null) {
  return `cargo_ops_schedule_flight_order_${room?.id || "latest"}`;
}

export function loadScheduleFlightOrder(storageKey: string) {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((value) => normalizeSummaryFlightKey(String(value))).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export function saveScheduleFlightOrder(storageKey: string, order: string[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(order));
  } catch {
    // 순서 저장 실패는 화면 동작을 막지 않습니다.
  }
}

export function applyScheduleFlightOrder<T extends { flight: string }>(items: T[], manualOrder: string[]) {
  if (manualOrder.length === 0) return items;

  const orderMap = new Map(manualOrder.map((key, index) => [key, index]));

  return [...items].sort((a, b) => {
    const aKey = normalizeSummaryFlightKey(a.flight);
    const bKey = normalizeSummaryFlightKey(b.flight);
    const aIndex = orderMap.has(aKey) ? orderMap.get(aKey)! : Number.MAX_SAFE_INTEGER;
    const bIndex = orderMap.has(bKey) ? orderMap.get(bKey)! : Number.MAX_SAFE_INTEGER;

    if (aIndex !== bIndex) return aIndex - bIndex;
    return items.indexOf(a) - items.indexOf(b);
  });
}
