"use client";

import { getAfocsSkdPlaceholderFromRow } from "../../lib/afocs-skd";
import { normalizeFlightKey } from "../../lib/flight-keys";
import { getFlightNoColor } from "../../lib/flight-status";
import {
  formatMonthDayTime,
  getSortCircleButtonStyle,
  isFinalCompletedStatus,
  isItemInFocusWindow,
} from "../helpers";
import {
  actionBtnStyle,
  backBtnStyle,
  completedBadgeStyle,
  focusBadgeStyle,
  infoCardStyle,
  infoLabelStyle,
  infoValueStyle,
  sectionStyle,
} from "../styles";

export type SelectedRoomSectionProps = {
  activeItems: import("../types").WidgetSummaryItem[];
  activeItemsForSelectedRoom: { excludeReason: string | undefined; flight: string; status: string; departureCode: string; arrivalCode: string; displayTime: string; gate: string; registrationNo?: string | undefined; afocsSkd?: string | undefined; }[];
  backToFlightsHref: string;
  canDragReorder: boolean;
  completedItems: import("../types").WidgetSummaryItem[];
  currentIntervalMinutes: number | null;
  displayItemsForSelectedRoom: { excludeReason: string | undefined; flight: string; status: string; departureCode: string; arrivalCode: string; displayTime: string; gate: string; registrationNo?: string | undefined; afocsSkd?: string | undefined; }[];
  draggingIndex: number | null;
  endDrag: (e: React.PointerEvent<HTMLDivElement>) => void;
  error: string;
  fetchSummary: (room: import("../../lib/flight-types").MonitorRoom) => Promise<void>;
  formatNextRefresh: (date: Date | null) => string;
  handleCameraUpload: (flightNo: string, e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleSortModeChange: (mode: "schedule" | "afocs") => void;
  handleUpdateAfocsSkd: (flight: string, val: string) => Promise<void>;
  loading: boolean;
  nextRefreshAt: Date | null;
  onDragMove: (e: React.PointerEvent<HTMLDivElement>, index: number) => void;
  orderedDisplayItems: import("../types").WidgetSummaryItem[];
  selectedRoom: import("../../lib/flight-types").MonitorRoom | null;
  setShowAllFlights: React.Dispatch<React.SetStateAction<boolean>>;
  showAllFlights: boolean;
  sortMode: "manual" | "schedule" | "afocs";
  startDrag: (e: React.PointerEvent<HTMLDivElement>, index: number) => void;
  summary: import("../types").WidgetSummaryResponse | null;
  visibleDisplayItems: import("../types").WidgetSummaryItem[];
};

/** 선택한 Schedule Flight 편 목록 영역 */
export function SelectedRoomSection({
  activeItems,
  activeItemsForSelectedRoom,
  backToFlightsHref,
  canDragReorder,
  completedItems,
  currentIntervalMinutes,
  displayItemsForSelectedRoom,
  draggingIndex,
  endDrag,
  error,
  fetchSummary,
  formatNextRefresh,
  handleCameraUpload,
  handleSortModeChange,
  handleUpdateAfocsSkd,
  loading,
  nextRefreshAt,
  onDragMove,
  orderedDisplayItems,
  selectedRoom,
  setShowAllFlights,
  showAllFlights,
  sortMode,
  startDrag,
  summary,
  visibleDisplayItems,
}: SelectedRoomSectionProps) {
  return (
    <>
      {selectedRoom && (
          <>
            <section style={sectionStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  marginBottom: 14,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>
                    {selectedRoom.name}
                  </div>
                  <div style={{ color: "#b8c7db", fontSize: 12, marginTop: 4 }}>
                    마지막 저장 조회: {selectedRoom.lastFetchedAt || "-"}
                  </div>
                  <div style={{ color: "#92a7c5", fontSize: 12, marginTop: 6 }}>
                    표시 대상: {displayItemsForSelectedRoom.length}개
                  </div>
                  <div style={{ color: "#92a7c5", fontSize: 12, marginTop: 2 }}>
                    자동조회 대상: {activeItemsForSelectedRoom.length}개
                  </div>
                  <div style={{ color: "#92a7c5", fontSize: 12, marginTop: 2 }}>
                    현재 자동조회 주기:{" "}
                    {currentIntervalMinutes ? `${currentIntervalMinutes}분` : "-"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={() => void fetchSummary(selectedRoom)}
                    disabled={loading}
                    style={actionBtnStyle}
                  >
                    {loading ? "조회중..." : "다시 조회"}
                  </button>

                  <button
                    onClick={() => {
                      window.location.href = backToFlightsHref;
                    }}
                    style={backBtnStyle}
                  >
                    편명조회로 돌아가기
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <div style={infoCardStyle}>
                  <div style={infoLabelStyle}>위젯 대체 갱신 시각</div>
                  <div style={infoValueStyle}>
                    {summary?.updatedAt
                      ? formatMonthDayTime(summary.updatedAt)
                      : "-"}
                  </div>
                </div>

                <div style={infoCardStyle}>
                  <div style={infoLabelStyle}>다음 자동 새로고침</div>
                  <div style={infoValueStyle}>{formatNextRefresh(nextRefreshAt)}</div>
                </div>
              </div>
            </section>

            <section style={sectionStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 15,
                  fontWeight: 800,
                  marginBottom: 8,
                }}
              >
                <span>핵심 요약</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
                {completedItems.length > 0 && (
                  <button
                    onClick={() => setShowAllFlights((prev) => !prev)}
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "4px 10px",
                      borderRadius: 8,
                      border: showAllFlights
                        ? "1px solid rgba(52,211,153,0.5)"
                        : "1px solid rgba(147,197,253,0.35)",
                      background: showAllFlights ? "rgba(52,211,153,0.12)" : "#0f172a",
                      color: showAllFlights ? "#34d399" : "#93c5fd",
                      cursor: "pointer",
                    }}
                  >
                    {showAllFlights ? `총편수보기 ON (${orderedDisplayItems.length}편)` : `총편수보기 (완료 ${completedItems.length}편 숨김)`}
                  </button>
                )}
                </div>
              </div>

              {/* 진행중/완료 미니 통계 */}
              {orderedDisplayItems.length > 0 && (
                <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "#f87171", fontWeight: 700 }}>진행중 {activeItems.length}편</span>
                  <span style={{ fontSize: 12, color: "#34d399", fontWeight: 700 }}>완료 {completedItems.length}편</span>
                </div>
              )}

              {error && (
                <div
                  style={{
                    marginBottom: 12,
                    color: "#fca5a5",
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  {error}
                </div>
              )}

              {!error && !summary && loading && (
                <div style={{ color: "#b8c7db", fontSize: 14 }}>조회중...</div>
              )}

              {!error && visibleDisplayItems.length === 0 && !loading && (
                <div style={{ color: "#b8c7db", fontSize: 14 }}>
                  {orderedDisplayItems.length > 0
                    ? "모든 편이 완료되었습니다. '총편수보기'를 눌러 전체 확인."
                    : "표시할 편명이 없습니다."}
                </div>
              )}

              {visibleDisplayItems.map((item, index) => {
                const completed = isFinalCompletedStatus(item.status);
                const focused = !completed && isItemInFocusWindow(item);

                return (
                  <div
                    key={`${item.flight}-${item.departureCode}-${item.arrivalCode}-${item.displayTime}-${item.gate}`}
                    style={{
                      background: "#091326",
                      border: focused ? "1px solid #fbbf24" : (draggingIndex === index ? "1px solid #3b82f6" : "1px solid #1f2c43"),
                      borderRadius: 14,
                      padding: 14,
                      marginBottom: 10,
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

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          justifyContent: "flex-end",
                        }}
                      >
                        {focused && (
                          <span style={focusBadgeStyle}>집중조회</span>
                        )}

                        {completed && (
                          <span style={completedBadgeStyle}>
                            자동조회 제외{item.excludeReason ? ` · ${item.excludeReason}` : ""}
                          </span>
                        )}

                        <span
                          style={{
                            fontSize: 13,
                            color: "#93c5fd",
                            fontWeight: "bold",
                            background: "rgba(59, 130, 246, 0.14)",
                            border: "1px solid rgba(59, 130, 246, 0.3)",
                            borderRadius: 6,
                            padding: "4px 8px",
                          }}
                        >
                          변경 {item.displayTime || "-"}
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
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          letterSpacing: 0.2,
                        }}
                      >
                        {item.departureCode} → {item.arrivalCode}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span style={{ fontSize: 11, color: "#92a7c5", fontWeight: "bold" }}>
                          AFOCS SKD:
                        </span>
                        <input
                          type="text"
                          value={item.afocsSkd || ""}
                          placeholder={getAfocsSkdPlaceholderFromRow(
                            (selectedRoom?.rows || []).find(
                              (row) =>
                                normalizeFlightKey(row.flightId || row.flightNo || "") ===
                                normalizeFlightKey(item.flight),
                            ),
                          )}
                          onChange={(e) => void handleUpdateAfocsSkd(item.flight, e.target.value)}
                          style={{
                            width: 130,
                            minWidth: 120,
                            background: "#091326",
                            border: "1px solid #3b82f6",
                            color: "#fcd34d",
                            fontWeight: "extrabold",
                            padding: "4px 6px",
                            borderRadius: 8,
                            fontSize: 13,
                            textAlign: "center",
                            fontFamily: "monospace",
                          }}
                        />
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
                      <div style={{ color: "#92a7c5", fontSize: 12 }}>
                        등록 번호
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: "white",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {item.registrationNo || "-"}
                      </div>
                    </div>

                    {/* 현장 사진 업로드 연동 및 순서 드래그 핸들 */}
                    <div
                      style={{
                        borderTop: "1px dashed rgba(255, 255, 255, 0.1)",
                        marginTop: 10,
                        paddingTop: 10,
                        display: "flex",
                        justifyContent: "flex-end",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <label
                        style={{
                          background: "#0284c7",
                          color: "white",
                          borderRadius: 8,
                          padding: "6px 12px",
                          fontSize: 12,
                          fontWeight: "bold",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
                        }}
                      >
                        📸 사진 촬영/업로드
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => void handleCameraUpload(item.flight, e)}
                          style={{ display: "none" }}
                        />
                      </label>

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
                  </div>
                );
              })}
            </section>
          </>
        )}
    </>
  );
}
