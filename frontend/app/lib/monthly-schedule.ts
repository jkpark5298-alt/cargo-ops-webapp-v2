"use client";

import { BACKEND_URL, apiAuthHeaders } from "./api-config";

/** Monthly Scheduled Flight 한 편 (서버 monthly_schedule_flights) */
export type MonthlyFlight = {
  recordKey: string;
  flightDate: string;
  flight: string;
  departureCode: string;
  arrivalCode: string;
  /** 월간 SKD ETD/ETA (YYYY-MM-DD HH:MM, 한국 시각) */
  skdTime: string;
  registrationNo: string;
  /** 편별 담당 지정(A/B/C). 비어 있으면 근무조 안에서 시간순 자동 배정 */
  assigneeSlot: string;
  /** 인천 API 변경시각(오늘~3일 뒤 편만) */
  apiTime: string;
  apiRemark: string;
  apiGate: string;
  apiUpdatedAt: string;
  source: string;
};

export type MonthlyAssignee = {
  flightDate: string;
  shift: ShiftCode;
  nameA: string;
  nameB: string;
  nameC: string;
  /** 그 근무조의 담당 인원 수: 1(A) / 2(A,B) / 3(A,B,C). 없으면 3 */
  slotCount?: number;
};

export type MonthlyScheduleData = {
  title: string;
  window: { start: string; end: string; monthLast: string };
  flights: MonthlyFlight[];
  assignees: MonthlyAssignee[];
  apiRefreshedAt: string;
};

export type ShiftCode = "A" | "C" | "S";
export type SlotCode = "A" | "B" | "C";
/** 1: 실시간(API 반영, 오늘·내일·모레) / 2: 월간 SKD(추정, API 미반영) */
export type ViewType = 1 | 2;

export const SHIFTS: { code: ShiftCode; label: string; range: string }[] = [
  { code: "A", label: "A조", range: "06:31~14:00" },
  { code: "C", label: "C조", range: "14:01~23:59" },
  { code: "S", label: "S조", range: "익일 00:00~06:30" },
];
export const SLOTS: SlotCode[] = ["A", "B", "C"];

/** 새 입력 한 줄 (저장 요청 단위) */
export type MonthlyInputRecord = {
  flight: string;
  skdTime: string;
  departureCode: string;
  arrivalCode: string;
  registrationNo: string;
};

// ── 날짜·시간 ──────────────────────────────────────────────────────────
/** 한국 시각 기준 오늘(YYYY-MM-DD) */
export function todayKst(nowMs: number = Date.now()): string {
  return new Date(nowMs + 9 * 3600_000).toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 70; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 유형 1에서 고를 수 있는 일자: 오늘·내일·모레 */
export function type1Dates(today: string = todayKst()): string[] {
  return [today, addDays(today, 1), addDays(today, 2)];
}

/** 화면에 쓸 ETD/ETA: 유형 1은 API 변경시각 우선, 유형 2는 월간 SKD 시각 */
export function displayTime(flight: MonthlyFlight, viewType: ViewType): string {
  return viewType === 1 ? flight.apiTime || flight.skdTime : flight.skdTime;
}

/**
 * 근무조에 속하는지. 선택 일자 D 기준
 * 업무일자 D 기준 A조 D 06:31~14:00 / C조 D 14:01~23:59 / S조 D+1 00:00~06:30 (근무조끼리 겹치지 않음)
 */
export function isInShift(time: string, date: string, shift: ShiftCode): boolean {
  if (!time || time.length < 16) return false;
  const day = time.slice(0, 10);
  const hm = time.slice(11, 16);
  if (shift === "A") return day === date && hm >= "06:31" && hm <= "14:00";
  if (shift === "C") return day === date && hm >= "14:01" && hm <= "23:59";
  return day === addDays(date, 1) && hm <= "06:30";
}

export function flightsForShift(flights: MonthlyFlight[], date: string, shift: ShiftCode, viewType: ViewType) {
  return flights
    .filter((f) => isInShift(displayTime(f, viewType), date, shift))
    .sort((a, b) => displayTime(a, viewType).localeCompare(displayTime(b, viewType)) || a.flight.localeCompare(b.flight));
}

/** 담당 인원 수(1/2/3)에 따른 사용 칸: 1명=A, 2명=A·B, 3명=A·B·C */
export function activeSlots(count?: number): SlotCode[] {
  const n = count === 1 || count === 2 ? count : 3;
  return SLOTS.slice(0, n);
}

/**
 * 근무조 안 시간순으로 사용 칸(A→B→C 중 인원 수만큼)을 돌아가며 자동 배정한다.
 * 편별로 지정한 값이 사용 칸에 있으면 그 값을 쓴다.
 */
export function assignSlots(list: MonthlyFlight[], count: number = 3): Record<string, SlotCode> {
  const active = activeSlots(count);
  const result: Record<string, SlotCode> = {};
  let cursor = 0;
  list.forEach((f) => {
    const fixed = String(f.assigneeSlot || "").toUpperCase() as SlotCode;
    if (active.includes(fixed)) {
      result[f.recordKey] = fixed;
    } else {
      result[f.recordKey] = active[cursor % active.length];
      cursor += 1;
    }
  });
  return result;
}

/** 도착지가 비어 있고 출발지가 인천이 아니면 도착은 ICN (KJ 편은 인천 출발 또는 도착) */
export function arrivalOf(f: Pick<MonthlyFlight, "departureCode" | "arrivalCode">): string {
  const dep = String(f.departureCode || "").toUpperCase();
  const arr = String(f.arrivalCode || "").toUpperCase();
  return arr || (dep && dep !== "ICN" ? "ICN" : "");
}

export function departureOf(f: Pick<MonthlyFlight, "departureCode" | "arrivalCode">): string {
  const dep = String(f.departureCode || "").toUpperCase();
  const arr = String(f.arrivalCode || "").toUpperCase();
  return dep || (arr && arr !== "ICN" ? "ICN" : "");
}

/** 담당 이름. 이름을 입력하지 않았으면 'A'/'B'/'C' 글자 그대로 */
export function assigneeName(slot: SlotCode, names?: Pick<MonthlyAssignee, "nameA" | "nameB" | "nameC"> | null): string {
  const name = slot === "A" ? names?.nameA : slot === "B" ? names?.nameB : names?.nameC;
  return String(name || "").trim() || slot;
}

export function isIcnDeparture(f: Pick<MonthlyFlight, "departureCode" | "arrivalCode">) {
  return departureOf(f) === "ICN";
}

/** '2026-11-06 23:15' → '11-06 23:15' */
export function shortDateTime(value: string) {
  return value && value.length >= 16 ? `${value.slice(5, 10)} ${value.slice(11, 16)}` : value || "";
}

// ── 입력 파싱 (엑셀 붙여넣기·파일) ──────────────────────────────────────
function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** 엑셀 셀 값 → 'YYYY-MM-DD HH:MM'. 엑셀 날짜 일련번호(숫자)와 여러 문자열 형식을 받는다. */
export function parseSkdDateTime(value: unknown, dateHint?: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())} ${pad2(value.getHours())}:${pad2(value.getMinutes())}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // 시각만 있는 칸(하루의 비율, 예: 0.5 = 12:00) + 별도 일자 칸
    if (value >= 0 && value < 1 && dateHint !== undefined) {
      const datePart = parseDateOnly(dateHint);
      const minutes = Math.round(value * 1440) % 1440;
      return datePart ? `${datePart} ${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}` : "";
    }
    if (value >= 1 && value < 100000) {
      const dt = new Date(Math.round((value - 25569) * 86400) * 1000); // 엑셀 일련번호 → 같은 벽시계(UTC 필드로 읽음)
      return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())} ${pad2(dt.getUTCHours())}:${pad2(dt.getUTCMinutes())}`;
    }
    return "";
  }
  const text = String(value ?? "").trim().replace(/T/, " ").replace(/\./g, "-").replace(/\//g, "-");
  let m = text.match(/^(\d{4})-?(\d{1,2})-?(\d{1,2})\s*(\d{1,2}):?(\d{2})/);
  if (m) {
    const [, y, mo, d, h, mi] = m;
    return `${y}-${pad2(+mo)}-${pad2(+d)} ${pad2(+h)}:${mi}`;
  }
  // 시각만 있고 일자는 별도 칸(dateHint)인 경우
  m = text.match(/^(\d{1,2}):(\d{2})$/);
  if (m && dateHint !== undefined) {
    const datePart = parseDateOnly(dateHint);
    return datePart ? `${datePart} ${pad2(+m[1])}:${m[2]}` : "";
  }
  return "";
}

/** 일자 칸 값 → 'YYYY-MM-DD' (엑셀 일련번호·문자열) */
function parseDateOnly(value: unknown): string {
  if (typeof value === "number" && value >= 1) return parseSkdDateTime(Math.floor(value)).slice(0, 10);
  if (value instanceof Date) return parseSkdDateTime(value).slice(0, 10);
  const m = String(value ?? "").trim().match(/^(\d{4})[-./]?(\d{1,2})[-./]?(\d{1,2})/);
  return m ? `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}` : "";
}

const HEADER_ALIASES: Record<keyof MonthlyInputRecord | "date", string[]> = {
  flight: ["편명", "flight", "flightno", "flightid"],
  registrationNo: ["등록기호", "등록번호", "hl", "hlnbr", "registration", "registrationno"],
  departureCode: ["dep", "출발", "출발지", "출발지코드", "departure"],
  arrivalCode: ["arr", "도착", "도착지", "도착지코드", "arrival"],
  skdTime: ["etd/eta", "etdeta", "etd", "eta", "skd", "afocsskd", "시간", "시각"],
  date: ["일자", "날짜", "운항일자", "date"],
};

const normHeader = (v: unknown) => String(v ?? "").replace(/\s+/g, "").toLowerCase();

function findHeaderIndex(matrix: unknown[][]): number {
  for (let i = 0; i < Math.min(matrix.length, 30); i++) {
    const cells = (matrix[i] || []).map(normHeader);
    if (cells.some((c) => HEADER_ALIASES.flight.includes(c))) return i;
  }
  return -1;
}

export type ParseResult = { records: MonthlyInputRecord[]; skipped: { line: number; reason: string }[] };

/**
 * 표(행렬)를 월간 SKD 입력으로 변환한다.
 * 머리글(편명/등록기호/DEP/ARR/ETD·ETA)이 있으면 그 위치로, 없으면 이 순서로 읽는다: 편명, 등록기호, DEP, ARR, ETD/ETA
 */
export function parseSkdMatrix(matrix: unknown[][]): ParseResult {
  const records: MonthlyInputRecord[] = [];
  const skipped: ParseResult["skipped"] = [];
  const headerIdx = findHeaderIndex(matrix);
  const col: Record<string, number> = { flight: 0, registrationNo: 1, departureCode: 2, arrivalCode: 3, skdTime: 4, date: -1 };
  if (headerIdx >= 0) {
    Object.keys(col).forEach((k) => (col[k] = -1));
    (matrix[headerIdx] || []).forEach((cell, i) => {
      const h = normHeader(cell);
      (Object.keys(HEADER_ALIASES) as (keyof typeof HEADER_ALIASES)[]).forEach((key) => {
        if (col[key] < 0 && HEADER_ALIASES[key].includes(h)) col[key] = i;
      });
    });
  }
  const start = headerIdx >= 0 ? headerIdx + 1 : 0;
  for (let r = start; r < matrix.length; r++) {
    const row = matrix[r] || [];
    if (row.every((c) => String(c ?? "").trim() === "")) continue;
    const get = (k: string) => (col[k] >= 0 ? row[col[k]] : undefined);
    const flightRaw = String(get("flight") ?? "").replace(/[\s-]+/g, "").toUpperCase();
    const fm = flightRaw.match(/^([A-Z]{2})0*(\d{1,4})$/);
    const flight = fm ? `${fm[1]}${fm[2]}` : flightRaw;
    const line = r + 1;
    if (!/^KJ\d{2,4}$/.test(flight)) {
      skipped.push({ line, reason: flight ? `KJ 편이 아님(${flight})` : "편명 없음" });
      continue;
    }
    const skdTime = parseSkdDateTime(get("skdTime"), col.date >= 0 ? get("date") : undefined);
    if (!skdTime) {
      skipped.push({ line, reason: `${flight} ETD/ETA 형식을 읽지 못함` });
      continue;
    }
    const hlRaw = String(get("registrationNo") ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const registrationNo = /^\d{4,5}$/.test(hlRaw) ? `HL${hlRaw}` : /^HL\d{4,5}$/.test(hlRaw) ? hlRaw : "";
    let departureCode = String(get("departureCode") ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    let arrivalCode = String(get("arrivalCode") ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    // 한쪽만 있으면 다른 쪽은 인천(ICN)으로 채운다
    if (departureCode && departureCode !== "ICN" && !arrivalCode) arrivalCode = "ICN";
    else if (arrivalCode && arrivalCode !== "ICN" && !departureCode) departureCode = "ICN";
    records.push({ flight, skdTime, departureCode, arrivalCode, registrationNo });
  }
  return { records, skipped };
}

/** 엑셀에서 복사한 텍스트(탭 구분) → 표 */
export function textToMatrix(text: string): string[][] {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => (line.includes("\t") ? line.split("\t") : line.split(/\s{2,}|,/)).map((c) => c.trim()));
}

// ── 서버 API ────────────────────────────────────────────────────────────
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, { cache: "no-store", ...init });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(json.detail || json.message || `요청 실패 (${res.status})`);
  }
  return json as T;
}

const writeInit = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json", ...apiAuthHeaders() },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export function fetchMonthlySchedule(refresh = false) {
  return request<MonthlyScheduleData & { success: boolean }>(`/flights/monthly-schedule${refresh ? "?refresh=true" : ""}`);
}

export function saveMonthlyRecords(records: MonthlyInputRecord[], options: { replaceDates?: boolean; source?: string } = {}) {
  return request<{ saved: number; removed: number; invalid: number; outsideWindow: number; registrationSaved: number; dates: string[] }>(
    "/flights/monthly-schedule",
    writeInit("POST", { records, replaceDates: options.replaceDates ?? true, source: options.source || "manual" }),
  );
}

export function deleteMonthlyFlight(recordKey: string) {
  return request(`/flights/monthly-schedule/${encodeURIComponent(recordKey)}`, writeInit("DELETE"));
}

export function setMonthlyAssigneeSlot(recordKey: string, slot: string) {
  return request<{ flight: MonthlyFlight }>("/flights/monthly-schedule/assignee-slot", writeInit("POST", { recordKey, slot }));
}

export function saveMonthlyAssignees(value: MonthlyAssignee) {
  return request<{ assignee: MonthlyAssignee }>("/flights/monthly-schedule/assignees", writeInit("POST", value));
}
