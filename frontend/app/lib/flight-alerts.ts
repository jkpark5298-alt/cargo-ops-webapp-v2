"use client";

import type { FlightRow, MonitorRoom } from "../page";

const FLIGHT_ALERT_SNAPSHOT_KEY = "cargo_ops_flight_alert_snapshot_v1";
const FLIGHT_ALERT_HISTORY_KEY = "cargo_ops_flight_alert_history_v1";

export type FlightAlertSnapshotRow = {
  flight: string;
  route: string;
  scheduleTime: string;
  estimatedTime: string;
  gate: string;
  terminal: string;
  remark: string;
  status: string;
};

export type FlightAlertSnapshot = {
  roomId: string;
  roomName: string;
  savedAt: string;
  rows: FlightAlertSnapshotRow[];
};

export type FlightAlertItem = {
  key: string;
  title: string;
  description: string;
};

export type FlightAlertHistoryItem = FlightAlertItem & {
  checkedAt: string;
  roomName: string;
};

export function loadFlightAlertSnapshot(): FlightAlertSnapshot | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(FLIGHT_ALERT_SNAPSHOT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed?.roomId && Array.isArray(parsed?.rows) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveFlightAlertSnapshot(snapshot: FlightAlertSnapshot) {
  if (typeof window === "undefined") return;
  localStorage.setItem(FLIGHT_ALERT_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export function loadFlightAlertHistory(): FlightAlertHistoryItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(FLIGHT_ALERT_HISTORY_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFlightAlertHistory(items: FlightAlertHistoryItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(FLIGHT_ALERT_HISTORY_KEY, JSON.stringify(items.slice(0, 20)));
}

export function clearFlightAlertHistory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(FLIGHT_ALERT_HISTORY_KEY);
}

export function clearFlightAlertSnapshot() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(FLIGHT_ALERT_SNAPSHOT_KEY);
}

export function buildFlightAlertSnapshot(room: MonitorRoom | null): FlightAlertSnapshot | null {
  if (!room) return null;

  return {
    roomId: room.id,
    roomName: room.name,
    savedAt: getCurrentTimeLabel(),
    rows: getFlightAlertRows(room),
  };
}

export function createFlightAlertItems(
  room: MonitorRoom | null,
  snapshot: FlightAlertSnapshot | null,
): FlightAlertItem[] {
  if (!room || !snapshot) return [];
  if (snapshot.roomId !== room.id) return [];

  const currentRows = getFlightAlertRows(room);
  const previousRows = snapshot.rows || [];
  const currentMap = new Map(currentRows.map((row) => [normalizeFlightKey(row.flight), row]));
  const previousMap = new Map(previousRows.map((row) => [normalizeFlightKey(row.flight), row]));
  const alerts: FlightAlertItem[] = [];

  currentRows.forEach((current) => {
    const key = normalizeFlightKey(current.flight);
    const previous = previousMap.get(key);

    if (!previous) {
      alerts.push({
        key: `new-${key}`,
        title: `${current.flight} ${current.route}`,
        description: "신규 조회",
      });
      return;
    }

    const changes: string[] = [];
    const previousStatus = previous.remark || previous.status || "-";
    const currentStatus = current.remark || current.status || "-";

    if (previous.estimatedTime !== current.estimatedTime) {
      changes.push(`시간 ${previous.estimatedTime || "-"}→${current.estimatedTime || "-"}`);
    }

    if (previousStatus !== currentStatus) {
      changes.push(`상태 ${previousStatus}→${currentStatus}`);
    }

    if (previous.gate !== current.gate) {
      changes.push(`게이트 ${previous.gate || "-"}→${current.gate || "-"}`);
    }

    if (previous.route !== current.route) {
      changes.push(`구간 ${previous.route || "-"}→${current.route || "-"}`);
    }

    if (changes.length > 0) {
      alerts.push({
        key: `changed-${key}`,
        title: `${current.flight} ${current.route}`,
        description: changes.slice(0, 2).join(" · "),
      });
    }
  });

  previousRows.forEach((previous) => {
    const key = normalizeFlightKey(previous.flight);

    if (!currentMap.has(key)) {
      alerts.push({
        key: `missing-${key}`,
        title: `${previous.flight} ${previous.route}`,
        description: "조회 대상에서 제외 또는 삭제됨",
      });
    }
  });

  return alerts.slice(0, 6);
}

function getFlightAlertRows(room: MonitorRoom | null): FlightAlertSnapshotRow[] {
  if (!room || !Array.isArray(room.rows)) return [];

  const rows = room.rows
    .map((row) => {
      const flight = getFlightNo(row).trim();
      if (!flight) return null;

      return {
        flight,
        route: getRouteDisplay(row) || "구간 확인 중",
        scheduleTime: getRowBaseScheduleTime(row),
        estimatedTime: getRowScheduleTime(row),
        gate: row.gatenumber || "",
        terminal: row.terminalid || "",
        remark: row.remark || "",
        status: row.status || "",
      };
    })
    .filter((row): row is FlightAlertSnapshotRow => Boolean(row));

  return rows.filter((row, index, array) => {
    const key = normalizeFlightKey(row.flight);
    return array.findIndex((candidate) => normalizeFlightKey(candidate.flight) === key) === index;
  });
}

function getFlightNo(row: FlightRow) {
  return row.flightNo || row.flightId || "";
}

function getRouteDisplay(row?: FlightRow) {
  if (!row) return "";

  const departure = row.departureCode || "";
  const arrival = row.arrivalCode || "";

  if (!departure && !arrival) return "";
  if (departure && arrival) return `${departure}→${arrival}`;
  if (departure) return `${departure}→-`;

  return `-→${arrival}`;
}

function getCurrentTimeLabel() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function normalizeFlightKey(flight: string) {
  return flight.replace(/\s+/g, "").toUpperCase();
}

function getRowScheduleTime(row: FlightRow) {
  return row.formattedEstimatedTime || row.estimatedDateTime || row.formattedScheduleTime || row.scheduleDateTime || "";
}

function getRowBaseScheduleTime(row: FlightRow) {
  return row.formattedScheduleTime || row.scheduleDateTime || "";
}
