"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";

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

const STORAGE_KEY = "cargo_ops_monitor_rooms_v6";
const HL_MAPPING_STORAGE_KEY = "cargo_ops_hl_number_mapping_v1";
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

function normalizeFlightKey(value: string) {
  return value.replace(/\s+/g, "").toUpperCase();
}

function normalizeHlFlightKey(value: string) {
  const normalized = value.replace(/\s+/g, "").toUpperCase();
  if (/^\d{3,4}$/.test(normalized)) return `KJ${normalized}`;
  return normalized;
}

function normalizeHlNumber(value: string) {
  const normalized = value.replace(/\s+/g, "").toUpperCase();

  if (/^\d{3,5}$/.test(normalized)) {
    return `HL${normalized}`;
  }

  return normalized;
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

  const mapped = mapping[flight];
  if (mapped) return mapped;

  const current = getRegistrationNo(row);
  return current === "-" ? "" : current;
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
  onToggleDetail,
  onToggleSelect,
  onDeleteFlight,
}: {
  rows: FlightRow[];
  expandedKeys: Record<string, boolean>;
  selectedKeys: Record<string, boolean>;
  hlNumberMap: Record<string, string>;
  hlDrafts: Record<string, string>;
  onHlDraftChange: (flight: string, value: string) => void;
  onToggleDetail: (key: string) => void;
  onToggleSelect: (row: FlightRow, idx: number) => void;
  onDeleteFlight?: (flight: string) => void;
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
              <td style={tdStyle} colSpan={9}>
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
                    {onDeleteFlight ? (
                      <button
                        type="button"
                        onClick={() => onDeleteFlight(getFlightDisplay(row))}
                        title={`${getFlightDisplay(row)} Schedule Flight에서 삭제`}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 999,
                          border: "1px solid rgba(248, 113, 113, 0.65)",
                          background: "rgba(127, 29, 29, 0.72)",
                          color: "#fecaca",
                          fontWeight: 900,
                          fontSize: 20,
                          lineHeight: 1,
                          cursor: "pointer",
                        }}
                      >
                        -
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onToggleSelect(row, idx)}
                        disabled={finalCompleted}
                        title={finalCompleted ? `${getRefreshExcludeReason(row)}으로 저장 제외` : selected ? "저장 선택 해제" : "저장할 항공편 선택"}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 999,
                          border: selected ? "1px solid #60a5fa" : "1px solid #334155",
                          background: selected ? "#2563eb" : "#111827",
                          color: selected ? "#ffffff" : "#facc15",
                          fontWeight: 900,
                          fontSize: 20,
                          lineHeight: 1,
                          cursor: finalCompleted ? "not-allowed" : "pointer",
                          opacity: finalCompleted ? 0.45 : 1,
                        }}
                      >
                        {selected ? "✓" : "+"}
                      </button>
                    )}
                  </td>
                  <td style={tdStyle}>{getFlightDisplay(row)}</td>
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
                    <td colSpan={9} style={{ padding: 14 }}>
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

  const currentRangeText = useMemo(() => {
    return `${startDateTime.replace("T", " ")} ~ ${endDateTime.replace("T", " ")}`;
  }, [startDateTime, endDateTime]);

  const alertCounts = useMemo(() => getAlertCounts(rows), [rows]);

  const hlNumberMap = useMemo(() => parseHlMappingText(hlMappingText), [hlMappingText]);
  const hlMappingCount = useMemo(() => Object.keys(hlNumberMap).length, [hlNumberMap]);

  useEffect(() => {
    setHlMappingText(loadHlMappingText());
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

  const handleHlInlineDraftChange = (flight: string, value: string) => {
    const key = normalizeHlFlightKey(flight);
    if (!key) return;

    setHlInlineDrafts((prev) => ({
      ...prev,
      [key]: value,
    }));
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

    const nextRows = applyHlMappingToRows(rows, nextMap);
    const nextRooms = rooms.map((room) => ({
      ...room,
      rows: applyHlMappingToRows(room.rows || [], nextMap),
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
        setHlMappingStatus(`등록기호 ${savedCount}건 저장 · Schedule Lite/초기화면 반영`);
      } catch (error) {
        setHlMappingStatus(
          error instanceof Error
            ? `등록기호 로컬 저장 완료 · 서버 반영 실패: ${error.message}`
            : "등록기호 로컬 저장 완료 · 서버 반영 실패",
        );
      }
      return;
    }

    setHlMappingStatus(`등록기호 ${savedCount}건 저장`);
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
      setError("Schedule Flight를 비웠습니다. 초기화면과 Schedule Lite에도 반영됩니다.");
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
          ? "Schedule Flight 편명 변경을 Schedule Lite와 최근 Schedule Flight에 동기화했습니다."
          : "Schedule Flight 편명을 모두 비웠습니다. Schedule Lite와 최근 Schedule Flight도 비워졌습니다.",
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

    void loadLatestScheduleFromServer()
      .then((serverRoom) => {
        const mergedRooms = mergeLatestScheduleRoom(loadRooms(), serverRoom);
        setRooms(mergedRooms);
        saveRooms(mergedRooms);
      })
      .catch(() => {
        // 서버 기준 조회 실패 시 기기 저장값을 유지합니다.
      });

    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const q = params.get("flight");
    const roomId = params.get("roomId");

    if (roomId) {
      const foundRoom = savedRooms.find((room) => room.id === roomId);
      if (foundRoom) {
        setSelectedRoomId(foundRoom.id);
        setInput(foundRoom.flightsInput);
        setStartDateTime(foundRoom.startDateTime);
        setEndDateTime(foundRoom.endDateTime);
        setFixed(foundRoom.fixed);
        setLastFetchedAt(foundRoom.lastFetchedAt);
        setRows(foundRoom.rows);
        setExpandedDetailKeys({});
      }

      void loadLatestScheduleFromServer()
        .then((serverRoom) => {
          const mergedRooms = mergeLatestScheduleRoom(loadRooms(), serverRoom);
          setRooms(mergedRooms);
          saveRooms(mergedRooms);

          if (serverRoom && (serverRoom.id === roomId || serverRoom.fixed)) {
            setSelectedRoomId(serverRoom.id);
            setInput(serverRoom.flightsInput);
            setStartDateTime(serverRoom.startDateTime);
            setEndDateTime(serverRoom.endDateTime);
            setFixed(serverRoom.fixed);
            setLastFetchedAt(serverRoom.lastFetchedAt);
            setRows(serverRoom.rows || []);
            setExpandedDetailKeys({});
          } else if (!serverRoom) {
            resetLookupView();
          }
        })
        .catch(() => {
          // 서버 기준 조회 실패 시 현재 화면을 유지합니다.
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

    setQueryMode("manual");
    setInput(flights.join(", "));
    if (!keepScheduleContext) {
      setSelectedRoomId("");
      setFixed(false);
    }
    setRows([]);
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});
    setLoading(true);
    setError("");

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

      const nextRows = applyHlMappingToRows(json.data || [], hlNumberMap);
      const fetchedAt = new Date().toLocaleString("ko-KR");

      setRows(nextRows);
      setLastFetchedAt(fetchedAt);
      setExpandedDetailKeys({});

      if (keepScheduleContext && selectedRoom) {
        const mergedInput = mergeFlightsInput(selectedRoom.flightsInput, flights.join(", "));
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
          flights.join(", "),
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
    setQueryMode("kj-all");
    setSelectedRoomId("");
    setFixed(false);
    setRows([]);
    setLastFetchedAt("");
    setExpandedDetailKeys({});
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setLoading(true);
    setError("");

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

      const nextRows = applyHlMappingToRows(json.data || [], hlNumberMap);
      const fetchedAt = new Date().toLocaleString("ko-KR");

      setRows(nextRows);
      setLastFetchedAt(fetchedAt);
      setExpandedDetailKeys({});
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

  const handleDeleteFlightFromSchedule = async (flight: string) => {
    if (!selectedRoom?.fixed) return;

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
      await saveLatestScheduleToServer(updatedRoom);
      if (typeof window !== "undefined") {
        if (!hasRemaining) {
          window.localStorage.removeItem(LAST_FIXED_ROOM_KEY);
        }
        window.localStorage.setItem("cargo_ops_latest_schedule_updated_at", new Date().toISOString());
      }

      setError(
        hasRemaining
          ? `${targetFlight} 삭제 완료. 초기화면과 Schedule Lite에도 반영됩니다.`
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
      mergedMap.set(flight, row);
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
          : "결과 행의 +를 눌러 저장할 항공편을 선택하세요.",
      );
      return;
    }

    const selectedRowsWithHl = applyHlMappingToRows(selectedScheduleRows, hlNumberMap);
    const selectedFlights = getFlightsFromRowsInOrder(selectedRowsWithHl);
    if (selectedFlights.length === 0) {
      setError("선택한 결과에서 편명을 확인하지 못했습니다.");
      return;
    }

    const missingFlights = getMissingInputFlights(input, rows);
    const now = new Date();
    const baseScheduleRoom = selectedRoom?.fixed ? normalizeScheduleRoomRows(selectedRoom) : null;
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
      name: baseScheduleRoom?.name || `Schedule_${formatMonitorRoomName(now).replace("Monitor_", "")}`,
      flightsInput: mergedFlightsInput,
      startDateTime: baseScheduleRoom?.startDateTime || startDateTime,
      endDateTime: baseScheduleRoom?.endDateTime || endDateTime,
      fixed: true,
      lastFetchedAt: new Date().toISOString(),
      rows: mergedRows,
    });

    setError(
      baseScheduleRoom
        ? "선택 편명을 Schedule Flight에 저장 중입니다."
        : "선택한 Schedule Flight를 저장 중입니다.",
    );

    let finalRoom = baseRoom;

    try {
      const serverRoom = await saveLatestScheduleToServer(baseRoom);
      finalRoom = normalizeScheduleRoomRows({
        ...baseRoom,
        ...serverRoom,
        fixed: true,
        rows: Array.isArray(serverRoom.rows) ? serverRoom.rows : baseRoom.rows,
        flightsInput: serverRoom.flightsInput || baseRoom.flightsInput,
        startDateTime: serverRoom.startDateTime || baseRoom.startDateTime,
        endDateTime: serverRoom.endDateTime || baseRoom.endDateTime,
        lastFetchedAt: serverRoom.lastFetchedAt || baseRoom.lastFetchedAt,
      });

      setError(
        missingFlights.length > 0
          ? `저장 완료. 조회 결과가 없는 편명은 제외했습니다: ${missingFlights.join(", ")}`
          : baseScheduleRoom
            ? "저장 완료 · 초기화면/Schedule Lite 반영"
            : "저장 완료 · 초기화면/Schedule Lite 반영",
      );
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? `서버 동기화 실패. 이 기기에는 저장했습니다: ${syncError.message}`
          : "서버 동기화 실패. 이 기기에는 저장했습니다.",
      );
    }

    const nextRooms = mergeLatestScheduleRoom(rooms, finalRoom);
    setRooms(nextRooms);
    saveRooms(nextRooms);
    clearFlightAlertBaselineAndHistory();
    setSelectedRoomId(finalRoom.id);
    setInput(finalRoom.flightsInput);
    setRows(finalRoom.rows);
    setLastFetchedAt(finalRoom.lastFetchedAt);
    setFixed(true);
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
        setError("Schedule Flight 저장방을 삭제하고 서버 기준도 비웠습니다. 초기화면과 Schedule Lite에도 반영됩니다.");
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

  const openScheduleLite = () => {
    if (!selectedRoom) {
      setError("선택된 Schedule Flight가 없습니다.");
      return;
    }

    router.push("/fixed-lite");
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
        <h3 style={{ fontSize: 20, marginBottom: 16 }}>Monitor</h3>

        <button
          onClick={handleCreateMonitor}
          style={{
            width: "100%",
            padding: "10px 12px",
            background: "#16a34a",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 700,
            marginBottom: 16,
          }}
        >
          현재 조회 저장
        </button>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rooms.length === 0 && (
            <div style={{ color: "#94a3b8", fontSize: 14 }}>
              저장된 Monitor 방이 없습니다.
            </div>
          )}

          {rooms.map((room) => {
            const counts = getAlertCounts(room.rows);
            const totalAlerts =
              counts.delay + counts.gateChanged + counts.canceled;

            return (
              <div
                key={room.id}
                style={{
                  border:
                    room.id === selectedRoomId
                      ? "1px solid #60a5fa"
                      : "1px solid #23314f",
                  borderRadius: 8,
                  padding: 12,
                  background:
                    room.id === selectedRoomId ? "#0b1b35" : "#0a1528",
                }}
              >
                <div
                  onClick={() => handleSelectRoom(room)}
                  style={{ cursor: "pointer" }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    {room.name}
                  </div>

                  <div
                    style={{
                      color: "#cbd5e1",
                      fontSize: 13,
                      wordBreak: "break-all",
                    }}
                  >
                    {room.flightsInput}
                  </div>

                  <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 6 }}>
                    {room.startDateTime.replace("T", " ")} ~{" "}
                    {room.endDateTime.replace("T", " ")}
                  </div>

                  <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
                    마지막 조회: {room.lastFetchedAt || "-"}
                  </div>

                  <div
                    style={{
                      color: room.fixed ? "#facc15" : "#94a3b8",
                      fontSize: 12,
                      marginTop: 4,
                    }}
                  >
                    {room.fixed ? "Schedule Flight" : "일반"}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    {counts.delay > 0 && (
                      <span style={badgeOrange}>지연 {counts.delay}</span>
                    )}
                    {counts.gateChanged > 0 && (
                      <span style={badgePurple}>게이트 {counts.gateChanged}</span>
                    )}
                    {counts.canceled > 0 && (
                      <span style={badgeRed}>결항 {counts.canceled}</span>
                    )}
                    {totalAlerts === 0 && (
                      <span style={badgeNormal}>이상 없음</span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => void handleDeleteRoom(room.id)}
                  style={{
                    marginTop: 10,
                    width: "100%",
                    padding: "8px 10px",
                    background: "#334155",
                    color: "white",
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  삭제
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      <main style={{ flex: 1, padding: 40 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 28, marginBottom: 20 }}>✈️ 편명 조회</h2>
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

        {isSelectedFixedRoom && (
          <div style={scheduleSaveGuideStyle}>
            기존 Schedule Flight에 추가 저장합니다. 결과 행의 <b style={{ color: "#facc15" }}>+</b> 선택 후 저장하세요.
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

          <button
            onClick={handleToggleFixed}
            style={fixed ? fixedOnBtn : fixedOffBtn}
          >
            Schedule Flight
          </button>

          <button
            onClick={() => void handleSaveSelectedSchedule()}
            disabled={selectedScheduleRows.length === 0}
            style={selectedScheduleRows.length > 0 ? saveScheduleBtn : disabledBtn}
          >
            {selectedScheduleRows.length > 0
              ? `선택 ${selectedScheduleRows.length}건 저장`
              : "저장할 항공편 선택"}
          </button>
        </div>

        {fixed && (
          <div style={{ marginTop: 6, color: "#facc15", fontSize: 14 }}>
            Schedule Flight 관리 중 · D로 상세 확인
          </div>
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

        {rows.length > 0 && (
          <div style={scheduleSaveStatusStyle}>
            저장 선택 {selectedScheduleRows.length}건
            <div style={scheduleSaveStatusSubStyle}>
              재조회 {refreshActiveRows.length}건 · 제외 {refreshExcludedRows.length}건
            </div>
          </div>
        )}

        {selectedRoom && (
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
                      자동조회는 Schedule Lite에서만 {REFRESH_INTERVAL_MINUTES}분마다 적용됩니다.
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
                    onClick={openScheduleLite}
                    style={scheduleLiteLinkBtn}
                    title="아이폰용 Schedule Lite 화면 열기"
                  >
                    Schedule Lite 열기
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {loading && <p style={{ marginTop: 20 }}>조회중...</p>}
        {error && <p style={{ marginTop: 20, color: "#f87171" }}>{error}</p>}

        {!fixed && (
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
                          {!finalCompleted && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 22,
                                height: 22,
                                borderRadius: 999,
                                background: selected ? "#2563eb" : "#1e293b",
                                color: selected ? "#ffffff" : "#93c5fd",
                                border: selected ? "1px solid #60a5fa" : "1px solid #334155",
                                fontWeight: 900,
                                fontSize: 16,
                                lineHeight: 1,
                              }}
                            >
                              +
                            </span>
                          )}
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
                      <td style={tdStyle}>{getFlightDisplay(r)}</td>
                      <td style={tdStyle}>{getRegistrationNo(r)}</td>
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

        {fixed && rows.length > 0 && (
          <div style={hlInlineSaveRowStyle}>
            <button type="button" onClick={() => void handleSaveInlineHlMapping()} style={hlMappingSaveButtonStyle}>
              등록기호 저장
            </button>
            <span style={hlInlineHelpStyle}>
              아래 표의 등록기호 칸에 숫자만 입력해도 HL이 자동으로 붙습니다. 예) 7423 → HL7423
            </span>
          </div>
        )}

        {hlMappingStatus ? <div style={hlMappingStatusStyle}>{hlMappingStatus}</div> : null}

        {fixed && (
          <FixedResultsTable
            rows={rows}
            expandedKeys={expandedDetailKeys}
            selectedKeys={selectedScheduleKeys}
            hlNumberMap={hlNumberMap}
            hlDrafts={hlInlineDrafts}
            onHlDraftChange={handleHlInlineDraftChange}
            onToggleDetail={handleToggleDetail}
            onToggleSelect={handleToggleScheduleSelection}
            onDeleteFlight={isSelectedFixedRoom ? handleDeleteFlightFromSchedule : undefined}
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

const scheduleLiteLinkBtn: CSSProperties = {
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
