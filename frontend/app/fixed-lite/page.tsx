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

type ImageSlotKey = "daily-schedule" | "aircraft-check" | "inspection-result" | "issue";

type SavedImage = {
  id: string;
  type: ImageSlotKey;
  label: string;
  savedAt: string;
  capturedAt?: string;
  locationText?: string;
  memo?: string;
  dataUrl: string;
};

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
  afocsSkd?: string;
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
  afocsSkd?: string;
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
    row.scheduleDateTime || row.formattedScheduleTime || row.estimatedDateTime || row.formattedEstimatedTime || "",
  );
}

function buildAircraftRegistrationKey(date: string, flight: string, departureCode = "", arrivalCode = "") {
  return [
    normalizeAircraftRegistrationDate(date),
    normalizeFlightKey(flight),
    String(departureCode || "").replace(/\s+/g, "").toUpperCase(),
    String(arrivalCode || "").replace(/\s+/g, "").toUpperCase(),
  ].join("|");
}

function buildAircraftRegistrationFlightDateKey(date: string, flight: string) {
  return [normalizeAircraftRegistrationDate(date), normalizeFlightKey(flight)].join("|");
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
    afocsSkd: row.afocsSkd || "",
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
    afocsSkd: "",
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

  // Weather states & logic
  const [weather, setWeather] = useState<any>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const fetchWeather = async () => {
    setWeatherLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/weather/current`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setWeather(json);
    } catch (err) {
      console.error("Mobile weather fetch error:", err);
    } finally {
      setWeatherLoading(false);
    }
  };

  // Daily report states & logic
  const [dailyStatus, setDailyStatus] = useState<"normal" | "issue">("normal");
  const [author, setAuthor] = useState("");
  const [note, setNote] = useState("");
  const [images, setImages] = useState<SavedImage[]>([]);
  const [dailyWorkDate, setDailyWorkDate] = useState(() => {
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return now.toISOString().split("T")[0];
  });
  const [isDailySyncing, setIsDailySyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const lastSavedValuesRef = useRef({
    status: dailyStatus,
    author,
    note,
    imagesJson: JSON.stringify(images),
    workDate: dailyWorkDate,
  });

  const [manualOrder, setManualOrder] = useState<string[]>([]);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [startY, setStartY] = useState<number>(0);

  const loadDailyReportFromSupabase = async (dateStr: string) => {
    setIsDailySyncing(true);
    try {
      const query = new URLSearchParams({ workDate: dateStr });
      const response = await fetch(`${BACKEND_URL}/flights/daily-report-text?${query.toString()}`, { cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (response.ok && json?.success && json.report) {
        setDailyStatus(json.report.status === "issue" ? "issue" : "normal");
        setAuthor(json.report.author || "");
        setNote(json.report.note || "");
        setImages(Array.isArray(json.report.images) ? json.report.images : []);

        lastSavedValuesRef.current = {
          status: json.report.status === "issue" ? "issue" : "normal",
          author: json.report.author || "",
          note: json.report.note || "",
          imagesJson: JSON.stringify(Array.isArray(json.report.images) ? json.report.images : []),
          workDate: dateStr,
        };

        setSyncMessage("동기화 완료");
      } else {
        setSyncMessage("저장된 일일 보고 없음");
        lastSavedValuesRef.current = {
          status: dailyStatus,
          author: author,
          note: note,
          imagesJson: JSON.stringify(images),
          workDate: dateStr,
        };
      }
    } catch (e) {
      setSyncMessage("동기화 실패");
    } finally {
      setIsDailySyncing(false);
    }
  };

  const saveDailyReportToSupabase = async (statusOverride?: "normal" | "issue", imagesOverride?: SavedImage[]) => {
    setIsDailySyncing(true);
    setSyncMessage("저장 중...");
    const targetStatus = statusOverride || dailyStatus;
    const targetImages = imagesOverride || images;
    try {
      const response = await fetch(`${BACKEND_URL}/flights/daily-report-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workDate: dailyWorkDate,
          status: targetStatus,
          author: author || "현장 모바일",
          note,
          images: targetImages,
          savedAt: new Date().toISOString(),
        }),
      });
      const json = await response.json().catch(() => null);
      if (response.ok && json?.success) {
        setSyncMessage("저장 완료");
        if (json.report) {
          const report = json.report;
          setDailyStatus(report.status === "issue" ? "issue" : "normal");
          setAuthor(report.author || "");
          setNote(report.note || "");
          setImages(Array.isArray(report.images) ? report.images : []);

          lastSavedValuesRef.current = {
            status: report.status === "issue" ? "issue" : "normal",
            author: report.author || "",
            note: report.note || "",
            imagesJson: JSON.stringify(Array.isArray(report.images) ? report.images : []),
            workDate: dailyWorkDate,
          };
        }
      } else {
        setSyncMessage("저장 실패");
      }
    } catch (e) {
      setSyncMessage("저장 에러");
    } finally {
      setIsDailySyncing(false);
    }
  };

  // 1.5초 디바운스 자동 저장 효과
  useEffect(() => {
    const currentImagesJson = JSON.stringify(images);
    const hasChanged =
      dailyStatus !== lastSavedValuesRef.current.status ||
      author !== lastSavedValuesRef.current.author ||
      note !== lastSavedValuesRef.current.note ||
      currentImagesJson !== lastSavedValuesRef.current.imagesJson ||
      dailyWorkDate !== lastSavedValuesRef.current.workDate;

    if (!hasChanged) return;

    const timer = setTimeout(() => {
      // update ref immediately to prevent multiple triggers
      lastSavedValuesRef.current = {
        status: dailyStatus,
        author,
        note,
        imagesJson: currentImagesJson,
        workDate: dailyWorkDate,
      };

      void saveDailyReportToSupabase();
    }, 1500);

    return () => clearTimeout(timer);
  }, [dailyStatus, author, note, images, dailyWorkDate]);

  function resizeImageDataUrl(dataUrl: string, maxSize = 1280, quality = 0.72): Promise<string> {
    if (!dataUrl.startsWith("data:image/")) return Promise.resolve(dataUrl);
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        try {
          const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) { resolve(dataUrl); return; }
          context.drawImage(image, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch {
          resolve(dataUrl);
        }
      };
      image.onerror = () => resolve(dataUrl);
      image.src = dataUrl;
    });
  }

  const handleCameraUpload = async (flightNo: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSyncMessage("사진 처리 중...");

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawDataUrl = event.target?.result as string;
      if (!rawDataUrl) return;

      try {
        const compressedUrl = await resizeImageDataUrl(rawDataUrl);

        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        const capturedTime = `${hh}:${mm}`;

        const newImage: SavedImage = {
          id: "img_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
          type: "issue",
          label: `[${flightNo}] 화물 적재 / 주기장 상황`,
          savedAt: now.toISOString(),
          capturedAt: capturedTime,
          dataUrl: compressedUrl,
        };

        const nextImages = [newImage, ...images].slice(0, 20);
        setImages(nextImages);
        setDailyStatus("issue");

        await saveDailyReportToSupabase("issue", nextImages);
        alert(`${flightNo} 화물 사진이 특이사항 이미지로 PC 대시보드에 업로드되었습니다!`);
      } catch (err) {
        console.error(err);
        alert("사진 업로드 중 오류가 발생했습니다.");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateAfocsSkd = async (flight: string, val: string) => {
    if (!selectedRoom) return;

    const flightKey = normalizeFlightKey(flight);

    const updatedRows = (selectedRoom.rows || []).map((row) => {
      const rowFlightKey = normalizeFlightKey(row.flightId || row.flightNo || "");
      if (rowFlightKey === flightKey) {
        return { ...row, afocsSkd: val };
      }
      return row;
    });

    const exists = (selectedRoom.rows || []).some(
      (row) => normalizeFlightKey(row.flightId || row.flightNo || "") === flightKey
    );

    let finalRows = updatedRows;
    if (!exists) {
      const newDummyRow: FlightRow = {
        flightId: flight,
        flightNo: flight,
        afocsSkd: val,
      };
      finalRows = [...updatedRows, newDummyRow];
    }

    const updatedRoom = {
      ...selectedRoom,
      rows: finalRows,
    };

    const nextRooms = rooms.map((room) => (room.id === selectedRoom.id ? updatedRoom : room));
    setRooms(nextRooms);
    saveRooms(nextRooms);

    try {
      await saveLatestScheduleToServer(updatedRoom);
    } catch (err) {
      console.error("Failed to sync updated AFOCS SKD to server:", err);
    }
  };

  useEffect(() => {
    void fetchWeather();
    void loadDailyReportFromSupabase(dailyWorkDate);

    const weatherTimer = setInterval(() => {
      void fetchWeather();
    }, 60000);

    const syncTimer = setInterval(() => {
      const isUserTyping =
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "INPUT";
      if (!isUserTyping) {
        void loadDailyReportFromSupabase(dailyWorkDate);
      }
    }, 15000);

    return () => {
      clearInterval(weatherTimer);
      clearInterval(syncTimer);
    };
  }, [dailyWorkDate]);

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
        const afocsSkd = latestRow?.afocsSkd || known.afocsSkd || "";
        return { ...known, registrationNo, afocsSkd, excludeReason };
      }

      if (latestRow) return { ...formatDisplayItemFromRow(flight, latestRow), excludeReason };

      return { ...formatFallbackDisplayItem(flight), excludeReason };
    });
  }, [selectedRoom, lastKnownItemsByRoom]);

  const orderStorageKey = useMemo(
    () => getScheduleFlightOrderStorageKey(selectedRoom),
    [selectedRoom]
  );

  useEffect(() => {
    setManualOrder(loadScheduleFlightOrder(orderStorageKey));
  }, [orderStorageKey]);

  const orderedDisplayItems = useMemo(
    () => applyScheduleFlightOrder(displayItemsForSelectedRoom, manualOrder),
    [displayItemsForSelectedRoom, manualOrder]
  );

  const startDrag = (e: React.PointerEvent<HTMLDivElement>, index: number) => {
    if (e.button !== 0) return; // Only left-click/touch
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingIndex(index);
    setStartY(e.clientY);
  };

  const onDragMove = (e: React.PointerEvent<HTMLDivElement>, index: number) => {
    if (draggingIndex === null || draggingIndex !== index) return;
    const deltaY = e.clientY - startY;
    const threshold = 40; // Swap items if dragged past 40px

    if (deltaY > threshold) {
      const nextIndex = draggingIndex + 1;
      if (nextIndex < orderedDisplayItems.length) {
        const nextOrder = [...orderedDisplayItems.map((item) => normalizeSummaryFlightKey(item.flight))];
        const [moved] = nextOrder.splice(draggingIndex, 1);
        nextOrder.splice(nextIndex, 0, moved);
        setManualOrder(nextOrder);
        saveScheduleFlightOrder(orderStorageKey, nextOrder);
        setDraggingIndex(nextIndex);
        setStartY(e.clientY);
      }
    } else if (deltaY < -threshold) {
      const prevIndex = draggingIndex - 1;
      if (prevIndex >= 0) {
        const nextOrder = [...orderedDisplayItems.map((item) => normalizeSummaryFlightKey(item.flight))];
        const [moved] = nextOrder.splice(draggingIndex, 1);
        nextOrder.splice(prevIndex, 0, moved);
        setManualOrder(nextOrder);
        saveScheduleFlightOrder(orderStorageKey, nextOrder);
        setDraggingIndex(prevIndex);
        setStartY(e.clientY);
      }
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDraggingIndex(null);
  };

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
        {/* 활주로 실시간 기상 (METAR) 위젯 */}
        {weather && (
          <div
            style={{
              background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
              border: "1px solid rgba(147, 197, 253, 0.25)",
              borderRadius: 18,
              padding: 16,
              boxShadow: "0 8px 30px rgba(0, 0, 0, 0.4)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
                borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                paddingBottom: 8,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 900, color: "#93c5fd", letterSpacing: -0.3 }}>
                ✈️ 활주로 실시간 기상 (METAR)
              </span>
              <button
                onClick={fetchWeather}
                disabled={weatherLoading}
                style={{
                  background: "rgba(59, 130, 246, 0.2)",
                  border: "1px solid rgba(59, 130, 246, 0.4)",
                  color: "#60a5fa",
                  borderRadius: 8,
                  padding: "4px 8px",
                  fontSize: 12,
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                {weatherLoading ? "조회중" : "🔄 갱신"}
              </button>
            </div>

            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{ textAlign: "center", minWidth: 90 }}>
                <div style={{ fontSize: 44, lineHeight: 1 }}>{weather.icon || "☀️"}</div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6, letterSpacing: -0.5 }}>
                  {weather.temperature || "-"}°C
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2, fontWeight: 800 }}>
                  {weather.condition || "-"}
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  fontSize: 12,
                }}
              >
                <div style={{ background: "rgba(255, 255, 255, 0.03)", borderRadius: 10, padding: 8 }}>
                  <div style={{ color: "#94a3b8", fontSize: 10, marginBottom: 2 }}>💨 풍향 / 풍속</div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "white" }}>
                    {weather.windDirectionText || "-"} {weather.windSpeed ? `${weather.windSpeed}m/s` : "-"}
                    {weather.windGust ? (
                      <span style={{ color: "#f87171", display: "block", fontSize: 10, marginTop: 2 }}>
                        ⚠️ 돌풍 {weather.windGust}m/s
                      </span>
                    ) : null}
                  </div>
                </div>

                <div style={{ background: "rgba(255, 255, 255, 0.03)", borderRadius: 10, padding: 8 }}>
                  <div style={{ color: "#94a3b8", fontSize: 10, marginBottom: 2 }}>👁️ 활주로 시정</div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "white" }}>
                    {weather.visibility || "-"}
                  </div>
                </div>

                <div style={{ background: "rgba(255, 255, 255, 0.03)", borderRadius: 10, padding: 8 }}>
                  <div style={{ color: "#94a3b8", fontSize: 10, marginBottom: 2 }}>💧 상대 습도</div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "white" }}>
                    {weather.humidity ? `${weather.humidity}%` : "-"}
                  </div>
                </div>

                <div style={{ background: "rgba(255, 255, 255, 0.03)", borderRadius: 10, padding: 8 }}>
                  <div style={{ color: "#94a3b8", fontSize: 10, marginBottom: 2 }}>☔ 강수 상태</div>
                  <div style={{ fontWeight: 800, fontSize: 12, color: "white" }}>
                    {weather.condition && (weather.condition.includes("비") || weather.condition.includes("눈") || weather.condition.includes("소나기") || weather.condition.includes("이슬비")) 
                      ? "강수 감지" 
                      : "강수 없음"}
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                fontSize: 10,
                color: "#64748b",
                textAlign: "right",
                marginTop: 10,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              인천공항(RKSI) {weather.baseTime || "-"} 기준 · {weather.source === "metar" ? "실시간 METAR" : "KMA 초단기실황"}
            </div>
          </div>
        )}

        <section style={sectionStyle}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              marginBottom: 6,
              letterSpacing: -0.3,
            }}
          >
            AFOCS SKD
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

              {!error && orderedDisplayItems.length === 0 && (
                <div style={{ color: "#b8c7db", fontSize: 14 }}>
                  표시할 편명이 없습니다.
                </div>
              )}

              {orderedDisplayItems.map((item, index) => {
                const completed = isFinalCompletedStatus(item.status);
                const focused = !completed && isItemInFocusWindow(item);

                return (
                  <div
                    key={`${item.flight}-${item.departureCode}-${item.arrivalCode}-${item.displayTime}-${item.gate}`}
                    style={{
                      background: "#091326",
                      border: focused ? "1px solid #fbbf24" : (draggingIndex === index ? "1px solid #3b82f6" : "1px solid #1f2c43"),
                      borderRadius: 14,
                      padding: 14,
                      marginBottom: 10,
                      opacity: completed ? 0.88 : (draggingIndex === index ? 0.72 : 1),
                      transform: draggingIndex === index ? "scale(1.02)" : "scale(1)",
                      boxShadow: draggingIndex === index ? "0 8px 24px rgba(0, 0, 0, 0.55)" : "none",
                      transition: "transform 0.15s ease, background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
                      zIndex: draggingIndex === index ? 10 : 1,
                      position: "relative",
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
                          color: getFlightNoColor(item.departureCode, item.arrivalCode),
                        }}
                      >
                        {item.flight}
                        {item.gate && item.gate !== "-" ? (
                          <span
                            style={{
                              marginLeft: 8,
                              color: "#bfdbfe",
                              fontSize: 15,
                              fontWeight: 900,
                              background: "rgba(191, 219, 254, 0.12)",
                              padding: "2px 6px",
                              borderRadius: 6,
                              border: "1px solid rgba(191, 219, 254, 0.24)",
                              display: "inline-block",
                            }}
                          >
                            {item.gate}
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
                        {/* Drag Handle */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 34,
                            height: 34,
                            borderRadius: 8,
                            background: draggingIndex === index ? "rgba(59, 130, 246, 0.25)" : "rgba(148, 163, 184, 0.08)",
                            border: draggingIndex === index ? "1px solid #3b82f6" : "1px solid rgba(148, 163, 184, 0.16)",
                            cursor: draggingIndex === index ? "grabbing" : "grab",
                            touchAction: "none",
                            userSelect: "none",
                          }}
                          onPointerDown={(e) => startDrag(e, index)}
                          onPointerMove={(e) => onDragMove(e, index)}
                          onPointerUp={endDrag}
                          onPointerCancel={endDrag}
                          title={`${item.flight} 드래그하여 순서 이동`}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={draggingIndex === index ? "#60a5fa" : "#94a3b8"} strokeWidth="2.5" strokeLinecap="round">
                            <line x1="4" y1="8" x2="20" y2="8" />
                            <line x1="4" y1="16" x2="20" y2="16" />
                          </svg>
                        </div>

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
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span style={{ fontSize: 11, color: "#92a7c5", fontWeight: "bold" }}>
                          AFOCS SKD:
                        </span>
                        <input
                          type="text"
                          value={item.afocsSkd || ""}
                          placeholder={item.displayTime && item.displayTime !== "-" ? item.displayTime.split(" ").slice(-1)[0] : "시간 입력"}
                          onChange={(e) => void handleUpdateAfocsSkd(item.flight, e.target.value)}
                          style={{
                            width: 85,
                            background: "#091326",
                            border: "1px solid #3b82f6",
                            color: "#fcd34d",
                            fontWeight: "extrabold",
                            padding: "4px 6px",
                            borderRadius: 8,
                            fontSize: 13,
                            textAlign: "center",
                            fontFamily: "monospace",
                          }}
                        />
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
                        등록 번호
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: "white",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {item.registrationNo || "-"}
                      </div>
                    </div>

                    {/* 현장 사진 업로드 연동 */}
                    <div
                      style={{
                        borderTop: "1px dashed rgba(255, 255, 255, 0.1)",
                        marginTop: 10,
                        paddingTop: 10,
                        display: "flex",
                        justifyContent: "flex-end",
                      }}
                    >
                      <label
                        style={{
                          background: "#0284c7",
                          color: "white",
                          borderRadius: 8,
                          padding: "6px 12px",
                          fontSize: 12,
                          fontWeight: "bold",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
                        }}
                      >
                        📸 사진 촬영/업로드
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => void handleCameraUpload(item.flight, e)}
                          style={{ display: "none" }}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </section>
          </>
        )}

        {/* 모바일 일일 업무 보고 및 메모 작성 섹션 */}
        <section style={sectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#60a5fa" }}>📝 당일 업무 메모 및 보고</div>
            <span style={{ fontSize: 11, color: isDailySyncing ? "#f59e0b" : "#b8c7db" }}>
              {syncMessage || (isDailySyncing ? "동기화 중..." : "동기화 대기")}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 4 }}>작성자</label>
              <input
                type="text"
                placeholder="이름 또는 부서 입력"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                style={{
                  width: "100%",
                  background: "#091326",
                  border: "1px solid #1f2c43",
                  color: "white",
                  padding: "8px 12px",
                  borderRadius: 10,
                  fontSize: 14,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 4 }}>업무 상태</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    setDailyStatus("normal");
                    void saveDailyReportToSupabase("normal");
                  }}
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: 8,
                    border: dailyStatus === "normal" ? "1px solid #10b981" : "1px solid #1f2c43",
                    background: dailyStatus === "normal" ? "#064e3b" : "#091326",
                    color: dailyStatus === "normal" ? "#34d399" : "#94a3b8",
                    fontSize: 13,
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  🟢 이상 없음
                </button>
                <button
                  onClick={() => {
                    setDailyStatus("issue");
                    void saveDailyReportToSupabase("issue");
                  }}
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: 8,
                    border: dailyStatus === "issue" ? "1px solid #ef4444" : "1px solid #1f2c43",
                    background: dailyStatus === "issue" ? "#7f1d1d" : "#091326",
                    color: dailyStatus === "issue" ? "#fca5a5" : "#94a3b8",
                    fontSize: 13,
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  🔴 특이사항 있음
                </button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 4 }}>업무 메모 내용</label>
              <textarea
                placeholder="PC 대시보드와 실시간 연동되는 업무 메모 내용입니다."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                style={{
                  width: "100%",
                  background: "#091326",
                  border: "1px solid #1f2c43",
                  color: "white",
                  padding: "8px 12px",
                  borderRadius: 10,
                  fontSize: 14,
                  resize: "vertical",
                }}
              />
            </div>

            <button
              onClick={() => void saveDailyReportToSupabase()}
              style={{
                width: "100%",
                background: "#2563eb",
                color: "white",
                border: "none",
                borderRadius: 10,
                padding: "10px",
                fontSize: 14,
                fontWeight: "bold",
                cursor: "pointer",
                marginTop: 4,
                boxShadow: "0 4px 6px -1px rgba(37, 99, 235, 0.4)",
              }}
            >
              💾 Supabase에 저장 및 동기화
            </button>
          </div>
        </section>
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

function getFlightNoColor(dep?: string, arr?: string): string {
  const d = String(dep || "").trim().toUpperCase();
  const a = String(arr || "").trim().toUpperCase();
  if (d === "ICN" || d === "RKSI") return "#ef4444"; // 빨간색 (인천출발)
  if (a === "ICN" || a === "RKSI") return "#3b82f6"; // 파란색 (인천도착)
  return "#e2e8f0"; // 기본 흰색 계열
}

function normalizeSummaryFlightKey(value: string) {
  return value.replace(/\s+/g, "").toUpperCase();
}

function getScheduleFlightOrderStorageKey(room: MonitorRoom | null) {
  return `cargo_ops_schedule_flight_order_${room?.id || "latest"}`;
}

function loadScheduleFlightOrder(storageKey: string) {
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

function saveScheduleFlightOrder(storageKey: string, order: string[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(order));
  } catch {
    // 순서 저장 실패는 화면 동작을 막지 않습니다.
  }
}

function applyScheduleFlightOrder<T extends { flight: string }>(items: T[], manualOrder: string[]) {
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
