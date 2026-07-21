"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { FlightRow, MonitorRoom } from "../page";
import type { FlightAlertHistoryItem } from "../lib/flight-alerts";
import { formatAlertTitle, renderAlertDescription, formatHistoryTime } from "./FlightAlertHistoryCard";

type ScheduleSummaryCardProps = {
  latestRoom: MonitorRoom | null;
  syncCheckedAt: string;
  apiSyncStatus: string;
  apiSyncLoading: boolean;
  onOpenScheduleFlight: () => void;
  onRefreshLatestSchedule: () => void;
  flightAlertHistory?: FlightAlertHistoryItem[];
  onDeleteAlertHistoryItem?: (item: FlightAlertHistoryItem) => void;
};

export function ScheduleSummaryCard({
  latestRoom,
  syncCheckedAt,
  apiSyncStatus,
  apiSyncLoading,
  onOpenScheduleFlight,
  onRefreshLatestSchedule,
  flightAlertHistory = [],
  onDeleteAlertHistoryItem,
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
        <FlightRouteRows
          room={latestRoom}
          flightAlertHistory={flightAlertHistory}
          onDeleteAlertHistoryItem={onDeleteAlertHistoryItem}
        />
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

type FlightSortMode = "manual" | "schedule" | "afocs";

type FlightRouteItem = {
  flight: string;
  registrationNo: string;
  route: string;
  direction: string;
  status: string;
  time: string;
  displayTime: string;
  afocsSkd: string;
  gate: string;
  hasResult: boolean;
  departureCode: string;
  arrivalCode: string;
};

function isFinalCompletedFlightStatus(status: string) {
  if (!status || status === "-") return false;
  const s = status.toLowerCase();
  return (
    s.includes("도착") ||
    s.includes("출발") ||
    s.includes("결항") ||
    s === "arrival" ||
    s === "departure" ||
    s === "cancel" ||
    s === "cancelled"
  );
}

function FlightRouteRows({
  room,
  flightAlertHistory = [],
  onDeleteAlertHistoryItem,
}: {
  room: MonitorRoom | null;
  flightAlertHistory?: FlightAlertHistoryItem[];
  onDeleteAlertHistoryItem?: (item: FlightAlertHistoryItem) => void;
}) {
  const baseItems = useMemo(() => getFlightRouteItems(room), [room]);
  const orderStorageKey = getScheduleFlightOrderStorageKey(room);
  const [manualOrder, setManualOrder] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<FlightSortMode>("manual");
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [startY, setStartY] = useState<number>(0);
  const [showAll, setShowAll] = useState(false);
  const [expandedFlights, setExpandedFlights] = useState<Record<string, boolean>>({});

  const toggleExpandFlight = (flight: string) => {
    const key = normalizeSummaryFlightKey(flight);
    setExpandedFlights((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  useEffect(() => {
    setManualOrder(loadScheduleFlightOrder(orderStorageKey));
  }, [orderStorageKey]);

  const items = useMemo(
    () => sortFlightItemsByMode(baseItems, sortMode, manualOrder),
    [baseItems, sortMode, manualOrder],
  );

  const completedItems = useMemo(
    () => items.filter((item) => isFinalCompletedFlightStatus(item.status)),
    [items],
  );
  const activeItems = useMemo(
    () => items.filter((item) => !isFinalCompletedFlightStatus(item.status)),
    [items],
  );
  const visibleItems = showAll ? items : activeItems;
  const canDragReorder = sortMode === "manual";

  const handleSortModeChange = (mode: "schedule" | "afocs") => {
    setSortMode((prev) => (prev === mode ? "manual" : mode));
    setDraggingIndex(null);
  };

  const startDrag = (e: React.PointerEvent<HTMLDivElement>, index: number) => {
    if (!canDragReorder || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingIndex(index);
    setStartY(e.clientY);
  };

  const onDragMove = (e: React.PointerEvent<HTMLDivElement>, index: number) => {
    if (!canDragReorder || draggingIndex === null || draggingIndex !== index) return;
    const deltaY = e.clientY - startY;
    const threshold = 40; // Swap items if dragged past 40px

    if (deltaY > threshold) {
      const nextIndex = draggingIndex + 1;
      if (nextIndex < visibleItems.length) {
        const nextOrder = [...visibleItems.map((item) => normalizeSummaryFlightKey(item.flight))];
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
        const nextOrder = [...visibleItems.map((item) => normalizeSummaryFlightKey(item.flight))];
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
      {/* 스탈 통계 + 총편수보기 토글 */}
      {items.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            paddingBottom: 8,
            borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#b8c7db", fontWeight: 700 }}>예정 {items.length}편</span>
            <span
              style={{
                fontSize: 12,
                color: "#34d399",
                fontWeight: 700,
                background: "rgba(52,211,153,0.10)",
                border: "1px solid rgba(52,211,153,0.25)",
                borderRadius: 6,
                padding: "1px 7px",
              }}
            >
              완료 {completedItems.length}편
            </span>
            <span
              style={{
                fontSize: 12,
                color: "#f87171",
                fontWeight: 700,
                background: "rgba(248,113,113,0.10)",
                border: "1px solid rgba(248,113,113,0.25)",
                borderRadius: 6,
                padding: "1px 7px",
              }}
            >
              진행중 {activeItems.length}편
            </span>
          </div>
          {completedItems.length > 0 && (
            <button
              onClick={() => setShowAll((prev) => !prev)}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 9px",
                borderRadius: 7,
                border: showAll
                  ? "1px solid rgba(52,211,153,0.5)"
                  : "1px solid rgba(147,197,253,0.35)",
                background: showAll ? "rgba(52,211,153,0.12)" : "rgba(15,23,42,0.6)",
                color: showAll ? "#34d399" : "#93c5fd",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {showAll ? `총편수보기 ON` : `총편수보기 (완료 ${completedItems.length}편 숨김)`}
            </button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>정렬</span>
            <button
              type="button"
              onClick={() => handleSortModeChange("schedule")}
              title="변경 시간 기준 정렬"
              style={getSortCircleButtonStyle(sortMode === "schedule")}
            >
              S
            </button>
            <button
              type="button"
              onClick={() => handleSortModeChange("afocs")}
              title="AFOCS SKD 기준 정렬"
              style={getSortCircleButtonStyle(sortMode === "afocs")}
            >
              A
            </button>
          </div>
        </div>
      )}

      {visibleItems.length > 0 ? (
        visibleItems.map((item, index) => {
          const completed = isFinalCompletedFlightStatus(item.status);
          const focused = !completed && isItemInFocusWindow(item);

          return (
          <div
            key={`${item.flight}-${item.route}-${index}`}
            style={{
              background: "#091326",
              border: focused ? "1px solid #fbbf24" : (draggingIndex === index ? "1px solid #3b82f6" : "1px solid #1f2c43"),
              borderRadius: 14,
              padding: 14,
              marginBottom: 2,
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

              <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
                {focused ? <span style={focusBadgeStyle}>집중조회</span> : null}
                {completed ? <span style={completedBadgeStyle}>자동조회 제외</span> : null}
                <span style={changeTimeBadgeStyle}>
                  변경 {item.displayTime || item.time || "-"}
                </span>
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
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.2, color: "#dbeafe" }}>
                {item.departureCode || "-"} → {item.arrivalCode || "-"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#92a7c5", fontWeight: "bold" }}>AFOCS SKD:</span>
                <span style={afocsSkdDisplayStyle}>{item.afocsSkd || "-"}</span>
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
              <div style={{ color: "#92a7c5", fontSize: 12 }}>등록 번호</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "white", fontVariantNumeric: "tabular-nums" }}>
                {item.registrationNo || "-"}
              </div>
            </div>

            {(() => {
              const flightKey = item.flight.replace(/\s+/g, "").toUpperCase();
              const matchedAlerts = flightAlertHistory.filter((alert) => {
                const keyMatch = alert.key.replace(/\s+/g, "").toUpperCase().includes(flightKey);
                const titleMatch = alert.title.replace(/\s+/g, "").toUpperCase().includes(flightKey);
                const descMatch = alert.description.replace(/\s+/g, "").toUpperCase().includes(flightKey);
                return keyMatch || titleMatch || descMatch;
              });

              if (matchedAlerts.length === 0) return null;

              const isExpanded = expandedFlights[normalizeSummaryFlightKey(item.flight)];

              return (
                <div
                  style={{
                    marginTop: 10,
                    padding: "8px 10px",
                    borderRadius: 10,
                    background: "rgba(30, 41, 59, 0.5)",
                    border: "1px solid rgba(148, 163, 184, 0.15)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpandFlight(item.flight)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "3px 8px",
                      borderRadius: 6,
                      border: "1px solid rgba(147, 197, 253, 0.25)",
                      background: "rgba(147, 197, 253, 0.08)",
                      color: "#93c5fd",
                      fontSize: 11,
                      fontWeight: 850,
                      cursor: "pointer",
                    }}
                  >
                    <span>🔔</span>
                    <span>
                      {isExpanded
                        ? `알림 이력 접기 (${matchedAlerts.length}건)`
                        : `알림 이력보기 (${matchedAlerts.length}건)`}
                    </span>
                  </button>

                  {isExpanded ? (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, paddingTop: 8, borderTop: "1px solid rgba(148, 163, 184, 0.15)" }}>
                      {matchedAlerts.map((alert, alertIndex) => (
                        <div
                          key={`${alert.key}-${alertIndex}`}
                          style={{
                            padding: "6px 8px",
                            borderRadius: 8,
                            background: "rgba(15, 23, 42, 0.35)",
                            border: "1px solid rgba(148, 163, 184, 0.08)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 6 }}>
                            <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>
                              {formatHistoryTime(alert.checkedAt, true)}
                            </span>
                            {onDeleteAlertHistoryItem ? (
                              <button
                                type="button"
                                onClick={() => onDeleteAlertHistoryItem(alert)}
                                style={{
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: "rgba(239, 68, 68, 0.15)",
                                  border: "1px solid rgba(239, 68, 68, 0.3)",
                                  color: "#fca5a5",
                                  fontSize: 10,
                                  fontWeight: 900,
                                  cursor: "pointer",
                                }}
                              >
                                삭제
                              </button>
                            ) : null}
                          </div>
                          <div style={{ color: "#fef3c7", fontSize: 12, fontWeight: 900, marginBottom: 2 }}>
                            {formatAlertTitle(alert.title, alert.description)}
                          </div>
                          <div style={{ color: "#fde68a", fontSize: 11, lineHeight: 1.4, fontWeight: 750 }}>
                            {renderAlertDescription(alert.description, alert.checkedAt)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })()}

            {canDragReorder ? (
              <div
                style={{
                  borderTop: "1px dashed rgba(255, 255, 255, 0.1)",
                  marginTop: 10,
                  paddingTop: 10,
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                }}
              >
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
              </div>
            ) : null}
          </div>
          );
        })
      ) : items.length > 0 ? (
        <div style={{ ...infoValueStyle, color: "#b8c7db", fontSize: 13 }}>
          모든 편이 완료되었습니다. '총편수보기'를 눌러 전체 확인하세요.
        </div>
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
        displayTime: formatMonthDayTime(
          row.formattedEstimatedTime ||
            row.estimatedDateTime ||
            row.formattedScheduleTime ||
            row.scheduleDateTime ||
            "",
        ),
        afocsSkd: row.afocsSkd || "",
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
      afocsSkd: "",
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

function parseDateTime(value?: string | null): Date | null {
  if (!value || value === "-") return null;

  const raw = value.trim().replace(/\./g, "-").replace(/\//g, "-").replace("T", " ");
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const fullMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (fullMatch) {
    const [, y, m, d, hh, mm, ss] = fullMatch;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss || "0"));
  }

  const monthDayMatch = raw.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (monthDayMatch) {
    const [, m, d, hh, mm] = monthDayMatch;
    const now = new Date();
    return new Date(now.getFullYear(), Number(m) - 1, Number(d), Number(hh), Number(mm), 0);
  }

  return null;
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

function getItemDirection(item: Pick<FlightRouteItem, "departureCode" | "arrivalCode">) {
  const dep = (item.departureCode || "").toUpperCase();
  const arr = (item.arrivalCode || "").toUpperCase();

  if (dep === "ICN") return "departure";
  if (arr === "ICN") return "arrival";
  return "unknown";
}

function isItemInFocusWindow(item: FlightRouteItem) {
  const dt = parseDateTime(item.displayTime || item.time);
  if (!dt) return false;

  const now = Date.now();
  const t = dt.getTime();
  const direction = getItemDirection(item);

  if (direction === "departure") {
    return now >= t - 30 * 60 * 1000 && now <= t + 60 * 60 * 1000;
  }

  if (direction === "arrival") {
    return now >= t - 60 * 60 * 1000 && now <= t + 30 * 60 * 1000;
  }

  return false;
}

function parseAfocsSkdSortValue(value?: string) {
  if (!value || value === "-") return Number.MAX_SAFE_INTEGER;

  const normalized = value.trim();
  const timeMatch = normalized.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    return Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
  }

  const dt = parseDateTime(normalized);
  if (dt) return dt.getHours() * 60 + dt.getMinutes();

  return Number.MAX_SAFE_INTEGER;
}

function parseScheduleSortValue(item: FlightRouteItem) {
  const dt = parseDateTime(item.displayTime || item.time);
  return dt ? dt.getTime() : Number.MAX_SAFE_INTEGER;
}

function sortFlightItemsByMode(items: FlightRouteItem[], mode: FlightSortMode, manualOrder: string[]) {
  if (mode === "manual") {
    return applyScheduleFlightOrder(items, manualOrder);
  }

  return [...items].sort((a, b) => {
    if (mode === "schedule") {
      return parseScheduleSortValue(a) - parseScheduleSortValue(b);
    }

    const diff = parseAfocsSkdSortValue(a.afocsSkd) - parseAfocsSkdSortValue(b.afocsSkd);
    if (diff !== 0) return diff;
    return parseScheduleSortValue(a) - parseScheduleSortValue(b);
  });
}

function getSortCircleButtonStyle(active: boolean): CSSProperties {
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

const changeTimeBadgeStyle: CSSProperties = {
  fontSize: 13,
  color: "#93c5fd",
  fontWeight: "bold",
  background: "rgba(59, 130, 246, 0.14)",
  border: "1px solid rgba(59, 130, 246, 0.3)",
  borderRadius: 6,
  padding: "4px 8px",
};

const afocsSkdDisplayStyle: CSSProperties = {
  minWidth: 52,
  color: "#fcd34d",
  fontWeight: 800,
  padding: "4px 8px",
  borderRadius: 8,
  fontSize: 13,
  textAlign: "center",
  fontFamily: "monospace",
  background: "rgba(252, 211, 77, 0.08)",
  border: "1px solid rgba(59, 130, 246, 0.35)",
};
