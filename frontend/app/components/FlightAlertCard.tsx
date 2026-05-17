"use client";

import type { CSSProperties } from "react";
import type { FlightAlertItem } from "../lib/flight-alerts";

type FlightAlertCardProps = {
  alertCount: number;
  alertItems: FlightAlertItem[];
  checkedAt: string;
  snapshotName: string | null;
  onSaveCurrent: () => void;
};

export function FlightAlertCard({
  alertCount,
  alertItems,
  checkedAt,
  snapshotName,
  onSaveCurrent,
}: FlightAlertCardProps) {
  return (
    <section style={flightAlertCardStyle}>
      <div style={flightAlertTopStyle}>
        <div>
          <div style={cardLabelStyle}>출도착 알림</div>
          <h2 style={flightAlertTitleStyle}>확인 필요 {alertCount}건</h2>
        </div>
        <div style={flightAlertBadgeStyle}>변경 감지</div>
      </div>

      <div style={flightAlertSummaryStyle}>
        {alertCount > 0 ? "알림 이력으로 자동 저장 중" : snapshotName ? "최근 변경 없음" : "먼저 현재 결과를 기준으로 저장하세요"}
      </div>
      <div style={flightAlertMetaStyle}>
        마지막 확인: {checkedAt || "-"} · 기준 결과: {snapshotName || "아직 저장 안 됨"}
      </div>

      {alertCount > 0 && (
        <div style={flightAlertAutoSaveNoticeStyle}>
          새 알림은 출도착 알림 이력에 자동 저장된 뒤 현재 알림에서 정리됩니다.
        </div>
      )}

      <div style={flightAlertGuideStyle}>
        현재 알림은 임시 감지용입니다. 실제 확인과 관리는 아래 출도착 알림 이력에서 합니다.
      </div>

      <button onClick={onSaveCurrent} style={secondaryButtonStyle}>
        현재 결과를 기준으로 저장
      </button>
    </section>
  );
}

const flightAlertCardStyle: CSSProperties = {
  background: "linear-gradient(145deg, #0f172a, #111827)",
  border: "1px solid #334155",
  borderRadius: 22,
  padding: 18,
  boxShadow: "0 18px 45px rgba(0,0,0,0.26)",
};

const flightAlertTopStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 12,
};

const cardLabelStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: 2,
  textTransform: "uppercase",
};

const flightAlertTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#f8fafc",
  fontSize: 22,
  lineHeight: 1.15,
  fontWeight: 950,
};

const flightAlertBadgeStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: 999,
  background: "#1d4ed8",
  color: "#dbeafe",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const flightAlertSummaryStyle: CSSProperties = {
  color: "#bbf7d0",
  fontSize: 16,
  fontWeight: 950,
  marginBottom: 6,
};

const flightAlertMetaStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
  lineHeight: 1.5,
  marginBottom: 14,
};

const flightAlertAutoSaveNoticeStyle: CSSProperties = {
  border: "1px solid rgba(251, 191, 36, 0.24)",
  background: "rgba(120, 53, 15, 0.18)",
  borderRadius: 14,
  padding: "10px 12px",
  color: "#fde68a",
  fontSize: 12,
  lineHeight: 1.45,
  fontWeight: 850,
  marginBottom: 12,
};

const flightAlertGuideStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.45,
  marginBottom: 12,
};

const flightAlertListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  marginBottom: 14,
};

const flightAlertItemStyle: CSSProperties = {
  border: "1px solid rgba(251, 191, 36, 0.26)",
  background: "rgba(120, 53, 15, 0.22)",
  borderRadius: 14,
  padding: "10px 12px",
};

const flightAlertItemTitleStyle: CSSProperties = {
  color: "#fef3c7",
  fontSize: 14,
  fontWeight: 950,
  marginBottom: 4,
};

const flightAlertItemDescStyle: CSSProperties = {
  color: "#fde68a",
  fontSize: 12,
  lineHeight: 1.45,
  fontWeight: 750,
};

const secondaryButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 58,
  border: "none",
  borderRadius: 16,
  color: "#ffffff",
  background: "#2563eb",
  fontSize: 17,
  fontWeight: 950,
  cursor: "pointer",
};
