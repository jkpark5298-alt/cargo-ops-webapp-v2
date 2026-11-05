import {
  type AircraftRegistrationRecord,
  type FlightRow,
  type MonitorRoom,
} from "../../lib/flight-types";
import {
  confirmedRegistrationNo,
  getRegistrationNo as getRegistrationNoValue,
  normalizeFlightKey,
  normalizeFlightsInput,
  normalizeHlNumber,
} from "../../lib/flight-keys";
import { getComputedFlightStatus } from "../../lib/flight-status";
import * as XLSX from "xlsx";
import {
  getFlightRowCandidateDates,
  normalizeAircraftRegistrationDate,
} from "../../lib/aircraft-registration";
import { formatExcelAfocsSkdFromDateAndTime, prepareAfocsSkdForSave } from "../../lib/afocs-skd";
import {
  FLIGHT_ALERT_HISTORY_KEY,
  FLIGHT_ALERT_SNAPSHOT_KEY,
  FLIGHT_LOOKUP_CACHE_PREFIX,
  FLIGHT_LOOKUP_CACHE_TTL_MS,
  HL_MAPPING_STORAGE_KEY,
  REGISTRATION_RANGE_STORAGE_KEY,
} from "./constants";
import { FlightLookupCacheValue, ParsedRegistrationAfocsExcelRow } from "./types";

/** 이 화면은 등록번호가 없을 때 "-"로 표시·비교합니다. (공용 getRegistrationNo는 빈 문자열) */
export function getRegistrationNo(row: FlightRow) {
  return getRegistrationNoValue(row) || "-";
}

export function toDateTimeLocalString(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function getDefaultStartDateTime() {
  return toDateTimeLocalString(new Date());
}

export function getDefaultEndDateTime() {
  const d = new Date();
  d.setHours(d.getHours() + 24);
  return toDateTimeLocalString(d);
}

export function loadRegistrationQueryRange(): { start: string; end: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(REGISTRATION_RANGE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { start?: string; end?: string };
    if (!parsed?.start || !parsed?.end) return null;
    return { start: parsed.start, end: parsed.end };
  } catch {
    return null;
  }
}

export function saveRegistrationQueryRange(start: string, end: string) {
  if (typeof window === "undefined") return;
  if (!start || !end) return;
  window.localStorage.setItem(
    REGISTRATION_RANGE_STORAGE_KEY,
    JSON.stringify({ start, end }),
  );
}

export function mergeManualRegistrationFields(
  previousRows: FlightRow[],
  refreshedRows: FlightRow[],
): FlightRow[] {
  const previousByFlight = new Map<string, FlightRow>();
  previousRows.forEach((row) => {
    const key = getFlightKeyFromRow(row);
    if (!key || key === "-") return;
    const current = previousByFlight.get(key);
    if (!current || (!confirmedRegistrationNoFromRow(current) && confirmedRegistrationNoFromRow(row))) {
      previousByFlight.set(key, row);
    }
  });

  return refreshedRows.map((row) => {
    const key = getFlightKeyFromRow(row);
    const previous = key ? previousByFlight.get(key) : undefined;
    if (!previous) return row;

    const registrationNo =
      confirmedRegistrationNoFromRow(previous) || confirmedRegistrationNoFromRow(row);

    return {
      ...row,
      afocsSkd: previous.afocsSkd || row.afocsSkd || "",
      registrationNoEdited: Boolean(previous.registrationNoEdited || row.registrationNoEdited),
      flightNoEdited: Boolean(previous.flightNoEdited || row.flightNoEdited),
      ...(registrationNo
        ? {
            hlnbr: registrationNo,
            registrationNo,
            aircraftRegNo: registrationNo,
          }
        : {}),
    };
  });
}

/** 등록번호/AFOCS 작업 결과를 Schedule Flight 카드 행에만 병합 (기간·편명 목록은 유지) */
export function patchScheduleRowsWithRegistrationFields(
  slotRows: FlightRow[],
  sourceRows: FlightRow[],
): FlightRow[] {
  const sourceByFlight = new Map<string, FlightRow>();
  sourceRows.forEach((row) => {
    const key = getFlightKeyFromRow(row);
    if (key && key !== "-") sourceByFlight.set(key, row);
  });

  return slotRows.map((row) => {
    const key = getFlightKeyFromRow(row);
    const source = key ? sourceByFlight.get(key) : undefined;
    if (!source) return row;

    // 등록번호 화면에서 수동 수정한 값(source)은 카드의 기존 값보다 우선
    const registrationNo = source.registrationNoEdited
      ? confirmedRegistrationNoFromRow(source) || confirmedRegistrationNoFromRow(row)
      : confirmedRegistrationNoFromRow(row) || confirmedRegistrationNoFromRow(source);

    return {
      ...row,
      afocsSkd: source.afocsSkd || row.afocsSkd || "",
      registrationNoEdited: Boolean(source.registrationNoEdited || row.registrationNoEdited),
      ...(registrationNo
        ? {
            hlnbr: registrationNo,
            registrationNo,
            aircraftRegNo: registrationNo,
          }
        : {}),
    };
  });
}

export function getFlightLookupCacheKey(kind: "manual" | "kj-all", flights: string, start: string, end: string) {
  return `${FLIGHT_LOOKUP_CACHE_PREFIX}${kind}|${flights}|${start}|${end}`;
}

export function loadFlightLookupCache(key: string): FlightLookupCacheValue | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.savedAt || 0);
    if (!savedAt || Date.now() - savedAt > FLIGHT_LOOKUP_CACHE_TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }

    const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
    const fetchedAt = typeof parsed?.fetchedAt === "string" ? parsed.fetchedAt : "";

    return { rows, fetchedAt, savedAt };
  } catch {
    return null;
  }
}

export function saveFlightLookupCache(key: string, rows: FlightRow[], fetchedAt: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        rows,
        fetchedAt,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // 조회 캐시 저장 실패는 화면 동작을 막지 않습니다.
  }
}

export function clearFlightAlertBaselineAndHistory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(FLIGHT_ALERT_SNAPSHOT_KEY);
  localStorage.removeItem(FLIGHT_ALERT_HISTORY_KEY);
}

export function getStatusColor(row: FlightRow) {
  const status = getComputedFlightStatus(row);

  if (status === "결항") return "#111111";
  if (status === "게이트 변경") return "#a855f7";
  if (status.includes("지연")) return "#f59e0b";
  if (status === "출발") return "#ef4444";
  if (status === "도착") return "#3b82f6";
  return "#e5e7eb";
}

export function getAlertCounts(rows: FlightRow[]) {
  const computed = rows.map((r) => getComputedFlightStatus(r));
  return {
    delay: computed.filter((s) => s.includes("지연")).length,
    gateChanged: computed.filter((s) => s === "게이트 변경").length,
    canceled: computed.filter((s) => s === "결항").length,
  };
}

export function getRowBackground(row: FlightRow) {
  const status = getComputedFlightStatus(row);

  if (status === "결항") return "rgba(239, 68, 68, 0.12)";
  if (status === "게이트 변경") return "rgba(168, 85, 247, 0.14)";
  if (status.includes("지연")) return "rgba(245, 158, 11, 0.12)";
  if (status === "출발") return "rgba(239, 68, 68, 0.06)";
  if (status === "도착") return "rgba(59, 130, 246, 0.06)";
  return "transparent";
}

export function getChangedDateTime(row: FlightRow) {
  return (
    row.formattedEstimatedTime ||
    row.estimatedDateTime ||
    row.formattedScheduleTime ||
    row.scheduleDateTime ||
    "-"
  );
}

export function getFlightDisplay(row: FlightRow) {
  return row.flightId || row.flightNo || "-";
}

export function applyInlineHlDraftsToRows(targetRows: FlightRow[], drafts: Record<string, string>) {
  return targetRows.map((row) => {
    const flight = getFlightKeyFromRow(row);
    if (!flight || flight === "-") return row;
    if (!Object.prototype.hasOwnProperty.call(drafts, flight)) return row;

    const registrationNo = normalizeHlNumber(drafts[flight] || "");
    if (!/^HL\d{3,5}$/i.test(registrationNo)) return row;

    const current = normalizeHlNumber(getRegistrationNo(row));
    const registrationNoEdited = registrationNo !== current || Boolean(row.registrationNoEdited);

    return {
      ...row,
      hlnbr: registrationNo,
      registrationNo,
      aircraftRegNo: registrationNo,
      registrationNoEdited,
    };
  });
}

export function formatFlightDisplayWithMarker(row: FlightRow, drafts: Record<string, string> = {}) {
  const flight = getFlightDisplay(row);
  if (row.registrationNoEdited || row.flightNoEdited) return `${flight}*`;

  const flightKey = getFlightKeyFromRow(row);
  if (Object.prototype.hasOwnProperty.call(drafts, flightKey)) {
    const normalizedDraft = normalizeHlNumber(drafts[flightKey] || "");
    const current = normalizeHlNumber(getRegistrationNo(row));
    if (normalizedDraft && normalizedDraft !== current && /^HL\d{3,5}$/i.test(normalizedDraft)) {
      return `${flight}*`;
    }
  }

  return flight;
}

export function getRowKey(row: FlightRow, idx: number) {
  return [
    getFlightDisplay(row),
    row.scheduleDateTime || "",
    row.estimatedDateTime || "",
    row.departureCode || "",
    row.arrivalCode || "",
    row.gatenumber || "",
    idx,
  ].join("|");
}

export function getSelectionKey(row: FlightRow, idx: number) {
  return [
    getFlightDisplay(row),
    row.scheduleDateTime || "",
    row.estimatedDateTime || "",
    row.departureCode || "",
    row.arrivalCode || "",
    row.gatenumber || "",
    row.terminalid || "",
    idx,
  ].join("|");
}

export function getRefreshExcludeReason(row: FlightRow) {
  const remarkStatus = String(row.remark || "").toUpperCase();

  if (row.canceled || remarkStatus.includes("결항") || remarkStatus.includes("CANCEL")) {
    return "결항 확정";
  }

  if (remarkStatus.includes("도착") || remarkStatus.includes("ARRIVED")) {
    return "도착 확정";
  }

  return "";
}

export function isFinalCompletedRow(row: FlightRow) {
  return Boolean(getRefreshExcludeReason(row));
}

export function getActiveRefreshFlights(room: MonitorRoom) {
  const requestedFlights = normalizeFlightsInput(room.flightsInput);
  if (!Array.isArray(room.rows) || room.rows.length === 0) return requestedFlights;

  const finalFlightSet = new Set(
    room.rows
      .filter(isFinalCompletedRow)
      .map((row) => getFlightDisplay(row).replace(/\s+/g, "").toUpperCase())
      .filter(Boolean),
  );

  return requestedFlights.filter((flight) => !finalFlightSet.has(flight));
}

export function mergeRowsKeepFinal(previousRows: FlightRow[], refreshedRows: FlightRow[]) {
  const refreshedFlightSet = new Set(
    refreshedRows
      .map((row) => getFlightDisplay(row).replace(/\s+/g, "").toUpperCase())
      .filter(Boolean),
  );

  const finalRowsToKeep = previousRows.filter((row) => {
    const flight = getFlightDisplay(row).replace(/\s+/g, "").toUpperCase();
    return isFinalCompletedRow(row) && !refreshedFlightSet.has(flight);
  });

  return [...finalRowsToKeep, ...refreshedRows];
}

export function confirmedRegistrationNoFromRow(row?: FlightRow) {
  if (!row) return "";
  const fromFields = confirmedRegistrationNo(
    String(row.registrationNo || row.hlnbr || row.aircraftRegNo || ""),
  );
  if (fromFields) return fromFields;
  const current = getRegistrationNo(row);
  return current && current !== "-" ? current : "";
}

export function formatExcelTimeValue(val: unknown): string {
  if (!val) return "";
  if (val instanceof Date) {
    const hours = String(val.getHours()).padStart(2, "0");
    const minutes = String(val.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
  if (typeof val === "number") {
    const totalMinutes = Math.round(val * 24 * 60);
    const hours = String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0");
    const minutes = String(totalMinutes % 60).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
  const str = String(val).trim();
  const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const hours = timeMatch[1].padStart(2, "0");
    const minutes = timeMatch[2];
    return `${hours}:${minutes}`;
  }
  return str;
}

export function parseHlMappingText(text: string): Record<string, string> {
  const mapping: Record<string, string> = {};

  text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const cleaned = line.replace(/[|,]/g, " ");
      const parts = cleaned.split(/\s+/).filter(Boolean);
      if (parts.length < 2) return;

      const flight = normalizeFlightKey(parts[0]);
      const hlNumber = normalizeHlNumber(parts[1]);

      if (!/^KJ\d{2,4}$/i.test(flight)) return;
      if (!/^HL\d{3,5}$/i.test(hlNumber)) return;

      mapping[flight] = hlNumber;
    });

  return mapping;
}

export function serializeHlMapping(mapping: Record<string, string>) {
  return Object.keys(mapping)
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((flight) => `${flight} ${mapping[flight]}`)
    .join("\n");
}

export function loadHlMappingText() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(HL_MAPPING_STORAGE_KEY) || "";
}

export function saveHlMappingText(value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HL_MAPPING_STORAGE_KEY, value);
}

export function getAircraftRegistrationCell(row: Record<string, unknown>, candidates: string[]) {
  const entries = Object.entries(row);
  const normalizedCandidates = candidates.map((candidate) => candidate.replace(/\s+/g, "").toLowerCase());

  for (const [key, value] of entries) {
    const normalizedKey = key.replace(/\s+/g, "").toLowerCase();
    if (normalizedCandidates.includes(normalizedKey)) return value;
  }

  return "";
}

/** 제목 행이 있는 엑셀도 헤더(편명/등록기호/일자 등)를 찾아 객체 배열로 변환합니다. */
export function sheetToRegistrationAfocsRows(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (!Array.isArray(matrix) || matrix.length === 0) return [];

  const normalizeCell = (value: unknown) => String(value ?? "").replace(/\s+/g, "").toLowerCase();

  let headerIdx = -1;
  for (let i = 0; i < Math.min(matrix.length, 40); i++) {
    const cells = Array.isArray(matrix[i]) ? matrix[i] : [];
    const normalized = cells.map(normalizeCell);
    const hasFlight = normalized.some(
      (cell) => cell === "편명" || cell === "flight" || cell === "flightid" || cell === "flightno",
    );
    const hasMarker = normalized.some(
      (cell) =>
        cell === "등록기호" ||
        cell === "등록" ||
        cell === "일자" ||
        cell === "date" ||
        cell === "etd/eta" ||
        cell === "etd" ||
        cell === "eta" ||
        cell === "afocsskd",
    );
    if (hasFlight && hasMarker) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx < 0) {
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  }

  const headers = (Array.isArray(matrix[headerIdx]) ? matrix[headerIdx] : []).map((cell) =>
    String(cell ?? "").trim(),
  );
  const rows: Record<string, unknown>[] = [];

  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const cells = Array.isArray(matrix[r]) ? matrix[r] : [];
    const isEmpty = cells.every((cell) => String(cell ?? "").trim() === "");
    if (isEmpty) continue;

    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      row[header] = cells[index] ?? "";
    });
    rows.push(row);
  }

  return rows;
}

export function parseAircraftRegistrationRows(rawRows: Record<string, unknown>[]) {
  const now = new Date().toISOString();
  const records: AircraftRegistrationRecord[] = [];

  rawRows.forEach((row) => {
    const date = normalizeAircraftRegistrationDate(
      getAircraftRegistrationCell(row, ["운항일자", "일자", "날짜", "date", "operationdate"]),
    );
    const flight = normalizeFlightKey(
      String(getAircraftRegistrationCell(row, ["편명", "flight", "flightid", "flightno"]) || ""),
    );
    const departureCode = String(
      getAircraftRegistrationCell(row, ["출발지코드", "출발코드", "출발지", "출발", "departure", "dep", "depcode"]) || ""
    )
      .replace(/[^A-Z0-9]/ig, "")
      .toUpperCase();
    const arrivalCode = String(
      getAircraftRegistrationCell(row, [
        "도착지코드",
        "도착코드",
        "도착지",
        "도착",
        "arrival",
        "arr",
        "arrcode",
        "apr",
      ]) || ""
    )
      .replace(/[^A-Z0-9]/ig, "")
      .toUpperCase();
    const registrationNo = normalizeHlNumber(
      String(getAircraftRegistrationCell(row, ["등록기호", "등록", "기호", "hl", "hlnbr", "registration", "registrationno"]) || ""),
    );

    if (!date) return;
    if (!/^KJ\d{2,4}$/i.test(flight)) return;
    if (!/^HL\d{3,5}$/i.test(registrationNo)) return;

    records.push({
      date,
      flight,
      departureCode,
      arrivalCode,
      registrationNo,
      updatedAt: now,
    });
  });

  return records;
}

export function normalizeAirportCode(value: unknown) {
  return String(value || "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
}

export function extractHhMm(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function getFlightRowCandidateTimes(row: FlightRow) {
  const times: string[] = [];
  [
    row.formattedEstimatedTime,
    row.estimatedDateTime,
    row.formattedScheduleTime,
    row.scheduleDateTime,
  ].forEach((value) => {
    const time = extractHhMm(value);
    if (time && !times.includes(time)) times.push(time);
  });
  return times;
}

export function parseRegistrationAfocsExcelRows(rawRows: Record<string, unknown>[]): ParsedRegistrationAfocsExcelRow[] {
  return rawRows
    .map((row) => {
      const flight = normalizeFlightKey(
        String(
          getAircraftRegistrationCell(row, ["편명", "flight", "flightid", "flightno", "flightnumber"]) || "",
        ),
      );
      const dateVal = getAircraftRegistrationCell(row, ["운항일자", "일자", "날짜", "date", "operationdate"]);
      const date = normalizeAircraftRegistrationDate(dateVal);
      const departureCode = normalizeAirportCode(
        getAircraftRegistrationCell(row, ["출발지코드", "출발코드", "출발지", "출발", "departure", "dep", "depcode"]),
      );
      const arrivalCode = normalizeAirportCode(
        getAircraftRegistrationCell(row, [
          "도착지코드",
          "도착코드",
          "도착지",
          "도착",
          "arrival",
          "arr",
          "arrcode",
          "apr",
        ]),
      );
      const registrationNo = normalizeHlNumber(
        String(
          getAircraftRegistrationCell(row, [
            "등록기호",
            "등록",
            "기호",
            "hl",
            "hlnbr",
            "registration",
            "registrationno",
          ]) || "",
        ),
      );
      const timeVal = getAircraftRegistrationCell(row, [
        "시간",
        "AFOCSSKD",
        "AFOCS SKD",
        "time",
        "schedule",
        "scheduledatetime",
        "etd/eta",
        "etd",
        "eta",
      ]);
      const time = formatExcelTimeValue(timeVal) || extractHhMm(timeVal);
      const afocsSkd = formatExcelAfocsSkdFromDateAndTime(dateVal, timeVal);

      return {
        flight,
        date,
        departureCode,
        arrivalCode,
        registrationNo: /^HL\d{3,5}$/i.test(registrationNo) ? registrationNo : "",
        afocsSkd,
        time,
      };
    })
    .filter((row) => Boolean(row.flight));
}

export function scoreExcelRowForScheduleRow(excel: ParsedRegistrationAfocsExcelRow, row: FlightRow) {
  if (!excel.flight || excel.flight !== getFlightKeyFromRow(row)) return -1;

  let score = 10;
  const rowDates = getFlightRowCandidateDates(row);
  const rowTimes = getFlightRowCandidateTimes(row);
  const rowDep = normalizeAirportCode(row.departureCode);
  const rowArr = normalizeAirportCode(row.arrivalCode);

  if (excel.date && rowDates.includes(excel.date)) score += 50;
  if (excel.departureCode && rowDep && excel.departureCode === rowDep) score += 20;
  if (excel.arrivalCode && rowArr && excel.arrivalCode === rowArr) score += 20;
  if (excel.time && rowTimes.includes(excel.time)) score += 30;
  return score;
}

export function findBestExcelRowForScheduleRow(
  excelRows: ParsedRegistrationAfocsExcelRow[],
  row: FlightRow,
): ParsedRegistrationAfocsExcelRow | null {
  const candidates = excelRows.filter((excel) => excel.flight === getFlightKeyFromRow(row));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    // 한 줄뿐이면 일자가 같은 경우에만 적용합니다. (다른 날의 운항분은 제외)
    // 출발/도착 코드는 비교하지 않습니다: 엑셀의 오타·노선 변경(예: CAN↔HAN, ANC↔BRU)이 있어도
    // 편명과 일자가 같으면 같은 운항으로 보고 엑셀 값을 반영합니다.
    const only = candidates[0];
    const rowDates = getFlightRowCandidateDates(row);
    if (only.date && rowDates.length > 0 && !rowDates.includes(only.date)) return null;
    return only;
  }

  let best: ParsedRegistrationAfocsExcelRow | null = null;
  let bestScore = -1;
  candidates.forEach((excel) => {
    const score = scoreExcelRowForScheduleRow(excel, row);
    if (score > bestScore) {
      bestScore = score;
      best = excel;
    }
  });

  // 같은 편명이 여러 날이면 일자·노선·시각이 맞는 행만 사용합니다.
  return bestScore >= 40 ? best : null;
}

export type ExcelUploadReport = {
  /** 엑셀에는 있지만 어느 조회 행에도 반영되지 못한 줄 */
  unmatched: { flight: string; date: string; reason: string }[];
  /** 반영은 했지만 엑셀과 조회 결과의 출발/도착 코드가 다른 편 */
  routeDiffs: { flight: string; excelRoute: string; rowRoute: string }[];
};

/**
 * 엑셀 업로드 결과 점검: 반영하지 못한 줄(조회 목록에 없음 / 일자 다름)과 노선이 다른 편을 찾습니다.
 * 상태 문구에 건수만 보여주면 일부 편이 빠져도 알아채기 어려워서 편명까지 알려주기 위한 용도입니다.
 */
export function buildExcelUploadReport(
  excelRows: ParsedRegistrationAfocsExcelRow[],
  scheduleRows: FlightRow[],
  matchedPairs: { excel: ParsedRegistrationAfocsExcelRow; row: FlightRow }[],
): ExcelUploadReport {
  const usedExcel = new Set(matchedPairs.map((pair) => pair.excel));
  const rowFlights = new Set(scheduleRows.map((row) => getFlightKeyFromRow(row)));

  const unmatched: ExcelUploadReport["unmatched"] = [];
  excelRows.forEach((excel) => {
    if (!excel.registrationNo && !excel.afocsSkd) return;
    if (usedExcel.has(excel)) return;
    unmatched.push({
      flight: excel.flight,
      date: excel.date,
      reason: rowFlights.has(excel.flight) ? "일자가 다름" : "조회 목록에 없음",
    });
  });

  const routeDiffs: ExcelUploadReport["routeDiffs"] = [];
  const seen = new Set<string>();
  matchedPairs.forEach(({ excel, row }) => {
    const rowDep = normalizeAirportCode(row.departureCode);
    const rowArr = normalizeAirportCode(row.arrivalCode);
    const depDiff = excel.departureCode && rowDep && excel.departureCode !== rowDep;
    const arrDiff = excel.arrivalCode && rowArr && excel.arrivalCode !== rowArr;
    if (!depDiff && !arrDiff) return;
    const key = `${excel.flight}|${excel.date}`;
    if (seen.has(key)) return;
    seen.add(key);
    routeDiffs.push({
      flight: excel.flight,
      excelRoute: `${excel.departureCode || "-"}→${excel.arrivalCode || "-"}`,
      rowRoute: `${rowDep || "-"}→${rowArr || "-"}`,
    });
  });

  return { unmatched, routeDiffs };
}

/** 상태 문구에 덧붙일 점검 결과 (문제가 없으면 빈 문자열). 길어지지 않게 최대 maxItems건만 나열합니다. */
export function formatExcelUploadReport(report: ExcelUploadReport, maxItems = 6) {
  const parts: string[] = [];
  const list = <T,>(items: T[], format: (item: T) => string) => {
    const shown = items.slice(0, maxItems).map(format).join(", ");
    return items.length > maxItems ? `${shown} 외 ${items.length - maxItems}건` : shown;
  };

  if (report.unmatched.length > 0) {
    parts.push(
      ` · 미반영 ${report.unmatched.length}건(${list(
        report.unmatched,
        (item) => `${item.flight} ${item.reason}`,
      )})`,
    );
  }
  if (report.routeDiffs.length > 0) {
    parts.push(
      ` · 노선 다름 ${report.routeDiffs.length}건(${list(
        report.routeDiffs,
        (item) => `${item.flight} 엑셀 ${item.excelRoute} / 조회 ${item.rowRoute}`,
      )}) — 엑셀 값은 반영했습니다`,
    );
  }
  return parts.join("");
}

export function uniqueHlByFlightFromExcel(excelRows: ParsedRegistrationAfocsExcelRow[]) {
  const grouped = new Map<string, Set<string>>();
  excelRows.forEach((row) => {
    if (!row.flight || !row.registrationNo) return;
    if (!grouped.has(row.flight)) grouped.set(row.flight, new Set());
    grouped.get(row.flight)?.add(row.registrationNo);
  });

  const unique: Record<string, string> = {};
  const conflicting = new Set<string>();
  grouped.forEach((hls, flight) => {
    if (hls.size === 1) {
      unique[flight] = [...hls][0];
    } else {
      conflicting.add(flight);
    }
  });
  return { unique, conflicting };
}

export function getMappedHlNumber(row: FlightRow, mapping: Record<string, string>) {
  const flight = getFlightKeyFromRow(row);
  return mapping[flight] || "";
}

export function getEditableHlValue(
  row: FlightRow,
  mapping: Record<string, string>,
  drafts: Record<string, string>,
) {
  const flight = getFlightKeyFromRow(row);
  if (Object.prototype.hasOwnProperty.call(drafts, flight)) {
    return drafts[flight];
  }

  const current = getRegistrationNo(row);
  if (current !== "-") return current;

  const mapped = mapping[flight] || "";
  return mapped ? normalizeHlNumber(mapped) : "";
}

export function applyHlMappingToRows(rows: FlightRow[], mapping: Record<string, string>) {
  return rows.map((row) => {
    if (confirmedRegistrationNoFromRow(row)) return row;
    const mappedHl = getMappedHlNumber(row, mapping);
    return mappedHl
      ? {
          ...row,
          hlnbr: mappedHl,
          registrationNo: mappedHl,
          aircraftRegNo: mappedHl,
        }
      : row;
  });
}

export function getFlightKeyFromRow(row: FlightRow) {
  return normalizeFlightKey(getFlightDisplay(row));
}

export function filterRowsByFlightInput(rows: FlightRow[], flights: string[]) {
  const flightSet = new Set(flights.map((flight) => flight.replace(/\s+/g, "").toUpperCase()));

  return rows.filter((row) => {
    const rowFlight = getFlightDisplay(row).replace(/\s+/g, "").toUpperCase();
    return flightSet.has(rowFlight);
  });
}

export function buildFixedDetailRows(row: FlightRow) {
  return [
    { label: "현황", value: getComputedFlightStatus(row) },
    { label: "편명", value: getFlightDisplay(row) },
    { label: "출발지코드", value: row.departureCode || "-" },
    { label: "출발지공항명", value: row.departureName || "-" },
    { label: "도착지코드", value: row.arrivalCode || "-" },
    { label: "도착지공항명", value: row.arrivalName || "-" },
    { label: "예정일시", value: row.formattedScheduleTime || "-" },
    { label: "변경일시", value: row.formattedEstimatedTime || "-" },
    { label: "게이트", value: row.gatenumber || "-" },
    { label: "터미널", value: row.terminalid || "-" },
    { label: "등록기호", value: getRegistrationNo(row) },
    { label: "코드쉐어", value: row.codeshare || "-" },
  ];
}

export function getDatePart(value: string) {
  if (!value) return "";
  if (value.includes("T")) return value.split("T")[0];
  if (value.includes(" ")) return value.split(" ")[0];
  return value.slice(0, 10);
}

export function getTimePart(value: string) {
  if (!value) return "00:00";
  if (value.includes("T")) return value.split("T")[1]?.slice(0, 5) || "00:00";
  if (value.includes(" ")) return value.split(" ")[1]?.slice(0, 5) || "00:00";
  return "00:00";
}

export function buildDateTime(datePart: string, timePart: string) {
  if (!datePart) return "";
  return `${datePart}T${timePart || "00:00"}`;
}

export function combineAfocsSkdParts(date: string, time: string): string {
  const datePart = date.trim();
  const timePart = time.trim();
  if (!datePart && !timePart) return "";
  if (datePart && timePart) return prepareAfocsSkdForSave(`${datePart} ${timePart}`);
  return prepareAfocsSkdForSave(datePart || timePart);
}
