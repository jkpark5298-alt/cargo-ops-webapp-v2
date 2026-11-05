"use client";

import { getDatePart, getTimePart } from "../lib/helpers";
import { REFRESH_INTERVAL_MINUTES } from "../lib/constants";
import {
  afocsSkdLinkBtn,
  badgeNormal,
  badgeOrange,
  badgePurple,
  badgeRed,
  inlineDateInputStyle,
  refreshBtn,
} from "../styles";
import { TimeSelect24 } from "./TimeSelect24";

export type ScheduleRoomEditorProps = {
  endDateTime: string;
  flightMode: import("../lib/schedule-slots").FlightMode;
  handleEndDateChange: (value: string) => void;
  handleEndTimeChange: (value: string) => void;
  handleStartDateChange: (value: string) => void;
  handleStartTimeChange: (value: string) => void;
  loading: boolean;
  openAfocsSkd: () => void;
  refreshSelectedRoom: () => Promise<void>;
  selectedRoom: import("../../lib/flight-types").MonitorRoom | null;
  selectedRoomCounts: { delay: number; gateChanged: number; canceled: number; } | null;
  startDateTime: string;
};

/** 선택한 Schedule Flight 카드 편집 영역 */
export function ScheduleRoomEditor({
  endDateTime,
  flightMode,
  handleEndDateChange,
  handleEndTimeChange,
  handleStartDateChange,
  handleStartTimeChange,
  loading,
  openAfocsSkd,
  refreshSelectedRoom,
  selectedRoom,
  selectedRoomCounts,
  startDateTime,
}: ScheduleRoomEditorProps) {
  return (
    <>
      {selectedRoom && flightMode === "edit" && (
          <div
            style={{
              marginTop: 20,
              padding: 18,
              background: "#0d1a30",
              border: "1px solid #2b4269",
              borderRadius: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 20,
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 360 }}>
                <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>
                  선택된 Monitor 상세
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                  {selectedRoom.name}
                </div>
                <div style={{ color: "#cbd5e1", marginBottom: 6 }}>
                  편명: {selectedRoom.flightsInput}
                </div>
                <div style={{ color: "#cbd5e1", marginBottom: 6 }}>
                  Schedule Flight 기간:{" "}
                  {(selectedRoom.startDateTime || startDateTime).replace("T", " ")} ~{" "}
                  {(selectedRoom.endDateTime || endDateTime).replace("T", " ")}
                </div>
                <div style={{ color: "#cbd5e1", marginBottom: 6 }}>
                  마지막 조회: {selectedRoom.lastFetchedAt || "-"}
                </div>
                <div style={{ color: selectedRoom.fixed ? "#facc15" : "#cbd5e1", marginBottom: 12 }}>
                  상태: {selectedRoom.fixed ? "Schedule Flight" : "일반"}
                </div>

                {selectedRoom.fixed && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 14,
                      background: "#0a1528",
                      border: "1px solid #28436b",
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 12, color: "#e5edf7" }}>
                      Schedule Flight 조회 기간 수정
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "90px 1fr 90px 160px",
                        gap: 10,
                        alignItems: "center",
                        marginBottom: 10,
                      }}
                    >
                      <label style={{ color: "#9fb3c8", fontSize: 13 }}>시작일</label>
                      <input
                        type="date"
                        value={getDatePart(startDateTime)}
                        onChange={(e) => handleStartDateChange(e.target.value)}
                        style={inlineDateInputStyle}
                      />

                      <label style={{ color: "#9fb3c8", fontSize: 13 }}>시작시간</label>
                      <TimeSelect24
                        value={getTimePart(startDateTime)}
                        onChange={handleStartTimeChange}
                      />
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "90px 1fr 90px 160px",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <label style={{ color: "#9fb3c8", fontSize: 13 }}>종료일</label>
                      <input
                        type="date"
                        value={getDatePart(endDateTime)}
                        onChange={(e) => handleEndDateChange(e.target.value)}
                        style={inlineDateInputStyle}
                      />

                      <label style={{ color: "#9fb3c8", fontSize: 13 }}>종료시간</label>
                      <TimeSelect24
                        value={getTimePart(endDateTime)}
                        onChange={handleEndTimeChange}
                      />
                    </div>

                    <div style={{ color: "#93c5fd", marginTop: 12, fontSize: 13 }}>
                      PC 화면은 자동조회하지 않습니다.
                    </div>
                    <div style={{ color: "#93c5fd", marginTop: 4, fontSize: 13 }}>
                      자동조회는 AFOCS SKD에서만 {REFRESH_INTERVAL_MINUTES}분마다 적용됩니다.
                    </div>
                  </div>
                )}
              </div>

              <div style={{ minWidth: 260 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>이상 현황</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                  {selectedRoomCounts && selectedRoomCounts.delay > 0 && (
                    <span style={badgeOrange}>지연 {selectedRoomCounts.delay}건</span>
                  )}
                  {selectedRoomCounts && selectedRoomCounts.gateChanged > 0 && (
                    <span style={badgePurple}>
                      게이트 변경 {selectedRoomCounts.gateChanged}건
                    </span>
                  )}
                  {selectedRoomCounts && selectedRoomCounts.canceled > 0 && (
                    <span style={badgeRed}>결항 {selectedRoomCounts.canceled}건</span>
                  )}
                  {selectedRoomCounts &&
                    selectedRoomCounts.delay +
                      selectedRoomCounts.gateChanged +
                      selectedRoomCounts.canceled ===
                      0 && <span style={badgeNormal}>이상 없음</span>}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={() => void refreshSelectedRoom()} disabled={loading} style={refreshBtn}>
                    선택된 Monitor 다시 조회
                  </button>

                  <button
                    onClick={openAfocsSkd}
                    style={afocsSkdLinkBtn}
                    title="Monthly Scheduled Flight 화면 열기"
                  >
                    Monthly SKD 열기
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
    </>
  );
}
