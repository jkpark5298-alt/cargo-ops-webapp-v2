"use client";

import { MonthlySkdInputPanel } from "../../components/MonthlySkdInputPanel";
import { type useRouter } from "next/navigation";
import { getDatePart, getTimePart } from "../lib/helpers";
import {
  dateInputStyle,
  homeButtonStyle,
  modeActiveBtn,
  modeBtn,
  primaryBtn,
  queryButtonRowStyle,
} from "../styles";
import { TimeSelect24 } from "./TimeSelect24";

export type RegistrationPanelProps = {
  fetchRegistrationFlights: () => Promise<void>;
  fetchRegistrationKjAll: () => Promise<void>;
  flightMode: import("../lib/schedule-slots").FlightMode;
  handleFlightsInputChange: (value: string) => void;
  handleRegistrationEndDateChange: (value: string) => void;
  handleRegistrationEndTimeChange: (value: string) => void;
  handleRegistrationStartDateChange: (value: string) => void;
  handleRegistrationStartTimeChange: (value: string) => void;
  input: string;
  loading: boolean;
  openAfocsSkd: () => void;
  queryMode: "manual" | "kj-all";
  registrationEndDateTime: string;
  registrationRangeText: string;
  registrationStartDateTime: string;
  router: ReturnType<typeof useRouter>;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setQueryMode: React.Dispatch<React.SetStateAction<"manual" | "kj-all">>;
};

/** ③ 등록번호 / AFOCS 탭: 전용 기간 조회 입력 영역 */
export function RegistrationPanel({
  fetchRegistrationFlights,
  fetchRegistrationKjAll,
  flightMode,
  handleFlightsInputChange,
  handleRegistrationEndDateChange,
  handleRegistrationEndTimeChange,
  handleRegistrationStartDateChange,
  handleRegistrationStartTimeChange,
  input,
  loading,
  openAfocsSkd,
  queryMode,
  registrationEndDateTime,
  registrationRangeText,
  registrationStartDateTime,
  router,
  setInput,
  setQueryMode,
}: RegistrationPanelProps) {
  return (
    <>
      {flightMode === "registration" && (
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
                <h2 style={{ fontSize: 28, margin: 0 }}>✈️ 등록번호 / AFOCS 저장</h2>
                <p style={{ color: "#9fb3c8", margin: "6px 0 0 0", fontSize: 14 }}>
                  전용 조회 기간으로 조회한 뒤 등록번호·AFOCS SKD를 입력·저장합니다. 편명조회에서 이미 등록한 번호가 있으면 그대로 두고, 없는 편만 여기서 채웁니다.
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={openAfocsSkd} style={homeButtonStyle}>
                  Monthly SKD 열기
                </button>
                <button type="button" onClick={() => router.push("/")} style={homeButtonStyle}>
                  초기화면
                </button>
              </div>
            </div>

            <div
              style={{
                marginBottom: 16,
                padding: 16,
                background: "#0a1528",
                border: "1px solid #3b82f6",
                borderRadius: 10,
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 6, color: "#e5edf7", fontSize: 16 }}>
                ① 등록번호 / AFOCS 전용 조회 기간
              </div>
              <div style={{ color: "#9fb3c8", fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>
                왼쪽 카드 기간·편명과 무관합니다. 기간을 설정한 뒤 편명 또는 KJ 전체로 조회하세요.
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 180px 90px 140px",
                  gap: 12,
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <label style={{ color: "#9fb3c8", fontSize: 13 }}>시작일</label>
                <input
                  type="date"
                  value={getDatePart(registrationStartDateTime)}
                  onChange={(e) => handleRegistrationStartDateChange(e.target.value)}
                  style={dateInputStyle}
                />
                <label style={{ color: "#9fb3c8", fontSize: 13 }}>시작시간</label>
                <TimeSelect24
                  value={getTimePart(registrationStartDateTime)}
                  onChange={handleRegistrationStartTimeChange}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 180px 90px 140px",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <label style={{ color: "#9fb3c8", fontSize: 13 }}>종료일</label>
                <input
                  type="date"
                  value={getDatePart(registrationEndDateTime)}
                  onChange={(e) => handleRegistrationEndDateChange(e.target.value)}
                  style={dateInputStyle}
                />
                <label style={{ color: "#9fb3c8", fontSize: 13 }}>종료시간</label>
                <TimeSelect24
                  value={getTimePart(registrationEndDateTime)}
                  onChange={handleRegistrationEndTimeChange}
                />
              </div>

              <div style={{ color: "#93c5fd", marginTop: 12, fontSize: 13 }}>
                등록 조회 범위: {registrationRangeText}
              </div>
            </div>

            <div style={queryButtonRowStyle}>
              <button
                onClick={() => {
                  setQueryMode("manual");
                  if (input === "KJ 전체") setInput("");
                }}
                style={queryMode === "manual" ? modeActiveBtn : modeBtn}
              >
                편명 직접 조회
              </button>
              <button
                onClick={() => {
                  setQueryMode("kj-all");
                  setInput("");
                }}
                style={queryMode === "kj-all" ? modeActiveBtn : modeBtn}
              >
                KJ 전체 조회
              </button>
            </div>

            {queryMode === "manual" ? (
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <input
                  value={input}
                  onChange={(e) => handleFlightsInputChange(e.target.value)}
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
            ) : (
              <div style={{ marginTop: 14, color: "#93c5fd", fontSize: 14, lineHeight: 1.55 }}>
                등록 전용 기간의 KJ 화물기를 전체 조회합니다. Schedule Flight 카드는 변경되지 않습니다.
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              {queryMode === "manual" ? (
                <button
                  onClick={() => void fetchRegistrationFlights()}
                  disabled={loading}
                  style={primaryBtn}
                >
                  ② 이 기간으로 편명 조회
                </button>
              ) : (
                <button
                  onClick={() => void fetchRegistrationKjAll()}
                  disabled={loading}
                  style={primaryBtn}
                >
                  ② 이 기간으로 KJ 전체 조회
                </button>
              )}
            </div>

            {/* 월간 SKD 입력: Monthly Scheduled Flight 와 등록기호 기록에 함께 저장 */}
            <div style={{ marginTop: 20 }}>
              <MonthlySkdInputPanel compact />
            </div>
          </>
        )}
    </>
  );
}
