"use client";

import type { FlightRow, MonitorRoom } from "./flight-types";

import { getFlightNo, normalizeFlightKey } from ".//flight-keys";
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

function normalizeHistoryText(value?: string) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[·•|/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeHistoryCheckedAt(value?: string) {
  const raw = String(value || "").replace("T", " ").trim();
  const full = raw.match(/(\d{4}[-/.]\d{2}[-/.]\d{2})\s+(\d{2}:\d{2})/);
  if (full) return `${full[1].replace(/[/.]/g, "-")} ${full[2]}`;
  const clock = raw.match(/(\d{2}:\d{2})/);
  return clock ? clock[1] : raw;
}

/** 동일 알림을 description 포맷 차이(개행 vs ·)가 있어도 하나로 묶습니다. */
export function getFlightAlertHistoryDedupeKey(item: FlightAlertHistoryItem) {
  return [
    normalizeHistoryText(item.title),
    normalizeHistoryText(item.description),
    normalizeHistoryCheckedAt(item.checkedAt),
  ].join("|");
}

export function mergeFlightAlertHistoryItems(
  incomingItems: FlightAlertHistoryItem[],
  existingItems: FlightAlertHistoryItem[],
  limit = 20,
) {
  const seenKeys = new Set<string>();
  const seenContent = new Set<string>();
  const merged: FlightAlertHistoryItem[] = [];

  for (const item of [...incomingItems, ...existingItems]) {
    if (!item) continue;

    if (item.key && seenKeys.has(item.key)) continue;
    const contentKey = getFlightAlertHistoryDedupeKey(item);
    if (contentKey && seenContent.has(contentKey)) continue;

    if (item.key) seenKeys.add(item.key);
    if (contentKey) seenContent.add(contentKey);
    merged.push(item);
  }

  return merged.slice(0, limit);
}

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

export function getRouteDisplay(row?: FlightRow) {
  if (!row) return "";

  const departure = row.departureCode || "";
  const arrival = row.arrivalCode || "";

  if (!departure && !arrival) return "";
  if (departure && arrival) return `${departure}→${arrival}`;
  if (departure) return `${departure}→-`;

  return `-→${arrival}`;
}

export function getCurrentTimeLabel() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function getRowScheduleTime(row: FlightRow) {
  return row.formattedEstimatedTime || row.estimatedDateTime || row.formattedScheduleTime || row.scheduleDateTime || "";
}

function getRowBaseScheduleTime(row: FlightRow) {
  return row.formattedScheduleTime || row.scheduleDateTime || "";
}
