"use client";

import { normalizeFlightsInput } from "../../lib/flight-keys";
import { LAST_FIXED_ROOM_KEY } from "../constants";
import { getCompletedFlightSetFromRows, isFinalCompletedStatus, roomButtonStyle } from "../helpers";
import { sectionStyle } from "../styles";

export type FixedRoomsSectionProps = {
  activeItems: import("../types").WidgetSummaryItem[];
  completedItems: import("../types").WidgetSummaryItem[];
  fixedRooms: import("../../lib/flight-types").MonitorRoom[];
  lastKnownItemsByRoom: Record<string, import("../types").WidgetSummaryItem[]>;
  orderedDisplayItems: import("../types").WidgetSummaryItem[];
  selectedRoom: import("../../lib/flight-types").MonitorRoom | null;
  selectedRoomId: string;
  serverSyncLoading: boolean;
  setSelectedRoomId: React.Dispatch<React.SetStateAction<string>>;
};

/** 고정 Schedule Flight 카드 선택 영역 */
export function FixedRoomsSection({
  activeItems,
  completedItems,
  fixedRooms,
  lastKnownItemsByRoom,
  orderedDisplayItems,
  selectedRoom,
  selectedRoomId,
  serverSyncLoading,
  setSelectedRoomId,
}: FixedRoomsSectionProps) {
  return (
    <section style={sectionStyle}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>
            Schedule Flight 선택
          </div>

          {/* 통계 요약 */}
          {selectedRoom && orderedDisplayItems.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 13, color: "#b8c7db", fontWeight: 700 }}>
                총 {orderedDisplayItems.length}편
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: "#34d399",
                  fontWeight: 700,
                  background: "rgba(52,211,153,0.10)",
                  border: "1px solid rgba(52,211,153,0.25)",
                  borderRadius: 6,
                  padding: "2px 8px",
                }}
              >
                완료 {completedItems.length}편
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: "#f87171",
                  fontWeight: 700,
                  background: "rgba(248,113,113,0.10)",
                  border: "1px solid rgba(248,113,113,0.25)",
                  borderRadius: 6,
                  padding: "2px 8px",
                }}
              >
                진행중 {activeItems.length}편
              </span>
            </div>
          )}

          {serverSyncLoading ? (
            <div style={{ color: "#b8c7db", fontSize: 14 }}>
              최근 Schedule Flight 기준을 동기화 중입니다.
            </div>
          ) : fixedRooms.length === 0 ? (
            <div style={{ color: "#b8c7db", fontSize: 14 }}>
              저장된 Schedule Flight가 없습니다.
              <br />
              먼저 편명 조회 화면에서 Schedule Flight를 선택 저장해 주세요.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 10,
              }}
            >
              {fixedRooms.map((room) => {
                // 각 room의 편명 목록에서 통계 계산
                const roomFlights = normalizeFlightsInput(room.flightsInput);
                const roomCompletedSet = getCompletedFlightSetFromRows(room.rows || []);
                const roomKnownItems = lastKnownItemsByRoom[room.id] || [];
                const roomCompletedFromSummary = new Set(
                  roomKnownItems.filter((it) => isFinalCompletedStatus(it.status)).map((it) => it.flight)
                );
                const roomTotalCount = roomFlights.length;
                const roomCompletedCount = roomFlights.filter(
                  (f) => roomCompletedSet.has(f) || roomCompletedFromSummary.has(f)
                ).length;
                const roomActiveCount = roomTotalCount - roomCompletedCount;

                return (
                  <button
                    key={room.id}
                    onClick={() => {
                      setSelectedRoomId(room.id);
                      localStorage.setItem(LAST_FIXED_ROOM_KEY, room.id);
                    }}
                    style={roomButtonStyle(room.id === selectedRoomId)}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: 4,
                      }}
                    >
                      <div style={{ fontSize: 15, fontWeight: 800 }}>{room.name}</div>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: 8 }}>
                        <span style={{ fontSize: 11, color: "#b8c7db", fontWeight: 700 }}>총 {roomTotalCount}</span>
                        <span style={{ fontSize: 11, color: "#34d399", fontWeight: 700 }}>✓{roomCompletedCount}</span>
                        <span style={{ fontSize: 11, color: "#f87171", fontWeight: 700 }}>▶{roomActiveCount}</span>
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#b8c7db",
                        wordBreak: "break-all",
                      }}
                    >
                      {room.flightsInput}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
  );
}
