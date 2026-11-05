import {
  parseAfocsDateTime,
  parseAfocsSkdSortValueFromParts,
  resolveAfocsSkdForDisplay,
  splitAfocsSkdPartsStoredOnly,
  splitScheduleCompactParts,
} from "../lib/afocs-skd";
import { type FlightRow } from "../lib/flight-types";
import { getComputedFlightStatus, isFinalCompletedFlightStatus } from "../lib/flight-status";
import { type CSSProperties } from "react";
import { getRegistrationNo } from "../lib/flight-keys";
import { applyScheduleFlightOrder } from "../lib/schedule-order";
import { WidgetSummaryItem } from "./types";
import { DEFAULT_REFRESH_MINUTES, FOCUS_REFRESH_MINUTES } from "./constants";

export function parseDateTime(value?: string | null): Date | null {
  if (!value || value === "-") return null;

  const parsed = parseAfocsDateTime(value);
  if (parsed) return parsed;

  const raw = value.trim().replace(/\./g, "-").replace(/\//g, "-").replace("T", " ");
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

export function getFlightTimeFromRow(row: FlightRow): Date | null {
  return (
    parseDateTime(row.formattedEstimatedTime) ||
    parseDateTime(row.estimatedDateTime) ||
    parseDateTime(row.formattedScheduleTime) ||
    parseDateTime(row.scheduleDateTime)
  );
}

export function getRefreshExcludeReasonFromRow(row: FlightRow) {
  const remarkStatus = String(row.remark || "").toUpperCase();

  if (row.canceled || remarkStatus.includes("결항") || remarkStatus.includes("CANCEL")) {
    return "결항 확정";
  }

  if (remarkStatus.includes("도착") || remarkStatus.includes("ARRIVED")) {
    return "도착 확정";
  }

  return "";
}

export function isFinalCompletedStatus(status: string) {
  return isFinalCompletedFlightStatus(status);
}

export function getLatestRowsByFlight(rows: FlightRow[]) {
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

export function getCompletedFlightSetFromRows(rows: FlightRow[]) {
  const completed = new Set<string>();
  const latestMap = getLatestRowsByFlight(rows);

  latestMap.forEach(({ row }, flight) => {
    const reason = getRefreshExcludeReasonFromRow(row);
    if (reason) completed.add(flight);
  });

  return completed;
}

export function getRefreshExcludeReasonMapFromRows(rows: FlightRow[]) {
  const reasonMap = new Map<string, string>();
  const latestMap = getLatestRowsByFlight(rows);

  latestMap.forEach(({ row }, flight) => {
    const reason = getRefreshExcludeReasonFromRow(row);
    if (reason) reasonMap.set(flight, reason);
  });

  return reasonMap;
}

export function roomButtonStyle(active: boolean): CSSProperties {
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

export function formatMonthDayTime(value?: string | null) {
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

export function formatDisplayItemFromRow(flight: string, row: FlightRow): WidgetSummaryItem {
  return {
    flight,
    status: getComputedFlightStatus(row),
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
    afocsSkd: resolveAfocsSkdForDisplay(row.afocsSkd || "", row),
  };
}

export function formatFallbackDisplayItem(flight: string): WidgetSummaryItem {
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

export function getItemDirection(item: WidgetSummaryItem) {
  const dep = (item.departureCode || "").toUpperCase();
  const arr = (item.arrivalCode || "").toUpperCase();

  if (dep === "ICN") return "departure";
  if (arr === "ICN") return "arrival";
  return "unknown";
}

export function isItemInFocusWindow(item: WidgetSummaryItem) {
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

export function getNextRefreshMinutes(activeItems: WidgetSummaryItem[]) {
  if (activeItems.length === 0) return null;

  const hasFocusItem = activeItems.some((item) => isItemInFocusWindow(item));

  return hasFocusItem ? FOCUS_REFRESH_MINUTES : DEFAULT_REFRESH_MINUTES;
}

export function parseWidgetAfocsSortValue(item: WidgetSummaryItem) {
  const stored = splitAfocsSkdPartsStoredOnly(item.afocsSkd || "");
  // 저장된 AFOCS가 없으면 변경(displayTime)을 화면과 동일하게 fallback
  if (!stored.date || !stored.time) {
    const changeParts = splitScheduleCompactParts({
      formattedEstimatedTime: item.displayTime,
    });
    const date = stored.date || changeParts.date;
    const time = stored.time || changeParts.time;
    return parseAfocsSkdSortValueFromParts(date, time, item.afocsSkd || item.displayTime);
  }
  return parseAfocsSkdSortValueFromParts(stored.date, stored.time, item.afocsSkd);
}

export function parseWidgetChangeSortValue(item: WidgetSummaryItem) {
  const dt = parseDateTime(item.displayTime);
  return dt ? dt.getTime() : Number.MAX_SAFE_INTEGER;
}

export function sortWidgetItemsByMode(
  items: WidgetSummaryItem[],
  mode: "manual" | "schedule" | "afocs",
  manualOrder: string[],
) {
  if (mode === "manual") {
    return applyScheduleFlightOrder(items, manualOrder);
  }

  return [...items].sort((a, b) => {
    // S(schedule): 변경 시각 / A(afocs): AFOCS SKD
    if (mode === "schedule") {
      return parseWidgetChangeSortValue(a) - parseWidgetChangeSortValue(b);
    }

    const diff = parseWidgetAfocsSortValue(a) - parseWidgetAfocsSortValue(b);
    if (diff !== 0) return diff;
    return parseWidgetChangeSortValue(a) - parseWidgetChangeSortValue(b);
  });
}

export function getSortCircleButtonStyle(active: boolean): CSSProperties {
  return {
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: active ? "1px solid #60a5fa" : "1px solid rgba(148, 163, 184, 0.35)",
    background: active ? "rgba(59, 130, 246, 0.25)" : "rgba(15, 23, 42, 0.85)",
    color: active ? "#93c5fd" : "#cbd5e1",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };
}
