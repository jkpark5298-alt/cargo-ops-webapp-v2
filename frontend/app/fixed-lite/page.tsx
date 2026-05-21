"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://cargo-ops-backend.onrender.com";

const STORAGE_KEY = "cargo_ops_monitor_rooms_v6";
const AIRCRAFT_REGISTRATION_STORAGE_KEY = "cargo_ops_aircraft_registration_records_v1";

const LAST_FIXED_ROOM_KEY = "last_fixed_room_id";

const DEFAULT_REFRESH_MINUTES = 30;
const FOCUS_REFRESH_MINUTES = 5;
const COMPLETED_EXCLUDE_BUFFER_MINUTES = 10;

type FlightRow = {
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
  aircraftRegNo?: string;
  registrationNo?: string;
  hlnbr?: string;
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

type WidgetSummaryItem = {
  flight: string;
  status: string;
  departureCode: string;
  arrivalCode: string;
  displayTime: string;
  gate: string;
  registrationNo?: string;
  excludeReason?: string;
};

type WidgetSummaryResponse = {
  success: boolean;
  roomId: string;
  roomName: string;
  updatedAt: string;
  refreshIntervalMinutes: number;
  items: WidgetSummaryItem[];
};

function loadRooms(): MonitorRoom[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? removeEmptyScheduleRooms(parsed) : [];
  } catch {
    return [];
  }
}

function saveRooms(rooms: MonitorRoom[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
}

function isActiveScheduleRoom(room?: MonitorRoom | null) {
  if (!room) return false;
  const flightsInput = String(room.flightsInput || "").trim();
  const rows = Array.isArray(room.rows) ? room.rows : [];
  return Boolean(flightsInput || rows.length > 0);
}

function removeEmptyScheduleRooms(rooms: MonitorRoom[]) {
  return rooms.filter((room) => !room.fixed || isActiveScheduleRoom(room));
}

function mergeLatestScheduleRoom(rooms: MonitorRoom[], latestRoom: MonitorRoom | null) {
  const localRooms = removeEmptyScheduleRooms(rooms).filter((room) => !room.fixed);
  if (!isActiveScheduleRoom(latestRoom)) return localRooms;
  return [latestRoom as MonitorRoom, ...localRooms];
}


function getFlightNo(row?: FlightRow) {
  if (!row) return "";
  return row.flightId || row.flightNo || "";
}

function getRegistrationNo(row?: FlightRow) {
  const maybeRow = row as
    | {
        hlnbr?: string;
        registrationNo?: string;
        aircraftRegNo?: string;
        fid?: string;
      }
    | undefined;

  const hlnbr =
    maybeRow?.hlnbr ||
    maybeRow?.registrationNo ||
    maybeRow?.aircraftRegNo ||
    "";

  if (/^HL\d{3,5}$/i.test(hlnbr)) return hlnbr.toUpperCase();

  const fid = maybeRow?.fid || "";
  if (/^HL\d{3,5}$/i.test(fid)) return fid.toUpperCase();

  return "";
}

function normalizeAircraftRegistrationDate(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (/^\d{4}\.\d{2}\.\d{2}/.test(raw)) return raw.slice(0, 10).replace(/\./g, "-");
  if (/^\d{4}\/\d{2}\/\d{2}/.test(raw)) return raw.slice(0, 10).replace(/\//g, "-");
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return raw;
}

function getAircraftRegistrationDateFromRow(row: FlightRow) {
  return normalizeAircraftRegistrationDate(
    row.scheduleDateTime || row.formattedScheduleTime || row.estimatedDateTime || row.formattedEstimatedTime || "",
  );
}

function buildAircraftRegistrationKey(date: string, flight: string, departureCode = "", arrivalCode = "") {
  return [
    normalizeAircraftRegistrationDate(date),
    String(flight || "").replace(/\s+/g, "").toUpperCase(),
    String(departureCode || "").replace(/\s+/g, "").toUpperCase(),
    String(arrivalCode || "").replace(/\s+/g, "").toUpperCase(),
  ].join("|");
}

function buildAircraftRegistrationFlightDateKey(date: string, flight: string) {
  return [normalizeAircraftRegistrationDate(date), String(flight || "").replace(/\s+/g, "").toUpperCase()].join("|");
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

function addAircraftRegistrationRecordsToMap(map: Map<string, string>, records: AircraftRegistrationRecord[]) {
  records.forEach((record) => {
    if (!record.date || !record.flight || !record.registrationNo) return;
    map.set(buildAircraftRegistrationKey(record.date, record.flight, record.departureCode, record.arrivalCode), record.registrationNo);
    const fallbackKey = buildAircraftRegistrationFlightDateKey(record.date, record.flight);
    if (!map.has(fallbackKey)) map.set(fallbackKey, record.registrationNo);
  });
}

function getScheduleRegistrationKey(row?: FlightRow) {
  if (!row) return "";
  return [
    getFlightNo(row).replace(/\s+/g, "").toUpperCase(),
    row.scheduleDateTime || row.formattedScheduleTime || "",
    row.departureCode || "",
    row.arrivalCode || "",
  ].join("|");
}

function buildScheduleRegistrationMap(rows?: FlightRow[]) {
  const map = new Map<string, string>();
  if (!Array.isArray(rows)) return map;

  rows.forEach((row) => {
    const registrationNo = getRegistrationNo(row);
    if (!registrationNo) return;

    const fullKey = getScheduleRegistrationKey(row);
    if (fullKey) map.set(fullKey, registrationNo);

    const flightKey = getFlightNo(row).replace(/\s+/g, "").toUpperCase();
    if (flightKey && !map.has(flightKey)) map.set(flightKey, registrationNo);
  });

  return map;
}

function applyRegistrationMapToRows(rows: FlightRow[], registrationMap: Map<string, string>) {
  return rows.map((row) => {
    const existing = getRegistrationNo(row);
    const fullKey = getScheduleRegistrationKey(row);
    const flightKey = getFlightNo(row).replace(/\s+/g, "").toUpperCase();
    const dateKey = getAircraftRegistrationDateFromRow(row);
    const aircraftExactKey = buildAircraftRegistrationKey(
      dateKey,
      getFlightNo(row),
      row.departureCode,
      row.arrivalCode,
    );
    const aircraftFallbackKey = buildAircraftRegistrationFlightDateKey(dateKey, getFlightNo(row));
    const mapped =
      registrationMap.get(aircraftExactKey) ||
      registrationMap.get(aircraftFallbackKey) ||
      registrationMap.get(fullKey) ||
      registrationMap.get(flightKey) ||
      existing;

    return mapped
      ? {
          ...row,
          hlnbr: mapped,
          registrationNo: mapped,
          aircraftRegNo: mapped,
        }
      : row;
  });
}

function mergeScheduleRegistrationIntoRoom(
  incomingRoom: MonitorRoom | null,
  previousRoom: MonitorRoom | null,
) {
  if (!incomingRoom) return incomingRoom;

  const registrationMap = buildScheduleRegistrationMap(previousRoom?.rows);
  addAircraftRegistrationRecordsToMap(registrationMap, loadAircraftRegistrationRecords());
  const nextRows = applyRegistrationMapToRows(incomingRoom.rows || [], registrationMap);

  return {
    ...incomingRoom,
    rows: nextRows,
  };
}

async function loadLatestScheduleFromServer() {
  const res = await fetch(`${BACKEND_URL}/flights/latest-schedule`, {
    cache: "no-store",
  });
  const json = await res.json();

  if (!res.ok || json.success === false) {
    throw new Error(json.detail || json.message || "Schedule Flight 동기화 실패");
  }

  const room = (json.room || null) as MonitorRoom | null;
  const localLatestRoom = loadRooms().find((candidate) => candidate.fixed && isActiveScheduleRoom(candidate)) || null;
  return isActiveScheduleRoom(room) ? mergeScheduleRegistrationIntoRoom(room, localLatestRoom) : null;
}

async function saveLatestScheduleToServer(room: MonitorRoom) {
  const res = await fetch(`${BACKEND_URL}/flights/latest-schedule`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ room }),
  });
  const json = await res.json();

  if (!res.ok || json.success === false) {
    throw new Error(json.detail || json.message || "Schedule Flight 서버 저장 실패");
  }

  return mergeScheduleRegistrationIntoRoom((json.room || room) as MonitorRoom, room) as MonitorRoom;
}


function normalizeFlightsInput(rawInput: string) {
  return rawInput
    .split(/[\s,\n,]+/)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
    .map((value) => {
      if (/^\d{3,4}$/.test(value)) return `KJ${value}`;
      return value;
    });
}

function parseDateTime(value?: string | null): Date | null {
  if (!value || value === "-") return null;

  const raw = value.trim().replace(/\./g, "-").replace(/\//g, "-").replace("T", " ");

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const fullMatch = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/
  );

  if (fullMatch) {
    const [, y, m, d, hh, mm, ss] = fullMatch;
    return new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss || "0")
    );
  }

  const monthDayMatch = raw.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);

  if (monthDayMatch) {
    const now = new Date();
    const [, m, d, hh, mm] = monthDayMatch;
    return new Date(
      now.getFullYear(),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm)
    );
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12) {
    return new Date(
      Number(digits.slice(0, 4)),
      Number(digits.slice(4, 6)) - 1,
      Number(digits.slice(6, 8)),
      Number(digits.slice(8, 10)),
      Number(digits.slice(10, 12))
    );
  }

  return null;
}

function normalizeFlightKey(value: string) {
  return value.replace(/\s+/g, "").toUpperCase();
}

function getFlightKeyFromRow(row: FlightRow) {
  return normalizeFlightKey(row.flightId || row.flightNo || "");
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

function getFlightOrderIndex(flightsInput: string, flight: string) {
  const order = flightsInput
    .split(",")
    .map((value) => normalizeFlightKey(value.trim()))
    .filter(Boolean);

  const index = order.indexOf(normalizeFlightKey(flight));
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function getFlightTimeFromRow(row: FlightRow): Date | null {
  return (
    parseDateTime(row.formattedEstimatedTime) ||
    parseDateTime(row.estimatedDateTime) ||
    parseDateTime(row.formattedScheduleTime) ||
    parseDateTime(row.scheduleDateTime)
  );
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

  return "-";
}

function getRefreshExcludeReasonFromRow(row: FlightRow) {
  const remarkStatus = String(row.remark || "").toUpperCase();

  if (row.canceled || remarkStatus.includes("결항") || remarkStatus.includes("CANCEL")) {
    return "결항 확정";
  }

  if (remarkStatus.includes("도착") || remarkStatus.includes("ARRIVED")) {
    return "도착 확정";
  }

  return "";
}

function isFinalCompletedStatus(status: string) {
  return status === "도착" || status === "결항";
}

function getLatestRowsByFlight(rows: FlightRow[]) {
  const map = new Map<string, { row: FlightRow; time: number }>();

  for (const row of rows) {
    const flight = row.flightId || row.flightNo || "";
    if (!flight) continue;

    const dt = getFlightTimeFromRow(row);
    const time = dt ? dt.getTime() : -1;

    const prev = map.get(flight);
    if (!prev || time >= prev.time) {
      map.set(flight, { row, time });
    }
  }

  return map;
}

function getCompletedFlightSetFromRows(rows: FlightRow[]) {
  const completed = new Set<string>();
  const latestMap = getLatestRowsByFlight(rows);
  const now = Date.now();
  const bufferMs = COMPLETED_EXCLUDE_BUFFER_MINUTES * 60 * 1000;

  latestMap.forEach(({ row }, flight) => {
    const reason = getRefreshExcludeReasonFromRow(row);
    if (reason) completed.add(flight);
  });

  return completed;
}

function getRefreshExcludeReasonMapFromRows(rows: FlightRow[]) {
  const reasonMap = new Map<string, string>();
  const latestMap = getLatestRowsByFlight(rows);

  latestMap.forEach(({ row }, flight) => {
    const reason = getRefreshExcludeReasonFromRow(row);
    if (reason) reasonMap.set(flight, reason);
  });

  return reasonMap;
}

function statusColor(status: string) {
  if (status === "출발") return "#ef4444";
  if (status === "도착") return "#3b82f6";
  if (status.includes("지연")) return "#f59e0b";
  if (status === "게이트 변경") return "#a855f7";
  if (status === "결항") return "#94a3b8";
  return "#e5e7eb";
}

function roomButtonStyle(active: boolean): CSSProperties {
  return {
    border: active ? "1px solid #60a5fa" : "1px solid #24354f",
    background: active ? "#0e203d" : "#0a1528",
    color: "white",
    borderRadius: 12,
    padding: "10px 12px",
    cursor: "pointer",
    textAlign: "left",
    minWidth: 0,
  };
}

function formatMonthDayTime(value?: string | null) {
  if (!value) return "-";

  const parsed = parseDateTime(value);

  if (parsed) {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(parsed);
  }

  return value;
}

function formatDisplayItemFromRow(flight: string, row: FlightRow): WidgetSummaryItem {
  return {
    flight,
    status: getComputedStatus(row),
    departureCode: row.departureCode || "-",
    arrivalCode: row.arrivalCode || "-",
    displayTime:
      formatMonthDayTime(
        row.formattedEstimatedTime ||
          row.estimatedDateTime ||
          row.formattedScheduleTime ||
          row.scheduleDateTime ||
          "-"
      ) || "-",
    gate: row.gatenumber || "-",
    registrationNo: getRegistrationNo(row),
  };
}

function formatFallbackDisplayItem(flight: string): WidgetSummaryItem {
  return {
    flight,
    status: "-",
    departureCode: "-",
    arrivalCode: "-",
    displayTime: "-",
    gate: "-",
    registrationNo: "",
  };
}

function getItemDirection(item: WidgetSummaryItem) {
  const dep = (item.departureCode || "").toUpperCase();
  const arr = (item.arrivalCode || "").toUpperCase();

  if (dep === "ICN") return "departure";
  if (arr === "ICN") return "arrival";
  return "unknown";
}

function isItemInFocusWindow(item: WidgetSummaryItem) {
  const dt = parseDateTime(item.displayTime);
  if (!dt) return false;

  const now = Date.now();
  const t = dt.getTime();
  const direction = getItemDirection(item);

  if (direction === "departure") {
    const start = t - 30 * 60 * 1000;
    const end = t + 60 * 60 * 1000;
    return now >= start && now <= end;
  }

  if (direction === "arrival") {
    const start = t - 60 * 60 * 1000;
    const end = t + 30 * 60 * 1000;
    return now >= start && now <= end;
  }

  return false;
}

function getNextRefreshMinutes(activeItems: WidgetSummaryItem[]) {
  if (activeItems.length === 0) return null;

  const hasFocusItem = activeItems.some((item) => isItemInFocusWindow(item));

  return hasFocusItem ? FOCUS_REFRESH_MINUTES : DEFAULT_REFRESH_MINUTES;
}

export default function FixedLitePage() {
  const [rooms, setRooms] = useState<MonitorRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [summary, setSummary] = useState<WidgetSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverSyncLoading, setServerSyncLoading] = useState(true);
  const [error, setError] = useState("");
  const [nextRefreshAt, setNextRefreshAt] = useState<Date | null>(null);
  const [currentIntervalMinutes, setCurrentIntervalMinutes] = useState<number | null>(null);
  const [completedFlightsByRoom, setCompletedFlightsByRoom] = useState<Record<string, string[]>>({});
  const [lastKnownItemsByRoom, setLastKnownItemsByRoom] = useState<
    Record<string, WidgetSummaryItem[]>
  >({});

  const timerRef = useRef<number | null>(null);

  const fixedRooms = useMemo(
    () => rooms.filter((room) => room.fixed && isActiveScheduleRoom(room)),
    [rooms],
  );

  const selectedRoom = useMemo(
    () => fixedRooms.find((room) => room.id === selectedRoomId) || null,
    [fixedRooms, selectedRoomId]
  );

  const displayItemsForSelectedRoom = useMemo(() => {
    if (!selectedRoom) return [];

    const requested = normalizeFlightsInput(selectedRoom.flightsInput);
    const latestRowMap = getLatestRowsByFlight(selectedRoom.rows);
    const reasonMap = getRefreshExcludeReasonMapFromRows(selectedRoom.rows || []);
    const knownItemsMap = new Map(
      (lastKnownItemsByRoom[selectedRoom.id] || []).map((item) => [item.flight, item])
    );

    return requested.map((flight) => {
      const known = knownItemsMap.get(flight);
      const excludeReason = reasonMap.get(flight);
      const latestRow = latestRowMap.get(flight)?.row;
      if (known) {
        const registrationNo = latestRow ? getRegistrationNo(latestRow) : known.registrationNo || "";
        return { ...known, registrationNo, excludeReason };
      }

      if (latestRow) return { ...formatDisplayItemFromRow(flight, latestRow), excludeReason };

      return { ...formatFallbackDisplayItem(flight), excludeReason };
    });
  }, [selectedRoom, lastKnownItemsByRoom]);

  const activeItemsForSelectedRoom = useMemo(() => {
    if (!selectedRoom) return [];

    const completedFromRows = getCompletedFlightSetFromRows(selectedRoom.rows);
    const completedFromSummary = new Set(completedFlightsByRoom[selectedRoom.id] || []);

    return displayItemsForSelectedRoom.filter((item) => {
      if (completedFromRows.has(item.flight)) return false;
      if (completedFromSummary.has(item.flight)) return false;
      if (isFinalCompletedStatus(item.status)) return false;
      return true;
    });
  }, [selectedRoom, displayItemsForSelectedRoom, completedFlightsByRoom]);

  const handleDeleteFlightFromSchedule = async (flight: string) => {
    if (!selectedRoom) return;

    const targetFlight = normalizeFlightKey(flight);
    if (!targetFlight) return;

    const confirmed = window.confirm(`${targetFlight} 편명을 Schedule Flight에서 삭제할까요?`);
    if (!confirmed) return;

    const updatedRoom = removeFlightFromScheduleRoom(selectedRoom, targetFlight);
    const hasRemaining = isActiveScheduleRoom(updatedRoom);
    const nextRooms = hasRemaining
      ? mergeLatestScheduleRoom(rooms, updatedRoom)
      : removeEmptyScheduleRooms(rooms.map((room) => (room.id === selectedRoom.id ? updatedRoom : room)));

    setRooms(nextRooms);
    saveRooms(nextRooms);
    setSummary(null);
    setCompletedFlightsByRoom((prev) => {
      const next = { ...prev };
      delete next[selectedRoom.id];
      return next;
    });
    setLastKnownItemsByRoom((prev) => {
      const next = { ...prev };
      delete next[selectedRoom.id];
      return next;
    });

    if (hasRemaining) {
      setSelectedRoomId(updatedRoom.id);
      localStorage.setItem(LAST_FIXED_ROOM_KEY, updatedRoom.id);
    } else {
      setSelectedRoomId("");
      localStorage.removeItem(LAST_FIXED_ROOM_KEY);
    }

    try {
      await saveLatestScheduleToServer(updatedRoom);
      setError(
        hasRemaining
          ? `${targetFlight} 삭제 완료. 초기화면과 편명조회에도 반영됩니다.`
          : `${targetFlight} 삭제 완료. 남은 편명이 없어 Schedule Flight를 비웠습니다.`,
      );
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? `${targetFlight} 로컬 삭제 완료. 서버 동기화 실패: ${syncError.message}`
          : `${targetFlight} 로컬 삭제 완료. 서버 동기화 중 오류가 발생했습니다.`,
      );
    }
  };

  const backToFlightsHref = selectedRoomId
    ? `/flights?roomId=${encodeURIComponent(selectedRoomId)}`
    : "/flights";

  function clearTimer() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function scheduleNext(room: MonitorRoom, activeItems: WidgetSummaryItem[]) {
    clearTimer();

    const nextMinutes = getNextRefreshMinutes(activeItems);

    if (!nextMinutes) {
      setCurrentIntervalMinutes(null);
      setNextRefreshAt(null);
      return;
    }

    setCurrentIntervalMinutes(nextMinutes);
    setNextRefreshAt(new Date(Date.now() + nextMinutes * 60 * 1000));

    timerRef.current = window.setTimeout(() => {
      void fetchSummary(room);
    }, nextMinutes * 60 * 1000);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const selectTargetRoom = (nextRooms: MonitorRoom[]) => {
      const fixedOnly = nextRooms.filter((room) => room.fixed);
      const params = new URLSearchParams(window.location.search);
      const roomIdFromQuery = params.get("roomId") || "";
      const lastRoomId = localStorage.getItem(LAST_FIXED_ROOM_KEY);

      let target: MonitorRoom | undefined;

      if (roomIdFromQuery) {
        target = fixedOnly.find((room) => room.id === roomIdFromQuery);
      }

      if (!target && lastRoomId) {
        target = fixedOnly.find((room) => room.id === lastRoomId);
      }

      if (!target && fixedOnly.length > 0) {
        target = fixedOnly[0];
      }

      if (target) {
        setSelectedRoomId(target.id);
        localStorage.setItem(LAST_FIXED_ROOM_KEY, target.id);
      }
    };

    const savedRooms = loadRooms().map((room) =>
      room.fixed ? (mergeScheduleRegistrationIntoRoom(room, room) as MonitorRoom) : room,
    );
    setRooms([]);
    setSelectedRoomId("");
    setServerSyncLoading(true);

    void loadLatestScheduleFromServer()
      .then((serverRoom) => {
        const nextRooms = mergeLatestScheduleRoom(savedRooms, serverRoom);
        setRooms(nextRooms);
        saveRooms(nextRooms);

        if (serverRoom) {
          setSelectedRoomId(serverRoom.id);
          localStorage.setItem(LAST_FIXED_ROOM_KEY, serverRoom.id);
          return;
        }

        localStorage.removeItem(LAST_FIXED_ROOM_KEY);
        selectTargetRoom(nextRooms);
      })
      .catch(() => {
        // 서버 동기화 실패 시 로컬 Schedule Flight를 그대로 사용합니다.
        setRooms(savedRooms);
        selectTargetRoom(savedRooms);
      })
      .finally(() => {
        setServerSyncLoading(false);
      });
  }, []);

  useEffect(() => {
    clearTimer();

    if (!selectedRoom || (!selectedRoom.flightsInput.trim() && (selectedRoom.rows || []).length === 0)) {
      setSummary(null);
      setNextRefreshAt(null);
      setCurrentIntervalMinutes(null);
      return;
    }

    void fetchSummary(selectedRoom);

    return () => clearTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoomId]);

  async function fetchSummary(room: MonitorRoom) {
    const requestedFlights = normalizeFlightsInput(room.flightsInput);

    if (requestedFlights.length === 0) {
      setError("조회할 편명이 없습니다.");
      setSummary(null);
      scheduleNext(room, []);
      return;
    }

    const completedSet = getCompletedFlightSetFromRows(room.rows || []);
    const activeFlights = requestedFlights.filter((flight) => !completedSet.has(flight));

    setLoading(true);
    setError("");

    try {
      let nextRows: FlightRow[] = room.rows || [];
      let refreshIntervalMinutes = DEFAULT_REFRESH_MINUTES;

      if (activeFlights.length > 0) {
        const res = await fetch(`${BACKEND_URL}/flights/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            flights: activeFlights,
            start: room.startDateTime,
            end: room.endDateTime,
          }),
        });

        const json = (await res.json()) as {
          success?: boolean;
          data?: FlightRow[];
          message?: string;
          detail?: string;
          refreshIntervalMinutes?: number;
        };

        if (!res.ok || json.success === false) {
          throw new Error(json.message || json.detail || `요약 조회에 실패했습니다. (${res.status})`);
        }

        refreshIntervalMinutes = json.refreshIntervalMinutes || DEFAULT_REFRESH_MINUTES;
        const refreshedRows = Array.isArray(json.data) ? json.data : [];
        const refreshedFlightSet = new Set(
          refreshedRows
            .map((row) => row.flightId || row.flightNo || "")
            .filter(Boolean)
        );
        const rowsToKeep = (room.rows || []).filter((row) => {
          const flight = row.flightId || row.flightNo || "";
          return Boolean(flight) && !refreshedFlightSet.has(flight);
        });
        nextRows = [...rowsToKeep, ...refreshedRows];
      }

      const registrationMap = buildScheduleRegistrationMap(room.rows || []);
      addAircraftRegistrationRecordsToMap(registrationMap, loadAircraftRegistrationRecords());
      nextRows = applyRegistrationMapToRows(nextRows, registrationMap);

      const latestRowMap = getLatestRowsByFlight(nextRows);
      const excludeReasonMap = getRefreshExcludeReasonMapFromRows(nextRows);
      const nextItems = requestedFlights.map((flight) => {
        const latestRow = latestRowMap.get(flight)?.row;
        const excludeReason = excludeReasonMap.get(flight);
        if (latestRow) return { ...formatDisplayItemFromRow(flight, latestRow), excludeReason };
        return { ...formatFallbackDisplayItem(flight), excludeReason };
      });

      const fetchedAt = new Date().toLocaleString("ko-KR");
      const updatedRoom: MonitorRoom = {
        ...room,
        rows: nextRows,
        lastFetchedAt: fetchedAt,
      };

      setRooms((prevRooms) => {
        const nextRooms = prevRooms.map((prevRoom) =>
          prevRoom.id === updatedRoom.id ? updatedRoom : prevRoom
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRooms));
        return nextRooms;
      });

      try {
        const serverRoom = await saveLatestScheduleToServer(updatedRoom);
        const syncedRoom: MonitorRoom = {
          ...updatedRoom,
          ...serverRoom,
          fixed: true,
          rows: Array.isArray(serverRoom.rows) ? serverRoom.rows : updatedRoom.rows,
          flightsInput: serverRoom.flightsInput || updatedRoom.flightsInput,
          startDateTime: serverRoom.startDateTime || updatedRoom.startDateTime,
          endDateTime: serverRoom.endDateTime || updatedRoom.endDateTime,
          lastFetchedAt: serverRoom.lastFetchedAt || updatedRoom.lastFetchedAt,
        };
        const syncedRooms = mergeLatestScheduleRoom(loadRooms(), syncedRoom);
        setRooms(syncedRooms);
        saveRooms(syncedRooms);
        setSelectedRoomId(syncedRoom.id);
        localStorage.setItem(LAST_FIXED_ROOM_KEY, syncedRoom.id);
      } catch (syncError) {
        console.warn("Schedule Flight 알림 비교 또는 서버 기준 저장 실패", syncError);
      }

      setLastKnownItemsByRoom((prev) => ({
        ...prev,
        [room.id]: nextItems,
      }));

      const newlyCompleted = nextItems
        .filter((item) => isFinalCompletedStatus(item.status))
        .map((item) => item.flight);

      setCompletedFlightsByRoom((prev) => ({
        ...prev,
        [room.id]: newlyCompleted,
      }));

      const nextSummary: WidgetSummaryResponse = {
        success: true,
        roomId: room.id,
        roomName: room.name,
        updatedAt: new Date().toISOString(),
        refreshIntervalMinutes,
        items: nextItems,
      };

      setSummary(nextSummary);

      const nextActiveItems = nextItems.filter(
        (item) => !isFinalCompletedStatus(item.status)
      );

      scheduleNext(updatedRoom, nextActiveItems);
    } catch (e: any) {
      setError(e.message || "요약 조회에 실패했습니다.");
      setSummary(null);
      scheduleNext(room, displayItemsForSelectedRoom);
    } finally {
      setLoading(false);
    }
  }

  function formatNextRefresh(date: Date | null) {
    if (!date) return "-";

    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#07152b",
        color: "white",
        padding: "16px 14px 28px",
        fontFamily:
          "Inter, Apple SD Gothic Neo, SF Pro Display, Segoe UI, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 560,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <section style={sectionStyle}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              marginBottom: 6,
              letterSpacing: -0.3,
            }}
          >
            Schedule Lite
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <button
              onClick={() => {
                window.location.href = "/";
              }}
              style={homeButtonStyle}
            >
              초기화면으로
            </button>
            <button
              onClick={() => {
                window.location.href = backToFlightsHref;
              }}
              style={homeButtonStyle}
            >
              편명조회로
            </button>
          </div>

          <div style={{ color: "#b8c7db", fontSize: 13, lineHeight: 1.5 }}>
            기본 30분 자동조회입니다.
            <br />
            remark가 도착 또는 결항일 때만 자동조회에서 제외합니다. 출발, 착륙, 지연, 게이트 변경은 계속 조회합니다.
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>
            Schedule Flight 선택
          </div>

          {serverSyncLoading ? (
            <div style={{ color: "#b8c7db", fontSize: 14 }}>
              최근 Schedule Flight 기준을 동기화 중입니다.
            </div>
          ) : fixedRooms.length === 0 ? (
            <div style={{ color: "#b8c7db", fontSize: 14 }}>
              저장된 Schedule Flight가 없습니다.
              <br />
              먼저 편명 조회 화면에서 Schedule Flight를 선택 저장해 주세요.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 10,
              }}
            >
              {fixedRooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => {
                    setSelectedRoomId(room.id);
                    localStorage.setItem(LAST_FIXED_ROOM_KEY, room.id);
                  }}
                  style={roomButtonStyle(room.id === selectedRoomId)}
                >
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      marginBottom: 4,
                    }}
                  >
                    {room.name}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#b8c7db",
                      wordBreak: "break-all",
                    }}
                  >
                    {room.flightsInput}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {selectedRoom && (
          <>
            <section style={sectionStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  marginBottom: 14,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>
                    {selectedRoom.name}
                  </div>
                  <div style={{ color: "#b8c7db", fontSize: 12, marginTop: 4 }}>
                    마지막 저장 조회: {selectedRoom.lastFetchedAt || "-"}
                  </div>
                  <div style={{ color: "#92a7c5", fontSize: 12, marginTop: 6 }}>
                    표시 대상: {displayItemsForSelectedRoom.length}개
                  </div>
                  <div style={{ color: "#92a7c5", fontSize: 12, marginTop: 2 }}>
                    자동조회 대상: {activeItemsForSelectedRoom.length}개
                  </div>
                  <div style={{ color: "#92a7c5", fontSize: 12, marginTop: 2 }}>
                    현재 자동조회 주기:{" "}
                    {currentIntervalMinutes ? `${currentIntervalMinutes}분` : "-"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={() => void fetchSummary(selectedRoom)}
                    disabled={loading}
                    style={actionBtnStyle}
                  >
                    {loading ? "조회중..." : "다시 조회"}
                  </button>

                  <button
                    onClick={() => {
                      window.location.href = backToFlightsHref;
                    }}
                    style={backBtnStyle}
                  >
                    편명조회로 돌아가기
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <div style={infoCardStyle}>
                  <div style={infoLabelStyle}>위젯 대체 갱신 시각</div>
                  <div style={infoValueStyle}>
                    {summary?.updatedAt
                      ? formatMonthDayTime(summary.updatedAt)
                      : "-"}
                  </div>
                </div>

                <div style={infoCardStyle}>
                  <div style={infoLabelStyle}>다음 자동 새로고침</div>
                  <div style={infoValueStyle}>{formatNextRefresh(nextRefreshAt)}</div>
                </div>
              </div>
            </section>

            <section style={sectionStyle}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  marginBottom: 12,
                }}
              >
                핵심 요약
              </div>

              {error && (
                <div
                  style={{
                    marginBottom: 12,
                    color: "#fca5a5",
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  {error}
                </div>
              )}

              {!error && !summary && loading && (
                <div style={{ color: "#b8c7db", fontSize: 14 }}>조회중...</div>
              )}

              {!error && displayItemsForSelectedRoom.length === 0 && (
                <div style={{ color: "#b8c7db", fontSize: 14 }}>
                  표시할 편명이 없습니다.
                </div>
              )}

              {displayItemsForSelectedRoom.map((item) => {
                const completed = isFinalCompletedStatus(item.status);
                const focused = !completed && isItemInFocusWindow(item);

                return (
                  <div
                    key={`${item.flight}-${item.departureCode}-${item.arrivalCode}-${item.displayTime}-${item.gate}`}
                    style={{
                      background: "#091326",
                      border: focused ? "1px solid #fbbf24" : "1px solid #1f2c43",
                      borderRadius: 14,
                      padding: 14,
                      marginBottom: 10,
                      opacity: completed ? 0.88 : 1,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 900,
                          letterSpacing: -0.2,
                        }}
                      >
                        {item.flight}
                        {item.registrationNo ? (
                          <span
                            style={{
                              marginLeft: 8,
                              color: "#bfdbfe",
                              fontSize: 15,
                              fontWeight: 900,
                            }}
                          >
                            {item.registrationNo}
                          </span>
                        ) : null}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          flexWrap: "wrap",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => void handleDeleteFlightFromSchedule(item.flight)}
                          title={`${item.flight} Schedule Flight에서 삭제`}
                          style={deleteFlightBtnStyle}
                        >
                          -
                        </button>

                        {focused && (
                          <span style={focusBadgeStyle}>집중조회</span>
                        )}

                        {completed && (
                          <span style={completedBadgeStyle}>
                            자동조회 제외{item.excludeReason ? ` · ${item.excludeReason}` : ""}
                          </span>
                        )}

                        <div
                          style={{
                            color: statusColor(item.status),
                            background: `${statusColor(item.status)}22`,
                            border: `1px solid ${statusColor(item.status)}55`,
                            borderRadius: 999,
                            padding: "5px 10px",
                            fontSize: 12,
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.status}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 8,
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          letterSpacing: 0.2,
                        }}
                      >
                        {item.departureCode} → {item.arrivalCode}
                      </div>

                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {item.displayTime}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div style={{ color: "#92a7c5", fontSize: 12 }}>
                        주기장 / 게이트
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: "white",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {item.gate || "-"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

const homeButtonStyle: CSSProperties = {
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid rgba(147, 197, 253, 0.34)",
  background: "#0f172a",
  color: "#dbeafe",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

const sectionStyle: CSSProperties = {
  background: "#0a1528",
  border: "1px solid #22314e",
  borderRadius: 16,
  padding: 16,
};

const actionBtnStyle: CSSProperties = {
  border: "none",
  background: "#2563eb",
  color: "white",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
  minWidth: 96,
};

const backBtnStyle: CSSProperties = {
  border: "none",
  background: "#0f766e",
  color: "white",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
  minWidth: 150,
};

const infoCardStyle: CSSProperties = {
  background: "#091326",
  border: "1px solid #1f2c43",
  borderRadius: 12,
  padding: 12,
};

const infoLabelStyle: CSSProperties = {
  color: "#92a7c5",
  fontSize: 11,
  marginBottom: 4,
};

const infoValueStyle: CSSProperties = {
  fontWeight: 800,
  fontSize: 15,
};

const focusBadgeStyle: CSSProperties = {
  color: "#fbbf24",
  background: "#fbbf2422",
  border: "1px solid #fbbf2455",
  borderRadius: 999,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const completedBadgeStyle: CSSProperties = {
  color: "#93c5fd",
  background: "#93c5fd22",
  border: "1px solid #93c5fd55",
  borderRadius: 999,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};


const deleteFlightBtnStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 999,
  border: "1px solid rgba(248, 113, 113, 0.65)",
  background: "rgba(127, 29, 29, 0.72)",
  color: "#fecaca",
  fontSize: 20,
  fontWeight: 900,
  lineHeight: 1,
  cursor: "pointer",
};
