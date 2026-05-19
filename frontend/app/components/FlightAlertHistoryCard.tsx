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
  const latestItem = historyItems[0];

  return (
    <section style={flightAlertHistoryCardStyle}>
      <div style={flightAlertTopStyle}>
        <div>
          <div style={cardLabelStyle}>출도착 알림 이력</div>
          <h2 style={flightAlertTitleStyle}>
            {hasRecentChanges ? `미확인 ${visibleCount}건` : "미확인 없음"}
          </h2>
        </div>
        <div style={hasRecentChanges ? activeBadgeStyle : idleBadgeStyle}>
          {hasRecentChanges ? "확인 필요" : "정상"}
        </div>
      </div>

      <div style={serverActionRowStyle}>
        <button
          type="button"
          onClick={onLoadServerHistory}
          disabled={serverLoading}
          style={serverButtonStyle}
        >
          {serverLoading ? "확인 중..." : "최근 알림 확인"}
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

      {hasRecentChanges && !detailsVisible ? (
        <div style={compactSummaryStyle}>
          <div style={compactSummaryTitleStyle}>
            {latestItem ? compactAlertTitle(latestItem.title) : `미확인 ${visibleCount}건`}
          </div>
          <div style={compactSummaryDescStyle}>
            {latestItem
              ? compactAlertDescription(latestItem.description)
              : "최근 알림 확인을 눌러 세부 내용을 확인하세요."}
          </div>
          <div style={compactSummaryMetaStyle}>최근 알림 확인을 누르면 세부 목록이 열립니다.</div>
        </div>
      ) : null}

      {hasHistoryItems && detailsVisible ? (
        <div style={flightAlertListStyle}>
          {historyItems.slice(0, 5).map((item, index) => (
            <div key={`${item.key}-${item.checkedAt}-${index}`} style={flightAlertHistoryItemStyle}>
              <div style={flightAlertHistoryItemHeaderStyle}>
                <div>
                  <div style={flightAlertItemTitleStyle}>{compactAlertTitle(item.title)}</div>
                  <div style={flightAlertItemDescStyle}>{compactAlertDescription(item.description)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteItem(item)}
                  style={deleteItemButtonStyle}
                  aria-label={`${item.title} 알림 삭제`}
                >
                  삭제
                </button>
              </div>
              <div style={flightAlertHistoryMetaStyle}>
                {formatHistoryTime(item.checkedAt)} · {compactRoomName(item.roomName)}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {serverStatus ? <div style={serverStatusStyle}>{compactServerStatus(serverStatus)}</div> : null}

      {!hasRecentChanges ? (
        <div style={flightAlertMetaStyle}>새 출도착 변경 알림이 없습니다.</div>
      ) : null}
    </section>
  );
}

const flightAlertHistoryCardStyle: CSSProperties = {
  background: "linear-gradient(145deg, #0b1120, #111827)",
  border: "1px solid #1e3a8a",
  borderRadius: 22,
  padding: 16,
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
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 1.5,
  textTransform: "uppercase",
};

const flightAlertTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#f8fafc",
  fontSize: 22,
  lineHeight: 1.15,
  fontWeight: 950,
};

const activeBadgeStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: 999,
  background: "#b45309",
  color: "#fffbeb",
  fontSize: 12,
  fontWeight: 950,
  whiteSpace: "nowrap",
};

const idleBadgeStyle: CSSProperties = {
  ...activeBadgeStyle,
  background: "#14532d",
  color: "#dcfce7",
};

const flightAlertMetaStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
  lineHeight: 1.5,
  marginTop: 10,
};

const compactSummaryStyle: CSSProperties = {
  border: "1px solid rgba(250, 204, 21, 0.28)",
  background: "rgba(250, 204, 21, 0.08)",
  borderRadius: 14,
  padding: "12px 14px",
  marginBottom: 10,
};

const compactSummaryTitleStyle: CSSProperties = {
  color: "#fef3c7",
  fontSize: 15,
  fontWeight: 950,
  lineHeight: 1.3,
};

const compactSummaryDescStyle: CSSProperties = {
  color: "#fde68a",
  fontSize: 13,
  lineHeight: 1.45,
  fontWeight: 850,
  marginTop: 4,
};

const compactSummaryMetaStyle: CSSProperties = {
  color: "#93c5fd",
  fontSize: 11,
  lineHeight: 1.4,
  fontWeight: 800,
  marginTop: 6,
};

const flightAlertListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  marginBottom: 10,
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
  fontWeight: 800,
};

const flightAlertHistoryMetaStyle: CSSProperties = {
  color: "#93c5fd",
  fontSize: 11,
  lineHeight: 1.4,
  marginTop: 6,
  fontWeight: 800,
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
  fontSize: 11,
  fontWeight: 800,
  lineHeight: 1.45,
  marginTop: 8,
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

function compactAlertTitle(value?: string) {
  const raw = (value || "출도착 변경").trim();
  const flight = raw.match(/\b[A-Z]{2}\d{2,4}\b/)?.[0];

  if (flight) {
    if (raw.includes("시간") || raw.includes("운항시각") || raw.includes("도착예정") || raw.includes("출발예정")) {
      return `${flight} 시간 변경`;
    }
    if (raw.includes("게이트")) return `${flight} 게이트 변경`;
    if (raw.includes("상태") || raw.includes("REMARK") || raw.includes("Remark")) return `${flight} 상태 변경`;
    return raw.includes("변경") ? `${flight} 변경` : flight;
  }

  return raw
    .replace("Schedule Flight 변경 감지", "Schedule 변경")
    .replace("서버에 저장된 알림 이력", "서버 알림")
    .slice(0, 28);
}

function compactAlertDescription(value?: string) {
  const raw = (value || "운항 정보 변경").trim();
  const parts = raw
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.includes("API 즉시 확인"))
    .filter((part) => !part.includes("수동 변경 확인"))
    .filter((part) => !part.includes("푸시 자동 확인"))
    .filter((part) => !part.includes("앱 자동 확인"))
    .filter((part) => !part.includes("Schedule Lite 저장 알림"));

  const route = raw.match(/[A-Z]{3}→[A-Z]{3}/)?.[0];
  const changeText =
    parts.find((part) => part.includes("운항시각")) ||
    parts.find((part) => part.includes("도착예정")) ||
    parts.find((part) => part.includes("출발예정")) ||
    parts.find((part) => part.includes("게이트")) ||
    parts.find((part) => part.includes("터미널")) ||
    parts.find((part) => part.includes("상태")) ||
    parts[0] ||
    "운항 정보 변경";

  const shortChange = changeText
    .replace(/'.*?→.*?$/g, "변경")
    .replace(/\s+/g, " ")
    .slice(0, 34);

  return route ? `${route} · ${shortChange}` : shortChange;
}

function compactServerStatus(value: string) {
  return value
    .replace("서버 미처리 이력", "서버 이력")
    .replace("출도착 알림 이력에 자동 표시", "자동 표시")
    .replace("출도착 알림 이력에 자동 반영했습니다.", "자동 반영")
    .slice(0, 64);
}

function compactRoomName(value?: string) {
  return (value || "서버 알림").replace("서버에 저장된 알림 이력", "서버 알림").slice(0, 18);
}

function formatHistoryTime(value?: string) {
  if (!value) return "-";

  const raw = value.replace("T", " ").replace("Z", "").trim();
  const match = raw.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})\s+(\d{2}):(\d{2})/);

  if (match) {
    const [, , month, day, hour, minute] = match;
    return `${month}/${day} ${hour}:${minute}`;
  }

  return raw;
}
