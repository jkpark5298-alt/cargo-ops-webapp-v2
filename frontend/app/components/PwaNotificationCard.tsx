"use client";

import type { CSSProperties } from "react";

type PwaNotificationCardProps = {
  permissionLabel: string;
  statusMessage: string;
  loading: boolean;
  testLoading: boolean;
  checkLoading: boolean;
  autoEnabled: boolean;
  autoLoading: boolean;
  autoStatusMessage: string;
  onEnable: () => void;
  onSendTest: () => void;
  onCheckSchedule: () => void;
  onToggleAuto: () => void;
};

export function PwaNotificationCard({
  permissionLabel,
  statusMessage,
  loading,
  testLoading,
  checkLoading,
  autoEnabled,
  autoLoading,
  autoStatusMessage,
  onEnable,
  onSendTest,
  onCheckSchedule,
  onToggleAuto,
}: PwaNotificationCardProps) {
  return (
    <section style={cardStyle}>
      <div style={cardLabelStyle}>PWA 알림</div>
      <h2 style={cardTitleStyle}>아이폰 알림</h2>
      <p style={cardDescriptionStyle}>
        홈 화면 앱에서 Schedule Flight 변경 알림을 받을 수 있습니다.
      </p>

      <div style={infoBoxStyle}>
        <div style={infoRowStyle}>
          <span style={infoLabelStyle}>권한 상태</span>
          <span style={infoValueStyle}>{permissionLabel}</span>
        </div>
        <div style={infoHintStyle}>
          {statusMessage || "알림 권한과 구독 상태를 확인합니다."}
        </div>
      </div>

      <div style={buttonStackStyle}>
        <button onClick={onEnable} disabled={loading} style={loading ? disabledButtonStyle : primaryButtonStyle}>
          {loading ? "준비 중..." : "알림 허용"}
        </button>
        <button
          onClick={onSendTest}
          disabled={testLoading || permissionLabel !== "허용됨"}
          style={testLoading || permissionLabel !== "허용됨" ? disabledButtonStyle : secondaryButtonStyle}
        >
          {testLoading ? "발송 중..." : "테스트 알림"}
        </button>
        <button
          onClick={onCheckSchedule}
          disabled={checkLoading || permissionLabel !== "허용됨"}
          style={checkLoading || permissionLabel !== "허용됨" ? disabledButtonStyle : accentButtonStyle}
        >
          {checkLoading ? "확인 중..." : "변경 즉시 확인"}
        </button>
        <button
          onClick={onToggleAuto}
          disabled={autoLoading || permissionLabel !== "허용됨"}
          style={autoLoading || permissionLabel !== "허용됨" ? disabledButtonStyle : successButtonStyle}
        >
          {autoLoading ? "확인 중..." : "자동 상태 새로고침"}
        </button>
      </div>

      <div style={autoStatusStyle}>
        자동 확인 상태: {autoEnabled ? "자동 적용 중" : "일시 중지"}
        <br />
        {autoStatusMessage || "평상시 30분, 집중 시간대 5분 간격으로 확인합니다."}
      </div>

      <div style={helpTextStyle}>
        자동 확인은 Schedule Flight 기준으로 적용됩니다.
      </div>
    </section>
  );
}

const cardStyle: CSSProperties = {
  border: "1px solid rgba(56, 189, 248, 0.38)",
  borderRadius: 20,
  padding: 16,
  background: "linear-gradient(135deg, rgba(14, 165, 233, 0.16), rgba(15, 23, 42, 0.92))",
  boxShadow: "0 18px 50px rgba(2, 6, 23, 0.34)",
};

const cardLabelStyle: CSSProperties = {
  color: "#7dd3fc",
  fontSize: 13,
  fontWeight: 950,
  letterSpacing: 0.6,
  textTransform: "uppercase",
};

const cardTitleStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 21,
  fontWeight: 950,
  margin: "8px 0 8px",
};

const cardDescriptionStyle: CSSProperties = {
  color: "#cbd5e1",
  fontSize: 15,
  lineHeight: 1.55,
  margin: 0,
};

const infoBoxStyle: CSSProperties = {
  marginTop: 14,
  border: "1px solid rgba(148, 163, 184, 0.2)",
  borderRadius: 14,
  padding: 12,
  background: "rgba(2, 6, 23, 0.34)",
};

const infoRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
};

const infoLabelStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
  fontWeight: 800,
};

const infoValueStyle: CSSProperties = {
  color: "#e0f2fe",
  fontSize: 14,
  fontWeight: 950,
};

const infoHintStyle: CSSProperties = {
  color: "#cbd5e1",
  fontSize: 13,
  lineHeight: 1.5,
  marginTop: 10,
};

const buttonStackStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 14,
};

const primaryButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 52,
  border: "none",
  borderRadius: 16,
  color: "#ffffff",
  background: "#0284c7",
  fontSize: 17,
  fontWeight: 950,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  border: "1px solid rgba(125, 211, 252, 0.34)",
  background: "#0f172a",
  color: "#e0f2fe",
};

const accentButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: "#2563eb",
};

const successButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: "#16a34a",
};

const dangerButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: "#dc2626",
};

const disabledButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: "#334155",
  color: "#94a3b8",
  cursor: "not-allowed",
  opacity: 0.72,
};

const autoStatusStyle: CSSProperties = {
  color: "#bfdbfe",
  fontSize: 13,
  lineHeight: 1.5,
  marginTop: 12,
  padding: 12,
  border: "1px solid rgba(96, 165, 250, 0.24)",
  borderRadius: 12,
  background: "rgba(15, 23, 42, 0.44)",
};

const helpTextStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.5,
  marginTop: 10,
};
