"use client";

import { ScheduleSummaryCardProps } from "./schedule-summary/types";
import {
  apiGuideStyle,
  apiSyncStatusStyle,
  buttonStackStyle,
  cardStyle,
  infoListStyle,
  refreshButtonStyle,
  secondaryButtonStyle,
  sectionTitleStyle,
  syncStatusStyle,
} from "./schedule-summary/styles";
import { FlightRouteRows } from "./schedule-summary/parts/FlightRouteRows";

export function ScheduleSummaryCard({
  latestRoom,
  syncCheckedAt,
  apiSyncStatus,
  apiSyncLoading,
  flightDeleting = false,
  onOpenScheduleFlight,
  onRefreshLatestSchedule,
  flightAlertHistory = [],
  onDeleteAlertHistoryItem,
  onUpdateAfocsSkd,
  onDeleteFlight,
}: ScheduleSummaryCardProps) {
  return (
    <section style={cardStyle}>
      <div style={sectionTitleStyle}>Schedule Flight 선택</div>

      <div style={infoListStyle}>
        <FlightRouteRows
          room={latestRoom}
          flightAlertHistory={flightAlertHistory}
          flightDeleting={flightDeleting}
          onDeleteAlertHistoryItem={onDeleteAlertHistoryItem}
          onUpdateAfocsSkd={onUpdateAfocsSkd}
          onDeleteFlight={onDeleteFlight}
        />
      </div>
      {apiSyncStatus ? <div style={apiSyncStatusStyle}>{apiSyncStatus}</div> : null}
      {syncCheckedAt ? <div style={syncStatusStyle}>초기화면 반영 확인 · {syncCheckedAt}</div> : null}
      <div style={apiGuideStyle}>
        AFOCS SKD는 월일·시간(MM.DD / HH:mm)을 각각 수정할 수 있습니다. 편 삭제 → 삭제 확인을 누르면 Schedule Flight 카드·초기화면에 함께 반영됩니다. API 즉시 확인은 Schedule Flight API를 조회한 뒤 서버 기준과 초기화면에 반영합니다.
      </div>
      <div style={buttonStackStyle}>
        <button
          onClick={onRefreshLatestSchedule}
          style={{
            ...refreshButtonStyle,
            opacity: apiSyncLoading ? 0.72 : 1,
            cursor: apiSyncLoading ? "wait" : "pointer",
          }}
          disabled={apiSyncLoading || flightDeleting}
        >
          {apiSyncLoading ? "API 즉시 확인 중..." : "API 즉시 확인"}
        </button>
        <button onClick={onOpenScheduleFlight} style={secondaryButtonStyle} disabled={flightDeleting}>
          AFOCS SKD 열기
        </button>
      </div>
    </section>
  );
}
