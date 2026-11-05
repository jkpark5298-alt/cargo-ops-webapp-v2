"use client";

import { type useRouter } from "next/navigation";
import { getDatePart, getTimePart } from "../lib/helpers";
import {
  dateInputStyle,
  disabledBtn,
  homeButtonStyle,
  modeActiveBtn,
  modeBtn,
  primaryBtn,
  queryButtonRowStyle,
  saveScheduleBtn,
  scheduleSaveGuideStyle,
} from "../styles";
import { TimeSelect24 } from "./TimeSelect24";

export type QueryPanelProps = {
  clearSelectedScheduleFlight: () => Promise<void>;
  currentRangeText: string;
  endDateTime: string;
  fetchAllKjFlights: () => Promise<void>;
  fetchFlights: (flightArg?: string | undefined) => Promise<void>;
  fixed: boolean;
  flightMode: import("../lib/schedule-slots").FlightMode;
  handleClearAllScheduleRows: () => void;
  handleEndDateChange: (value: string) => void;
  handleEndTimeChange: (value: string) => void;
  handleFlightsInputChange: (value: string) => void;
  handleSaveSelectedSchedule: () => Promise<void>;
  handleSelectAllScheduleRows: () => void;
  handleSelectSlot: (slotKey: import("../lib/schedule-slots").ScheduleSlotKey) => void;
  handleStartDateChange: (value: string) => void;
  handleStartTimeChange: (value: string) => void;
  input: string;
  isSelectedFixedRoom: boolean;
  loading: boolean;
  queryMode: "manual" | "kj-all";
  router: ReturnType<typeof useRouter>;
  rows: import("../../lib/flight-types").FlightRow[];
  scheduleSlots: import("../lib/schedule-slots").ScheduleSlotsState;
  selectedScheduleRows: import("../../lib/flight-types").FlightRow[];
  selectedSlotKey: import("../lib/schedule-slots").ScheduleSlotKey | null;
  startDateTime: string;
  switchToKjAllMode: () => void;
  switchToManualMode: () => void;
  syncFixedRoomFlightsInput: () => Promise<void>;
};

/** 편명 조회 입력·기간 영역 (조회 및 저장 / 수정 탭) */
export function QueryPanel({
  clearSelectedScheduleFlight,
  currentRangeText,
  endDateTime,
  fetchAllKjFlights,
  fetchFlights,
  fixed,
  flightMode,
  handleClearAllScheduleRows,
  handleEndDateChange,
  handleEndTimeChange,
  handleFlightsInputChange,
  handleSaveSelectedSchedule,
  handleSelectAllScheduleRows,
  handleSelectSlot,
  handleStartDateChange,
  handleStartTimeChange,
  input,
  isSelectedFixedRoom,
  loading,
  queryMode,
  router,
  rows,
  scheduleSlots,
  selectedScheduleRows,
  selectedSlotKey,
  startDateTime,
  switchToKjAllMode,
  switchToManualMode,
  syncFixedRoomFlightsInput,
}: QueryPanelProps) {
  return (
    <>
      {(flightMode === "query" || (flightMode === "edit" && !fixed)) && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 20,
              }}
            >
              <div>
                <h2 style={{ fontSize: 28, margin: 0 }}>
                  {flightMode === "query" ? "✈️ 편명 조회 및 저장" : "✈️ 편명 추가/조회"}
                </h2>
                <p style={{ color: "#9fb3c8", margin: "6px 0 0 0", fontSize: 14 }}>
                  {flightMode === "query"
                    ? "편명 또는 KJ 전체를 조회한 뒤 선택 항목을 Schedule Flight 활성 카드로 저장합니다."
                    : "추가할 편명을 조회한 뒤 선택 카드에 병합 저장합니다."}
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {flightMode === "edit" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedSlotKey) handleSelectSlot(selectedSlotKey);
                    }}
                    style={homeButtonStyle}
                  >
                    ◀ 편명 목록으로
                  </button>
                )}
                <button type="button" onClick={() => router.push("/")} style={homeButtonStyle}>
                  초기화면
                </button>
              </div>
            </div>

            <div style={queryButtonRowStyle}>
              <button
                onClick={switchToManualMode}
                style={queryMode === "manual" ? modeActiveBtn : modeBtn}
              >
                편명 직접 조회
              </button>
              <button
                onClick={switchToKjAllMode}
                style={queryMode === "kj-all" ? modeActiveBtn : modeBtn}
              >
                KJ 전체 조회
              </button>
              <button onClick={() => router.push("/")} style={homeButtonStyle}>
                초기화면
              </button>
            </div>

            {queryMode === "manual" ? (
              <>
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <input
                    value={input}
                    onChange={(e) => handleFlightsInputChange(e.target.value)}
                    onBlur={() => {
                      if (isSelectedFixedRoom && input.trim() === "") {
                        void clearSelectedScheduleFlight();
                        return;
                      }

                      void syncFixedRoomFlightsInput();
                    }}
                    placeholder="예: 247,972 또는 KJ247,KJ972"
                    style={{
                      flex: 1,
                      padding: 12,
                      background: "#111",
                      border: "1px solid #444",
                      borderRadius: 6,
                      color: "white",
                      fontSize: 16,
                    }}
                  />
                </div>

                <div style={{ marginTop: 8, color: "#9fb3c8", fontSize: 13 }}>
                  숫자 3~4자리만 입력하면 KJ를 자동으로 붙여 조회합니다.
                </div>
              </>
            ) : (
              <div style={{ marginTop: 14, color: "#93c5fd", fontSize: 14, lineHeight: 1.55 }}>
                기본 24시간 범위의 KJ 화물기를 전체 조회합니다. 시작/종료 시간은 아래에서 변경할 수 있습니다.
                <br />
                KJ 전체 조회로 전환하면 기존 편명 직접 조회 결과는 비우고 새 조회 결과만 표시합니다.
                <br />
                remark가 도착 또는 결항으로 확정된 항목은 Schedule Flight 선택 대상에서 제외됩니다.
              </div>
            )}

            {!isSelectedFixedRoom && (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "90px 180px 90px 140px",
                    gap: 12,
                    marginTop: 16,
                    alignItems: "center",
                  }}
                >
                  <label>시작일</label>
                  <input
                    type="date"
                    value={getDatePart(startDateTime)}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    style={dateInputStyle}
                  />

                  <label>시작시간</label>
                  <TimeSelect24
                    value={getTimePart(startDateTime)}
                    onChange={handleStartTimeChange}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "90px 180px 90px 140px",
                    gap: 12,
                    marginTop: 12,
                    alignItems: "center",
                  }}
                >
                  <label>종료일</label>
                  <input
                    type="date"
                    value={getDatePart(endDateTime)}
                    onChange={(e) => handleEndDateChange(e.target.value)}
                    style={dateInputStyle}
                  />

                  <label>종료시간</label>
                  <TimeSelect24
                    value={getTimePart(endDateTime)}
                    onChange={handleEndTimeChange}
                  />
                </div>

                <div style={{ marginTop: 10, color: "#9fb3c8", fontSize: 14 }}>
                  현재 조회 범위: {currentRangeText}
                </div>
              </>
            )}

            {flightMode === "edit" && isSelectedFixedRoom && (
              <div style={scheduleSaveGuideStyle}>
                선택한 Schedule Flight 카드에 병합 저장합니다. 필요 시 체크를 해제해 제외하세요.
              </div>
            )}

            {flightMode === "query" && scheduleSlots.active && (
              <div style={scheduleSaveGuideStyle}>
                저장 시 기존 <b style={{ color: "#c084fc" }}>NOW FLT</b> 카드는{" "}
                <b style={{ color: "#94a3b8" }}>After</b>로 이동합니다.
                {scheduleSlots.linkedSlot === "archive" ? (
                  <>
                    {" "}
                    현재 <b style={{ color: "#c084fc" }}>초기화면 연동</b>은 After 카드에 연결되어 있어,
                    새 저장만으로는 초기화면이 바뀌지 않습니다.
                  </>
                ) : (
                  <>
                    {" "}
                    초기화면 연동이 <b style={{ color: "#c084fc" }}>NOW FLT</b>에 연결되어 있으면 저장과
                    함께 초기화면도 갱신됩니다.
                  </>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              {queryMode === "manual" ? (
                <button onClick={() => void fetchFlights()} disabled={loading} style={primaryBtn}>
                  편명 조회
                </button>
              ) : (
                <button onClick={() => void fetchAllKjFlights()} disabled={loading} style={primaryBtn}>
                  KJ 전체 조회
                </button>
              )}

              {rows.length > 0 && (
                <>
                  <button type="button" onClick={handleSelectAllScheduleRows} style={modeBtn}>
                    전체 선택
                  </button>
                  <button type="button" onClick={handleClearAllScheduleRows} style={modeBtn}>
                    전체 해제
                  </button>
                </>
              )}

              <button
                onClick={() => void handleSaveSelectedSchedule()}
                disabled={selectedScheduleRows.length === 0}
                style={selectedScheduleRows.length > 0 ? saveScheduleBtn : disabledBtn}
              >
                {selectedScheduleRows.length > 0
                  ? flightMode === "query"
                    ? `선택 ${selectedScheduleRows.length}건 NOW FLT 저장`
                    : `선택 ${selectedScheduleRows.length}건 카드에 저장`
                  : "저장할 항공편 선택"}
              </button>
            </div>
          </>
        )}
    </>
  );
}
