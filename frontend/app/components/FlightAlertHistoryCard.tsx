"use client";

import { useState } from "react";
import { FlightAlertHistoryCardProps } from "./flight-alert-history/types";
import {
  activeBadgeStyle,
  cardLabelStyle,
  dangerButtonStyle,
  deleteItemButtonStyle,
  disabledServerButtonStyle,
  flightAlertHistoryCardStyle,
  flightAlertHistoryItemHeaderStyle,
  flightAlertHistoryItemStyle,
  flightAlertItemDescStyle,
  flightAlertItemTitleStyle,
  flightAlertListStyle,
  flightAlertMetaStyle,
  flightAlertTitleStyle,
  flightAlertTopStyle,
  idleBadgeStyle,
  serverActionRowStyle,
  serverButtonStyle,
  serverStatusStyle,
  showAllButtonStyle,
} from "./flight-alert-history/styles";
import {
  compactServerStatus,
  formatAlertTitle,
  renderAlertDescription,
} from "./flight-alert-history/helpers";

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
  const alertCount = summaryCount ?? historyItems.length;
  const newChangeCount = alertCount;
  const hasHistoryItems = historyItems.length > 0;
  const hasRecentChanges = newChangeCount > 0;
  const [showAllHistory, setShowAllHistory] = useState(false);
  const defaultVisibleCount = 5;
  const displayedHistoryItems = showAllHistory
    ? historyItems
    : historyItems.slice(0, defaultVisibleCount);
  const hiddenHistoryCount = Math.max(0, historyItems.length - defaultVisibleCount);

  return (
    <section style={flightAlertHistoryCardStyle}>
      <div style={flightAlertTopStyle}>
        <div>
          <div style={cardLabelStyle}>출도착 알림 이력</div>
          <h2 style={flightAlertTitleStyle}>
            {hasRecentChanges ? `신규 변경 ${newChangeCount}건` : "신규 변경 없음"}
          </h2>
        </div>
        <div style={hasRecentChanges ? activeBadgeStyle : idleBadgeStyle}>
          {hasRecentChanges ? "이력 있음" : "정상"}
        </div>
      </div>

      <div style={serverActionRowStyle}>
        <button
          type="button"
          onClick={onLoadServerHistory}
          disabled={serverLoading}
          style={serverButtonStyle}
        >
          {serverLoading
            ? "확인 중..."
            : detailsVisible
              ? `알림 이력 닫기 (${alertCount}건)`
              : `알림 이력 보기 (${alertCount}건)`}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={serverLoading || alertCount === 0}
          style={alertCount > 0 ? dangerButtonStyle : disabledServerButtonStyle}
        >
          전체 삭제
        </button>
      </div>

      {hasHistoryItems && detailsVisible ? (
        <div style={flightAlertListStyle}>
          {displayedHistoryItems.map((item, index) => (
            <div key={`${item.key}-${item.checkedAt}-${index}`} style={flightAlertHistoryItemStyle}>
              <div style={flightAlertHistoryItemHeaderStyle}>
                <div>
                  <div style={flightAlertItemTitleStyle}>{formatAlertTitle(item.title, item.description)}</div>
                  <div style={flightAlertItemDescStyle}>{renderAlertDescription(item.description, item.checkedAt)}</div>
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
            </div>
          ))}

          {historyItems.length > defaultVisibleCount ? (
            <button
              type="button"
              onClick={() => setShowAllHistory((current) => !current)}
              style={showAllButtonStyle}
            >
              {showAllHistory
                ? `최근 ${defaultVisibleCount}건만 보기`
                : `전체 이력 보기 (${historyItems.length}건 · 숨김 ${hiddenHistoryCount}건)`}
            </button>
          ) : null}
        </div>
      ) : null}

      {serverStatus ? <div style={serverStatusStyle}>{compactServerStatus(serverStatus)}</div> : null}

      {!hasRecentChanges ? (
        <div style={flightAlertMetaStyle}>새 변경 알림이 없습니다.</div>
      ) : null}
    </section>
  );
}

