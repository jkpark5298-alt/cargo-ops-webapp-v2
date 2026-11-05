import { type FlightRow, type MonitorRoom } from "../../lib/flight-types";
import { applyScheduleFlightOrder, normalizeSummaryFlightKey } from "../../lib/schedule-order";
import { getFlightNo, getRegistrationNo } from "../../lib/flight-keys";
import {
  parseAfocsDateTime,
  parseAfocsSkdSortValueFromParts,
  resolveAfocsSkdForDisplay,
  splitAfocsSkdPartsStoredOnly,
  splitScheduleCompactParts,
} from "../../lib/afocs-skd";
import { getRouteDisplay } from "../../lib/flight-alerts";
import { getComputedFlightStatus } from "../../lib/flight-status";
import { type CSSProperties } from "react";
import { FlightRouteItem, FlightSortMode } from "./types";
import { compactFieldBaseStyle } from "./styles";

export function formatApiLookupTime(value?: string) {
  if (!value) return "-";

  const raw = value.replace("T", " ").replace("Z", "").slice(0, 19);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);

  if (!match) return `${raw} KST`;

  const [, y, mo, d, h, mi, s] = match;
  const localCandidate = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  const now = new Date();
  const diffHours = Math.abs(now.getTime() - localCandidate.getTime()) / (1000 * 60 * 60);

  // 서버에 이미 KST로 저장된 신규 값은 그대로 표시합니다.
  // 과거 저장값처럼 UTC로 저장된 값은 KST(+9시간)로 변환해 표시합니다.
  if (diffHours <= 4) {
    return `${raw} KST`;
  }

  const utcDate = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
  const kstDate = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);

  const yy = kstDate.getUTCFullYear();
  const mm = String(kstDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kstDate.getUTCDate()).padStart(2, "0");
  const hh = String(kstDate.getUTCHours()).padStart(2, "0");
  const min = String(kstDate.getUTCMinutes()).padStart(2, "0");
  const sec = String(kstDate.getUTCSeconds()).padStart(2, "0");

  return `${yy}-${mm}-${dd} ${hh}:${min}:${sec} KST`;
}

export function getSummaryFlightOrderIndex(room: MonitorRoom, flight: string) {
  const order = room.flightsInput
    .split(",")
    .map((value) => normalizeSummaryFlightKey(value.trim()))
    .filter(Boolean);

  const index = order.indexOf(normalizeSummaryFlightKey(flight));
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function getFlightRouteItems(room: MonitorRoom | null) {
  if (!room) return [];

  const inputFlightKeys = new Set(
    room.flightsInput
      .split(",")
      .map((flight) => normalizeSummaryFlightKey(flight.trim()))
      .filter(Boolean),
  );
  const rows = Array.isArray(room.rows) ? room.rows : [];
  // flightsInput에 없는 orphan rows는 표시하지 않습니다 (삭제 후 재출현 방지).
  const visibleRows =
    inputFlightKeys.size > 0
      ? rows.filter((row) => inputFlightKeys.has(normalizeSummaryFlightKey(getFlightNo(row))))
      : rows;

  const rowItems = visibleRows
    .map((row) => {
      const flight = getFlightNo(row);
      if (!flight) return null;

      const afocsPartsStored = splitAfocsSkdPartsStoredOnly(row.afocsSkd || "");
      const changeParts = splitScheduleCompactParts(row);
      // 저장된 AFOCS가 없으면 변경 시각을 표시값으로 사용합니다.
      const afocsParts = {
        date: afocsPartsStored.date || changeParts.date,
        time: afocsPartsStored.time || changeParts.time,
      };
      const scheduleSource =
        row.formattedEstimatedTime ||
        row.estimatedDateTime ||
        row.formattedScheduleTime ||
        row.scheduleDateTime ||
        "";

      return {
        flight,
        registrationNo: getRegistrationNo(row),
        route: getRouteDisplay(row) || "구간 확인 중",
        direction: "기준",
        status: getComputedFlightStatus(row),
        time: getFlightTimeDisplay(row),
        displayTime: formatMonthDayTime(scheduleSource),
        changeTimeDate: changeParts.date,
        changeTimeTime: changeParts.time,
        afocsSkd: resolveAfocsSkdForDisplay(row.afocsSkd || "", row),
        afocsSkdDate: afocsParts.date,
        afocsSkdTime: afocsParts.time,
        gate: getGateDisplay(row),
        hasResult: true,
        departureCode: row.departureCode || "",
        arrivalCode: row.arrivalCode || "",
      };
    })
    .filter((item): item is FlightRouteItem => Boolean(item));

  const uniqueRowMap = new Map<string, FlightRouteItem>();

  rowItems.forEach((item) => {
    const key = item.flight.replace(/\s+/g, "").toUpperCase();
    const existing = uniqueRowMap.get(key);

    if (!existing) {
      uniqueRowMap.set(key, item);
      return;
    }

    if (!existing.registrationNo && item.registrationNo) {
      uniqueRowMap.set(key, item);
    }
  });

  const uniqueRowItems = Array.from(uniqueRowMap.values());

  if (uniqueRowItems.length > 0) {
    return uniqueRowItems.sort((a, b) => {
      const orderDiff = getSummaryFlightOrderIndex(room, a.flight) - getSummaryFlightOrderIndex(room, b.flight);
      if (orderDiff !== 0) return orderDiff;
      return a.flight.localeCompare(b.flight, "en");
    });
  }

  return room.flightsInput
    .split(",")
    .map((flight) => flight.trim())
    .filter(Boolean)
    .map((flight) => ({
      flight,
      registrationNo: "",
      route: "조회 결과 없음",
      direction: "기준",
      status: "-",
      time: "-",
      displayTime: "-",
      changeTimeDate: "",
      changeTimeTime: "",
      afocsSkd: "",
      afocsSkdDate: "",
      afocsSkdTime: "",
      gate: "",
      hasResult: false,
      departureCode: "",
      arrivalCode: "",
    }));
}

export function getFlightTimeDisplay(row?: FlightRow) {
  if (!row) return "-";
  const value = row.formattedEstimatedTime || row.estimatedDateTime || row.formattedScheduleTime || row.scheduleDateTime || "";
  return formatFlightTimeNoYear(value);
}

export function getGateDisplay(row?: FlightRow) {
  if (!row) return "";
  return row.gatenumber || "";
}

export function formatFlightTimeNoYear(value?: string) {
  if (!value) return "-";

  const normalized = value.replace("T", " ").trim();
  const match = normalized.match(/^(\d{4})[/-](\d{2})[/-](\d{2})\s+(\d{2}):(\d{2})/);

  if (match) {
    const [, year, month, day, hour, minute] = match;
    return `'${year.slice(2)}/${month}/${day} ${hour}:${minute}`;
  }

  return normalized;
}

export function formatCompactDateTime(value?: string) {
  if (!value) return "-";

  const normalized = value.replace("T", " ").trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);

  if (match) {
    const [, yy, mo, dd, hh, mi] = match;
    return `'${yy.slice(2)}-${mo}-${dd} ${hh}:${mi}`;
  }

  return normalized.slice(0, 16);
}

export function parseDateTime(value?: string | null): Date | null {
  return parseAfocsDateTime(value);
}

export function formatMonthDayTime(value?: string | null) {
  if (!value) return "-";

  const parsed = parseDateTime(value);
  if (parsed) {
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    const hour = String(parsed.getHours()).padStart(2, "0");
    const minute = String(parsed.getMinutes()).padStart(2, "0");
    return `${month}. ${day}. ${hour}:${minute}`;
  }

  return value;
}

export function getItemDirection(item: Pick<FlightRouteItem, "departureCode" | "arrivalCode">) {
  const dep = (item.departureCode || "").toUpperCase();
  const arr = (item.arrivalCode || "").toUpperCase();

  if (dep === "ICN") return "departure";
  if (arr === "ICN") return "arrival";
  return "unknown";
}

export function isItemInFocusWindow(item: FlightRouteItem, nowMs: number) {
  const dt = parseDateTime(item.displayTime || item.time);
  if (!dt) return false;

  const t = dt.getTime();
  const direction = getItemDirection(item);

  if (direction === "departure") {
    return nowMs >= t - 30 * 60 * 1000 && nowMs <= t + 60 * 60 * 1000;
  }

  if (direction === "arrival") {
    return nowMs >= t - 60 * 60 * 1000 && nowMs <= t + 30 * 60 * 1000;
  }

  return false;
}

export function parseAfocsItemSortValue(item: FlightRouteItem) {
  // 화면에 보이는 AFOCS MM.DD / HH:mm 을 우선 사용 (저장 문자열 파싱 실패 방지)
  return parseAfocsSkdSortValueFromParts(item.afocsSkdDate, item.afocsSkdTime, item.afocsSkd);
}

export function parseChangeSortValue(item: FlightRouteItem) {
  const changeCombined =
    item.changeTimeDate && item.changeTimeTime
      ? `${item.changeTimeDate} ${item.changeTimeTime}`
      : "";
  const dt =
    parseDateTime(changeCombined) ||
    parseDateTime(item.displayTime) ||
    parseDateTime(item.time);
  return dt ? dt.getTime() : Number.MAX_SAFE_INTEGER;
}

export function sortFlightItemsByMode(items: FlightRouteItem[], mode: FlightSortMode, manualOrder: string[]) {
  if (mode === "manual") {
    return applyScheduleFlightOrder(items, manualOrder);
  }

  return [...items].sort((a, b) => {
    // S(schedule): 변경 시각 / A(afocs): AFOCS SKD
    if (mode === "schedule") {
      return parseChangeSortValue(a) - parseChangeSortValue(b);
    }

    const diff = parseAfocsItemSortValue(a) - parseAfocsItemSortValue(b);
    if (diff !== 0) return diff;
    return parseChangeSortValue(a) - parseChangeSortValue(b);
  });
}

export function getScheduledCountButtonStyle(selected: boolean): CSSProperties {
  return {
    fontSize: 13,
    fontWeight: 700,
    color: selected ? "#f8fafc" : "#b8c7db",
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    textDecoration: selected ? "underline" : "none",
    textUnderlineOffset: 3,
  };
}

export function getTotalViewToggleStyle(active: boolean): CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 700,
    padding: "4px 10px",
    borderRadius: 8,
    border: active ? "1px solid rgba(52,211,153,0.5)" : "1px solid rgba(147,197,253,0.35)",
    background: active ? "rgba(52,211,153,0.12)" : "#0f172a",
    color: active ? "#34d399" : "#93c5fd",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

export function getViewChipStyle(selected: boolean, tone: "completed" | "active"): CSSProperties {
  const palette =
    tone === "completed"
      ? {
          text: "#34d399",
          border: selected ? "rgba(52,211,153,0.75)" : "rgba(52,211,153,0.25)",
          fill: selected ? "rgba(52,211,153,0.22)" : "rgba(52,211,153,0.10)",
        }
      : {
          text: "#f87171",
          border: selected ? "rgba(248,113,113,0.75)" : "rgba(248,113,113,0.25)",
          fill: selected ? "rgba(248,113,113,0.22)" : "rgba(248,113,113,0.10)",
        };

  return {
    fontSize: 13,
    fontWeight: 700,
    color: palette.text,
    background: palette.fill,
    border: `1px solid ${palette.border}`,
    borderRadius: 6,
    padding: "2px 8px",
    cursor: "pointer",
  };
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

export const afocsCompactFieldStyles = {
  date: {
    ...compactFieldBaseStyle,
    width: 54,
    minWidth: 54,
    color: "#fcd34d",
  } satisfies CSSProperties,
  time: {
    ...compactFieldBaseStyle,
    width: 58,
    minWidth: 58,
    color: "#fcd34d",
  } satisfies CSSProperties,
};

export const changeCompactFieldStyles = {
  date: {
    ...compactFieldBaseStyle,
    width: 54,
    minWidth: 54,
    color: "#93c5fd",
  } satisfies CSSProperties,
  time: {
    ...compactFieldBaseStyle,
    width: 58,
    minWidth: 58,
    color: "#93c5fd",
  } satisfies CSSProperties,
};
