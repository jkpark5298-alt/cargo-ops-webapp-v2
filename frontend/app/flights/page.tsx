"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as XLSX from "xlsx";
import { useRouter } from "next/navigation";
import { FlightsModeTabs } from "./components/FlightsModeTabs";
import { ScheduleSlotCards } from "./components/ScheduleSlotCards";
import {
  clearAllScheduleSlotsOnServer,
  deleteScheduleSlotOnServer,
  formatScheduleCardName,
  isActiveScheduleRoom as isActiveScheduleSlotRoom,
  linkScheduleSlotOnServer,
  loadScheduleSlotsFromServer,
  saveScheduleSlotToServer,
  slotsToRooms,
  swapScheduleSlotsOnServer,
  type FlightMode,
  type ScheduleSlotKey,
  type ScheduleSlotsState,
} from "./lib/schedule-slots";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://cargo-ops-backend.onrender.com";

const REFRESH_INTERVAL_MINUTES = 10;

type FlightRow = {
  airline?: string;
  flightId?: string;
  flightNo?: string;
  departureCode?: string;
  departureName?: string;
  arrivalCode?: string;
  arrivalName?: string;
  scheduleDateTime?: string;
  estimatedDateTime?: string;
  formattedScheduleTime?: string;
  formattedEstimatedTime?: string;
  gatenumber?: string;
  terminalid?: string;
  masterflightid?: string;
  codeshare?: string;
  typeOfFlight?: string;
  remark?: string;
  status?: string;
  delay?: boolean;
  canceled?: boolean;
  gateChanged?: boolean;
  sourceType?: string;
  fid?: string;
  afocsSkd?: string;
  registrationNoEdited?: boolean;
  flightNoEdited?: boolean;
};

type MonitorRoom = {
  id: string;
  name: string;
  flightsInput: string;
  startDateTime: string;
  endDateTime: string;
  fixed: boolean;
  lastFetchedAt: string;
  rows: FlightRow[];
};

type AircraftRegistrationRecord = {
  date: string;
  flight: string;
  departureCode: string;
  arrivalCode: string;
  registrationNo: string;
  updatedAt: string;
};

const STORAGE_KEY = "cargo_ops_monitor_rooms_v6";
const HL_MAPPING_STORAGE_KEY = "cargo_ops_hl_number_mapping_v1";
const AIRCRAFT_REGISTRATION_STORAGE_KEY = "cargo_ops_aircraft_registration_records_v1";
const LAST_FIXED_ROOM_KEY = "last_fixed_room_id";
const FLIGHT_ALERT_SNAPSHOT_KEY = "cargo_ops_flight_alert_snapshot_v1";
const FLIGHT_ALERT_HISTORY_KEY = "cargo_ops_flight_alert_history_v1";

function toDateTimeLocalString(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function getDefaultStartDateTime() {
  return toDateTimeLocalString(new Date());
}

function getDefaultEndDateTime() {
  const d = new Date();
  d.setHours(d.getHours() + 24);
  return toDateTimeLocalString(d);
}

function formatMonitorRoomName(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `Monitor_${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function loadRooms(): MonitorRoom[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRooms(rooms: MonitorRoom[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
}


const FLIGHT_LOOKUP_CACHE_PREFIX = "cargo_ops_flight_lookup_cache_v1:";
const FLIGHT_LOOKUP_CACHE_TTL_MS = 3 * 60 * 1000;

type FlightLookupCacheValue = {
  rows: FlightRow[];
  fetchedAt: string;
  savedAt: number;
};

function getFlightLookupCacheKey(kind: "manual" | "kj-all", flights: string, start: string, end: string) {
  return `${FLIGHT_LOOKUP_CACHE_PREFIX}${kind}|${flights}|${start}|${end}`;
}

function loadFlightLookupCache(key: string): FlightLookupCacheValue | null {
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

function saveFlightLookupCache(key: string, rows: FlightRow[], fetchedAt: string) {
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

function isActiveScheduleRoom(room?: MonitorRoom | null) {
  return isActiveScheduleSlotRoom(room);
}

function removeEmptyScheduleRooms(rooms: MonitorRoom[]) {
  return rooms.filter((room) => !room.fixed || isActiveScheduleRoom(room));
}

function mergeLatestScheduleRoom(rooms: MonitorRoom[], latestRoom: MonitorRoom | null) {
  const localRooms = removeEmptyScheduleRooms(rooms).filter((room) => !room.fixed);
  if (!isActiveScheduleRoom(latestRoom)) return localRooms;
  return [latestRoom as MonitorRoom, ...localRooms];
}

async function loadLatestScheduleFromServer() {
  const res = await fetch(`${BACKEND_URL}/flights/latest-schedule`, {
    cache: "no-store",
  });
  const json = await res.json();

  if (!res.ok || json.success === false) {
    throw new Error(json.detail || json.message || "Schedule Flight 서버 조회 실패");
  }

  const room = (json.room || null) as MonitorRoom | null;
  return isActiveScheduleRoom(room) ? room : null;
}

async function saveLatestScheduleToServer(room: MonitorRoom) {
  const roomToSave = normalizeScheduleRoomRows(room);

  const res = await fetch(`${BACKEND_URL}/flights/latest-schedule`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ room: roomToSave }),
  });

  const json = await res.json();

  if (!res.ok || json.success === false) {
    throw new Error(json.detail || json.message || "Schedule Flight 서버 동기화 실패");
  }

  return normalizeScheduleRoomRows((json.room || roomToSave) as MonitorRoom);
}

async function clearLatestScheduleOnServer(room?: MonitorRoom) {
  const now = new Date();
  const emptyRoom: MonitorRoom = {
    id: room?.id || `${now.getTime()}`,
    name: room?.name || `Schedule_${now.toLocaleString("ko-KR")}`,
    flightsInput: "",
    startDateTime: room?.startDateTime || getDefaultStartDateTime(),
    endDateTime: room?.endDateTime || getDefaultEndDateTime(),
    fixed: true,
    lastFetchedAt: now.toISOString(),
    rows: [],
  };

  const res = await fetch(`${BACKEND_URL}/flights/latest-schedule`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ room: emptyRoom }),
  });
  const json = await res.json();

  if (!res.ok || json.success === false) {
    throw new Error(json.detail || json.message || "Schedule Flight 서버 비우기 실패");
  }

  return json;
}

function isScheduleFlightRoom(room?: MonitorRoom | null) {
  if (!room) return false;

  return Boolean(
    room.fixed ||
      room.name?.startsWith("Schedule_") ||
      room.name?.includes("Schedule Flight")
  );
}

async function shouldClearLatestScheduleForDeletedRoom(room?: MonitorRoom | null) {
  if (!room) return false;
  if (isScheduleFlightRoom(room)) return true;

  try {
    const latestRoom = await loadLatestScheduleFromServer();
    return Boolean(latestRoom?.id && latestRoom.id === room.id);
  } catch {
    return false;
  }
}

function clearFlightAlertBaselineAndHistory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(FLIGHT_ALERT_SNAPSHOT_KEY);
  localStorage.removeItem(FLIGHT_ALERT_HISTORY_KEY);
}

function parseFlightTime(row: FlightRow): Date | null {
  const raw =
    row.formattedEstimatedTime ||
    row.formattedScheduleTime ||
    row.estimatedDateTime ||
    row.scheduleDateTime;

  if (!raw) return null;

  const normalized = raw
    .trim()
    .replace(/\./g, "-")
    .replace(/\//g, "-")
    .replace("T", " ");

  const direct = new Date(normalized);
  if (!Number.isNaN(direct.getTime())) return direct;

  const compactMatch = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (compactMatch) {
    const [, y, m, d, hh, mm, ss] = compactMatch;
    return new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss || "0")
    );
  }

  return null;
}

function getRemarkStatus(row: FlightRow): string {
  return `${row.status || ""} ${row.remark || ""}`.trim().toUpperCase();
}

function getComputedStatus(row: FlightRow) {
  const remarkStatus = getRemarkStatus(row);

  if (row.canceled || remarkStatus.includes("CANCEL")) return "결항";
  if (row.gateChanged) return "게이트 변경";

  if (
    remarkStatus.includes("DELAY") ||
    remarkStatus.includes("지연") ||
    row.delay
  ) {
    if (
      remarkStatus.includes("ARRIV") ||
      remarkStatus.includes("도착") ||
      row.status === "도착"
    ) {
      return "도착(지연)";
    }
    if (
      remarkStatus.includes("DEPAR") ||
      remarkStatus.includes("출발") ||
      row.status === "출발"
    ) {
      return "출발(지연)";
    }
    return "지연";
  }

  if (
    row.status === "출발" ||
    remarkStatus.includes("DEPART") ||
    remarkStatus.includes("DEP") ||
    remarkStatus.includes("출발")
  ) {
    return "출발";
  }

  if (
    row.status === "도착" ||
    remarkStatus.includes("ARRIV") ||
    remarkStatus.includes("ARR") ||
    remarkStatus.includes("도착")
  ) {
    return "도착";
  }

  const dt = parseFlightTime(row);
  const now = new Date();

  if (dt && dt.getTime() <= now.getTime()) {
    const dep = (row.departureCode || "").toUpperCase();
    const arr = (row.arrivalCode || "").toUpperCase();

    if (dep === "ICN") return "출발";
    if (arr === "ICN") return "도착";
  }

  return "-";
}

function getStatusColor(row: FlightRow) {
  const status = getComputedStatus(row);

  if (status === "결항") return "#111111";
  if (status === "게이트 변경") return "#a855f7";
  if (status.includes("지연")) return "#f59e0b";
  if (status === "출발") return "#ef4444";
  if (status === "도착") return "#3b82f6";
  return "#e5e7eb";
}

function getAlertCounts(rows: FlightRow[]) {
  const computed = rows.map((r) => getComputedStatus(r));
  return {
    delay: computed.filter((s) => s.includes("지연")).length,
    gateChanged: computed.filter((s) => s === "게이트 변경").length,
    canceled: computed.filter((s) => s === "결항").length,
  };
}

function getRowBackground(row: FlightRow) {
  const status = getComputedStatus(row);

  if (status === "결항") return "rgba(239, 68, 68, 0.12)";
  if (status === "게이트 변경") return "rgba(168, 85, 247, 0.14)";
  if (status.includes("지연")) return "rgba(245, 158, 11, 0.12)";
  if (status === "출발") return "rgba(239, 68, 68, 0.06)";
  if (status === "도착") return "rgba(59, 130, 246, 0.06)";
  return "transparent";
}

function getChangedDateTime(row: FlightRow) {
  return (
    row.formattedEstimatedTime ||
    row.estimatedDateTime ||
    row.formattedScheduleTime ||
    row.scheduleDateTime ||
    "-"
  );
}

function getRegistrationNo(row: FlightRow) {
  const maybeRow = row as FlightRow & {
    hlnbr?: string;
    registrationNo?: string;
    aircraftRegNo?: string;
    fid?: string;
  };

  return (
    maybeRow.hlnbr ||
    maybeRow.registrationNo ||
    maybeRow.aircraftRegNo ||
    (/^HL\d{3,5}$/i.test(maybeRow.fid || "") ? maybeRow.fid : "") ||
    "-"
  );
}

function getFlightDisplay(row: FlightRow) {
  return row.flightId || row.flightNo || "-";
}

function applyInlineHlDraftsToRows(targetRows: FlightRow[], drafts: Record<string, string>) {
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

function formatFlightDisplayWithMarker(row: FlightRow, drafts: Record<string, string> = {}) {
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

function getRowKey(row: FlightRow, idx: number) {
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

function getSelectionKey(row: FlightRow, idx: number) {
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

function getRefreshExcludeReason(row: FlightRow) {
  const remarkStatus = String(row.remark || "").toUpperCase();

  if (row.canceled || remarkStatus.includes("결항") || remarkStatus.includes("CANCEL")) {
    return "결항 확정";
  }

  if (remarkStatus.includes("도착") || remarkStatus.includes("ARRIVED")) {
    return "도착 확정";
  }

  return "";
}

function isFinalCompletedRow(row: FlightRow) {
  return Boolean(getRefreshExcludeReason(row));
}

function getUniqueFlightInputs(rows: FlightRow[]) {
  const seen = new Set<string>();
  const flights: string[] = [];

  rows.forEach((row) => {
    const flight = getFlightDisplay(row).replace(/\s+/g, "").toUpperCase();
    if (!flight || flight === "-") return;
    if (seen.has(flight)) return;
    seen.add(flight);
    flights.push(flight);
  });

  return flights;
}

function getActiveRefreshFlights(room: MonitorRoom) {
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

function mergeRowsKeepFinal(previousRows: FlightRow[], refreshedRows: FlightRow[]) {
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

function normalizeFlightsInput(rawInput: string) {
  return rawInput
    .split(/[\s,\n,]+/)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
    .map((value) => {
      if (/^\d{3,4}$/.test(value)) {
        return `KJ${value}`;
      }
      return value;
    });
}

function normalizeHlFlightKey(value: string) {
  let normalized = value.replace(/\s+/g, "").toUpperCase();
  normalized = normalized.replace(/[^A-Z0-9]/g, "");

  const match = normalized.match(/^([A-Z]{2,3})?0*([1-9]\d*)$/);
  if (match) {
    const prefix = match[1] || "KJ";
    const num = match[2];
    return `${prefix}${num}`;
  }

  const allZerosMatch = normalized.match(/^([A-Z]{2,3})?0+$/);
  if (allZerosMatch) {
    const prefix = allZerosMatch[1] || "KJ";
    return `${prefix}0`;
  }

  return normalized;
}

function normalizeFlightKey(value: string) {
  return normalizeHlFlightKey(value);
}

function normalizeHlNumber(value: string) {
  let normalized = value.replace(/\s+/g, "").toUpperCase();
  normalized = normalized.replace(/[^A-Z0-9]/g, "");

  if (/^\d{3,5}$/.test(normalized)) {
    return `HL${normalized}`;
  }

  return normalized;
}

function formatExcelTimeValue(val: unknown): string {
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

function parseHlMappingText(text: string): Record<string, string> {
  const mapping: Record<string, string> = {};

  text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const cleaned = line.replace(/[|,]/g, " ");
      const parts = cleaned.split(/\s+/).filter(Boolean);
      if (parts.length < 2) return;

      const flight = normalizeHlFlightKey(parts[0]);
      const hlNumber = normalizeHlNumber(parts[1]);

      if (!/^KJ\d{2,4}$/i.test(flight)) return;
      if (!/^HL\d{3,5}$/i.test(hlNumber)) return;

      mapping[flight] = hlNumber;
    });

  return mapping;
}

function serializeHlMapping(mapping: Record<string, string>) {
  return Object.keys(mapping)
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((flight) => `${flight} ${mapping[flight]}`)
    .join("\n");
}

function loadHlMappingText() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(HL_MAPPING_STORAGE_KEY) || "";
}

function saveHlMappingText(value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HL_MAPPING_STORAGE_KEY, value);
}



function normalizeAircraftRegistrationDate(value: unknown) {
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

function getAircraftRegistrationDateFromRow(row: FlightRow) {
  return normalizeAircraftRegistrationDate(
    row.scheduleDateTime ||
      row.formattedScheduleTime ||
      row.estimatedDateTime ||
      row.formattedEstimatedTime ||
      "",
  );
}

function buildAircraftRegistrationKey(date: string, flight: string, departureCode = "", arrivalCode = "") {
  return [
    normalizeAircraftRegistrationDate(date),
    normalizeHlFlightKey(flight),
    String(departureCode || "").replace(/\s+/g, "").toUpperCase(),
    String(arrivalCode || "").replace(/\s+/g, "").toUpperCase(),
  ].join("|");
}

function buildAircraftRegistrationFlightDateKey(date: string, flight: string) {
  return [normalizeAircraftRegistrationDate(date), normalizeHlFlightKey(flight)].join("|");
}

function buildAircraftRegistrationMap(records: AircraftRegistrationRecord[]) {
  const tempMap = new Map<string, { registrationNo: string; updatedAt: string }>();

  records.forEach((record) => {
    if (!record.date || !record.flight || !record.registrationNo) return;

    const exactKey = buildAircraftRegistrationKey(record.date, record.flight, record.departureCode, record.arrivalCode);
    const fallbackKey = buildAircraftRegistrationFlightDateKey(record.date, record.flight);
    const currentUpdateTime = record.updatedAt || "";

    const existingExact = tempMap.get(exactKey);
    if (!existingExact || currentUpdateTime >= existingExact.updatedAt) {
      tempMap.set(exactKey, { registrationNo: record.registrationNo, updatedAt: currentUpdateTime });
    }

    const existingFallback = tempMap.get(fallbackKey);
    if (!existingFallback || currentUpdateTime >= existingFallback.updatedAt) {
      tempMap.set(fallbackKey, { registrationNo: record.registrationNo, updatedAt: currentUpdateTime });
    }
  });

  const finalMap = new Map<string, string>();
  tempMap.forEach((value, key) => {
    finalMap.set(key, value.registrationNo);
  });

  return finalMap;
}

function getAircraftRegistrationForRow(row: FlightRow, records: AircraftRegistrationRecord[]) {
  const map = buildAircraftRegistrationMap(records);
  const date = getAircraftRegistrationDateFromRow(row);
  const flight = getFlightDisplay(row);
  const exactKey = buildAircraftRegistrationKey(date, flight, row.departureCode, row.arrivalCode);
  const fallbackKey = buildAircraftRegistrationFlightDateKey(date, flight);
  return map.get(exactKey) || map.get(fallbackKey) || "";
}

function applyAircraftRegistrationToRows(rows: FlightRow[], records: AircraftRegistrationRecord[]) {
  return rows.map((row) => {
    const existing = getRegistrationNo(row);
    const fromRegistrationDb = getAircraftRegistrationForRow(row, records);
    const registrationNo = fromRegistrationDb || (existing !== "-" ? existing : "");

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

function loadAircraftRegistrationRecords(): AircraftRegistrationRecord[] {
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

function saveAircraftRegistrationRecords(records: AircraftRegistrationRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AIRCRAFT_REGISTRATION_STORAGE_KEY, JSON.stringify(records));
}

async function fetchAircraftRegistrationRecordsFromServer() {
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

async function saveAircraftRegistrationRecordsToServer(
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

function mergeAircraftRegistrationRecords(
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

function getAircraftRegistrationCell(row: Record<string, unknown>, candidates: string[]) {
  const entries = Object.entries(row);
  const normalizedCandidates = candidates.map((candidate) => candidate.replace(/\s+/g, "").toLowerCase());

  for (const [key, value] of entries) {
    const normalizedKey = key.replace(/\s+/g, "").toLowerCase();
    if (normalizedCandidates.includes(normalizedKey)) return value;
  }

  return "";
}

function parseAircraftRegistrationRows(rawRows: Record<string, unknown>[]) {
  const now = new Date().toISOString();
  const records: AircraftRegistrationRecord[] = [];

  rawRows.forEach((row) => {
    const date = normalizeAircraftRegistrationDate(
      getAircraftRegistrationCell(row, ["운항일자", "일자", "날짜", "date", "operationdate"]),
    );
    const flight = normalizeHlFlightKey(
      String(getAircraftRegistrationCell(row, ["편명", "flight", "flightid", "flightno"]) || ""),
    );
    const departureCode = String(
      getAircraftRegistrationCell(row, ["출발지코드", "출발코드", "출발지", "출발", "departure", "dep", "depcode"]) || ""
    )
      .replace(/[^A-Z0-9]/ig, "")
      .toUpperCase();
    const arrivalCode = String(
      getAircraftRegistrationCell(row, ["도착지코드", "도착코드", "도착지", "도착", "arrival", "arr", "arrcode"]) || ""
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

function getMappedHlNumber(row: FlightRow, mapping: Record<string, string>) {
  const flight = getFlightKeyFromRow(row);
  return mapping[flight] || "";
}

function getEditableHlValue(
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

  return mapping[flight] || "";
}

function applyHlMappingToRows(rows: FlightRow[], mapping: Record<string, string>) {
  return rows.map((row) => {
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

function getFlightKeyFromRow(row: FlightRow) {
  return normalizeFlightKey(getFlightDisplay(row));
}

function removeFlightFromScheduleRoom(room: MonitorRoom, targetFlight: string): MonitorRoom {
  const targetKey = normalizeFlightKey(targetFlight);
  const nextFlights = normalizeFlightsInput(room.flightsInput).filter(
    (flight) => normalizeFlightKey(flight) !== targetKey,
  );
  const nextRows = (room.rows || []).filter((row) => getFlightKeyFromRow(row) !== targetKey);

  return {
    ...room,
    flightsInput: nextFlights.join(", "),
    rows: nextRows,
    lastFetchedAt: new Date().toISOString(),
  };
}

function filterRowsByFlightInput(rows: FlightRow[], flights: string[]) {
  const flightSet = new Set(flights.map((flight) => flight.replace(/\s+/g, "").toUpperCase()));

  return rows.filter((row) => {
    const rowFlight = getFlightDisplay(row).replace(/\s+/g, "").toUpperCase();
    return flightSet.has(rowFlight);
  });
}

function buildRowsByFlight(rows: FlightRow[]) {
  const rowsByFlight = new Map<string, FlightRow>();

  rows.forEach((row) => {
    const flight = getFlightKeyFromRow(row);
    if (!flight || flight === "-") return;
    rowsByFlight.set(flight, row);
  });

  return rowsByFlight;
}

function buildScheduleRowsForFlights(rows: FlightRow[], flights: string[]) {
  const rowsByFlight = buildRowsByFlight(rows);

  return flights
    .map((flight) => rowsByFlight.get(normalizeFlightKey(flight)))
    .filter((row): row is FlightRow => Boolean(row));
}

function normalizeScheduleRoomRows(room: MonitorRoom): MonitorRoom {
  const sourceRows = Array.isArray(room.rows) ? room.rows : [];
  const rowsByFlight = buildRowsByFlight(sourceRows);
  const requestedFlights = normalizeFlightsInput(room.flightsInput);
  const finalFlights = requestedFlights.length > 0
    ? requestedFlights.filter((flight) => rowsByFlight.has(normalizeFlightKey(flight)))
    : Array.from(rowsByFlight.keys());

  return {
    ...room,
    flightsInput: finalFlights.join(", "),
    rows: buildScheduleRowsForFlights(sourceRows, finalFlights),
  };
}

function buildFixedDetailRows(row: FlightRow) {
  return [
    { label: "현황", value: getComputedStatus(row) },
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

function getDatePart(value: string) {
  if (!value) return "";
  if (value.includes("T")) return value.split("T")[0];
  if (value.includes(" ")) return value.split(" ")[0];
  return value.slice(0, 10);
}

function getTimePart(value: string) {
  if (!value) return "00:00";
  if (value.includes("T")) return value.split("T")[1]?.slice(0, 5) || "00:00";
  if (value.includes(" ")) return value.split(" ")[1]?.slice(0, 5) || "00:00";
  return "00:00";
}

function buildDateTime(datePart: string, timePart: string) {
  if (!datePart) return "";
  return `${datePart}T${timePart || "00:00"}`;
}

function DetailToggleButton({
  expanded,
  onClick,
}: {
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        minWidth: 34,
        height: 30,
        padding: "0 10px",
        borderRadius: 6,
        border: "1px solid #36527f",
        background: expanded ? "#1d4ed8" : "#10213d",
        color: "white",
        fontWeight: 800,
        cursor: "pointer",
      }}
      aria-label="detail"
      title="DETAIL"
    >
      D
    </button>
  );
}

function TimeSelect24({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const hour = (value || "00:00").slice(0, 2);
  const minute = (value || "00:00").slice(3, 5);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <select
        value={hour}
        onChange={(e) => onChange(`${e.target.value}:${minute}`)}
        style={selectInputStyle}
      >
        {Array.from({ length: 24 }, (_, i) => {
          const v = String(i).padStart(2, "0");
          return (
            <option key={v} value={v}>
              {v}
            </option>
          );
        })}
      </select>

      <span style={{ color: "#9fb3c8" }}>:</span>

      <select
        value={minute}
        onChange={(e) => onChange(`${hour}:${e.target.value}`)}
        style={selectInputStyle}
      >
        {Array.from({ length: 60 }, (_, i) => {
          const v = String(i).padStart(2, "0");
          return (
            <option key={v} value={v}>
              {v}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function FixedResultsTable({
  rows,
  expandedKeys,
  selectedKeys,
  hlNumberMap,
  hlDrafts,
  onHlDraftChange,
  afocsSkdDrafts,
  onAfocsSkdDraftChange,
  onToggleDetail,
  onToggleSelect,
}: {
  rows: FlightRow[];
  expandedKeys: Record<string, boolean>;
  selectedKeys: Record<string, boolean>;
  hlNumberMap: Record<string, string>;
  hlDrafts: Record<string, string>;
  onHlDraftChange: (flight: string, value: string) => void;
  afocsSkdDrafts: Record<string, string>;
  onAfocsSkdDraftChange: (flight: string, value: string) => void;
  onToggleDetail: (key: string) => void;
  onToggleSelect: (row: FlightRow, idx: number) => void;
}) {
  return (
    <div style={{ marginTop: 30, overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: 900,
          background: "#081427",
          border: "1px solid #22314e",
        }}
      >
        <thead>
          <tr style={{ background: "#18263f" }}>
            <th style={thStyle}>선택</th>
            <th style={thStyle}>편명</th>
            <th style={thStyle}>등록기호</th>
            <th style={thStyle}>AFOCS SKD</th>
            <th style={thStyle}>구분</th>
            <th style={thStyle}>출발</th>
            <th style={thStyle}>도착</th>
            <th style={thStyle}>변경일시</th>
            <th style={thStyle}>게이트</th>
            <th style={thStyle}>D</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td style={tdStyle} colSpan={10}>
                조회 결과가 없습니다.
              </td>
            </tr>
          )}

          {rows.map((row, idx) => {
            const rowKey = getRowKey(row, idx);
            const selectionKey = getSelectionKey(row, idx);
            const expanded = Boolean(expandedKeys[rowKey]);
            const selected = Boolean(selectedKeys[selectionKey]);
            const finalCompleted = isFinalCompletedRow(row);
            const detailRows = buildFixedDetailRows(row);

            return (
              <FragmentRow key={rowKey}>
                <tr
                  style={{
                    borderBottom: expanded
                      ? "1px solid transparent"
                      : "1px solid #2b4269",
                    background: getRowBackground(row),
                  }}
                >
                  <td style={tdStyle}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleSelect(row, idx)}
                      style={{
                        width: 18,
                        height: 18,
                        cursor: "pointer",
                      }}
                    />
                  </td>
                  <td style={{ ...tdStyle, color: getFlightNoColor(row.departureCode, row.arrivalCode) }}>
                    {formatFlightDisplayWithMarker(row, hlDrafts)}
                  </td>
                  <td style={tdStyle}>
                    <input
                      value={getEditableHlValue(row, hlNumberMap, hlDrafts)}
                      onChange={(event) =>
                        onHlDraftChange(getFlightKeyFromRow(row), event.target.value.toUpperCase())
                      }
                      placeholder="7423"
                      style={hlInlineInputStyle}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      value={afocsSkdDrafts[getFlightKeyFromRow(row)] ?? row.afocsSkd ?? ""}
                      onChange={(event) =>
                        onAfocsSkdDraftChange(getFlightKeyFromRow(row), event.target.value)
                      }
                      placeholder={getChangedDateTime(row).split(" ").slice(-1)[0] || "시간입력"}
                      style={{
                        ...hlInlineInputStyle,
                        color: "#fcd34d",
                        fontWeight: "bold",
                        border: "1px solid rgba(59, 130, 246, 0.4)",
                      }}
                    />
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      color: getStatusColor(row),
                      fontWeight: 800,
                    }}
                  >
                    {getComputedStatus(row)}
                  </td>
                  <td style={tdStyle}>{row.departureCode || "-"}</td>
                  <td style={tdStyle}>{row.arrivalCode || "-"}</td>
                  <td style={tdStyle}>{getChangedDateTime(row)}</td>
                  <td style={tdStyle}>{row.gatenumber || "-"}</td>
                  <td style={tdStyle}>
                    <DetailToggleButton
                      expanded={expanded}
                      onClick={() => onToggleDetail(rowKey)}
                    />
                  </td>
                </tr>

                {expanded && (
                  <tr style={{ background: "#0c1a31", borderBottom: "1px solid #2b4269" }}>
                    <td colSpan={10} style={{ padding: 14 }}>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          background: "#0a1528",
                          border: "1px solid #2b4269",
                        }}
                      >
                        <thead>
                          <tr style={{ background: "#15233b" }}>
                            <th style={detailThStyle}>항목</th>
                            <th style={detailThStyle}>값</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailRows.map((detail) => (
                            <tr key={`${rowKey}-${detail.label}`} style={{ borderBottom: "1px solid #22314e" }}>
                              <td style={detailTdLabelStyle}>{detail.label}</td>
                              <td style={detailTdStyle}>{detail.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </FragmentRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export default function FlightsPage() {
  const router = useRouter();
  const registrationExcelInputRef = useRef<HTMLInputElement | null>(null);
  const [flightMode, setFlightMode] = useState<FlightMode>("query");
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlotsState>({
    active: null,
    archive: null,
    linkedSlot: "active",
  });
  const [selectedSlotKey, setSelectedSlotKey] = useState<ScheduleSlotKey | null>(null);
  const [queryMode, setQueryMode] = useState<"manual" | "kj-all">("manual");
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<FlightRow[]>([]);
  const [selectedScheduleKeys, setSelectedScheduleKeys] = useState<Record<string, boolean>>({});
  const [selectedScheduleOrder, setSelectedScheduleOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [startDateTime, setStartDateTime] = useState(getDefaultStartDateTime());
  const [endDateTime, setEndDateTime] = useState(getDefaultEndDateTime());

  const [fixed, setFixed] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState("");

  const [rooms, setRooms] = useState<MonitorRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [expandedDetailKeys, setExpandedDetailKeys] = useState<Record<string, boolean>>({});
  const [hlMappingText, setHlMappingText] = useState("");
  const [hlMappingStatus, setHlMappingStatus] = useState("");
  const [hlInlineDrafts, setHlInlineDrafts] = useState<Record<string, string>>({});
  const afocsExcelInputRef = useRef<HTMLInputElement | null>(null);
  const [afocsSkdInlineDrafts, setAfocsSkdInlineDrafts] = useState<Record<string, string>>({});
  const [aircraftRegistrationRecords, setAircraftRegistrationRecords] = useState<AircraftRegistrationRecord[]>([]);

  const currentRangeText = useMemo(() => {
    return `${startDateTime.replace("T", " ")} ~ ${endDateTime.replace("T", " ")}`;
  }, [startDateTime, endDateTime]);

  const alertCounts = useMemo(() => getAlertCounts(rows), [rows]);

  const hlNumberMap = useMemo(() => parseHlMappingText(hlMappingText), [hlMappingText]);
  const hlMappingCount = useMemo(() => Object.keys(hlNumberMap).length, [hlNumberMap]);

  useEffect(() => {
    setHlMappingText(loadHlMappingText());

    const localRecords = loadAircraftRegistrationRecords();
    setAircraftRegistrationRecords(localRecords);

    void fetchAircraftRegistrationRecordsFromServer()
      .then(async (serverRecords) => {
        let finalRecords = serverRecords;
        if (serverRecords.length === 0 && localRecords.length > 0) {
          try {
            finalRecords = await saveAircraftRegistrationRecordsToServer(localRecords, "replace");
            saveAircraftRegistrationRecords(finalRecords);
          } catch (restoreError) {
            console.error("Failed to restore records to server:", restoreError);
            finalRecords = localRecords;
          }
        }

        setAircraftRegistrationRecords(finalRecords);
        setRows((prevRows) => applyAircraftRegistrationToRows(prevRows, finalRecords));
        setRooms((prevRooms) => {
          const nextRooms = prevRooms.map((room) => ({
            ...room,
            rows: applyAircraftRegistrationToRows(room.rows || [], finalRecords),
          }));
          saveRooms(nextRooms);
          return nextRooms;
        });
      })
      .catch(() => {
        // 서버 등록기호 DB 조회 실패 시 현재 기기의 로컬 데이터로 계속 동작합니다.
      });
  }, []);

  const selectedScheduleRows = useMemo(() => {
    const rowMap = new Map<string, FlightRow>();

    rows.forEach((row, idx) => {
      const key = getSelectionKey(row, idx);
      if (selectedScheduleKeys[key]) {
        rowMap.set(key, row);
      }
    });

    return selectedScheduleOrder
      .map((key) => rowMap.get(key))
      .filter((row): row is FlightRow => Boolean(row));
  }, [rows, selectedScheduleKeys, selectedScheduleOrder]);

  const refreshExcludedRows = useMemo(() => rows.filter(isFinalCompletedRow), [rows]);
  const refreshActiveRows = useMemo(() => rows.filter((row) => !isFinalCompletedRow(row)), [rows]);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) || null,
    [rooms, selectedRoomId]
  );

  const isSelectedFixedRoom = Boolean(selectedRoom?.fixed);

  const applyScheduleSlotsState = (slots: ScheduleSlotsState, preferredSlot?: ScheduleSlotKey | null) => {
    setScheduleSlots(slots);
    const nextRooms = slotsToRooms(slots);
    setRooms(nextRooms);
    saveRooms(nextRooms);

    const slotOrder: ScheduleSlotKey[] = preferredSlot
      ? [preferredSlot, preferredSlot === "active" ? "archive" : "active"]
      : ["active", "archive"];
    const nextSelectedSlot =
      slotOrder.find((slotKey) => {
        const entry = slots[slotKey];
        return entry && isActiveScheduleRoom(entry.room);
      }) || null;

    setSelectedSlotKey(nextSelectedSlot);
    if (nextSelectedSlot && slots[nextSelectedSlot]) {
      const room = slots[nextSelectedSlot]!.room;
      setSelectedRoomId(room.id);
    } else {
      setSelectedRoomId("");
    }
  };

  const loadScheduleSlots = async (preferredSlot?: ScheduleSlotKey | null) => {
    const slots = await loadScheduleSlotsFromServer();
    applyScheduleSlotsState(slots, preferredSlot);
    return slots;
  };

  const handleSelectSlot = (slotKey: ScheduleSlotKey) => {
    const entry = scheduleSlots[slotKey];
    if (!entry || !isActiveScheduleRoom(entry.room)) return;

    setSelectedSlotKey(slotKey);
    setSelectedRoomId(entry.room.id);
    setInput(entry.room.flightsInput);
    setStartDateTime(entry.room.startDateTime);
    setEndDateTime(entry.room.endDateTime);
    setFixed(true);
    setLastFetchedAt(entry.room.lastFetchedAt);
    setRows(entry.room.rows || []);
    setQueryMode("manual");
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});
    setError("");
  };

  const handleDeleteSlot = async (slotKey: ScheduleSlotKey) => {
    const entry = scheduleSlots[slotKey];
    if (!entry) return;

    const confirmed = window.confirm(
      slotKey === "active"
        ? "활성 Schedule Flight 카드를 삭제할까요? 직전 보관 카드가 있으면 활성으로 승격됩니다."
        : "직전 보관 Schedule Flight 카드를 삭제할까요?",
    );
    if (!confirmed) return;

    try {
      const nextSlots = await deleteScheduleSlotOnServer(slotKey);
      applyScheduleSlotsState(nextSlots);
      if (selectedSlotKey === slotKey) {
        resetLookupView();
        setFixed(false);
      }
      clearFlightAlertBaselineAndHistory();
      if (typeof window !== "undefined") {
        window.localStorage.setItem("cargo_ops_latest_schedule_updated_at", new Date().toISOString());
      }
      setError(
        slotKey === "active"
          ? "활성 Schedule Flight 카드를 삭제했습니다. 초기화면과 AFOCS SKD에도 반영됩니다."
          : "직전 보관 Schedule Flight 카드를 삭제했습니다.",
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Schedule Flight 카드 삭제 중 오류가 발생했습니다.",
      );
    }
  };

  const handleDeleteAllSlots = async () => {
    const hasAnySlot = Boolean(scheduleSlots.active || scheduleSlots.archive);
    if (!hasAnySlot) {
      setError("삭제할 Schedule Flight 카드가 없습니다.");
      return;
    }

    const confirmed = window.confirm(
      "저장된 Schedule Flight 카드를 모두 삭제할까요? NOW FLT·After 카드와 초기화면/AFOCS SKD 연동이 함께 비워집니다.",
    );
    if (!confirmed) return;

    try {
      const nextSlots = await clearAllScheduleSlotsOnServer();
      applyScheduleSlotsState(nextSlots);
      resetLookupView();
      setFixed(false);
      setSelectedSlotKey(null);
      setInput("");
      saveRooms([]);
      clearFlightAlertBaselineAndHistory();
      if (typeof window !== "undefined") {
        window.localStorage.setItem("cargo_ops_latest_schedule_updated_at", new Date().toISOString());
      }

      const verifiedSlots = await loadScheduleSlotsFromServer();
      if (isActiveScheduleSlotRoom(verifiedSlots.active?.room) || isActiveScheduleSlotRoom(verifiedSlots.archive?.room)) {
        throw new Error("삭제 후에도 Schedule Flight 카드가 남아 있습니다.");
      }
      applyScheduleSlotsState(verifiedSlots);

      setError("Schedule Flight 카드를 모두 삭제했습니다. 초기화면과 AFOCS SKD에도 반영됩니다.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Schedule Flight 전체 삭제 중 오류가 발생했습니다.",
      );
    }
  };

  const handleRestoreArchiveSlot = async () => {
    if (!scheduleSlots.archive) {
      setError("복원할 직전 보관 카드가 없습니다.");
      return;
    }

    try {
      const nextSlots = await swapScheduleSlotsOnServer();
      applyScheduleSlotsState(nextSlots, "active");
      const activeRoom = nextSlots.active?.room;
      if (activeRoom) {
        setInput(activeRoom.flightsInput);
        setRows(activeRoom.rows || []);
        setLastFetchedAt(activeRoom.lastFetchedAt);
        setFixed(true);
      }
      clearFlightAlertBaselineAndHistory();
      if (typeof window !== "undefined") {
        window.localStorage.setItem("cargo_ops_latest_schedule_updated_at", new Date().toISOString());
      }
      setError("직전 보관 카드를 활성 Schedule Flight로 복원했습니다.");
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "Schedule Flight 카드 복원 중 오류가 발생했습니다.",
      );
    }
  };

  const handleLinkSlot = async (slotKey: ScheduleSlotKey) => {
    try {
      const nextSlots = await linkScheduleSlotOnServer(slotKey);
      applyScheduleSlotsState(nextSlots, slotKey);
      clearFlightAlertBaselineAndHistory();
      if (typeof window !== "undefined") {
        window.localStorage.setItem("cargo_ops_latest_schedule_updated_at", new Date().toISOString());
      }
      setError("초기화면 Scheduled Flight 연동 카드를 변경했습니다.");
    } catch (linkError) {
      setError(
        linkError instanceof Error
          ? linkError.message
          : "초기화면 연동 변경 중 오류가 발생했습니다.",
      );
    }
  };

  const handleSelectAllScheduleRows = () => {
    const initialKeys: Record<string, boolean> = {};
    const initialOrder: string[] = [];
    rows.forEach((row, idx) => {
      if (!isFinalCompletedRow(row)) {
        const key = getSelectionKey(row, idx);
        initialKeys[key] = true;
        initialOrder.push(key);
      }
    });
    setSelectedScheduleKeys(initialKeys);
    setSelectedScheduleOrder(initialOrder);
  };

  const handleClearAllScheduleRows = () => {
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
  };

  const applyAllRegistrationSources = (targetRows: FlightRow[]) => {
    const latestRecords = loadAircraftRegistrationRecords();
    const withDrafts = applyInlineHlDraftsToRows(targetRows, hlInlineDrafts);
    return applyAircraftRegistrationToRows(applyHlMappingToRows(withDrafts, hlNumberMap), latestRecords);
  };

  const persistRegistrationDraftsForRows = async (targetRows: FlightRow[]) => {
    const nextMap: Record<string, string> = { ...hlNumberMap };
    const incomingRecords = targetRows
      .map((row) => {
        const flight = getFlightKeyFromRow(row);
        if (!flight || flight === "-") return null;

        const rawValue = Object.prototype.hasOwnProperty.call(hlInlineDrafts, flight)
          ? hlInlineDrafts[flight]
          : getEditableHlValue(row, hlNumberMap, {});

        const registrationNo = normalizeHlNumber(rawValue || "");
        if (!/^HL\d{3,5}$/i.test(registrationNo)) return null;

        nextMap[flight] = registrationNo;
        return {
          date: getAircraftRegistrationDateFromRow(row),
          flight,
          departureCode: row.departureCode || "",
          arrivalCode: row.arrivalCode || "",
          registrationNo,
          updatedAt: new Date().toISOString(),
        } satisfies AircraftRegistrationRecord;
      })
      .filter((record): record is AircraftRegistrationRecord => Boolean(record));

    if (incomingRecords.length === 0) return;

    const normalizedText = serializeHlMapping(nextMap);
    setHlMappingText(normalizedText);
    saveHlMappingText(normalizedText);

    const latestRecords = loadAircraftRegistrationRecords();
    let nextAircraftRegistrationRecords = mergeAircraftRegistrationRecords(
      latestRecords,
      incomingRecords,
    );

    try {
      nextAircraftRegistrationRecords = await saveAircraftRegistrationRecordsToServer(
        incomingRecords,
        "merge",
      );
    } catch {
      saveAircraftRegistrationRecords(nextAircraftRegistrationRecords);
    }

    setAircraftRegistrationRecords(nextAircraftRegistrationRecords);
    saveAircraftRegistrationRecords(nextAircraftRegistrationRecords);
    setHlInlineDrafts({});
  };

  const applyAllRegistrationSourcesToRoom = (room: MonitorRoom): MonitorRoom => ({
    ...room,
    rows: applyAllRegistrationSources(room.rows || []),
  });

  const updateSelectedRoomDraft = (updates: Partial<MonitorRoom>) => {
    if (!selectedRoomId) return;

    setRooms((prevRooms) => {
      const nextRooms = prevRooms.map((room) =>
        room.id === selectedRoomId ? { ...room, ...updates } : room
      );
      saveRooms(nextRooms);
      return nextRooms;
    });
  };

  const handleAircraftRegistrationExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;

      if (!firstSheet) {
        setHlMappingStatus("엑셀 시트를 찾지 못했습니다.");
        return;
      }

      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
      const parsedRecords = parseAircraftRegistrationRows(rawRows);

      if (parsedRecords.length === 0) {
        setHlMappingStatus("업로드된 엑셀에서 등록기호 데이터를 찾지 못했습니다. 운항일자/편명/출발코드/도착코드/등록기호 컬럼을 확인해 주세요.");
        return;
      }

      // --- 1. Optimistic Update (Immediate) ---
      setAircraftRegistrationRecords(parsedRecords);
      saveAircraftRegistrationRecords(parsedRecords);

      let nextRows = applyAircraftRegistrationToRows(rows, parsedRecords);
      let nextRooms = rooms.map((room) => ({
        ...room,
        rows: applyAircraftRegistrationToRows(room.rows || [], parsedRecords),
      }));

      setRows(nextRows);
      setRooms(nextRooms);
      saveRooms(nextRooms);

      setHlMappingStatus(`등록기호 엑셀 ${parsedRecords.length}건 읽기 완료 · 로컬 반영 완료 · 서버 저장 중...`);

      // --- 2. Background Sync ---
      // We run the server sync asynchronously to keep the UI instant
      void (async () => {
        let serverSyncMessage = "";
        let finalRecords = parsedRecords;

        try {
          finalRecords = await saveAircraftRegistrationRecordsToServer(parsedRecords, "replace");
          saveAircraftRegistrationRecords(finalRecords);
          serverSyncMessage = " · 서버 저장 완료";
        } catch (serverError) {
          serverSyncMessage =
            serverError instanceof Error
              ? ` · 서버 저장 실패: ${serverError.message}`
              : " · 서버 저장 실패";
        }

        setAircraftRegistrationRecords(finalRecords);

        nextRows = applyAircraftRegistrationToRows(rows, finalRecords);
        nextRooms = rooms.map((room) => ({
          ...room,
          rows: applyAircraftRegistrationToRows(room.rows || [], finalRecords),
        }));

        setRows(nextRows);
        setRooms(nextRooms);
        saveRooms(nextRooms);

        const nextSelectedRoom = selectedRoom
          ? nextRooms.find((room) => room.id === selectedRoom.id) || null
          : null;

        if (nextSelectedRoom?.fixed) {
          try {
            await saveLatestScheduleToServer(normalizeScheduleRoomRows(nextSelectedRoom));
            setHlMappingStatus(`등록기호 엑셀 ${parsedRecords.length}건 업로드 · 총 ${finalRecords.length}건 관리${serverSyncMessage} · AFOCS SKD/초기화면 반영`);
          } catch (error) {
            setHlMappingStatus(
              error instanceof Error
                ? `등록기호 엑셀 ${parsedRecords.length}건 로컬 반영 · 서버 반영 실패: ${error.message}`
                : `등록기호 엑셀 ${parsedRecords.length}건 로컬 반영 · 서버 반영 실패`,
            );
          }
          return;
        }

        setHlMappingStatus(`등록기호 엑셀 ${parsedRecords.length}건 업로드 · 총 ${finalRecords.length}건 관리${serverSyncMessage}`);
      })();
    } catch (error) {
      setHlMappingStatus(
        error instanceof Error
          ? `등록기호 엑셀 업로드 실패: ${error.message}`
          : "등록기호 엑셀 업로드 중 오류가 발생했습니다.",
      );
    }
  };

  const handleHlInlineDraftChange = (flight: string, value: string) => {
    const key = normalizeHlFlightKey(flight);
    if (!key) return;

    setHlInlineDrafts((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleAfocsSkdInlineDraftChange = (flight: string, value: string) => {
    const key = normalizeFlightKey(flight);
    if (!key) return;

    setAfocsSkdInlineDrafts((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSaveInlineAfocsSkd = async () => {
    if (!selectedRoom || !selectedRoom.fixed) {
      setHlMappingStatus("수정할 Schedule Flight 방이 선택되지 않았습니다.");
      return;
    }

    const updatedRows = (selectedRoom.rows || []).map((row) => {
      const flightKey = getFlightKeyFromRow(row);
      if (Object.prototype.hasOwnProperty.call(afocsSkdInlineDrafts, flightKey)) {
        return {
          ...row,
          afocsSkd: afocsSkdInlineDrafts[flightKey],
        };
      }
      return row;
    });

    const updatedRoom: MonitorRoom = {
      ...selectedRoom,
      rows: updatedRows,
      lastFetchedAt: new Date().toLocaleString("ko-KR"),
    };

    const nextRooms = rooms.map((room) =>
      room.id === selectedRoom.id ? updatedRoom : room
    );

    setRooms(nextRooms);
    saveRooms(nextRooms);
    setRows(updatedRows);
    setAfocsSkdInlineDrafts({});

    try {
      await saveLatestScheduleToServer(updatedRoom);
      setHlMappingStatus("AFOCS SKD 시간을 저장했습니다. AFOCS SKD에 실시간 반영됩니다.");
    } catch (syncError) {
      setHlMappingStatus(
        syncError instanceof Error
          ? `AFOCS SKD 로컬 저장 완료 · 서버 반영 실패: ${syncError.message}`
          : "AFOCS SKD 로컬 저장 완료 · 서버 반영 실패",
      );
    }
  };

  const handleAfocsSkdExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!selectedRoom || !selectedRoom.fixed) {
      setHlMappingStatus("업로드할 Schedule Flight 방이 활성화되어 있지 않습니다.");
      return;
    }

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;

      if (!firstSheet) {
        setHlMappingStatus("엑셀 시트를 찾지 못했습니다.");
        return;
      }

      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
      
      const excelMappings: Record<string, string> = {};
      rawRows.forEach((row) => {
        const flightVal = getAircraftRegistrationCell(row, ["편명", "flight", "flightid", "flightno", "flightnumber"]);
        const timeVal = getAircraftRegistrationCell(row, ["시간", "AFOCSSKD", "AFOCS SKD", "time", "schedule", "scheduledatetime", "etd/eta", "etd", "eta"]);
        
        const flightKey = normalizeFlightKey(String(flightVal || ""));
        const timeStr = formatExcelTimeValue(timeVal);
        
        if (flightKey && timeStr) {
          excelMappings[flightKey] = timeStr;
        }
      });

      const keys = Object.keys(excelMappings);
      if (keys.length === 0) {
        setHlMappingStatus("업로드된 엑셀에서 AFOCS SKD 데이터를 찾지 못했습니다. 편명/시간(또는 AFOCS SKD, ETD/ETA) 컬럼을 확인해 주세요.");
        return;
      }

      let matchedCount = 0;
      const updatedRows = (selectedRoom.rows || []).map((row) => {
        const flightKey = getFlightKeyFromRow(row);
        if (excelMappings[flightKey]) {
          matchedCount++;
          return {
            ...row,
            afocsSkd: excelMappings[flightKey],
          };
        }
        return row;
      });

      if (matchedCount === 0) {
        setHlMappingStatus(`엑셀에서 ${keys.length}건의 시간 데이터를 읽었으나, 현재 Schedule Flight 목록과 일치하는 편명이 없습니다.`);
        return;
      }

      const updatedRoom: MonitorRoom = {
        ...selectedRoom,
        rows: updatedRows,
        lastFetchedAt: new Date().toLocaleString("ko-KR"),
      };

      const nextRooms = rooms.map((room) =>
        room.id === selectedRoom.id ? updatedRoom : room
      );

      setRooms(nextRooms);
      saveRooms(nextRooms);
      setRows(updatedRows);
      
      setAfocsSkdInlineDrafts((prev) => {
        const next = { ...prev };
        Object.keys(excelMappings).forEach((k) => {
          delete next[k];
        });
        return next;
      });

      await saveLatestScheduleToServer(updatedRoom);
      setHlMappingStatus(`AFOCS SKD 엑셀 업로드 성공: ${matchedCount}건의 시간이 반영 및 동기화되었습니다.`);
    } catch (err) {
      setHlMappingStatus(
        err instanceof Error
          ? `AFOCS SKD 엑셀 업로드 실패: ${err.message}`
          : "AFOCS SKD 엑셀 업로드 중 오류가 발생했습니다."
      );
    }
  };

  const handleSaveInlineHlMapping = async () => {
    const nextMap: Record<string, string> = { ...hlNumberMap };
    let savedCount = 0;

    rows.forEach((row) => {
      const flight = getFlightKeyFromRow(row);
      if (!flight || flight === "-") return;

      const rawValue = Object.prototype.hasOwnProperty.call(hlInlineDrafts, flight)
        ? hlInlineDrafts[flight]
        : getEditableHlValue(row, hlNumberMap, {});

      const normalizedHl = normalizeHlNumber(rawValue || "");
      if (!/^HL\d{3,5}$/i.test(normalizedHl)) return;

      nextMap[flight] = normalizedHl;
      savedCount += 1;
    });

    if (savedCount === 0) {
      setHlMappingStatus("저장할 등록기호가 없습니다. 표의 등록기호 칸에 숫자만 입력해 주세요.");
      return;
    }

    const normalizedText = serializeHlMapping(nextMap);
    setHlMappingText(normalizedText);
    saveHlMappingText(normalizedText);

    const incomingRecords = rows
      .map((row) => {
        const flight = getFlightKeyFromRow(row);
        if (!flight || flight === "-") return null;

        const rawValue = Object.prototype.hasOwnProperty.call(hlInlineDrafts, flight)
          ? hlInlineDrafts[flight]
          : getEditableHlValue(row, nextMap, {});
        const registrationNo = normalizeHlNumber(rawValue || "");
        if (!/^HL\d{3,5}$/i.test(registrationNo)) return null;

        return {
          date: getAircraftRegistrationDateFromRow(row),
          flight,
          departureCode: row.departureCode || "",
          arrivalCode: row.arrivalCode || "",
          registrationNo,
          updatedAt: new Date().toISOString(),
        } satisfies AircraftRegistrationRecord;
      })
      .filter((record): record is AircraftRegistrationRecord => Boolean(record));

    const latestRecords = loadAircraftRegistrationRecords();
    let nextAircraftRegistrationRecords = mergeAircraftRegistrationRecords(
      latestRecords,
      incomingRecords,
    );
    let serverRegistrationSyncMessage = "";

    if (incomingRecords.length > 0) {
      try {
        nextAircraftRegistrationRecords = await saveAircraftRegistrationRecordsToServer(incomingRecords, "merge");
        serverRegistrationSyncMessage = " · 서버 저장";
      } catch (serverError) {
        saveAircraftRegistrationRecords(nextAircraftRegistrationRecords);
        serverRegistrationSyncMessage =
          serverError instanceof Error
            ? ` · 서버 저장 실패: ${serverError.message}`
            : " · 서버 저장 실패";
      }
    } else {
      saveAircraftRegistrationRecords(nextAircraftRegistrationRecords);
    }

    setAircraftRegistrationRecords(nextAircraftRegistrationRecords);

    const nextRows = applyAircraftRegistrationToRows(applyHlMappingToRows(rows, nextMap), nextAircraftRegistrationRecords).map(
      (row) => {
        const flight = getFlightKeyFromRow(row);
        const wasEdited = incomingRecords.some(
          (record) => normalizeFlightKey(record.flight) === normalizeFlightKey(flight),
        );
        return wasEdited ? { ...row, registrationNoEdited: true } : row;
      },
    );
    const nextRooms = rooms.map((room) => ({
      ...room,
      rows: applyAircraftRegistrationToRows(applyHlMappingToRows(room.rows || [], nextMap), nextAircraftRegistrationRecords),
    }));

    setRows(nextRows);
    setRooms(nextRooms);
    saveRooms(nextRooms);
    setHlInlineDrafts({});

    const nextSelectedRoom = selectedRoom
      ? nextRooms.find((room) => room.id === selectedRoom.id) || null
      : null;

    if (nextSelectedRoom?.fixed) {
      try {
        await saveLatestScheduleToServer(normalizeScheduleRoomRows(nextSelectedRoom));
        setHlMappingStatus(`등록기호 ${savedCount}건 저장${serverRegistrationSyncMessage} · AFOCS SKD/초기화면 반영`);
      } catch (error) {
        setHlMappingStatus(
          error instanceof Error
            ? `등록기호 로컬 저장 완료 · 서버 반영 실패: ${error.message}`
            : "등록기호 로컬 저장 완료 · 서버 반영 실패",
        );
      }
      return;
    }

    setHlMappingStatus(`등록기호 ${savedCount}건 저장${serverRegistrationSyncMessage}`);
  };

  const handleFlightsInputChange = (value: string) => {
    setInput(value.toUpperCase());
  };

  const clearSelectedScheduleFlight = async () => {
    if (!selectedRoom || !selectedRoom.fixed) return;

    const updatedRoom: MonitorRoom = {
      ...selectedRoom,
      flightsInput: "",
      rows: [],
      lastFetchedAt: new Date().toLocaleString("ko-KR"),
    };

    const nextRooms = rooms.map((room) =>
      room.id === selectedRoom.id ? updatedRoom : room
    );

    setInput("");
    setRooms(nextRooms);
    saveRooms(nextRooms);
    setRows([]);
    clearFlightAlertBaselineAndHistory();
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});

    try {
      await saveLatestScheduleToServer(updatedRoom);
      setError("Schedule Flight를 비웠습니다. 초기화면과 AFOCS SKD에도 반영됩니다.");
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? `로컬 Schedule Flight 비우기 완료. 서버 동기화 실패: ${syncError.message}`
          : "로컬 Schedule Flight 비우기 완료. 서버 동기화 중 오류가 발생했습니다.",
      );
    }
  };

  const syncFixedRoomFlightsInput = async () => {
    const normalizedFlights = normalizeFlightsInput(input);
    const normalizedInput = normalizedFlights.join(", ");

    setInput(normalizedInput);

    if (!selectedRoom || !selectedRoom.fixed) return;

    const nextRows = normalizedFlights.length > 0
      ? filterRowsByFlightInput(selectedRoom.rows || [], normalizedFlights)
      : [];
    const updatedRoom: MonitorRoom = {
      ...selectedRoom,
      flightsInput: normalizedInput,
      rows: nextRows,
      lastFetchedAt: new Date().toLocaleString("ko-KR"),
    };

    const nextRooms = rooms.map((room) =>
      room.id === selectedRoom.id ? updatedRoom : room
    );

    setRooms(nextRooms);
    saveRooms(nextRooms);
    setRows(nextRows);
    clearFlightAlertBaselineAndHistory();
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});

    try {
      await saveLatestScheduleToServer(updatedRoom);
      setError(
        normalizedFlights.length > 0
          ? "Schedule Flight 편명 변경을 AFOCS SKD와 최근 Schedule Flight에 동기화했습니다."
          : "Schedule Flight 편명을 모두 비웠습니다. AFOCS SKD와 최근 Schedule Flight도 비워졌습니다.",
      );
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? `로컬 편명 변경 완료. 서버 동기화 실패: ${syncError.message}`
          : "로컬 편명 변경 완료. 서버 동기화 중 오류가 발생했습니다.",
      );
    }
  };

  const resetLookupView = () => {
    setRows([]);
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});
    setError("");
    setLastFetchedAt("");
    setSelectedRoomId("");
    setFixed(false);
  };

  const switchToManualMode = () => {
    setQueryMode("manual");
    if (input === "KJ 전체") setInput("");
    resetLookupView();
  };

  const switchToKjAllMode = () => {
    setQueryMode("kj-all");
    setInput("");
    resetLookupView();
  };

  const handleStartDateTimeChange = (value: string) => {
    setStartDateTime(value);
    updateSelectedRoomDraft({ startDateTime: value });
  };

  const handleEndDateTimeChange = (value: string) => {
    setEndDateTime(value);
    updateSelectedRoomDraft({ endDateTime: value });
  };

  const handleStartDateChange = (value: string) => {
    handleStartDateTimeChange(buildDateTime(value, getTimePart(startDateTime)));
  };

  const handleStartTimeChange = (value: string) => {
    handleStartDateTimeChange(buildDateTime(getDatePart(startDateTime), value));
  };

  const handleEndDateChange = (value: string) => {
    handleEndDateTimeChange(buildDateTime(value, getTimePart(endDateTime)));
  };

  const handleEndTimeChange = (value: string) => {
    handleEndDateTimeChange(buildDateTime(getDatePart(endDateTime), value));
  };

  const refreshRoomData = async (room: MonitorRoom, showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }

    setError("");

    try {
      const activeFlights = getActiveRefreshFlights(room);
      const excludedCount = (room.rows || []).filter(isFinalCompletedRow).length;
      let nextRows: FlightRow[];

      if (activeFlights.length === 0) {
        nextRows = room.rows || [];
        if (excludedCount > 0) {
          setError("모든 Schedule Flight가 API remark 기준으로 도착 또는 결항 확정되어 재조회 대상에서 제외되었습니다. 화면에는 기존 결과를 유지합니다.");
        }
      } else {
        const res = await fetch(`${BACKEND_URL}/flights/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            flights: activeFlights,
            start: room.startDateTime,
            end: room.endDateTime,
          }),
        });

        const json = await res.json();

        if (!res.ok || json.success === false) {
          throw new Error(json.message || json.detail || `서버 오류 (${res.status})`);
        }

        nextRows = mergeRowsKeepFinal(room.rows || [], json.data || []);
      }

      const fetchedAt = new Date().toLocaleString("ko-KR");
      const updatedRoom: MonitorRoom = normalizeScheduleRoomRows({
        ...room,
        rows: nextRows,
        lastFetchedAt: fetchedAt,
      });

      setRooms((prevRooms) => {
        const nextRooms = prevRooms.map((prevRoom) =>
          prevRoom.id === updatedRoom.id ? updatedRoom : prevRoom
        );
        saveRooms(nextRooms);
        return nextRooms;
      });

      if (selectedRoomId === updatedRoom.id) {
        setInput(updatedRoom.flightsInput);
        setStartDateTime(updatedRoom.startDateTime);
        setEndDateTime(updatedRoom.endDateTime);
        setFixed(updatedRoom.fixed);
        setRows(updatedRoom.rows);
        setLastFetchedAt(fetchedAt);
        setExpandedDetailKeys({});
      }
    } catch (e: any) {
      setError(e.message || "조회 실패");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const savedRooms = loadRooms();
    setRooms(savedRooms);

    void loadScheduleSlots()
      .then((slots) => {
        const activeRoom = slots.active?.room;
        if (activeRoom && isActiveScheduleRoom(activeRoom)) {
          mergeLatestScheduleRoom(loadRooms(), activeRoom);
        }
      })
      .catch(() => {
        void loadLatestScheduleFromServer()
          .then((serverRoom) => {
            const mergedRooms = mergeLatestScheduleRoom(loadRooms(), serverRoom);
            setRooms(mergedRooms);
            saveRooms(mergedRooms);
          })
          .catch(() => {
            // 서버 기준 조회 실패 시 기기 저장값을 유지합니다.
          });
      });

    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get("mode");
    if (modeParam === "edit" || modeParam === "registration" || modeParam === "query") {
      setFlightMode(modeParam);
    }
    const q = params.get("flight");
    const roomId = params.get("roomId");

    if (roomId) {
      setFlightMode("edit");
      void loadScheduleSlots().then((slots) => {
        const matchedSlot =
          (slots.active?.room.id === roomId ? "active" : null) ||
          (slots.archive?.room.id === roomId ? "archive" : null);
        if (matchedSlot) {
          handleSelectSlot(matchedSlot);
        }
      });
      return;
    }

    if (q) {
      const upper = q.toUpperCase();
      const normalized = normalizeFlightsInput(upper).join(", ");
      setQueryMode("manual");
      setInput(normalized);
      void fetchFlights(normalized);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistRoom = (
    roomId: string,
    nextRows: FlightRow[],
    fetchedAt: string,
    nextFixed: boolean = fixed,
    nextInput: string = input,
    nextStartDateTime: string = startDateTime,
    nextEndDateTime: string = endDateTime
  ) => {
    const nextRooms = rooms.map((room) =>
      room.id === roomId
        ? {
            ...room,
            flightsInput: nextInput,
            startDateTime: nextStartDateTime,
            endDateTime: nextEndDateTime,
            fixed: nextFixed,
            lastFetchedAt: fetchedAt,
            rows: nextRows,
          }
        : room
    );
    setRooms(nextRooms);
    saveRooms(nextRooms);
  };

  const fetchFlights = async (flightArg?: string) => {
    const finalInput = (flightArg ?? input).trim();

    if (!finalInput) {
      setError("편명을 입력하세요.");
      return;
    }

    const flights = normalizeFlightsInput(finalInput);

    if (flights.length === 0) {
      setError("편명을 입력하세요.");
      return;
    }

    const keepScheduleContext = Boolean(selectedRoom?.fixed);
    const previousScheduleRows = keepScheduleContext ? selectedRoom?.rows || [] : [];
    const normalizedInput = flights.join(", ");
    const cacheKey = getFlightLookupCacheKey("manual", normalizedInput, startDateTime, endDateTime);
    const cachedLookup = loadFlightLookupCache(cacheKey);

    setQueryMode("manual");
    setInput(normalizedInput);
    if (!keepScheduleContext) {
      setSelectedRoomId("");
      setFixed(false);
    }
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});
    setError("");

    if (cachedLookup) {
      const cachedRows = applyAllRegistrationSources(cachedLookup.rows || []);
      setRows(cachedRows);
      setLastFetchedAt(`${cachedLookup.fetchedAt} · 캐시`);
      setError("최근 조회 결과를 먼저 표시했습니다. 최신 정보로 갱신 중입니다.");

      const initialKeys: Record<string, boolean> = {};
      const initialOrder: string[] = [];
      cachedRows.forEach((row, idx) => {
        if (!isFinalCompletedRow(row)) {
          const key = getSelectionKey(row, idx);
          initialKeys[key] = true;
          initialOrder.push(key);
        }
      });
      setSelectedScheduleKeys(initialKeys);
      setSelectedScheduleOrder(initialOrder);
    } else {
      setRows([]);
      setLastFetchedAt("");
    }

    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/flights/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          flights,
          start: startDateTime,
          end: endDateTime,
        }),
      });

      const json = await res.json();

      if (!res.ok || json.success === false) {
        throw new Error(json.message || json.detail || `서버 오류 (${res.status})`);
      }

      const nextRows = applyAllRegistrationSources(json.data || []);
      const fetchedAt = new Date().toLocaleString("ko-KR");
      saveFlightLookupCache(cacheKey, nextRows, fetchedAt);

      setRows(nextRows);
      setLastFetchedAt(json.cached ? `${fetchedAt} · 서버 캐시` : fetchedAt);
      setExpandedDetailKeys({});

      const initialKeys: Record<string, boolean> = {};
      const initialOrder: string[] = [];
      nextRows.forEach((row, idx) => {
        if (!isFinalCompletedRow(row)) {
          const key = getSelectionKey(row, idx);
          initialKeys[key] = true;
          initialOrder.push(key);
        }
      });
      setSelectedScheduleKeys(initialKeys);
      setSelectedScheduleOrder(initialOrder);

      if (keepScheduleContext && selectedRoom) {
        const mergedInput = mergeFlightsInput(selectedRoom.flightsInput, normalizedInput);
        const mergedRows = mergeScheduleRowsByFlight(previousScheduleRows, nextRows);
        const updatedRoom: MonitorRoom = {
          ...selectedRoom,
          flightsInput: mergedInput,
          rows: mergedRows,
          lastFetchedAt: fetchedAt,
        };

        const nextRooms = mergeLatestScheduleRoom(rooms, updatedRoom);
        setRooms(nextRooms);
        saveRooms(nextRooms);
        setSelectedRoomId(updatedRoom.id);
        setFixed(true);
        const missingFlights = getMissingInputFlights(flights.join(", "), nextRows);
        setError(
          missingFlights.length > 0
            ? `추가 편명 조회 완료. 조회 결과가 없는 편명은 저장 대상에서 제외됩니다: ${missingFlights.join(", ")}`
            : "추가 편명 조회 완료. 결과 행의 +를 선택한 뒤 ‘선택한 Schedule Flight 저장’을 누르면 기존 정보에 병합됩니다.",
        );
        return;
      }

      if (selectedRoomId) {
        persistRoom(
          selectedRoomId,
          nextRows,
          fetchedAt,
          fixed,
          normalizedInput,
          startDateTime,
          endDateTime
        );
      }
    } catch (e: any) {
      setError(e.message || "조회 실패");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllKjFlights = async () => {
    const cacheKey = getFlightLookupCacheKey("kj-all", "KJ_ALL", startDateTime, endDateTime);
    const cachedLookup = loadFlightLookupCache(cacheKey);

    setQueryMode("kj-all");
    setSelectedRoomId("");
    setFixed(false);
    setExpandedDetailKeys({});
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setError("");

    if (cachedLookup) {
      const cachedRows = applyAllRegistrationSources(cachedLookup.rows || []);
      setRows(cachedRows);
      setLastFetchedAt(`${cachedLookup.fetchedAt} · 캐시`);
      setError("최근 KJ 전체 조회 결과를 먼저 표시했습니다. 최신 정보로 갱신 중입니다.");

      const initialKeys: Record<string, boolean> = {};
      const initialOrder: string[] = [];
      cachedRows.forEach((row, idx) => {
        if (!isFinalCompletedRow(row)) {
          const key = getSelectionKey(row, idx);
          initialKeys[key] = true;
          initialOrder.push(key);
        }
      });
      setSelectedScheduleKeys(initialKeys);
      setSelectedScheduleOrder(initialOrder);
    } else {
      setRows([]);
      setLastFetchedAt("");
    }

    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/flights/kj-all`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          start: startDateTime,
          end: endDateTime,
        }),
      });

      const json = await res.json();

      if (!res.ok || json.success === false) {
        throw new Error(
          json.message ||
            json.detail ||
            (res.status === 404
              ? "KJ 전체 조회 API가 아직 백엔드에 반영되지 않았습니다. Render 백엔드 배포를 확인하세요."
              : `서버 오류 (${res.status})`)
        );
      }

      const nextRows = applyAllRegistrationSources(json.data || []);
      const fetchedAt = new Date().toLocaleString("ko-KR");
      saveFlightLookupCache(cacheKey, nextRows, fetchedAt);

      setRows(nextRows);
      setLastFetchedAt(json.cached ? `${fetchedAt} · 서버 캐시` : fetchedAt);
      setExpandedDetailKeys({});

      const initialKeys: Record<string, boolean> = {};
      const initialOrder: string[] = [];
      nextRows.forEach((row, idx) => {
        if (!isFinalCompletedRow(row)) {
          const key = getSelectionKey(row, idx);
          initialKeys[key] = true;
          initialOrder.push(key);
        }
      });
      setSelectedScheduleKeys(initialKeys);
      setSelectedScheduleOrder(initialOrder);
    } catch (e: any) {
      setError(e.message || "KJ 전체 조회 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleScheduleSelection = (row: FlightRow, idx: number) => {
    if (isFinalCompletedRow(row)) return;

    const key = getSelectionKey(row, idx);

    setSelectedScheduleKeys((prev) => {
      const nextSelected = !prev[key];

      setSelectedScheduleOrder((prevOrder) => {
        if (nextSelected) {
          return prevOrder.includes(key) ? prevOrder : [...prevOrder, key];
        }

        return prevOrder.filter((itemKey) => itemKey !== key);
      });

      return {
        ...prev,
        [key]: nextSelected,
      };
    });
  };

  const handleDeleteSelectedFlightsFromSchedule = async () => {
    if (!selectedRoom?.fixed || selectedScheduleRows.length === 0) return;

    const targetFlights = selectedScheduleRows
      .map((r) => normalizeFlightKey(getFlightDisplay(r)))
      .filter((f): f is string => Boolean(f));

    if (targetFlights.length === 0) return;

    const confirmed = window.confirm(
      `선택한 ${targetFlights.length}개 편명을 Schedule Flight에서 삭제할까요?`
    );
    if (!confirmed) return;

    let updatedRoom = selectedRoom;
    for (const flight of targetFlights) {
      updatedRoom = removeFlightFromScheduleRoom(updatedRoom, flight);
    }

    const hasRemaining = isActiveScheduleRoom(updatedRoom);

    const nextRooms = hasRemaining
      ? mergeLatestScheduleRoom(rooms, updatedRoom)
      : removeEmptyScheduleRooms(rooms.map((room) => (room.id === selectedRoom.id ? updatedRoom : room)));

    setRooms(nextRooms);
    saveRooms(nextRooms);
    setRows(updatedRoom.rows || []);
    setInput(updatedRoom.flightsInput);
    setLastFetchedAt(updatedRoom.lastFetchedAt);
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});
    clearFlightAlertBaselineAndHistory();

    if (!hasRemaining) {
      setSelectedRoomId("");
      setFixed(false);
    } else {
      setSelectedRoomId(updatedRoom.id);
      setFixed(true);
    }

    try {
      const result = await saveScheduleSlotToServer(updatedRoom, {
        rotate: false,
        slot: selectedSlotKey || "active",
      });
      applyScheduleSlotsState(
        {
          active: result.active,
          archive: result.archive,
          linkedSlot: result.linkedSlot,
        },
        selectedSlotKey || "active",
      );
      if (typeof window !== "undefined") {
        if (!hasRemaining) {
          window.localStorage.removeItem(LAST_FIXED_ROOM_KEY);
        }
        window.localStorage.setItem("cargo_ops_latest_schedule_updated_at", new Date().toISOString());
      }

      setError(
        hasRemaining
          ? `선택한 편명(${targetFlights.join(", ")}) 삭제 완료. 초기화면과 AFOCS SKD에도 반영됩니다.`
          : `선택한 편명 삭제 완료. 남은 편명이 없어 Schedule Flight를 비웠습니다.`,
      );
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? `로컬 삭제 완료. 서버 동기화 실패: ${syncError.message}`
          : `로컬 삭제 완료. 서버 동기화 중 오류가 발생했습니다.`,
      );
    }
  };

  const mergeScheduleRowsByFlight = (baseRows: FlightRow[], addRows: FlightRow[]) => {
    const mergedMap = new Map<string, FlightRow>();

    baseRows.forEach((row) => {
      const flight = (row.flightId || row.flightNo || "").replace(/\s+/g, "").toUpperCase();
      if (!flight) return;
      mergedMap.set(flight, row);
    });

    addRows.forEach((row) => {
      const flight = (row.flightId || row.flightNo || "").replace(/\s+/g, "").toUpperCase();
      if (!flight) return;
      const existing = mergedMap.get(flight);
      mergedMap.set(flight, existing ? { ...existing, ...row } : row);
    });

    return Array.from(mergedMap.values());
  };

  const mergeFlightsInput = (baseInput: string, addInput: string) => {
    const values = [...normalizeFlightsInput(baseInput), ...normalizeFlightsInput(addInput)];
    const seen = new Set<string>();
    const merged: string[] = [];

    values.forEach((flight) => {
      const key = flight.replace(/\s+/g, "").toUpperCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(key);
    });

    return merged.join(", ");
  };

  const getFlightsFromRowsInOrder = (targetRows: FlightRow[]) => {
    const seen = new Set<string>();
    const flights: string[] = [];

    targetRows.forEach((row) => {
      const flight = (row.flightId || row.flightNo || "").replace(/\s+/g, "").toUpperCase();
      if (!flight || seen.has(flight)) return;
      seen.add(flight);
      flights.push(flight);
    });

    return flights;
  };

  const getMissingInputFlights = (inputText: string, targetRows: FlightRow[]) => {
    const found = new Set(
      targetRows
        .map((row) => (row.flightId || row.flightNo || "").replace(/\s+/g, "").toUpperCase())
        .filter(Boolean),
    );

    return normalizeFlightsInput(inputText).filter((flight) => !found.has(flight));
  };

  const buildScheduleFlightsInputFromRows = (targetRows: FlightRow[]) => {
    return getFlightsFromRowsInOrder(targetRows).join(", ");
  };

  const handleSaveSelectedSchedule = async () => {
    if (selectedScheduleRows.length === 0) {
      const missingFlights = getMissingInputFlights(input, rows);
      setError(
        missingFlights.length > 0
          ? `조회 결과가 없는 편명은 Schedule Flight에 저장할 수 없습니다: ${missingFlights.join(", ")}`
          : "저장할 항공편을 선택하세요.",
      );
      return;
    }

    const selectedRowsWithDrafts = applyInlineHlDraftsToRows(selectedScheduleRows, hlInlineDrafts);
    await persistRegistrationDraftsForRows(selectedRowsWithDrafts);
    const selectedRowsWithHl = applyAllRegistrationSources(selectedRowsWithDrafts);
    const selectedFlights = getFlightsFromRowsInOrder(selectedRowsWithHl);
    if (selectedFlights.length === 0) {
      setError("선택한 결과에서 편명을 확인하지 못했습니다.");
      return;
    }

    const missingFlights = getMissingInputFlights(input, rows);
    const now = new Date();
    const editBaseRoom =
      flightMode === "edit" && selectedSlotKey
        ? scheduleSlots[selectedSlotKey]?.room
        : flightMode === "edit" && selectedRoom?.fixed
          ? selectedRoom
          : null;
    const baseScheduleRoom = editBaseRoom ? normalizeScheduleRoomRows(editBaseRoom) : null;
    const selectedOnlyRows = buildScheduleRowsForFlights(selectedRowsWithHl, selectedFlights);
    const baseRows = baseScheduleRoom
      ? buildScheduleRowsForFlights(baseScheduleRoom.rows || [], normalizeFlightsInput(baseScheduleRoom.flightsInput))
      : [];
    const mergedRows = baseScheduleRoom
      ? mergeScheduleRowsByFlight(baseRows, selectedOnlyRows)
      : selectedOnlyRows;
    const mergedFlightsInput = buildScheduleFlightsInputFromRows(mergedRows);

    const baseRoom: MonitorRoom = normalizeScheduleRoomRows({
      id: baseScheduleRoom?.id || `${now.getTime()}`,
      name:
        baseScheduleRoom?.name ||
        formatScheduleCardName(baseScheduleRoom?.startDateTime || startDateTime, now),
      flightsInput: mergedFlightsInput,
      startDateTime: baseScheduleRoom?.startDateTime || startDateTime,
      endDateTime: baseScheduleRoom?.endDateTime || endDateTime,
      fixed: true,
      lastFetchedAt: new Date().toISOString(),
      rows: mergedRows,
    });

    const shouldRotate = flightMode === "query";
    const targetSlot =
      flightMode === "edit" ? selectedSlotKey || "active" : undefined;

    if (flightMode === "edit" && !targetSlot) {
      setError("수정할 Schedule Flight 카드를 먼저 선택하세요.");
      return;
    }

    setError(
      shouldRotate
        ? "Schedule Flight 활성 카드로 저장 중입니다. 기존 활성 카드는 직전 보관으로 이동합니다."
        : "선택한 Schedule Flight 카드에 저장 중입니다.",
    );

    let finalRoom = baseRoom;

    try {
      const result = await saveScheduleSlotToServer(baseRoom, {
        rotate: shouldRotate,
        slot: targetSlot,
      });
      applyScheduleSlotsState(
        {
          active: result.active,
          archive: result.archive,
          linkedSlot: result.linkedSlot,
        },
        shouldRotate ? "active" : targetSlot || "active",
      );

      finalRoom =
        (shouldRotate ? result.active?.room : result[targetSlot || "active"]?.room) || baseRoom;
      finalRoom = normalizeScheduleRoomRows(finalRoom);

      setError(
        missingFlights.length > 0
          ? `저장 완료. 조회 결과가 없는 편명은 제외했습니다: ${missingFlights.join(", ")}${
              result.rotated ? " · 직전 활성 카드는 보관 슬롯으로 이동했습니다." : ""
            }`
          : result.rotated
            ? "저장 완료 · 활성 카드 갱신 · 직전 활성은 보관 · 초기화면/AFOCS SKD 반영"
            : "저장 완료 · 선택 카드 반영 · 초기화면/AFOCS SKD 반영",
      );
    } catch (syncError) {
      const nextRooms = mergeLatestScheduleRoom(rooms, baseRoom);
      setRooms(nextRooms);
      saveRooms(nextRooms);
      setError(
        syncError instanceof Error
          ? `서버 동기화 실패. 이 기기에는 저장했습니다: ${syncError.message}`
          : "서버 동기화 실패. 이 기기에는 저장했습니다.",
      );
      finalRoom = baseRoom;
    }

    clearFlightAlertBaselineAndHistory();
    setSelectedRoomId(finalRoom.id);
    setInput(finalRoom.flightsInput);
    setRows(finalRoom.rows);
    setLastFetchedAt(finalRoom.lastFetchedAt);
    setFixed(flightMode !== "query");
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});

    if (typeof window !== "undefined") {
      window.localStorage.setItem("cargo_ops_latest_schedule_updated_at", new Date().toISOString());
    }
  };

  const handleCreateMonitor = async () => {
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      setError("Monitor 방으로 저장할 편명을 먼저 입력하세요.");
      return;
    }

    const now = new Date();
    const normalizedInput = normalizeFlightsInput(trimmedInput).join(", ");

    if (selectedRoom?.fixed) {
      const updatedScheduleRoom: MonitorRoom = normalizeScheduleRoomRows({
        ...selectedRoom,
        flightsInput: normalizedInput,
        startDateTime,
        endDateTime,
        fixed: true,
        lastFetchedAt: lastFetchedAt || new Date().toISOString(),
        rows,
      });

      const nextRooms = mergeLatestScheduleRoom(rooms, updatedScheduleRoom);
      setRooms(nextRooms);
      saveRooms(nextRooms);
      setSelectedRoomId(updatedScheduleRoom.id);
      setInput(updatedScheduleRoom.flightsInput);
      clearFlightAlertBaselineAndHistory();

      try {
        const serverRoom = await saveLatestScheduleToServer(updatedScheduleRoom);
        const finalRoom: MonitorRoom = normalizeScheduleRoomRows({
          ...updatedScheduleRoom,
          ...serverRoom,
          fixed: true,
          rows: Array.isArray(serverRoom.rows) ? serverRoom.rows : updatedScheduleRoom.rows,
          flightsInput: serverRoom.flightsInput || updatedScheduleRoom.flightsInput,
          startDateTime: serverRoom.startDateTime || updatedScheduleRoom.startDateTime,
          endDateTime: serverRoom.endDateTime || updatedScheduleRoom.endDateTime,
          lastFetchedAt: serverRoom.lastFetchedAt || updatedScheduleRoom.lastFetchedAt,
        });

        const syncedRooms = mergeLatestScheduleRoom(loadRooms(), finalRoom);
        setRooms(syncedRooms);
        saveRooms(syncedRooms);
        setSelectedRoomId(finalRoom.id);
        setInput(finalRoom.flightsInput);
        setError("현재 Schedule Flight 기준을 저장하고 초기화면 최근 Schedule Flight에 동기화했습니다.");
      } catch (syncError) {
        setError(
          syncError instanceof Error
            ? `이 기기에는 저장했습니다. 서버 Schedule Flight 동기화 실패: ${syncError.message}`
            : "이 기기에는 저장했습니다. 서버 Schedule Flight 동기화 중 오류가 발생했습니다.",
        );
      }

      return;
    }

    const newRoom: MonitorRoom = {
      id: `${now.getTime()}`,
      name: formatMonitorRoomName(now),
      flightsInput: normalizedInput,
      startDateTime,
      endDateTime,
      fixed,
      lastFetchedAt,
      rows,
    };

    const nextRooms = [newRoom, ...rooms];
    setRooms(nextRooms);
    saveRooms(nextRooms);
    setSelectedRoomId(newRoom.id);
    setInput(normalizedInput);
  };

  const handleSelectRoom = (room: MonitorRoom) => {
    setSelectedRoomId(room.id);
    setInput(room.flightsInput);
    setStartDateTime(room.startDateTime);
    setEndDateTime(room.endDateTime);
    setFixed(room.fixed);
    setLastFetchedAt(room.lastFetchedAt);
    setRows(room.rows);
    setQueryMode("manual");
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});
    setError("");
  };

  const refreshSelectedRoom = async () => {
    if (!selectedRoom) {
      setError("다시 조회할 Monitor를 먼저 선택하세요.");
      return;
    }

    await refreshRoomData(selectedRoom);
  };

  const handleDeleteRoom = async (roomId: string) => {
    const targetRoom = rooms.find((room) => room.id === roomId);
    const confirmed = window.confirm("저장된 조회를 삭제할까요?");
    if (!confirmed) return;

    const clearLatestSchedule = await shouldClearLatestScheduleForDeletedRoom(targetRoom);

    const nextRooms = rooms.filter((room) => room.id !== roomId);
    setRooms(nextRooms);
    saveRooms(nextRooms);

    if (selectedRoomId === roomId) {
      resetLookupView();
    }

    if (clearLatestSchedule && targetRoom) {
      clearFlightAlertBaselineAndHistory();

      try {
        await clearLatestScheduleOnServer(targetRoom);
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(LAST_FIXED_ROOM_KEY);
          window.localStorage.setItem("cargo_ops_latest_schedule_updated_at", new Date().toISOString());
        }
        setError("Schedule Flight 저장방을 삭제하고 서버 기준도 비웠습니다. 초기화면과 AFOCS SKD에도 반영됩니다.");
      } catch (error) {
        setError(
          error instanceof Error
            ? `저장방은 삭제했지만 서버 Schedule Flight 비우기 실패: ${error.message}`
            : "저장방은 삭제했지만 서버 Schedule Flight 비우기 중 오류가 발생했습니다.",
        );
      }
    } else {
      setError("저장된 조회를 삭제했습니다.");
    }
  };

  const handleToggleFixed = () => {
    const nextFixed = !fixed;
    setFixed(nextFixed);
    setExpandedDetailKeys({});

    if (selectedRoomId) {
      persistRoom(selectedRoomId, rows, lastFetchedAt, nextFixed);
    }
  };

  const handleToggleDetail = (rowKey: string) => {
    setExpandedDetailKeys((prev) => ({
      ...prev,
      [rowKey]: !prev[rowKey],
    }));
  };

  const openAfocsSkd = () => {
    if (!selectedRoom) {
      setError("선택된 Schedule Flight가 없습니다.");
      return;
    }

    router.push("/fixed-lite");
  };

  const handleFlightModeChange = (mode: FlightMode) => {
    setFlightMode(mode);
    setError("");

    if (mode === "home-link") {
      setFixed(false);
      setSelectedScheduleKeys({});
      setSelectedScheduleOrder([]);
      return;
    }

    if (mode === "query") {
      setFixed(false);
      setSelectedScheduleKeys({});
      setSelectedScheduleOrder([]);
      return;
    }

    const preferredSlot =
      selectedSlotKey ||
      (scheduleSlots.active ? "active" : scheduleSlots.archive ? "archive" : null);

    if (!preferredSlot) {
      setError("먼저 ① 편명 조회 및 저장에서 Schedule Flight 카드를 저장하세요.");
      return;
    }

    handleSelectSlot(preferredSlot);
  };

  const selectedRoomCounts = useMemo(
    () => (selectedRoom ? getAlertCounts(selectedRoom.rows) : null),
    [selectedRoom]
  );

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#07152b",
        color: "white",
      }}
    >
      <aside
        style={{
          width: 340,
          borderRight: "1px solid #1f2a44",
          padding: 20,
          background: "#06101f",
        }}
      >
        <h3 style={{ fontSize: 20, marginBottom: 8 }}>Schedule Flight</h3>
        <p style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.5, marginBottom: 16 }}>
          최대 2장(NOW FLT + After). 초기화면 연동은 보라색 NOW FLT 카드에서 선택합니다.
        </p>

        <ScheduleSlotCards
          slots={scheduleSlots}
          selectedSlot={selectedSlotKey}
          onSelect={handleSelectSlot}
          onDelete={(slotKey) => void handleDeleteSlot(slotKey)}
          onDeleteAll={() => void handleDeleteAllSlots()}
          onLink={(slotKey) => void handleLinkSlot(slotKey)}
          onRestore={() => void handleRestoreArchiveSlot()}
          showRestore={flightMode === "edit"}
        />
      </aside>

      <main style={{ flex: 1, padding: 40 }}>
        <FlightsModeTabs mode={flightMode} onChange={handleFlightModeChange} />

        {flightMode === "home-link" && (
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 24, margin: "0 0 8px 0" }}>④ 초기화면 선택</h2>
            <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
              NOW FLT 또는 After 카드 중 초기화면 Scheduled Flight에 연동할 카드를 선택하세요.
            </p>
            <ScheduleSlotCards
              slots={scheduleSlots}
              selectedSlot={scheduleSlots.linkedSlot}
              onSelect={(slotKey) => void handleLinkSlot(slotKey)}
              onDelete={(slotKey) => void handleDeleteSlot(slotKey)}
              onDeleteAll={() => void handleDeleteAllSlots()}
              onLink={(slotKey) => void handleLinkSlot(slotKey)}
            />
          </section>
        )}

        {flightMode === "edit" && !selectedSlotKey && (
          <div style={{ color: "#94a3b8", marginBottom: 16, fontSize: 14 }}>
            왼쪽에서 수정할 Schedule Flight 카드를 선택하세요.
          </div>
        )}

        {flightMode === "registration" && !selectedSlotKey && (
          <div style={{ color: "#94a3b8", marginBottom: 16, fontSize: 14 }}>
            왼쪽에서 등록번호/AFOCS를 수정할 Schedule Flight 카드를 선택하세요.
          </div>
        )}

        {flightMode === "edit" && selectedSlotKey && fixed ? (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 20,
              }}
            >
              <div>
                <h2 style={{ fontSize: 28, margin: 0 }}>✈️ 편명 수정</h2>
                <p style={{ color: "#9fb3c8", margin: "6px 0 0 0", fontSize: 14 }}>
                  선택한 Schedule Flight 카드의 편명을 추가·삭제합니다.
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    setFixed(false);
                    setExpandedDetailKeys({});
                  }}
                  style={{
                    padding: "10px 18px",
                    background: "#2563eb",
                    color: "white",
                    border: "none",
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 800,
                    cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
                  }}
                >
                  + 편명 추가/조회
                </button>
                <button
                  type="button"
                  onClick={openAfocsSkd}
                  style={{
                    padding: "10px 18px",
                    background: "#1e293b",
                    color: "#bfdbfe",
                    border: "1px solid rgba(96, 165, 250, 0.3)",
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  AFOCS SKD 열기
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  style={{
                    padding: "10px 18px",
                    background: "#334155",
                    color: "#f8fafc",
                    border: "none",
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  초기화면
                </button>
              </div>
            </div>
          </>
        ) : null}

        {flightMode === "registration" && selectedSlotKey && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 20,
              }}
            >
              <div>
                <h2 style={{ fontSize: 28, margin: 0 }}>✈️ 등록번호 / AFOCS 저장</h2>
                <p style={{ color: "#9fb3c8", margin: "6px 0 0 0", fontSize: 14 }}>
                  선택한 Schedule Flight 카드의 등록번호와 AFOCS SKD를 입력·저장합니다.
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={openAfocsSkd} style={homeButtonStyle}>
                  AFOCS SKD 열기
                </button>
                <button type="button" onClick={() => router.push("/")} style={homeButtonStyle}>
                  초기화면
                </button>
              </div>
            </div>
          </>
        )}

        {(flightMode === "query" || (flightMode === "edit" && !fixed)) && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 20,
              }}
            >
              <div>
                <h2 style={{ fontSize: 28, margin: 0 }}>
                  {flightMode === "query" ? "✈️ 편명 조회 및 저장" : "✈️ 편명 추가/조회"}
                </h2>
                <p style={{ color: "#9fb3c8", margin: "6px 0 0 0", fontSize: 14 }}>
                  {flightMode === "query"
                    ? "편명 또는 KJ 전체를 조회한 뒤 선택 항목을 Schedule Flight 활성 카드로 저장합니다."
                    : "추가할 편명을 조회한 뒤 선택 카드에 병합 저장합니다."}
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {flightMode === "edit" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedSlotKey) handleSelectSlot(selectedSlotKey);
                    }}
                    style={homeButtonStyle}
                  >
                    ◀ 편명 목록으로
                  </button>
                )}
                <button type="button" onClick={() => router.push("/")} style={homeButtonStyle}>
                  초기화면
                </button>
              </div>
            </div>

            <div style={queryButtonRowStyle}>
              <button
                onClick={switchToManualMode}
                style={queryMode === "manual" ? modeActiveBtn : modeBtn}
              >
                편명 직접 조회
              </button>
              <button
                onClick={switchToKjAllMode}
                style={queryMode === "kj-all" ? modeActiveBtn : modeBtn}
              >
                KJ 전체 조회
              </button>
              <button onClick={() => router.push("/")} style={homeButtonStyle}>
                초기화면
              </button>
            </div>

            {queryMode === "manual" ? (
              <>
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <input
                    value={input}
                    onChange={(e) => handleFlightsInputChange(e.target.value)}
                    onBlur={() => {
                      if (isSelectedFixedRoom && input.trim() === "") {
                        void clearSelectedScheduleFlight();
                        return;
                      }

                      void syncFixedRoomFlightsInput();
                    }}
                    placeholder="예: 247,972 또는 KJ247,KJ972"
                    style={{
                      flex: 1,
                      padding: 12,
                      background: "#111",
                      border: "1px solid #444",
                      borderRadius: 6,
                      color: "white",
                      fontSize: 16,
                    }}
                  />
                </div>

                <div style={{ marginTop: 8, color: "#9fb3c8", fontSize: 13 }}>
                  숫자 3~4자리만 입력하면 KJ를 자동으로 붙여 조회합니다.
                </div>
              </>
            ) : (
              <div style={{ marginTop: 14, color: "#93c5fd", fontSize: 14, lineHeight: 1.55 }}>
                기본 24시간 범위의 KJ 화물기를 전체 조회합니다. 시작/종료 시간은 아래에서 변경할 수 있습니다.
                <br />
                KJ 전체 조회로 전환하면 기존 편명 직접 조회 결과는 비우고 새 조회 결과만 표시합니다.
                <br />
                remark가 도착 또는 결항으로 확정된 항목은 Schedule Flight 선택 대상에서 제외됩니다.
              </div>
            )}

            {!isSelectedFixedRoom && (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "90px 180px 90px 140px",
                    gap: 12,
                    marginTop: 16,
                    alignItems: "center",
                  }}
                >
                  <label>시작일</label>
                  <input
                    type="date"
                    value={getDatePart(startDateTime)}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    style={dateInputStyle}
                  />

                  <label>시작시간</label>
                  <TimeSelect24
                    value={getTimePart(startDateTime)}
                    onChange={handleStartTimeChange}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "90px 180px 90px 140px",
                    gap: 12,
                    marginTop: 12,
                    alignItems: "center",
                  }}
                >
                  <label>종료일</label>
                  <input
                    type="date"
                    value={getDatePart(endDateTime)}
                    onChange={(e) => handleEndDateChange(e.target.value)}
                    style={dateInputStyle}
                  />

                  <label>종료시간</label>
                  <TimeSelect24
                    value={getTimePart(endDateTime)}
                    onChange={handleEndTimeChange}
                  />
                </div>

                <div style={{ marginTop: 10, color: "#9fb3c8", fontSize: 14 }}>
                  현재 조회 범위: {currentRangeText}
                </div>
              </>
            )}

            {flightMode === "edit" && isSelectedFixedRoom && (
              <div style={scheduleSaveGuideStyle}>
                선택한 Schedule Flight 카드에 병합 저장합니다. 필요 시 체크를 해제해 제외하세요.
              </div>
            )}

            {flightMode === "query" && scheduleSlots.active && (
              <div style={scheduleSaveGuideStyle}>
                저장 시 기존 <b style={{ color: "#c084fc" }}>NOW FLT</b> 카드는{" "}
                <b style={{ color: "#94a3b8" }}>After</b>로 이동합니다.
                {scheduleSlots.linkedSlot === "archive" ? (
                  <>
                    {" "}
                    현재 <b style={{ color: "#c084fc" }}>초기화면 연동</b>은 After 카드에 연결되어 있어,
                    새 저장만으로는 초기화면이 바뀌지 않습니다.
                  </>
                ) : (
                  <>
                    {" "}
                    초기화면 연동이 <b style={{ color: "#c084fc" }}>NOW FLT</b>에 연결되어 있으면 저장과
                    함께 초기화면도 갱신됩니다.
                  </>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              {queryMode === "manual" ? (
                <button onClick={() => void fetchFlights()} disabled={loading} style={primaryBtn}>
                  편명 조회
                </button>
              ) : (
                <button onClick={() => void fetchAllKjFlights()} disabled={loading} style={primaryBtn}>
                  KJ 전체 조회
                </button>
              )}

              {rows.length > 0 && (
                <>
                  <button type="button" onClick={handleSelectAllScheduleRows} style={modeBtn}>
                    전체 선택
                  </button>
                  <button type="button" onClick={handleClearAllScheduleRows} style={modeBtn}>
                    전체 해제
                  </button>
                </>
              )}

              <button
                onClick={() => void handleSaveSelectedSchedule()}
                disabled={selectedScheduleRows.length === 0}
                style={selectedScheduleRows.length > 0 ? saveScheduleBtn : disabledBtn}
              >
                {selectedScheduleRows.length > 0
                  ? flightMode === "query"
                    ? `선택 ${selectedScheduleRows.length}건 NOW FLT 저장`
                    : `선택 ${selectedScheduleRows.length}건 카드에 저장`
                  : "저장할 항공편 선택"}
              </button>
            </div>
          </>
        )}

        {lastFetchedAt && (
          <div style={{ marginTop: 6, color: "#9fb3c8", fontSize: 13 }}>
            마지막 조회 시각: {lastFetchedAt}
          </div>
        )}

        <div
          style={{
            marginTop: 18,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {alertCounts.delay > 0 && <span style={badgeOrange}>지연 {alertCounts.delay}</span>}
          {alertCounts.gateChanged > 0 && (
            <span style={badgePurple}>게이트 변경 {alertCounts.gateChanged}</span>
          )}
          {alertCounts.canceled > 0 && <span style={badgeRed}>결항 {alertCounts.canceled}</span>}
          {rows.length > 0 &&
            alertCounts.delay + alertCounts.gateChanged + alertCounts.canceled === 0 && (
              <span style={badgeNormal}>이상 없음</span>
            )}
        </div>

        {(flightMode === "query" || (flightMode === "edit" && !fixed)) && rows.length > 0 && (
          <div style={scheduleSaveStatusStyle}>
            저장 선택 {selectedScheduleRows.length}건
            <div style={scheduleSaveStatusSubStyle}>
              재조회 {refreshActiveRows.length}건 · 제외 {refreshExcludedRows.length}건
            </div>
          </div>
        )}

        {selectedRoom && flightMode !== "query" && (
          <div
            style={{
              marginTop: 20,
              padding: 18,
              background: "#0d1a30",
              border: "1px solid #2b4269",
              borderRadius: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 20,
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 360 }}>
                <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>
                  선택된 Monitor 상세
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                  {selectedRoom.name}
                </div>
                <div style={{ color: "#cbd5e1", marginBottom: 6 }}>
                  편명: {selectedRoom.flightsInput}
                </div>
                <div style={{ color: "#cbd5e1", marginBottom: 6 }}>
                  조회 범위: {startDateTime.replace("T", " ")} ~ {endDateTime.replace("T", " ")}
                </div>
                <div style={{ color: "#cbd5e1", marginBottom: 6 }}>
                  마지막 조회: {selectedRoom.lastFetchedAt || "-"}
                </div>
                <div style={{ color: selectedRoom.fixed ? "#facc15" : "#cbd5e1", marginBottom: 12 }}>
                  상태: {selectedRoom.fixed ? "Schedule Flight" : "일반"}
                </div>

                {selectedRoom.fixed && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 14,
                      background: "#0a1528",
                      border: "1px solid #28436b",
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 12, color: "#e5edf7" }}>
                      Schedule Flight 조회 기간 수정
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "90px 1fr 90px 160px",
                        gap: 10,
                        alignItems: "center",
                        marginBottom: 10,
                      }}
                    >
                      <label style={{ color: "#9fb3c8", fontSize: 13 }}>시작일</label>
                      <input
                        type="date"
                        value={getDatePart(startDateTime)}
                        onChange={(e) => handleStartDateChange(e.target.value)}
                        style={inlineDateInputStyle}
                      />

                      <label style={{ color: "#9fb3c8", fontSize: 13 }}>시작시간</label>
                      <TimeSelect24
                        value={getTimePart(startDateTime)}
                        onChange={handleStartTimeChange}
                      />
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "90px 1fr 90px 160px",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <label style={{ color: "#9fb3c8", fontSize: 13 }}>종료일</label>
                      <input
                        type="date"
                        value={getDatePart(endDateTime)}
                        onChange={(e) => handleEndDateChange(e.target.value)}
                        style={inlineDateInputStyle}
                      />

                      <label style={{ color: "#9fb3c8", fontSize: 13 }}>종료시간</label>
                      <TimeSelect24
                        value={getTimePart(endDateTime)}
                        onChange={handleEndTimeChange}
                      />
                    </div>

                    <div style={{ color: "#93c5fd", marginTop: 12, fontSize: 13 }}>
                      PC 화면은 자동조회하지 않습니다.
                    </div>
                    <div style={{ color: "#93c5fd", marginTop: 4, fontSize: 13 }}>
                      자동조회는 AFOCS SKD에서만 {REFRESH_INTERVAL_MINUTES}분마다 적용됩니다.
                    </div>
                  </div>
                )}
              </div>

              <div style={{ minWidth: 260 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>이상 현황</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                  {selectedRoomCounts && selectedRoomCounts.delay > 0 && (
                    <span style={badgeOrange}>지연 {selectedRoomCounts.delay}건</span>
                  )}
                  {selectedRoomCounts && selectedRoomCounts.gateChanged > 0 && (
                    <span style={badgePurple}>
                      게이트 변경 {selectedRoomCounts.gateChanged}건
                    </span>
                  )}
                  {selectedRoomCounts && selectedRoomCounts.canceled > 0 && (
                    <span style={badgeRed}>결항 {selectedRoomCounts.canceled}건</span>
                  )}
                  {selectedRoomCounts &&
                    selectedRoomCounts.delay +
                      selectedRoomCounts.gateChanged +
                      selectedRoomCounts.canceled ===
                      0 && <span style={badgeNormal}>이상 없음</span>}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={() => void refreshSelectedRoom()} disabled={loading} style={refreshBtn}>
                    선택된 Monitor 다시 조회
                  </button>

                  <button
                    onClick={openAfocsSkd}
                    style={afocsSkdLinkBtn}
                    title="아이폰용 AFOCS SKD 화면 열기"
                  >
                    AFOCS SKD 열기
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {loading && <p style={{ marginTop: 20 }}>조회중...</p>}
        {error && <p style={{ marginTop: 20, color: "#f87171" }}>{error}</p>}

        {flightMode === "edit" && fixed && rows.length > 0 && (
          <div style={hlInlineSaveRowStyle}>
            <button type="button" onClick={() => void handleSaveInlineHlMapping()} style={hlMappingSaveButtonStyle}>
              등록기호 저장
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteSelectedFlightsFromSchedule()}
              disabled={selectedScheduleRows.length === 0}
              style={selectedScheduleRows.length > 0 ? hlMappingDeleteButtonStyle : disabledBtn}
            >
              {selectedScheduleRows.length > 0
                ? `선택 ${selectedScheduleRows.length}건 삭제`
                : "삭제할 항공편 선택"}
            </button>
            <span style={hlInlineHelpStyle}>편명 삭제 후 저장하려면 조회 결과에서 선택하고 저장하거나, 여기서 바로 삭제할 수 있습니다.</span>
          </div>
        )}

        {flightMode === "registration" && selectedSlotKey && rows.length > 0 && (
          <>
            <div style={hlInlineSaveRowStyle}>
              <input
                ref={registrationExcelInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(event) => void handleAircraftRegistrationExcelUpload(event)}
                style={{ display: "none" }}
              />
              <button
                type="button"
                onClick={() => registrationExcelInputRef.current?.click()}
                style={hlExcelUploadButtonStyle}
              >
                등록기호 엑셀 업로드
              </button>
              <button type="button" onClick={() => void handleSaveInlineHlMapping()} style={hlMappingSaveButtonStyle}>
                등록기호 저장
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteSelectedFlightsFromSchedule()}
                disabled={selectedScheduleRows.length === 0}
                style={selectedScheduleRows.length > 0 ? hlMappingDeleteButtonStyle : disabledBtn}
              >
                {selectedScheduleRows.length > 0
                  ? `선택 ${selectedScheduleRows.length}건 삭제`
                  : "삭제할 항공편 선택"}
              </button>
              <span style={hlInlineHelpStyle}>
                엑셀 업로드 또는 표 직접 입력 가능 · 숫자만 입력해도 HL이 자동으로 붙습니다. 예) 7423 → HL7423 · 관리 {aircraftRegistrationRecords.length}건
              </span>
            </div>
            <div style={{ ...hlInlineSaveRowStyle, marginTop: 12 }}>
              <input
                ref={afocsExcelInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(event) => void handleAfocsSkdExcelUpload(event)}
                style={{ display: "none" }}
              />
              <button
                type="button"
                onClick={() => afocsExcelInputRef.current?.click()}
                style={{
                  ...hlExcelUploadButtonStyle,
                  background: "#7c3aed",
                  border: "1px solid rgba(196, 181, 253, 0.45)",
                }}
              >
                AFOCS SKD 엑셀 업로드
              </button>
              <button
                type="button"
                onClick={() => void handleSaveInlineAfocsSkd()}
                style={{
                  ...hlMappingSaveButtonStyle,
                  background: "#d97706",
                }}
              >
                AFOCS SKD 저장
              </button>
              <span style={hlInlineHelpStyle}>
                시간은 엑셀 업로드 또는 표에 직접 수동 입력 가능 · 시간 형식: HH:MM 또는 YYYY-MM-DD HH:MM
              </span>
            </div>
          </>
        )}

        {hlMappingStatus ? <div style={hlMappingStatusStyle}>{hlMappingStatus}</div> : null}

        {(flightMode === "query" || (flightMode === "edit" && !fixed)) && rows.length > 0 && (
          <div style={{ ...hlInlineSaveRowStyle, marginTop: 16 }}>
            <button type="button" onClick={() => void handleSaveInlineHlMapping()} style={hlMappingSaveButtonStyle}>
              등록기호 저장
            </button>
            <span style={hlInlineHelpStyle}>
              등록기호를 수동 입력한 뒤 저장하세요. 수정된 편명은 * 로 표시됩니다.
            </span>
          </div>
        )}

        {(flightMode === "query" || (flightMode === "edit" && !fixed)) && (
          <div style={{ marginTop: 30, overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 1200,
                background: "#081427",
                border: "1px solid #22314e",
              }}
            >
              <thead>
                <tr style={{ background: "#18263f" }}>
                  <th style={thStyle}>선택</th>
                  <th style={thStyle}>현황</th>
                  <th style={thStyle}>편명</th>
                  <th style={thStyle}>등록기호</th>
                  <th style={thStyle}>출발지코드</th>
                  <th style={thStyle}>출발지공항명</th>
                  <th style={thStyle}>도착지코드</th>
                  <th style={thStyle}>도착지공항명</th>
                  <th style={thStyle}>예정일시</th>
                  <th style={thStyle}>변경일시</th>
                  <th style={thStyle}>게이트</th>
                  <th style={thStyle}>터미널</th>
                  <th style={thStyle}>마스터 편명</th>
                  <th style={thStyle}>코드쉐어</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td style={tdStyle} colSpan={14}>
                      조회 결과가 없습니다.
                    </td>
                  </tr>
                )}
                {rows.map((r, i) => {
                  const selectionKey = getSelectionKey(r, i);
                  const finalCompleted = isFinalCompletedRow(r);
                  const selected = Boolean(selectedScheduleKeys[selectionKey]);

                  return (
                    <tr
                      key={getRowKey(r, i)}
                      style={{
                        borderBottom: "1px solid #2b4269",
                        background: getRowBackground(r),
                        opacity: finalCompleted ? 0.72 : 1,
                      }}
                    >
                      <td style={tdStyle}>
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            cursor: finalCompleted ? "not-allowed" : "pointer",
                          }}
                          title={finalCompleted ? `${getRefreshExcludeReason(r)}으로 API 재조회 제외` : "Schedule Flight 추가 선택"}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={finalCompleted}
                            onChange={() => handleToggleScheduleSelection(r, i)}
                          />
                        </label>
                        {finalCompleted && (
                          <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 4 }}>
                            조회 제외
                            <br />
                            {getRefreshExcludeReason(r)}
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          color: getStatusColor(r),
                          fontWeight: 700,
                        }}
                      >
                        {getComputedStatus(r)}
                      </td>
                      <td style={{ ...tdStyle, color: getFlightNoColor(r.departureCode, r.arrivalCode) }}>
                        {formatFlightDisplayWithMarker(r, hlInlineDrafts)}
                      </td>
                      <td style={tdStyle}>
                        <input
                          value={getEditableHlValue(r, hlNumberMap, hlInlineDrafts)}
                          onChange={(event) =>
                            handleHlInlineDraftChange(getFlightKeyFromRow(r), event.target.value.toUpperCase())
                          }
                          placeholder="7423"
                          style={hlInlineInputStyle}
                        />
                      </td>
                      <td style={tdStyle}>{r.departureCode || "-"}</td>
                      <td style={tdStyle}>{r.departureName || "-"}</td>
                      <td style={tdStyle}>{r.arrivalCode || "-"}</td>
                      <td style={tdStyle}>{r.arrivalName || "-"}</td>
                      <td style={tdStyle}>{r.formattedScheduleTime || "-"}</td>
                      <td style={tdStyle}>{r.formattedEstimatedTime || "-"}</td>
                      <td style={tdStyle}>{r.gatenumber || "-"}</td>
                      <td style={tdStyle}>{r.terminalid || "-"}</td>
                      <td style={tdStyle}>{r.masterflightid || "-"}</td>
                      <td style={tdStyle}>{r.codeshare || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {(flightMode === "edit" || flightMode === "registration") && fixed && (
          <FixedResultsTable
            rows={rows}
            expandedKeys={expandedDetailKeys}
            selectedKeys={selectedScheduleKeys}
            hlNumberMap={hlNumberMap}
            hlDrafts={hlInlineDrafts}
            onHlDraftChange={handleHlInlineDraftChange}
            afocsSkdDrafts={afocsSkdInlineDrafts}
            onAfocsSkdDraftChange={handleAfocsSkdInlineDraftChange}
            onToggleDetail={handleToggleDetail}
            onToggleSelect={handleToggleScheduleSelection}
          />
        )}

        {!loading && !error && rows.length === 0 && (
          <div style={{ marginTop: 30, color: "#9fb3c8" }}>
            조회 결과가 없습니다.
          </div>
        )}
      </main>
    </div>
  );
}

const queryButtonRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 20,
  flexWrap: "nowrap",
  alignItems: "center",
  overflowX: "auto",
  paddingBottom: 2,
};

const homeButtonStyle: CSSProperties = {
  padding: "10px 14px",
  background: "#0f172a",
  color: "#dbeafe",
  border: "1px solid rgba(147, 197, 253, 0.34)",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 800,
};

const thStyle: CSSProperties = {
  borderBottom: "1px solid #334155",
  padding: "12px 10px",
  textAlign: "left",
  fontSize: 14,
  color: "#e2e8f0",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  borderBottom: "1px solid #1f2937",
  padding: "12px 10px",
  fontSize: 14,
  verticalAlign: "top",
  whiteSpace: "nowrap",
};


const hlInlineSaveRowStyle: CSSProperties = {
  marginTop: 16,
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const hlInlineHelpStyle: CSSProperties = {
  color: "#9fb3c8",
  fontSize: 13,
  fontWeight: 700,
};

const hlExcelUploadButtonStyle: CSSProperties = {
  color: "#dbeafe",
  background: "#1e3a8a",
  border: "1px solid rgba(147, 197, 253, 0.45)",
  borderRadius: 10,
  padding: "12px 16px",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
};

const hlInlineInputStyle: CSSProperties = {
  width: 96,
  minHeight: 34,
  padding: "7px 9px",
  borderRadius: 8,
  border: "1px solid rgba(96, 165, 250, 0.45)",
  background: "#020617",
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 800,
  outline: "none",
};

const detailThStyle: CSSProperties = {
  borderBottom: "1px solid #334155",
  padding: "10px 12px",
  textAlign: "left",
  fontSize: 13,
  color: "#e2e8f0",
  whiteSpace: "nowrap",
};

const detailTdStyle: CSSProperties = {
  borderBottom: "1px solid #22314e",
  padding: "10px 12px",
  fontSize: 13,
  color: "#e5edf7",
};

const detailTdLabelStyle: CSSProperties = {
  ...detailTdStyle,
  width: 180,
  color: "#a7b7ce",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const dateInputStyle: CSSProperties = {
  padding: "10px 12px",
  background: "#111",
  border: "1px solid #444",
  borderRadius: 6,
  color: "white",
  fontSize: 14,
};

const inlineDateInputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "#111",
  border: "1px solid #444",
  borderRadius: 6,
  color: "white",
  fontSize: 14,
};

const selectInputStyle: CSSProperties = {
  padding: "10px 12px",
  background: "#111",
  border: "1px solid #444",
  borderRadius: 6,
  color: "white",
  fontSize: 14,
  minWidth: 78,
};







const hlMappingButtonStyle: CSSProperties = {
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid rgba(147, 197, 253, 0.34)",
  background: "#1d4ed8",
  color: "#ffffff",
  fontWeight: 850,
  cursor: "pointer",
};


const hlMappingSaveButtonStyle: CSSProperties = {
  ...hlMappingButtonStyle,
  background: "#16a34a",
  border: "none",
};

const hlMappingDeleteButtonStyle: CSSProperties = {
  ...hlMappingButtonStyle,
  background: "#dc2626",
  border: "none",
};




const hlMappingStatusStyle: CSSProperties = {
  marginTop: 10,
  color: "#bbf7d0",
  fontSize: 13,
  fontWeight: 800,
};

const scheduleSaveGuideStyle: CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(250, 204, 21, 0.28)",
  background: "rgba(250, 204, 21, 0.08)",
  color: "#fde68a",
  fontSize: 13,
  lineHeight: 1.5,
};

const scheduleSaveStatusStyle: CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #22314e",
  background: "#081427",
  color: "#e5edf7",
  fontSize: 14,
  fontWeight: 800,
};

const scheduleSaveStatusSubStyle: CSSProperties = {
  marginTop: 4,
  color: "#93c5fd",
  fontSize: 13,
  fontWeight: 700,
};

const modeBtn: CSSProperties = {
  padding: "10px 14px",
  background: "#111827",
  color: "#cbd5e1",
  border: "1px solid #334155",
  borderRadius: 9999,
  cursor: "pointer",
  fontWeight: 800,
};

const modeActiveBtn: CSSProperties = {
  ...modeBtn,
  background: "#1d4ed8",
  color: "white",
  border: "1px solid #60a5fa",
};

const saveScheduleBtn: CSSProperties = {
  padding: "10px 18px",
  background: "#16a34a",
  color: "white",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 800,
};

const disabledBtn: CSSProperties = {
  padding: "10px 18px",
  background: "#334155",
  color: "#94a3b8",
  border: "none",
  borderRadius: 6,
  cursor: "not-allowed",
  fontWeight: 700,
};

const primaryBtn: CSSProperties = {
  padding: "10px 18px",
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 700,
};

const fixedOnBtn: CSSProperties = {
  padding: "10px 18px",
  background: "#facc15",
  color: "#111827",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 800,
};

const fixedOffBtn: CSSProperties = {
  padding: "10px 18px",
  background: "#334155",
  color: "white",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 700,
};

const refreshBtn: CSSProperties = {
  flex: 1,
  minWidth: 180,
  padding: "10px 12px",
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 700,
};

const afocsSkdLinkBtn: CSSProperties = {
  flex: 1,
  minWidth: 160,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 12px",
  background: "#0f766e",
  color: "white",
  borderRadius: 6,
  fontWeight: 700,
  border: "none",
  cursor: "pointer",
};

const badgeBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "4px 8px",
  borderRadius: 9999,
  fontSize: 12,
  fontWeight: 700,
};

const badgeOrange: CSSProperties = {
  ...badgeBase,
  background: "rgba(245, 158, 11, 0.18)",
  color: "#fbbf24",
};

const badgePurple: CSSProperties = {
  ...badgeBase,
  background: "rgba(168, 85, 247, 0.18)",
  color: "#c084fc",
};

const badgeRed: CSSProperties = {
  ...badgeBase,
  background: "rgba(239, 68, 68, 0.18)",
  color: "#f87171",
};

const badgeNormal: CSSProperties = {
  ...badgeBase,
  background: "rgba(148, 163, 184, 0.16)",
  color: "#cbd5e1",
};


const clearScheduleButtonStyle: React.CSSProperties = {
  minHeight: 48,
  padding: "0 14px",
  border: "1px solid rgba(248, 113, 113, 0.45)",
  borderRadius: 8,
  background: "rgba(127, 29, 29, 0.35)",
  color: "#fecaca",
  fontSize: 14,
  fontWeight: 900,
  cursor: "pointer",
};

function getFlightNoColor(dep?: string, arr?: string): string {
  const d = String(dep || "").trim().toUpperCase();
  const a = String(arr || "").trim().toUpperCase();
  if (d === "ICN" || d === "RKSI") {
    return "#ef4444"; // 빨간색 (인천출발)
  }
  if (a === "ICN" || a === "RKSI") {
    return "#3b82f6"; // 파란색 (인천도착)
  }
  return "#e2e8f0"; // 기본 색상 (회백색)
}
