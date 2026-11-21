import { BACKEND_URL, apiAuthHeaders } from "./api-config";

/** 해외 출발편(인천 도착편)의 출발 일시 — 초기화면 카드에서 입력하는 표시용 값 */
export type DepartureItem = { departure: string; updatedAt: string };
export type DepartureMap = Record<string, DepartureItem>;

export function normalizeDepartureFlight(flight: string) {
  return String(flight || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** 저장 키: '예정 도착일(YYYY-MM-DD)|편명' */
export function departureKey(scheduleDate: string, flight: string) {
  return `${scheduleDate}|${normalizeDepartureFlight(flight)}`;
}

/** 인천 도착편(출발지가 인천이 아닌 편)인지 */
export function isInboundToIcn(departureCode?: string, arrivalCode?: string) {
  const dep = String(departureCode || "").toUpperCase();
  const arr = String(arrivalCode || "").toUpperCase();
  return arr === "ICN" && dep !== "ICN";
}

/** 'YYYY-MM-DD' → 'MM.DD' */
export function toMonthDay(date: string) {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(date || "");
  return m ? `${m[1]}.${m[2]}` : "";
}

/** 저장값 'YYYY-MM-DD HH:MM' → 입력칸 표시값 */
export function splitDeparture(value: string): { date: string; time: string } {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/.exec(value || "");
  return m ? { date: toMonthDay(m[1]), time: m[2] } : { date: "", time: "" };
}

function utcDay(y: number, mo: number, d: number) {
  return Date.UTC(y, mo - 1, d) / 86400000;
}

export type DepartureParse =
  | { kind: "empty" }
  | { kind: "incomplete" }
  | { kind: "invalid"; message: string }
  | { kind: "ok"; value: string };

/**
 * 입력칸(월일 MM.DD · 시각 HH:mm)을 저장값 'YYYY-MM-DD HH:MM' 으로 바꾼다.
 * - 월일·시각이 모두 비어 있으면 empty(저장된 값 삭제), 한쪽만 있으면 incomplete(저장하지 않음)
 * - 연도는 예정 도착일 기준: 도착일보다 2일 넘게 뒤 날짜가 되면 전년도로 본다(연말·연초)
 */
export function parseDepartureInput(dateText: string, timeText: string, scheduleDate: string): DepartureParse {
  const dateRaw = String(dateText || "").trim();
  const timeRaw = String(timeText || "").trim();
  if (!dateRaw && !timeRaw) return { kind: "empty" };
  if (!dateRaw || !timeRaw) return { kind: "incomplete" };

  const dm = /^(\d{1,2})[.\-/\s]?(\d{1,2})$/.exec(dateRaw);
  const tm = /^(\d{1,2}):?(\d{2})$/.exec(timeRaw);
  if (!dm) return { kind: "invalid", message: "출발 월일은 MM.DD 형식으로 입력하세요." };
  if (!tm) return { kind: "invalid", message: "출발 시각은 HH:mm 형식으로 입력하세요." };

  const month = Number(dm[1]);
  const day = Number(dm[2]);
  const hour = Number(tm[1]);
  const minute = Number(tm[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return { kind: "invalid", message: "출발 월일을 확인하세요." };
  if (hour > 23 || minute > 59) return { kind: "invalid", message: "출발 시각을 확인하세요." };

  const base = /^(\d{4})-(\d{2})-(\d{2})/.exec(scheduleDate || "");
  const baseYear = base ? Number(base[1]) : new Date().getFullYear();
  let year = baseYear;
  if (base) {
    const arrival = utcDay(Number(base[1]), Number(base[2]), Number(base[3]));
    if (utcDay(year, month, day) - arrival > 2) year -= 1;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return { kind: "invalid", message: "없는 날짜입니다. 출발 월일을 확인하세요." };
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  return { kind: "ok", value: `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}` };
}

/**
 * 출발(입력값)부터 도착(변경 시각)까지 소요 시간(분). 계산할 수 없으면 null.
 * 도착 일시의 연도는 예정 일자에 가장 가까운 해로 정한다(연말·연초).
 */
export function flightDurationMinutes(
  departure: string,
  changeDate: string,
  changeTime: string,
  scheduleDate: string,
): number | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(departure || "");
  const am = /^(\d{2})\.(\d{2})$/.exec(String(changeDate || "").trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(String(changeTime || "").trim());
  const sm = /^(\d{4})-(\d{2})-(\d{2})/.exec(scheduleDate || "");
  if (!dm || !am || !tm) return null;

  const minutes = (y: number, mo: number, d: number, h: number, mi: number) => Date.UTC(y, mo - 1, d, h, mi) / 60000;
  const dep = minutes(Number(dm[1]), Number(dm[2]), Number(dm[3]), Number(dm[4]), Number(dm[5]));
  const baseYear = sm ? Number(sm[1]) : Number(dm[1]);
  const anchor = sm ? minutes(Number(sm[1]), Number(sm[2]), Number(sm[3]), 12, 0) : dep;
  let best: number | null = null;
  for (const year of [baseYear - 1, baseYear, baseYear + 1]) {
    const candidate = minutes(year, Number(am[1]), Number(am[2]), Number(tm[1]), Number(tm[2]));
    if (best === null || Math.abs(candidate - anchor) < Math.abs(best - anchor)) best = candidate;
  }
  return best === null ? null : best - dep;
}

/** 305 → '5시간 5분', 45 → '45분', 120 → '2시간' */
export function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

export async function fetchDepartureTimes(): Promise<DepartureMap> {
  const res = await fetch(`${BACKEND_URL}/flights/departure-times`, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.detail || json?.message || "출발 일시를 불러오지 못했습니다.");
  return (json.items || {}) as DepartureMap;
}

/** departure 가 빈 문자열이면 서버의 값을 지운다 */
export async function saveDepartureTime(scheduleDate: string, flight: string, departure: string): Promise<DepartureMap> {
  const res = await fetch(`${BACKEND_URL}/flights/departure-times`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...apiAuthHeaders() },
    body: JSON.stringify({ date: scheduleDate, flight: normalizeDepartureFlight(flight), departure }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.detail || json?.message || "출발 일시 저장에 실패했습니다.");
  return (json.items || {}) as DepartureMap;
}
