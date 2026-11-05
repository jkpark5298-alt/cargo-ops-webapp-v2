"use client";

import { type MonitorRoom } from "../../../lib/flight-types";
import { type FlightAlertHistoryItem } from "../../../lib/flight-alerts";
import { useEffect, useMemo, useState } from "react";
import { normalizeSummaryFlightKey } from "../../../lib/schedule-order";
import { isFinalCompletedFlightStatus } from "../../../lib/flight-status";
import { openCsmChecklistWithFlights } from "../../../lib/csm-checklist";
import {
  formatApiLookupTime,
  formatCompactDateTime,
  getFlightRouteItems,
  getScheduledCountButtonStyle,
  getSortCircleButtonStyle,
  getTotalViewToggleStyle,
  getViewChipStyle,
  isItemInFocusWindow,
} from "../helpers";
import {
  csmTransferButtonStyle,
  csmTransferErrorStyle,
  csmTransferStatusStyle,
  infoValueStyle,
  scheduleMetaRowStyle,
  scheduleSummaryCardHeaderStyle,
  scheduleSummaryCardStyle,
  scheduleSummaryFlightListStyle,
  statsFilterRowStyle,
} from "../styles";
import { useFlightOrderState } from "../hooks/useFlightOrderState";
import { FlightItemCard } from "./FlightItemCard";

export function FlightRouteRows({
  room,
  flightAlertHistory = [],
  flightDeleting = false,
  onDeleteAlertHistoryItem,
  onUpdateAfocsSkd,
  onDeleteFlight,
}: {
  room: MonitorRoom | null;
  flightAlertHistory?: FlightAlertHistoryItem[];
  flightDeleting?: boolean;
  onDeleteAlertHistoryItem?: (item: FlightAlertHistoryItem) => void;
  onUpdateAfocsSkd?: (flight: string, date: string, time: string) => void;
  onDeleteFlight?: (flight: string) => void;
}) {
  const baseItems = useMemo(() => getFlightRouteItems(room), [room]);
  const [expandedFlights, setExpandedFlights] = useState<Record<string, boolean>>({});
  const [pendingDeleteFlight, setPendingDeleteFlight] = useState("");
  const {
    activeItems,
    canDragReorder,
    completedItems,
    draggingIndex,
    endDrag,
    handleSortModeChange,
    items,
    onDragMove,
    setViewMode,
    sortMode,
    startDrag,
    viewMode,
    visibleItems,
  } = useFlightOrderState({ baseItems, room, setPendingDeleteFlight });
  // SSR/CSR Date.now() 차이를 피해 hydration mismatch(React #423)를 막습니다.
  const [focusNowMs, setFocusNowMs] = useState<number | null>(null);
  const [csmTransferStatus, setCsmTransferStatus] = useState("");
  const [csmTransferOk, setCsmTransferOk] = useState(true);

  const toggleExpandFlight = (flight: string) => {
    const key = normalizeSummaryFlightKey(flight);
    setExpandedFlights((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  useEffect(() => {
    if (flightDeleting) return;
    setPendingDeleteFlight("");
  }, [flightDeleting]);

  useEffect(() => {
    setFocusNowMs(Date.now());
    const timer = window.setInterval(() => setFocusNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const handleSendToCsmChecklist = () => {
    const result = openCsmChecklistWithFlights(visibleItems);
    setCsmTransferOk(result.opened);
    setCsmTransferStatus(result.message);
  };

  const visibleFlightLabels = visibleItems.map((item) => item.flight).join(", ");

  return (
    <div style={{ display: "grid", gap: 10, padding: "2px 0 10px" }}>
      {/* AFOCS SKD Schedule Flight 선택 — 상태 필터 */}
      {items.length > 0 && (
        <div style={statsFilterRowStyle}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setViewMode((prev) => (prev === "all" ? "active" : "all"))}
              title="예정(전체) 편 보기"
              style={getScheduledCountButtonStyle(viewMode === "all")}
            >
              예정 {items.length}편
            </button>
            <button
              type="button"
              onClick={() => setViewMode((prev) => (prev === "completed" ? "active" : "completed"))}
              title="완료 편만 보기"
              style={getViewChipStyle(viewMode === "completed", "completed")}
            >
              완료 {completedItems.length}편
            </button>
            <button
              type="button"
              onClick={() => setViewMode("active")}
              title="진행중 편만 보기"
              style={getViewChipStyle(viewMode === "active", "active")}
            >
              진행중 {activeItems.length}편
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {completedItems.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setViewMode((prev) => (prev === "all" || prev === "completed" ? "active" : "all"))
                }
                style={getTotalViewToggleStyle(viewMode === "all" || viewMode === "completed")}
              >
                {viewMode === "all"
                  ? `총편수보기 ON (완료 ${completedItems.length}편)`
                  : viewMode === "completed"
                    ? `완료 ${completedItems.length}편 표시 중`
                    : `총편수보기 (완료 ${completedItems.length}편 숨김)`}
              </button>
            )}
            <button
              type="button"
              onClick={handleSendToCsmChecklist}
              title="편명(KJ 제외)과 SPOT(주기장)만 CSM CHECK LIST로 전달"
              style={csmTransferButtonStyle}
            >
              CSM 전달
            </button>
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
      {csmTransferStatus ? (
        <div style={csmTransferOk ? csmTransferStatusStyle : csmTransferErrorStyle}>
          {csmTransferStatus}
        </div>
      ) : null}

      {/* AFOCS SKD Schedule Flight 선택 — 요약 카드 */}
      {room && items.length > 0 && (
        <div style={scheduleSummaryCardStyle}>
          <div style={scheduleSummaryCardHeaderStyle}>
            <div style={{ fontSize: 15, fontWeight: 800, minWidth: 0, wordBreak: "break-word" }}>
              {room.name || "Schedule Flight"}
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: 8 }}>
              <span style={{ fontSize: 11, color: "#b8c7db", fontWeight: 700 }}>총 {items.length}</span>
              <span style={{ fontSize: 11, color: "#34d399", fontWeight: 700 }}>✓{completedItems.length}</span>
              <span style={{ fontSize: 11, color: "#f87171", fontWeight: 700 }}>▶{activeItems.length}</span>
            </div>
          </div>
          <div style={scheduleSummaryFlightListStyle}>
            {visibleFlightLabels || "-"}
          </div>
        </div>
      )}

      {room ? (
        <div style={scheduleMetaRowStyle}>
          <span>
            조회범위 {formatCompactDateTime(room.startDateTime)} ~ {formatCompactDateTime(room.endDateTime)}
          </span>
          <span style={{ color: "#93c5fd" }}>
            마지막 API 확인 {formatApiLookupTime(room.lastFetchedAt)}
          </span>
        </div>
      ) : null}

      {visibleItems.length > 0 ? (
        visibleItems.map((item, index) => {
          const completed = isFinalCompletedFlightStatus(item.status);
          const focused =
            focusNowMs != null && !completed && isItemInFocusWindow(item, focusNowMs);

          return (
          <FlightItemCard key={`${normalizeSummaryFlightKey(item.flight)}-${item.route}`} canDragReorder={canDragReorder} completed={completed} draggingIndex={draggingIndex} endDrag={endDrag} expandedFlights={expandedFlights} flightAlertHistory={flightAlertHistory} flightDeleting={flightDeleting} focused={focused} index={index} item={item} onDeleteAlertHistoryItem={onDeleteAlertHistoryItem} onDeleteFlight={onDeleteFlight} onDragMove={onDragMove} onUpdateAfocsSkd={onUpdateAfocsSkd} pendingDeleteFlight={pendingDeleteFlight} setPendingDeleteFlight={setPendingDeleteFlight} startDrag={startDrag} toggleExpandFlight={toggleExpandFlight} />
          );
        })
      ) : items.length > 0 ? (
        <div style={{ ...infoValueStyle, color: "#b8c7db", fontSize: 13 }}>
          {viewMode === "completed"
            ? `표시할 완료 편이 없습니다. (완료 ${completedItems.length}편)`
            : `모든 편이 완료되었습니다. (완료 ${completedItems.length}편) '완료' 또는 '총편수보기'를 눌러 확인하세요.`}
        </div>
      ) : (
        <div style={infoValueStyle}>저장된 Schedule Flight가 없습니다.</div>
      )}
    </div>
  );
}
