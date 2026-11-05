"use client";

import { type FlightRow } from "../../lib/flight-types";
import { getComputedFlightStatus, getFlightNoColor } from "../../lib/flight-status";
import { detailTdLabelStyle, detailTdStyle, detailThStyle, tdStyle, thStyle } from "../styles";
import {
  buildFixedDetailRows,
  formatFlightDisplayWithMarker,
  getChangedDateTime,
  getEditableHlValue,
  getFlightKeyFromRow,
  getRowBackground,
  getRowKey,
  getSelectionKey,
  getStatusColor,
} from "../lib/helpers";
import { FragmentRow } from "./FragmentRow";
import { HlRegistrationInput } from "./HlRegistrationInput";
import { AfocsSkdPartInputs } from "./AfocsSkdPartInputs";
import { DetailToggleButton } from "./DetailToggleButton";

export function FixedResultsTable({
  rows,
  expandedKeys,
  selectedKeys,
  hlNumberMap,
  hlDrafts,
  onHlDraftChange,
  afocsSkdDrafts,
  onAfocsSkdDraftChange,
  onToggleDetail,
  onToggleSelect,
  showSelection = true,
}: {
  rows: FlightRow[];
  expandedKeys: Record<string, boolean>;
  selectedKeys: Record<string, boolean>;
  hlNumberMap: Record<string, string>;
  hlDrafts: Record<string, string>;
  onHlDraftChange: (flight: string, value: string) => void;
  afocsSkdDrafts: Record<string, string>;
  onAfocsSkdDraftChange: (flight: string, value: string) => void;
  onToggleDetail: (key: string) => void;
  onToggleSelect: (row: FlightRow, idx: number) => void;
  showSelection?: boolean;
}) {
  const colSpan = showSelection ? 10 : 9;

  return (
    <div style={{ marginTop: 30, overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: 900,
          background: "#081427",
          border: "1px solid #22314e",
        }}
      >
        <thead>
          <tr style={{ background: "#18263f" }}>
            {showSelection ? <th style={thStyle}>선택</th> : null}
            <th style={thStyle}>편명</th>
            <th style={thStyle}>등록기호</th>
            <th style={thStyle}>AFOCS SKD (MM.DD / HH:mm)</th>
            <th style={thStyle}>구분</th>
            <th style={thStyle}>출발</th>
            <th style={thStyle}>도착</th>
            <th style={thStyle}>변경일시</th>
            <th style={thStyle}>게이트</th>
            <th style={thStyle}>D</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td style={tdStyle} colSpan={colSpan}>
                조회 결과가 없습니다.
              </td>
            </tr>
          )}

          {rows.map((row, idx) => {
            const rowKey = getRowKey(row, idx);
            const selectionKey = getSelectionKey(row, idx);
            const expanded = Boolean(expandedKeys[rowKey]);
            const selected = Boolean(selectedKeys[selectionKey]);
            const detailRows = buildFixedDetailRows(row);
            const flightKey = getFlightKeyFromRow(row);

            return (
              <FragmentRow key={rowKey}>
                <tr
                  style={{
                    borderBottom: expanded
                      ? "1px solid transparent"
                      : "1px solid #2b4269",
                    background: getRowBackground(row),
                  }}
                >
                  {showSelection ? (
                    <td style={tdStyle}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleSelect(row, idx)}
                        style={{
                          width: 18,
                          height: 18,
                          cursor: "pointer",
                        }}
                        title="편명 수정 모드에서 삭제할 편 선택"
                      />
                    </td>
                  ) : null}
                  <td style={{ ...tdStyle, color: getFlightNoColor(row.departureCode, row.arrivalCode) }}>
                    {formatFlightDisplayWithMarker(row, hlDrafts)}
                  </td>
                  <td style={tdStyle}>
                    <HlRegistrationInput
                      flightKey={flightKey}
                      rowIndex={idx}
                      value={getEditableHlValue(row, hlNumberMap, hlDrafts)}
                      onChange={(value) => onHlDraftChange(flightKey, value)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <AfocsSkdPartInputs
                      flightKey={flightKey}
                      storedValue={row.afocsSkd || ""}
                      draftValue={
                        Object.prototype.hasOwnProperty.call(afocsSkdDrafts, flightKey)
                          ? afocsSkdDrafts[flightKey]
                          : undefined
                      }
                      row={row}
                      onChange={onAfocsSkdDraftChange}
                    />
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      color: getStatusColor(row),
                      fontWeight: 800,
                    }}
                  >
                    {getComputedFlightStatus(row)}
                  </td>
                  <td style={tdStyle}>{row.departureCode || "-"}</td>
                  <td style={tdStyle}>{row.arrivalCode || "-"}</td>
                  <td style={tdStyle}>{getChangedDateTime(row)}</td>
                  <td style={tdStyle}>{row.gatenumber || "-"}</td>
                  <td style={tdStyle}>
                    <DetailToggleButton
                      expanded={expanded}
                      onClick={() => onToggleDetail(rowKey)}
                    />
                  </td>
                </tr>

                {expanded && (
                  <tr style={{ background: "#0c1a31", borderBottom: "1px solid #2b4269" }}>
                    <td colSpan={colSpan} style={{ padding: 14 }}>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          background: "#0a1528",
                          border: "1px solid #2b4269",
                        }}
                      >
                        <thead>
                          <tr style={{ background: "#15233b" }}>
                            <th style={detailThStyle}>항목</th>
                            <th style={detailThStyle}>값</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailRows.map((detail) => (
                            <tr key={`${rowKey}-${detail.label}`} style={{ borderBottom: "1px solid #22314e" }}>
                              <td style={detailTdLabelStyle}>{detail.label}</td>
                              <td style={detailTdStyle}>{detail.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </FragmentRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
