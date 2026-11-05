"use client";

import { normalizeSummaryFlightKey } from "../../../lib/schedule-order";
import { getFlightNoColor } from "../../../lib/flight-status";
import {
  formatAlertTitle,
  formatHistoryTime,
  renderAlertDescription,
} from "../../flight-alert-history/helpers";
import { completedBadgeStyle, focusBadgeStyle } from "../styles";
import { CompactDateTimeFields } from "./CompactDateTimeFields";

export type FlightItemCardProps = {
  canDragReorder: boolean;
  completed: boolean;
  draggingIndex: number | null;
  endDrag: (e: React.PointerEvent<HTMLDivElement>) => void;
  expandedFlights: Record<string, boolean>;
  flightAlertHistory: import("../../../lib/flight-alerts").FlightAlertHistoryItem[];
  flightDeleting: boolean;
  focused: boolean;
  index: number;
  item: import("../types").FlightRouteItem;
  onDeleteAlertHistoryItem: ((item: import("../../../lib/flight-alerts").FlightAlertHistoryItem) => void) | undefined;
  onDeleteFlight: ((flight: string) => void) | undefined;
  onDragMove: (e: React.PointerEvent<HTMLDivElement>, index: number) => void;
  onUpdateAfocsSkd: ((flight: string, date: string, time: string) => void) | undefined;
  pendingDeleteFlight: string;
  setPendingDeleteFlight: React.Dispatch<React.SetStateAction<string>>;
  startDrag: (e: React.PointerEvent<HTMLDivElement>, index: number) => void;
  toggleExpandFlight: (flight: string) => void;
};

/** 요약 카드의 편 1건 (상태·시간·AFOCS·삭제·정렬 컨트롤) */
export function FlightItemCard({
  canDragReorder,
  completed,
  draggingIndex,
  endDrag,
  expandedFlights,
  flightAlertHistory,
  flightDeleting,
  focused,
  index,
  item,
  onDeleteAlertHistoryItem,
  onDeleteFlight,
  onDragMove,
  onUpdateAfocsSkd,
  pendingDeleteFlight,
  setPendingDeleteFlight,
  startDrag,
  toggleExpandFlight,
}: FlightItemCardProps) {
  return (
    <div
            key={`${normalizeSummaryFlightKey(item.flight)}-${item.route}`}
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

              <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
                {focused ? <span style={focusBadgeStyle}>집중조회</span> : null}
                {completed ? <span style={completedBadgeStyle}>자동조회 제외</span> : null}
                <CompactDateTimeFields
                  label="AFOCS"
                  date={item.afocsSkdDate}
                  time={item.afocsSkdTime}
                  tone="afocs"
                  flight={item.flight}
                  editable={Boolean(onUpdateAfocsSkd) && !flightDeleting}
                  onSave={onUpdateAfocsSkd}
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.2, color: "#dbeafe", whiteSpace: "nowrap" }}>
                {item.departureCode || "-"} → {item.arrivalCode || "-"}
              </div>
              <CompactDateTimeFields
                label="변경"
                date={item.changeTimeDate}
                time={item.changeTimeTime}
                tone="change"
                readOnly
              />
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

            {canDragReorder || onDeleteFlight ? (
              <div
                style={{
                  borderTop: "1px dashed rgba(255, 255, 255, 0.1)",
                  marginTop: 10,
                  paddingTop: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {onDeleteFlight ? (
                  (() => {
                    const flightKey = normalizeSummaryFlightKey(item.flight);
                    const isPendingDelete = pendingDeleteFlight === flightKey;
                    const isThisDeleting = flightDeleting && isPendingDelete;

                    if (isPendingDelete) {
                      return (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: "#fca5a5", fontWeight: 750 }}>
                            {item.flight} 삭제할까요?
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (flightDeleting) return;
                              onDeleteFlight(item.flight);
                            }}
                            disabled={flightDeleting}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: "1px solid rgba(248, 113, 113, 0.55)",
                              background: "rgba(239, 68, 68, 0.22)",
                              color: "#fecaca",
                              fontSize: 12,
                              fontWeight: 900,
                              cursor: flightDeleting ? "wait" : "pointer",
                              opacity: flightDeleting ? 0.65 : 1,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {isThisDeleting || flightDeleting ? "삭제 중..." : "삭제 확인"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteFlight("")}
                            disabled={flightDeleting}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: "1px solid rgba(148, 163, 184, 0.35)",
                              background: "rgba(15, 23, 42, 0.55)",
                              color: "#cbd5e1",
                              fontSize: 12,
                              fontWeight: 800,
                              cursor: flightDeleting ? "not-allowed" : "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            취소
                          </button>
                        </div>
                      );
                    }

                    return (
                      <button
                        type="button"
                        onClick={() => setPendingDeleteFlight(flightKey)}
                        disabled={flightDeleting}
                        title={`${item.flight} 편명 삭제`}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid rgba(248, 113, 113, 0.4)",
                          background: "rgba(239, 68, 68, 0.12)",
                          color: "#fca5a5",
                          fontSize: 12,
                          fontWeight: 850,
                          cursor: flightDeleting ? "wait" : "pointer",
                          opacity: flightDeleting ? 0.65 : 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        편 삭제
                      </button>
                    );
                  })()
                ) : (
                  <span />
                )}
                {canDragReorder ? (
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
                    marginLeft: "auto",
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
                ) : null}
              </div>
            ) : null}
          </div>
  );
}
