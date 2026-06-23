"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { FlightRow, MonitorRoom } from "../page";

type ScheduleSummaryCardProps = {
  latestRoom: MonitorRoom | null;
  syncCheckedAt: string;
  apiSyncStatus: string;
  apiSyncLoading: boolean;
  onOpenScheduleFlight: () => void;
  onRefreshLatestSchedule: () => void;
};

export function ScheduleSummaryCard({
  latestRoom,
  syncCheckedAt,
  apiSyncStatus,
  apiSyncLoading,
  onOpenScheduleFlight,
  onRefreshLatestSchedule,
}: ScheduleSummaryCardProps) {
  return (
    <section style={cardStyle}>
      <h2 style={cardTitleStyle}>{getScheduleSummaryTitle(latestRoom)}</h2>

      <div style={summaryTopInfoStyle}>
        <span>조회범위 {latestRoom ? `${formatCompactDateTime(latestRoom.startDateTime)} ~ ${formatCompactDateTime(latestRoom.endDateTime)}` : "-"}</span>
        <span>결과 {getRoomRowsCount(latestRoom)}건</span>
      </div>

      <div style={apiLookupTimeStyle}>
        마지막 API 확인 {formatApiLookupTime(latestRoom?.lastFetchedAt)}
      </div>


      <div style={infoListStyle}>
        <FlightRouteRows room={latestRoom} />
      </div>
      {apiSyncStatus ? <div style={apiSyncStatusStyle}>{apiSyncStatus}</div> : null}
      {syncCheckedAt ? <div style={syncStatusStyle}>초기화면 반영 확인 · {syncCheckedAt}</div> : null}
      <div style={apiGuideStyle}>
        API 즉시 확인은 Schedule Flight API를 바로 조회한 뒤 서버 기준과 초기화면에 반영합니다.
      </div>
      <div style={buttonStackStyle}>
        <button
          onClick={onRefreshLatestSchedule}
          style={{
            ...refreshButtonStyle,
            opacity: apiSyncLoading ? 0.72 : 1,
            cursor: apiSyncLoading ? "wait" : "pointer",
          }}
          disabled={apiSyncLoading}
        >
          {apiSyncLoading ? "API 즉시 확인 중..." : "API 즉시 확인"}
        </button>
        <button onClick={onOpenScheduleFlight} style={secondaryButtonStyle}>
          AFOCS SKD 열기
        </button>
      </div>
    </section>
  );
}

function FlightRouteRows({ room }: { room: MonitorRoom | null }) {
  const baseItems = useMemo(() => getFlightRouteItems(room), [room]);
  const orderStorageKey = getScheduleFlightOrderStorageKey(room);
  const [manualOrder, setManualOrder] = useState<string[]>([]);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [startY, setStartY] = useState<number>(0);

  useEffect(() => {
    setManualOrder(loadScheduleFlightOrder(orderStorageKey));
  }, [orderStorageKey]);

  const items = useMemo(
    () => applyScheduleFlightOrder(baseItems, manualOrder),
    [baseItems, manualOrder],
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
      if (nextIndex < items.length) {
        const nextOrder = [...items.map((item) => normalizeSummaryFlightKey(item.flight))];
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
        const nextOrder = [...items.map((item) => normalizeSummaryFlightKey(item.flight))];
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

  return (
    <div style={{ display: "grid", gap: 10, padding: "10px 0" }}>
      {items.length > 0 ? (
        items.map((item, index) => (
          <div
            key={`${item.flight}-${item.route}-${index}`}
            style={{
              ...flightRouteRowStyle,
              background: draggingIndex === index ? "rgba(37, 99, 235, 0.22)" : "rgba(30, 41, 59, 0.45)",
              border: draggingIndex === index ? "1px solid #3b82f6" : "1px solid rgba(148, 163, 184, 0.12)",
              borderRadius: 12,
              padding: "12px 14px",
              transform: draggingIndex === index ? "scale(1.02)" : "scale(1)",
              boxShadow: draggingIndex === index ? "0 8px 24px rgba(0, 0, 0, 0.55)" : "none",
              transition: "transform 0.15s ease, background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
              zIndex: draggingIndex === index ? 10 : 1,
              position: "relative",
            }}
          >
            <div style={flightRouteRowHeaderStyle}>
              <div style={flightRouteTextBlockStyle}>
                <div style={flightRoutePrimaryLineStyle}>
                  <span style={{ ...flightRouteNoStyle, color: getFlightNoColor(item.departureCode, item.arrivalCode) }}>{item.flight}</span>
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
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 8,
                    alignItems: "center",
                    marginTop: 6,
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#dbeafe" }}>
                    {formatRouteInline(item.route)}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#fcd34d", fontVariantNumeric: "tabular-nums" }}>
                    {item.time}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, marginBottom: 8 }}>
                  {item.status && item.status !== "-" ? (
                    <span style={getStatusBadgeStyle(item.status)}>{item.status}</span>
                  ) : null}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingTop: 8,
                    borderTop: "1px solid rgba(148, 163, 184, 0.12)",
                    marginTop: 8,
                  }}
                >
                  <span style={{ color: "#92a7c5", fontSize: 12, fontWeight: 700 }}>
                    등록 번호
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 900, color: "#ffffff" }}>
                    {item.registrationNo || "-"}
                  </span>
                </div>
              </div>
              
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 36,
                  height: 36,
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={draggingIndex === index ? "#60a5fa" : "#94a3b8"} strokeWidth="2.5" strokeLinecap="round">
                  <line x1="4" y1="8" x2="20" y2="8" />
                  <line x1="4" y1="16" x2="20" y2="16" />
                </svg>
              </div>
            </div>
          </div>
        ))
      ) : (
        <div style={infoValueStyle}>저장된 Schedule Flight가 없습니다.</div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoRowStyle}>
      <span style={infoLabelStyle}>{label}</span>
      <span style={infoValueStyle}>{value}</span>
    </div>
  );
}

function getScheduleSummaryTitle(_room: MonitorRoom | null) {
  return "Scheduled Flight";
}

function formatApiLookupTime(value?: string) {
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

function getSummaryFlightOrderIndex(room: MonitorRoom, flight: string) {
  const order = room.flightsInput
    .split(",")
    .map((value) => normalizeSummaryFlightKey(value.trim()))
    .filter(Boolean);

  const index = order.indexOf(normalizeSummaryFlightKey(flight));
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function getFlightRouteItems(room: MonitorRoom | null) {
  if (!room) return [];

  const rows = Array.isArray(room.rows) ? room.rows : [];

  const rowItems = rows
    .map((row) => {
      const flight = getFlightNo(row);
      if (!flight) return null;

      return {
        flight,
        registrationNo: getRegistrationNo(row),
        route: getRouteDisplay(row) || "구간 확인 중",
        direction: "기준",
        status: getComputedStatus(row),
        time: getFlightTimeDisplay(row),
        gate: getGateDisplay(row),
        hasResult: true,
        departureCode: row.departureCode || "",
        arrivalCode: row.arrivalCode || "",
      };
    })
    .filter(
      (item): item is {
        flight: string;
        registrationNo: string;
        route: string;
        direction: string;
        status: string;
        time: string;
        gate: string;
        hasResult: boolean;
        departureCode: string;
        arrivalCode: string;
      } => Boolean(item),
    );

  const uniqueRowMap = new Map<string, {
    flight: string;
    registrationNo: string;
    route: string;
    direction: string;
    status: string;
    time: string;
    gate: string;
    hasResult: boolean;
    departureCode: string;
    arrivalCode: string;
  }>();

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
      gate: "",
      hasResult: false,
      departureCode: "",
      arrivalCode: "",
    }));
}

function getFlightNo(row: FlightRow) {
  return row.flightNo || row.flightId || "";
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

function getRouteDisplay(row?: FlightRow) {
  if (!row) return "";
  const departure = row.departureCode || "";
  const arrival = row.arrivalCode || "";

  if (!departure && !arrival) return "";
  if (departure && arrival) return `${departure}→${arrival}`;
  if (departure) return `${departure}→-`;
  return `-→${arrival}`;
}

function formatRouteInline(value: string) {
  return value.replace(/\s*→\s*/g, " → ");
}

function getDirectionLabel(row?: FlightRow) {
  if (!row) return "운항";
  const remark = `${row.remark || ""} ${row.status || ""}`.toLowerCase();
  const route = getRouteDisplay(row);

  if (remark.includes("arrival") || remark.includes("도착") || route.endsWith("→ICN")) return "도착";
  if (remark.includes("departure") || remark.includes("출발") || route.startsWith("ICN→")) return "출발";

  return "운항";
}

function getComputedStatus(row?: FlightRow) {
  if (!row) return "-";
  const remarkStatus = `${row.status || ""} ${row.remark || ""}`.trim().toUpperCase();

  if (row.canceled || remarkStatus.includes("CANCEL")) return "결항";
  if (row.gateChanged) return "게이트 변경";

  if (remarkStatus.includes("DELAY") || remarkStatus.includes("지연") || row.delay) {
    if (remarkStatus.includes("ARRIV") || remarkStatus.includes("도착") || row.status === "도착") return "도착(지연)";
    if (remarkStatus.includes("DEPAR") || remarkStatus.includes("출발") || row.status === "출발") return "출발(지연)";
    return "지연";
  }

  if (row.status === "출발" || remarkStatus.includes("DEPART") || remarkStatus.includes("DEP") || remarkStatus.includes("출발")) return "출발";
  if (row.status === "도착" || remarkStatus.includes("ARRIV") || remarkStatus.includes("ARR") || remarkStatus.includes("도착")) return "도착";

  return "-";
}

function getFlightTimeDisplay(row?: FlightRow) {
  if (!row) return "-";
  const value = row.formattedEstimatedTime || row.estimatedDateTime || row.formattedScheduleTime || row.scheduleDateTime || "";
  return formatFlightTimeNoYear(value);
}

function getGateDisplay(row?: FlightRow) {
  if (!row) return "";
  return row.gatenumber || "";
}

function formatFlightTimeNoYear(value?: string) {
  if (!value) return "-";

  const normalized = value.replace("T", " ").trim();
  const match = normalized.match(/^(\d{4})[/-](\d{2})[/-](\d{2})\s+(\d{2}):(\d{2})/);

  if (match) {
    const [, year, month, day, hour, minute] = match;
    return `'${year.slice(2)}/${month}/${day} ${hour}:${minute}`;
  }

  return normalized;
}

function getRoomRowsCount(room: MonitorRoom | null) {
  return room?.rows?.length || 0;
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function formatCompactDateTime(value?: string) {
  if (!value) return "-";

  const normalized = value.replace("T", " ").trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);

  if (match) {
    const [, yy, mo, dd, hh, mi] = match;
    return `'${yy.slice(2)}-${mo}-${dd} ${hh}:${mi}`;
  }

  return normalized.slice(0, 16);
}

function formatCompactSlashDateTime(value?: string) {
  if (!value) return "-";

  const normalized = value.replace("T", " ").trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);

  if (match) {
    const [, yy, mo, dd, hh, mi] = match;
    return `'${yy.slice(2)}/${mo}/${dd} ${hh}:${mi}`;
  }

  return normalized.slice(0, 16);
}

function getStatusTone(status: string) {
  if (status.includes("도착")) return "arrival";
  if (status.includes("출발")) return "departure";
  if (status.includes("지연")) return "delay";
  if (status.includes("결항") || status.includes("회항")) return "danger";
  return "normal";
}

function getFlightRouteMetaStyle(status: string): CSSProperties {
  const tone = getStatusTone(status);

  return {
    ...flightRouteMetaStyle,
    color:
      tone === "arrival"
        ? "#86efac"
        : tone === "departure"
          ? "#fca5a5"
          : tone === "delay"
            ? "#fde68a"
            : tone === "danger"
              ? "#fca5a5"
              : "#cbd5e1",
  };
}

function getStatusBadgeStyle(status: string): CSSProperties {
  const tone = getStatusTone(status);

  return {
    padding: "2px 6px",
    borderRadius: 999,
    background:
      tone === "arrival"
        ? "rgba(34, 197, 94, 0.16)"
        : tone === "departure"
          ? "rgba(239, 68, 68, 0.18)"
          : tone === "delay"
            ? "rgba(245, 158, 11, 0.18)"
            : tone === "danger"
              ? "rgba(239, 68, 68, 0.18)"
              : "rgba(148, 163, 184, 0.14)",
  };
}

const apiSyncStatusStyle: CSSProperties = {
  marginTop: 12,
  color: "#fde68a",
  fontSize: 12,
  fontWeight: 850,
  textAlign: "right",
  lineHeight: 1.4,
};

const syncStatusStyle: CSSProperties = {
  marginTop: 12,
  color: "#bfdbfe",
  fontSize: 12,
  fontWeight: 850,
  textAlign: "right",
};

const cardStyle: CSSProperties = {
  background: "#111827",
  border: "1px solid #26374f",
  borderRadius: 22,
  padding: 18,
  boxShadow: "0 18px 45px rgba(0,0,0,0.22)",
};

const cardLabelStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: 2,
  textTransform: "uppercase",
};

const cardTitleStyle: CSSProperties = {
  margin: "4px 0 8px",
  color: "#ef4444",
  fontSize: 22,
  lineHeight: 1.15,
  fontWeight: 950,
  letterSpacing: 0,
};

const summaryTopInfoStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  marginTop: 6,
  marginBottom: 8,
  color: "#cbd5e1",
  fontSize: 12,
  fontWeight: 850,
  lineHeight: 1.4,
};

const apiLookupTimeStyle: CSSProperties = {
  marginTop: -2,
  marginBottom: 10,
  color: "#93c5fd",
  fontSize: 12,
  fontWeight: 850,
  letterSpacing: 0.2,
};

const infoListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  marginTop: 4,
};

const infoRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "86px 1fr",
  gap: 10,
  alignItems: "start",
  padding: "10px 0",
  borderBottom: "1px solid rgba(148, 163, 184, 0.14)",
};

const infoLabelStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 14,
  fontWeight: 800,
};

const infoValueStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 15,
  lineHeight: 1.45,
  fontWeight: 800,
  wordBreak: "break-word",
};

const flightRouteOnlyBlockStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  padding: "10px 0",
  borderBottom: "1px solid rgba(148, 163, 184, 0.14)",
};

const flightRouteRowStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  padding: "4px 0",
  color: "#f8fafc",
  fontWeight: 900,
  lineHeight: 1.32,
};

const flightRouteRowHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  alignItems: "center",
  gap: 8,
};

const flightRouteTextBlockStyle: CSSProperties = {
  minWidth: 0,
};

const flightRoutePrimaryLineStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  flexWrap: "wrap",
  columnGap: 10,
  rowGap: 2,
  minWidth: 0,
};

const flightRouteNoStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 18,
  fontWeight: 950,
  letterSpacing: 0.5,
  whiteSpace: "nowrap",
};

const flightRouteHlStyle: CSSProperties = {
  display: "inline-block",
  color: "#bfdbfe",
  fontSize: 18,
  fontWeight: 950,
  letterSpacing: 0,
  whiteSpace: "nowrap",
};

const flightRouteValueStyle: CSSProperties = {
  color: "#dbeafe",
  fontSize: 18,
  fontWeight: 950,
  wordBreak: "keep-all",
  whiteSpace: "nowrap",
};

const flightRouteMetaStyle: CSSProperties = {
  color: "#fde68a",
  fontSize: 16,
  fontWeight: 950,
  lineHeight: 1.35,
  whiteSpace: "normal",
  overflow: "visible",
  textOverflow: "clip",
  wordBreak: "keep-all",
};

const apiGuideStyle: CSSProperties = {
  color: "#93c5fd",
  fontSize: 12,
  lineHeight: 1.45,
  marginTop: 8,
  marginBottom: 10,
  fontWeight: 750,
};

const buttonStackStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 14,
};

const refreshButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 58,
  border: "1px solid rgba(147, 197, 253, 0.34)",
  borderRadius: 16,
  color: "#dbeafe",
  background: "#0f172a",
  fontSize: 17,
  fontWeight: 950,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 58,
  border: "none",
  borderRadius: 16,
  color: "#ffffff",
  background: "#2563eb",
  fontSize: 17,
  fontWeight: 950,
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
