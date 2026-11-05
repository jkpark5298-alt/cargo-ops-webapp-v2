"use client";

import { getComputedFlightStatus, getFlightNoColor } from "../../lib/flight-status";
import {
  formatFlightDisplayWithMarker,
  getEditableHlValue,
  getFlightKeyFromRow,
  getRefreshExcludeReason,
  getRowBackground,
  getRowKey,
  getSelectionKey,
  getStatusColor,
  isFinalCompletedRow,
} from "../lib/helpers";
import { tdStyle, thStyle } from "../styles";
import { HlRegistrationInput } from "./HlRegistrationInput";

export type QueryResultsTableProps = {
  fixed: boolean;
  flightMode: import("../lib/schedule-slots").FlightMode;
  handleHlInlineDraftChange: (flight: string, value: string) => void;
  handleToggleScheduleSelection: (row: import("../../lib/flight-types").FlightRow, idx: number) => void;
  hlInlineDrafts: Record<string, string>;
  hlNumberMap: Record<string, string>;
  rows: import("../../lib/flight-types").FlightRow[];
  selectedScheduleKeys: Record<string, boolean>;
};

/** 편명 조회 결과 표 */
export function QueryResultsTable({
  fixed,
  flightMode,
  handleHlInlineDraftChange,
  handleToggleScheduleSelection,
  hlInlineDrafts,
  hlNumberMap,
  rows,
  selectedScheduleKeys,
}: QueryResultsTableProps) {
  return (
    <>
      {(flightMode === "query" || (flightMode === "edit" && !fixed)) && (
          <div style={{ marginTop: 30, overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 1200,
                background: "#081427",
                border: "1px solid #22314e",
              }}
            >
              <thead>
                <tr style={{ background: "#18263f" }}>
                  <th style={thStyle}>선택</th>
                  <th style={thStyle}>현황</th>
                  <th style={thStyle}>편명</th>
                  <th style={thStyle}>등록기호</th>
                  <th style={thStyle}>출발지코드</th>
                  <th style={thStyle}>출발지공항명</th>
                  <th style={thStyle}>도착지코드</th>
                  <th style={thStyle}>도착지공항명</th>
                  <th style={thStyle}>예정일시</th>
                  <th style={thStyle}>변경일시</th>
                  <th style={thStyle}>게이트</th>
                  <th style={thStyle}>터미널</th>
                  <th style={thStyle}>마스터 편명</th>
                  <th style={thStyle}>코드쉐어</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td style={tdStyle} colSpan={14}>
                      조회 결과가 없습니다.
                    </td>
                  </tr>
                )}
                {rows.map((r, i) => {
                  const selectionKey = getSelectionKey(r, i);
                  const finalCompleted = isFinalCompletedRow(r);
                  const selected = Boolean(selectedScheduleKeys[selectionKey]);

                  return (
                    <tr
                      key={getRowKey(r, i)}
                      style={{
                        borderBottom: "1px solid #2b4269",
                        background: getRowBackground(r),
                        opacity: finalCompleted ? 0.72 : 1,
                      }}
                    >
                      <td style={tdStyle}>
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            cursor: finalCompleted ? "not-allowed" : "pointer",
                          }}
                          title={finalCompleted ? `${getRefreshExcludeReason(r)}으로 API 재조회 제외` : "Schedule Flight 추가 선택"}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={finalCompleted}
                            onChange={() => handleToggleScheduleSelection(r, i)}
                          />
                        </label>
                        {finalCompleted && (
                          <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 4 }}>
                            조회 제외
                            <br />
                            {getRefreshExcludeReason(r)}
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          color: getStatusColor(r),
                          fontWeight: 700,
                        }}
                      >
                        {getComputedFlightStatus(r)}
                      </td>
                      <td style={{ ...tdStyle, color: getFlightNoColor(r.departureCode, r.arrivalCode) }}>
                        {formatFlightDisplayWithMarker(r, hlInlineDrafts)}
                      </td>
                      <td style={tdStyle}>
                        <HlRegistrationInput
                          flightKey={getFlightKeyFromRow(r)}
                          rowIndex={i}
                          value={getEditableHlValue(r, hlNumberMap, hlInlineDrafts)}
                          onChange={(value) => handleHlInlineDraftChange(getFlightKeyFromRow(r), value)}
                        />
                      </td>
                      <td style={tdStyle}>{r.departureCode || "-"}</td>
                      <td style={tdStyle}>{r.departureName || "-"}</td>
                      <td style={tdStyle}>{r.arrivalCode || "-"}</td>
                      <td style={tdStyle}>{r.arrivalName || "-"}</td>
                      <td style={tdStyle}>{r.formattedScheduleTime || "-"}</td>
                      <td style={tdStyle}>{r.formattedEstimatedTime || "-"}</td>
                      <td style={tdStyle}>{r.gatenumber || "-"}</td>
                      <td style={tdStyle}>{r.terminalid || "-"}</td>
                      <td style={tdStyle}>{r.masterflightid || "-"}</td>
                      <td style={tdStyle}>{r.codeshare || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </>
  );
}
