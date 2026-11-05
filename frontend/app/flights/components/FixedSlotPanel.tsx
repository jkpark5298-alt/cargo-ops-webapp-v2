"use client";

import { type useRouter } from "next/navigation";

export type FixedSlotPanelProps = {
  fixed: boolean;
  flightMode: import("../lib/schedule-slots").FlightMode;
  openAfocsSkd: () => void;
  router: ReturnType<typeof useRouter>;
  selectedSlotKey: import("../lib/schedule-slots").ScheduleSlotKey | null;
  setExpandedDetailKeys: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setFixed: React.Dispatch<React.SetStateAction<boolean>>;
};

/** ② 편명 수정 탭: 선택한 고정 카드 안내 영역 */
export function FixedSlotPanel({
  fixed,
  flightMode,
  openAfocsSkd,
  router,
  selectedSlotKey,
  setExpandedDetailKeys,
  setFixed,
}: FixedSlotPanelProps) {
  return (
    <>
      {flightMode === "edit" && selectedSlotKey && fixed ? (
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
                <h2 style={{ fontSize: 28, margin: 0 }}>✈️ 편명 수정</h2>
                <p style={{ color: "#9fb3c8", margin: "6px 0 0 0", fontSize: 14 }}>
                  선택한 Schedule Flight 카드의 편명을 추가·삭제합니다.
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    setFixed(false);
                    setExpandedDetailKeys({});
                  }}
                  style={{
                    padding: "10px 18px",
                    background: "#2563eb",
                    color: "white",
                    border: "none",
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 800,
                    cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
                  }}
                >
                  + 편명 추가/조회
                </button>
                <button
                  type="button"
                  onClick={openAfocsSkd}
                  style={{
                    padding: "10px 18px",
                    background: "#1e293b",
                    color: "#bfdbfe",
                    border: "1px solid rgba(96, 165, 250, 0.3)",
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  AFOCS SKD 열기
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  style={{
                    padding: "10px 18px",
                    background: "#334155",
                    color: "#f8fafc",
                    border: "none",
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  초기화면
                </button>
              </div>
            </div>
          </>
        ) : null}
    </>
  );
}
