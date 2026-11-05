/**
 * Schedule Flight(방) 로컬 저장·서버 동기화 — 홈 / 편명조회 / AFOCS SKD가 모두 이 모듈을 사용합니다.
 */
import { fillEmptyAfocsSkdOnRows, seedEmptyAfocsSkdFromSchedule } from "./afocs-skd";
import { BACKEND_URL } from "./api-config";
import {
  applyRegistrationToRows,
  loadAircraftRegistrationRecords,
} from "./aircraft-registration";
import { getFlightNo, normalizeFlightKey, normalizeFlightsInput } from "./flight-keys";
import type { AircraftRegistrationRecord, FlightRow, MonitorRoom } from "./flight-types";

export const SCHEDULE_ROOMS_STORAGE_KEY = "cargo_ops_monitor_rooms_v6";

/** 편명이 하나라도 있거나 조회된 행이 있으면 사용 중인 스케줄 */
export function isActiveScheduleRoom(room?: MonitorRoom | null) {
  if (!room) return false;
  const flightsInput = String(room.flightsInput || "").trim();
  const rows = Array.isArray(room.rows) ? room.rows : [];
  return Boolean(flightsInput || rows.length > 0);
}

/** 고정(fixed)된 스케줄이 비어 있으면 목록에서 제외 */
export function removeEmptyScheduleRooms(rooms: MonitorRoom[]) {
  return rooms.filter((room) => !room.fixed || isActiveScheduleRoom(room));
}

export function loadRooms(): MonitorRoom[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(SCHEDULE_ROOMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? removeEmptyScheduleRooms(parsed) : [];
  } catch {
    return [];
  }
}

export function saveRooms(rooms: MonitorRoom[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SCHEDULE_ROOMS_STORAGE_KEY, JSON.stringify(rooms));
}

/** 서버 기준 최신 스케줄(고정 방)을 로컬 목록의 맨 앞에 둡니다. */
export function mergeLatestScheduleRoom(rooms: MonitorRoom[], latestRoom: MonitorRoom | null) {
  const localRooms = removeEmptyScheduleRooms(rooms).filter((room) => !room.fixed);
  if (!isActiveScheduleRoom(latestRoom)) return localRooms;
  return [latestRoom as MonitorRoom, ...localRooms];
}

export function removeFlightFromScheduleRoom(room: MonitorRoom, targetFlight: string): MonitorRoom {
  const targetKey = normalizeFlightKey(targetFlight);
  const nextFlights = normalizeFlightsInput(room.flightsInput).filter(
    (flight) => normalizeFlightKey(flight) !== targetKey,
  );
  const nextRows = (room.rows || []).filter((row) => normalizeFlightKey(getFlightNo(row)) !== targetKey);

  return {
    ...room,
    flightsInput: nextFlights.join(", "),
    rows: nextRows,
    lastFetchedAt: new Date().toISOString(),
  };
}

export function buildRowsByFlight(rows: FlightRow[]) {
  const rowsByFlight = new Map<string, FlightRow>();
  rows.forEach((row) => {
    const flight = normalizeFlightKey(getFlightNo(row));
    if (!flight) return;
    rowsByFlight.set(flight, row);
  });
  return rowsByFlight;
}

export function buildScheduleRowsForFlights(rows: FlightRow[], flights: string[]) {
  const rowsByFlight = buildRowsByFlight(rows);
  return flights
    .map((flight) => rowsByFlight.get(normalizeFlightKey(flight)))
    .filter((row): row is FlightRow => Boolean(row));
}

/** 편명 목록(flightsInput)과 행을 일치시킵니다. 목록이 비어 있으면 행으로 편을 되살리지 않습니다 (편 삭제 유지). */
export function normalizeScheduleRoomRows(room: MonitorRoom): MonitorRoom {
  const sourceRows = Array.isArray(room.rows) ? room.rows : [];
  const rowsByFlight = buildRowsByFlight(sourceRows);
  const requestedFlights = normalizeFlightsInput(room.flightsInput);

  const finalFlights =
    requestedFlights.length > 0
      ? requestedFlights.filter((flight) => rowsByFlight.has(normalizeFlightKey(flight)))
      : [];

  return {
    ...room,
    flightsInput: finalFlights.join(", "),
    rows: buildScheduleRowsForFlights(sourceRows, finalFlights),
  };
}

/**
 * 들어온 스케줄(서버·슬롯)에 이전 스케줄(로컬)의 AFOCS·등록번호를 합칩니다.
 * 등록번호 우선순위는 aircraft-registration.ts의 규칙을 따릅니다.
 */
export function mergeScheduleRegistrationIntoRoom(
  incomingRoom: MonitorRoom | null,
  previousRoom: MonitorRoom | null,
  registrationRecords?: AircraftRegistrationRecord[],
) {
  if (!incomingRoom) return incomingRoom;

  // 서버/슬롯에 있는 AFOCS는 유지합니다. 로컬은 빈 칸만 채웁니다.
  // 그래도 비어 있으면 변경(스케줄) 시각으로 채웁니다.
  const rowsWithManualAfocs = seedEmptyAfocsSkdFromSchedule(
    fillEmptyAfocsSkdOnRows(incomingRoom.rows || [], previousRoom?.rows),
  );

  const nextRows = applyRegistrationToRows(
    rowsWithManualAfocs,
    registrationRecords || loadAircraftRegistrationRecords(),
    previousRoom?.rows,
  );

  return {
    ...incomingRoom,
    rows: nextRows,
  };
}

/** 서버에 최신 스케줄 저장. 저장 전 편명 목록과 행을 맞추고, 돌려받은 방에는 등록번호를 다시 합칩니다. */
export async function saveLatestScheduleToServer(room: MonitorRoom) {
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
    throw new Error(json.detail || json.message || "Schedule Flight 서버 저장 실패");
  }

  return mergeScheduleRegistrationIntoRoom(
    normalizeScheduleRoomRows((json.room || roomToSave) as MonitorRoom),
    roomToSave,
  ) as MonitorRoom;
}

/** 서버의 최신 스케줄을 읽고, 로컬 고정 방의 등록번호·AFOCS를 합칩니다. */
export async function loadLatestScheduleFromServer() {
  const res = await fetch(`${BACKEND_URL}/flights/latest-schedule`, {
    cache: "no-store",
  });

  const json = await res.json();

  if (!res.ok || json.success === false) {
    throw new Error(json.detail || json.message || "Schedule Flight 서버 조회 실패");
  }

  const room = (json.room || null) as MonitorRoom | null;
  const localLatestRoom =
    loadRooms().find((candidate) => candidate.fixed && isActiveScheduleRoom(candidate)) || null;

  return isActiveScheduleRoom(room) ? mergeScheduleRegistrationIntoRoom(room, localLatestRoom) : null;
}
