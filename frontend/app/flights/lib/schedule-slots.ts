export type FlightRow = {
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
  hlnbr?: string;
  registrationNo?: string;
  aircraftRegNo?: string;
};

export type MonitorRoom = {
  id: string;
  name: string;
  flightsInput: string;
  startDateTime: string;
  endDateTime: string;
  fixed: boolean;
  lastFetchedAt: string;
  rows: FlightRow[];
};

export type ScheduleSlotKey = "active" | "archive";

export type ScheduleSlot = {
  slot: ScheduleSlotKey;
  name: string;
  room: MonitorRoom;
  savedAt: string;
};

export type ScheduleSlotsState = {
  active: ScheduleSlot | null;
  archive: ScheduleSlot | null;
  linkedSlot: ScheduleSlotKey;
};

export type FlightMode = "query" | "edit" | "registration";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://cargo-ops-backend.onrender.com";

export function formatScheduleCardName(startDateTime: string, savedAt = new Date()) {
  const periodMatch = String(startDateTime || "")
    .trim()
    .replace("T", " ")
    .match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})/);
  const periodDate = periodMatch
    ? `${periodMatch[1]}.${periodMatch[2]}.${periodMatch[3]}`
    : formatTodayPeriodDate(savedAt);
  const yy = String(savedAt.getFullYear()).slice(2);
  const mm = String(savedAt.getMonth() + 1).padStart(2, "0");
  const dd = String(savedAt.getDate()).padStart(2, "0");
  const hh = String(savedAt.getHours()).padStart(2, "0");
  const mi = String(savedAt.getMinutes()).padStart(2, "0");
  return `${periodDate} Schedule Flight ('${yy}.${mm}.${dd} ${hh}:${mi})`;
}

function formatTodayPeriodDate(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

export function getFlightNo(row: FlightRow) {
  return String(row.flightId || row.flightNo || "").trim();
}

export function countTargetFlights(room?: MonitorRoom | null) {
  if (!room) return 0;
  const inputFlights = room.flightsInput
    .split(",")
    .map((flight) => flight.trim())
    .filter(Boolean);
  if (inputFlights.length > 0) return new Set(inputFlights.map((f) => f.toUpperCase())).size;

  const rowFlights = (room.rows || [])
    .map((row) => getFlightNo(row).replace(/\s+/g, "").toUpperCase())
    .filter(Boolean);
  return new Set(rowFlights).size;
}

export function countRegistrationRows(rows: FlightRow[]) {
  return rows.filter((row) => {
    const value = String(
      row.registrationNo || row.hlnbr || row.aircraftRegNo || "",
    )
      .trim()
      .toUpperCase();
    return /^HL\d{3,5}$/.test(value);
  }).length;
}

export function getScheduleStatusLabel(rows: FlightRow[]) {
  let delay = 0;
  let gateChanged = 0;
  let canceled = 0;

  rows.forEach((row) => {
    const remarkStatus = `${row.status || ""} ${row.remark || ""}`.trim().toUpperCase();
    if (row.canceled || remarkStatus.includes("CANCEL")) canceled += 1;
    else if (row.gateChanged) gateChanged += 1;
    else if (
      row.delay ||
      remarkStatus.includes("DELAY") ||
      remarkStatus.includes("지연")
    ) {
      delay += 1;
    }
  });

  if (delay > 0) return `지연 ${delay}`;
  if (gateChanged > 0) return `게이트 ${gateChanged}`;
  if (canceled > 0) return `결항 ${canceled}`;
  if (rows.length > 0) return "이상 없음";
  return "비어 있음";
}

export function isActiveScheduleRoom(room?: MonitorRoom | null) {
  if (!room) return false;
  const flightsInput = String(room.flightsInput || "").trim();
  const rows = Array.isArray(room.rows) ? room.rows : [];
  return Boolean(flightsInput || rows.length > 0);
}

export function slotsToRooms(slots: ScheduleSlotsState): MonitorRoom[] {
  const rooms: MonitorRoom[] = [];
  (["active", "archive"] as ScheduleSlotKey[]).forEach((slotKey) => {
    const entry = slots[slotKey];
    if (entry && isActiveScheduleRoom(entry.room)) {
      rooms.push({
        ...entry.room,
        fixed: true,
        name: entry.name || entry.room.name,
      });
    }
  });
  return rooms;
}

export async function loadScheduleSlotsFromServer(): Promise<ScheduleSlotsState> {
  const res = await fetch(`${BACKEND_URL}/flights/schedule-slots`, {
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.detail || json.message || "Schedule Flight 슬롯 조회 실패");
  }
  const linkedSlot = json.linkedSlot === "archive" ? "archive" : "active";
  return {
    active: (json.active || null) as ScheduleSlot | null,
    archive: (json.archive || null) as ScheduleSlot | null,
    linkedSlot,
  };
}

export async function saveScheduleSlotToServer(
  room: MonitorRoom,
  options: { rotate?: boolean; slot?: ScheduleSlotKey } = {},
) {
  const res = await fetch(`${BACKEND_URL}/flights/schedule-slots/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      room,
      rotate: options.rotate ?? true,
      slot: options.slot,
    }),
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.detail || json.message || "Schedule Flight 저장 실패");
  }
  return {
    active: (json.active || null) as ScheduleSlot | null,
    archive: (json.archive || null) as ScheduleSlot | null,
    linkedSlot: (json.linkedSlot === "archive" ? "archive" : "active") as ScheduleSlotKey,
    rotated: Boolean(json.rotated),
    savedAt: String(json.savedAt || ""),
  };
}

function normalizeScheduleSlotsResponse(json: Record<string, unknown>): ScheduleSlotsState {
  return {
    active: (json.active || null) as ScheduleSlot | null,
    archive: (json.archive || null) as ScheduleSlot | null,
    linkedSlot: (json.linkedSlot === "archive" ? "archive" : "active") as ScheduleSlotKey,
  };
}

export async function linkScheduleSlotOnServer(slot: ScheduleSlotKey) {
  const res = await fetch(`${BACKEND_URL}/flights/schedule-slots/link/${slot}`, {
    method: "POST",
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.detail || json.message || "초기화면 연동 변경 실패");
  }
  return normalizeScheduleSlotsResponse(json);
}

export async function deleteScheduleSlotOnServer(slot: ScheduleSlotKey) {
  const res = await fetch(`${BACKEND_URL}/flights/schedule-slots/${slot}`, {
    method: "DELETE",
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.detail || json.message || "Schedule Flight 슬롯 삭제 실패");
  }
  return normalizeScheduleSlotsResponse(json);
}

export async function swapScheduleSlotsOnServer() {
  const res = await fetch(`${BACKEND_URL}/flights/schedule-slots/swap`, {
    method: "POST",
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.detail || json.message || "Schedule Flight 카드 교체 실패");
  }
  return normalizeScheduleSlotsResponse(json);
}

export function getSlotLabel(slot: ScheduleSlotKey) {
  return slot === "active" ? "NOW FLT" : "After";
}

export async function clearAllScheduleSlotsOnServer() {
  let slots = await loadScheduleSlotsFromServer();
  let guard = 0;

  while (guard < 4 && (slots.active || slots.archive)) {
    if (slots.active) {
      slots = await deleteScheduleSlotOnServer("active");
    } else if (slots.archive) {
      slots = await deleteScheduleSlotOnServer("archive");
    } else {
      break;
    }
    guard += 1;
  }

  return slots;
}
