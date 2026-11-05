/**
 * 항공기 등록번호(HL) 기록과 우선순위 규칙 — 홈 / 편명조회 / AFOCS SKD가 모두 이 모듈을 사용합니다.
 *
 * 등록번호 결정 순서 (applyRegistrationToRows)
 *   1. 등록 기록(DB) 중 "일자(+노선)"가 맞는 가장 최근 저장분  — 엑셀 업로드와 매뉴얼 저장은 모두 기록으로 남으므로
 *      "나중에 저장한 값이 이긴다" (엑셀 → 매뉴얼 수정이면 매뉴얼, 매뉴얼 → 엑셀이면 엑셀)
 *   2. 이전 스케줄 행 중 일시·노선까지 같은 행의 값
 *   3. 행에 이미 들어 있는 값
 *   4. 이전 스케줄 행의 같은 편명 값
 *   5. 등록 기록의 편명 단독 값 (모든 날짜에서 HL이 하나뿐일 때만)
 */
import { BACKEND_URL } from "./api-config";
import {
  getFlightNo,
  getRegistrationNo,
  normalizeFlightKey,
  normalizeHlNumber,
} from "./flight-keys";
import type { AircraftRegistrationRecord, FlightRow } from "./flight-types";

export const AIRCRAFT_REGISTRATION_STORAGE_KEY = "cargo_ops_aircraft_registration_records_v1";

export function normalizeAircraftRegistrationDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const kstDate = new Date(value.getTime() + 9 * 60 * 60 * 1000);
    const yyyy = kstDate.getUTCFullYear();
    const mm = String(kstDate.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(kstDate.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const raw = String(value || "").trim();
  if (!raw) return "";

  const match = raw.match(/^(\d{4})[-/.\s]+(\d{1,2})[-/.\s]+(\d{1,2})/);
  if (match) {
    const yyyy = match[1];
    const mm = match[2].padStart(2, "0");
    const dd = match[3].padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;

  return raw;
}

export function getAircraftRegistrationDateFromRow(row: FlightRow) {
  return normalizeAircraftRegistrationDate(
    row.scheduleDateTime ||
      row.formattedScheduleTime ||
      row.estimatedDateTime ||
      row.formattedEstimatedTime ||
      "",
  );
}

/** 행이 속할 수 있는 날짜들(변경일·예정일). 지연 편은 변경일이 다음 날일 수 있습니다. */
export function getFlightRowCandidateDates(row: FlightRow) {
  const dates: string[] = [];
  [
    row.estimatedDateTime,
    row.formattedEstimatedTime,
    row.scheduleDateTime,
    row.formattedScheduleTime,
  ].forEach((value) => {
    const date = normalizeAircraftRegistrationDate(value || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && !dates.includes(date)) dates.push(date);
  });

  const primaryDate = getAircraftRegistrationDateFromRow(row);
  if (/^\d{4}-\d{2}-\d{2}$/.test(primaryDate) && !dates.includes(primaryDate)) {
    dates.push(primaryDate);
  }

  return dates;
}

export function buildAircraftRegistrationKey(
  date: string,
  flight: string,
  departureCode = "",
  arrivalCode = "",
) {
  return [
    normalizeAircraftRegistrationDate(date),
    normalizeFlightKey(flight),
    String(departureCode || "").replace(/\s+/g, "").toUpperCase(),
    String(arrivalCode || "").replace(/\s+/g, "").toUpperCase(),
  ].join("|");
}

export function buildAircraftRegistrationFlightDateKey(date: string, flight: string) {
  return [normalizeAircraftRegistrationDate(date), normalizeFlightKey(flight)].join("|");
}

/* ───────── 기록 저장소 (로컬 + 서버) ───────── */

export function loadAircraftRegistrationRecords(): AircraftRegistrationRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(AIRCRAFT_REGISTRATION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAircraftRegistrationRecords(records: AircraftRegistrationRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AIRCRAFT_REGISTRATION_STORAGE_KEY, JSON.stringify(records));
}

export async function fetchAircraftRegistrationRecordsFromServer(): Promise<AircraftRegistrationRecord[]> {
  const res = await fetch(`${BACKEND_URL}/flights/aircraft-registrations`, {
    cache: "no-store",
  });
  const json = await res.json();

  if (!res.ok || json.success === false) {
    throw new Error(json.detail || json.message || "등록기호 서버 조회 실패");
  }

  const records = Array.isArray(json.records) ? (json.records as AircraftRegistrationRecord[]) : [];
  saveAircraftRegistrationRecords(records);
  return records;
}

export async function saveAircraftRegistrationRecordsToServer(
  records: AircraftRegistrationRecord[],
  mode: "merge" | "replace" = "merge",
) {
  const res = await fetch(`${BACKEND_URL}/flights/aircraft-registrations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ records, mode }),
  });
  const json = await res.json();

  if (!res.ok || json.success === false) {
    throw new Error(json.detail || json.message || "등록기호 서버 저장 실패");
  }

  const nextRecords = Array.isArray(json.records) ? (json.records as AircraftRegistrationRecord[]) : records;
  saveAircraftRegistrationRecords(nextRecords);
  return nextRecords;
}

export function mergeAircraftRegistrationRecords(
  baseRecords: AircraftRegistrationRecord[],
  incomingRecords: AircraftRegistrationRecord[],
) {
  const map = new Map<string, AircraftRegistrationRecord>();

  baseRecords.forEach((record) => {
    map.set(buildAircraftRegistrationKey(record.date, record.flight, record.departureCode, record.arrivalCode), record);
  });

  incomingRecords.forEach((record) => {
    const key = buildAircraftRegistrationKey(record.date, record.flight, record.departureCode, record.arrivalCode);
    const existing = map.get(key);

    if (!existing || (record.updatedAt || "") >= (existing.updatedAt || "")) {
      map.set(key, record);
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    const dateDiff = a.date.localeCompare(b.date);
    if (dateDiff !== 0) return dateDiff;
    return a.flight.localeCompare(b.flight, "en");
  });
}

/* ───────── 우선순위 규칙 ───────── */

type StampedRegistration = { registrationNo: string; updatedAt: string };

/** 기록을 "일자(+노선) 키 → 가장 최근 값"과 "편명 단독 값(HL이 하나뿐일 때)"으로 색인합니다. */
export function buildAircraftRegistrationIndex(records: AircraftRegistrationRecord[]) {
  const dated = new Map<string, StampedRegistration>();
  const hlByFlight = new Map<string, Set<string>>();

  const setIfNewer = (key: string, registrationNo: string, updatedAt: string) => {
    if (!key) return;
    const existing = dated.get(key);
    if (!existing || updatedAt >= existing.updatedAt) {
      dated.set(key, { registrationNo, updatedAt });
    }
  };

  records.forEach((record) => {
    if (!record.flight || !record.registrationNo) return;
    const registrationNo = normalizeHlNumber(record.registrationNo);
    if (!/^HL\d{3,5}$/i.test(registrationNo)) return;

    const updatedAt = record.updatedAt || "";
    const flightKey = normalizeFlightKey(record.flight);

    if (record.date) {
      setIfNewer(
        buildAircraftRegistrationKey(record.date, record.flight, record.departureCode, record.arrivalCode),
        registrationNo,
        updatedAt,
      );
      setIfNewer(buildAircraftRegistrationFlightDateKey(record.date, record.flight), registrationNo, updatedAt);
    }

    if (flightKey) {
      if (!hlByFlight.has(flightKey)) hlByFlight.set(flightKey, new Set());
      hlByFlight.get(flightKey)?.add(registrationNo);
    }
  });

  // 같은 편명이 날짜마다 다른 HL이면 편명만으로 덮지 않습니다. (KJ283 09.04 HL7620 vs 다른 날 HL7423)
  const flightOnly = new Map<string, string>();
  hlByFlight.forEach((hls, flightKey) => {
    if (hls.size === 1) flightOnly.set(flightKey, [...hls][0]);
  });

  return { dated, flightOnly };
}

/** 이전 스케줄 행과 일시·노선까지 같은 행을 찾는 키 */
export function getScheduleRegistrationKey(row?: FlightRow | null) {
  if (!row) return "";
  return [
    normalizeFlightKey(getFlightNo(row)),
    row.scheduleDateTime || row.formattedScheduleTime || "",
    row.departureCode || "",
    row.arrivalCode || "",
  ].join("|");
}

/** 행 하나의 등록번호를 위 우선순위로 결정하는 함수를 만듭니다. (색인은 한 번만 만듭니다) */
export function createRegistrationResolver(
  records: AircraftRegistrationRecord[],
  previousRows?: FlightRow[] | null,
) {
  const index = buildAircraftRegistrationIndex(records);

  const previousExact = new Map<string, string>();
  const previousByFlight = new Map<string, string>();
  (Array.isArray(previousRows) ? previousRows : []).forEach((row) => {
    const registrationNo = getRegistrationNo(row);
    if (!registrationNo) return;
    const fullKey = getScheduleRegistrationKey(row);
    if (fullKey) previousExact.set(fullKey, registrationNo);
    const flightKey = normalizeFlightKey(getFlightNo(row));
    if (flightKey && !previousByFlight.has(flightKey)) previousByFlight.set(flightKey, registrationNo);
  });

  return (row: FlightRow): string => {
    const flight = getFlightNo(row);
    const dates = getFlightRowCandidateDates(row);

    let best: StampedRegistration | null = null;
    const consider = (key: string) => {
      const hit = index.dated.get(key);
      if (hit && (!best || hit.updatedAt > best.updatedAt)) best = hit;
    };
    for (const date of dates) {
      consider(buildAircraftRegistrationKey(date, flight, row.departureCode, row.arrivalCode));
      consider(buildAircraftRegistrationFlightDateKey(date, flight));
    }
    if (best) return (best as StampedRegistration).registrationNo;

    const previous = previousExact.get(getScheduleRegistrationKey(row));
    if (previous) return previous;

    const existing = getRegistrationNo(row);
    if (existing) return existing;

    const flightKey = normalizeFlightKey(flight);
    return previousByFlight.get(flightKey) || index.flightOnly.get(flightKey) || "";
  };
}

export function applyRegistrationToRows(
  rows: FlightRow[],
  records: AircraftRegistrationRecord[],
  previousRows?: FlightRow[] | null,
) {
  const resolve = createRegistrationResolver(records, previousRows);

  return rows.map((row) => {
    const registrationNo = resolve(row);
    return registrationNo
      ? {
          ...row,
          hlnbr: registrationNo,
          registrationNo,
          aircraftRegNo: registrationNo,
        }
      : row;
  });
}
