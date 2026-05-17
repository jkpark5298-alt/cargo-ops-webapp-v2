"use client";

import type { CSSProperties } from "react";
import type { FlightAlertHistoryItem } from "../lib/flight-alerts";

type FlightAlertHistoryCardProps = {
  historyItems: FlightAlertHistoryItem[];
  serverLoading?: boolean;
  serverStatus?: string;
  summaryCount?: number;
  detailsVisible?: boolean;
  onDeleteItem: (item: FlightAlertHistoryItem) => void;
  onClear: () => void;
  onLoadServerHistory: () => void | Promise<void>;
};

export function FlightAlertHistoryCard({
  historyItems,
  serverLoading = false,
  serverStatus = "",
  summaryCount,
  detailsVisible = false,
  onDeleteItem,
  onClear,
  onLoadServerHistory,
}: FlightAlertHistoryCardProps) {
  const visibleCount = summaryCount ?? historyItems.length;
  const hasHistoryItems = historyItems.length > 0;
  const hasRecentChanges = visibleCount > 0;

  return (
    <section style={flightAlertHistoryCardStyle}>
      <div style={flightAlertTopStyle}>
        <div>
          <div style={cardLabelStyle}>출도착 알림 이력</div>
          <h2 style={flightAlertTitleStyle}>최근 변경 {visibleCount}건</h2>
        </div>
        <div style={flightAlertBadgeStyle}>자동 반영</div>
      </div>

      <div style={autoGuideStyle}>
        서버 이력이 신규 발생하면 최근 변경 건수가 먼저 표시됩니다. 세부 사항은 서버 이력 즉시 확인을 눌러 확인하세요.
      </div>

      <div style={serverActionRowStyle}>
        <button
          type="button"
          onClick={onLoadServerHistory}
          disabled={serverLoading}
          style={serverButtonStyle}
        >
          {serverLoading ? "새로고침 중..." : "서버 이력 즉시 확인"}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={serverLoading || !hasHistoryItems}
          style={hasHistoryItems ? dangerButtonStyle : disabledServerButtonStyle}
        >
          전체 삭제
        </button>
      </div>

      {serverStatus && <div style={serverStatusStyle}>{serverStatus}</div>}

      {hasRecentChanges && !detailsVisible ? (
        <div style={flightAlertSummaryNoticeStyle}>
          최근 변경 {visibleCount}건이 있습니다. 세부 사항은 서버 이력 즉시 확인을 눌러 확인하세요.
        </div>
      ) : null}

      {hasHistoryItems && detailsVisible ? (
        <div style={flightAlertListStyle}>
          {historyItems.slice(0, 5).map((item, index) => (
            <div key={`${item.key}-${item.checkedAt}-${index}`} style={flightAlertHistoryItemStyle}>
              <div style={flightAlertHistoryItemHeaderStyle}>
                <div style={flightAlertItemTitleStyle}>{item.title}</div>
                <button
                  type="button"
                  onClick={() => onDeleteItem(item)}
                  style={deleteItemButtonStyle}
                  aria-label={`${item.title} 알림 삭제`}
                >
                  삭제
                </button>
              </div>
              <div style={flightAlertItemDescStyle}>{item.description}</div>
              <div style={flightAlertHistoryMetaStyle}>
                확인 {formatHistoryTime(item.checkedAt)} · {item.roomName}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!hasRecentChanges ? (
        <div style={flightAlertMetaStyle}>아직 저장된 알림 이력이 없습니다.</div>
      ) : null}
    </section>
  );
}

const flightAlertHistoryCardStyle: CSSProperties = {
  background: "linear-gradient(145deg, #0b1120, #111827)",
  border: "1px solid #1e3a8a",
  borderRadius: 22,
  padding: 18,
  boxShadow: "0 18px 45px rgba(0,0,0,0.22)",
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

const flightAlertMetaStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
  lineHeight: 1.5,
  marginBottom: 14,
};

const flightAlertSummaryNoticeStyle: CSSProperties = {
  border: "1px solid rgba(250, 204, 21, 0.28)",
  background: "rgba(250, 204, 21, 0.08)",
  borderRadius: 14,
  padding: "12px 14px",
  color: "#fef3c7",
  fontSize: 13,
  lineHeight: 1.55,
  fontWeight: 850,
  marginBottom: 14,
};

const flightAlertListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  marginBottom: 14,
};

const flightAlertHistoryItemStyle: CSSProperties = {
  border: "1px solid rgba(59, 130, 246, 0.22)",
  background: "rgba(30, 64, 175, 0.16)",
  borderRadius: 14,
  padding: "10px 12px",
};

const flightAlertHistoryItemHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  marginBottom: 4,
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

const flightAlertHistoryMetaStyle: CSSProperties = {
  color: "#93c5fd",
  fontSize: 11,
  lineHeight: 1.4,
  marginTop: 6,
  fontWeight: 800,
};

const autoGuideStyle: CSSProperties = {
  color: "#93c5fd",
  fontSize: 12,
  lineHeight: 1.45,
  marginBottom: 10,
  fontWeight: 750,
};

const serverActionRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  marginBottom: 10,
};

const serverButtonStyle: CSSProperties = {
  minHeight: 44,
  border: "1px solid rgba(59, 130, 246, 0.45)",
  borderRadius: 12,
  color: "#dbeafe",
  background: "#1d4ed8",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
};

const disabledServerButtonStyle: CSSProperties = {
  ...serverButtonStyle,
  opacity: 0.5,
  cursor: "not-allowed",
};

const dangerButtonStyle: CSSProperties = {
  ...serverButtonStyle,
  border: "1px solid rgba(248, 113, 113, 0.48)",
  background: "rgba(127, 29, 29, 0.72)",
  color: "#fecaca",
};

const serverStatusStyle: CSSProperties = {
  color: "#93c5fd",
  fontSize: 12,
  fontWeight: 800,
  marginBottom: 10,
};

const deleteItemButtonStyle: CSSProperties = {
  border: "1px solid rgba(248, 113, 113, 0.42)",
  borderRadius: 999,
  padding: "4px 8px",
  background: "rgba(127, 29, 29, 0.38)",
  color: "#fecaca",
  fontSize: 11,
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

function formatHistoryTime(value?: string) {
  if (!value) return "-";

  const raw = value.replace("T", " ").replace("Z", "").trim();
  const match = raw.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})\s+(\d{2}):(\d{2})/);

  if (match) {
    const [, year, month, day, hour, minute] = match;
    return `'${year.slice(2)}/${month}/${day} ${hour}:${minute}`;
  }

  return raw;
}
