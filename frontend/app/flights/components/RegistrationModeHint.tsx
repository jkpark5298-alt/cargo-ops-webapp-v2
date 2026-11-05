"use client";

export type RegistrationModeHintProps = {
  flightMode: import("../lib/schedule-slots").FlightMode;
};

/** ③ 등록번호 / AFOCS 탭 안내 문구 */
export function RegistrationModeHint({
  flightMode,
}: RegistrationModeHintProps) {
  return (
    <>
      {flightMode === "registration" && (
          <div style={{ color: "#94a3b8", marginBottom: 12, fontSize: 13, lineHeight: 1.55 }}>
            왼쪽 Schedule Flight 카드와 별개로 동작합니다. 카드 선택 없이 전용 기간으로 조회·등록하세요.
            <br />
            등록번호 확정: ① 편명조회에서 직접 등록한 값(매뉴얼) → ② 이 화면(등록번호/AFOCS) 저장값. 매뉴얼 값이 있으면 AFOCS 값으로 덮지 않습니다.
          </div>
        )}
    </>
  );
}
