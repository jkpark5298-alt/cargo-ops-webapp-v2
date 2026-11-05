"use client";

import type { CSSProperties } from "react";
import type { ExcelUploadReport } from "../lib/helpers";

/** 엑셀 업로드 후 '자세히 보기': 이번 조회에 반영하지 못한 줄과 노선이 다른 편 목록 (기본은 접혀 있음) */
export function ExcelUploadReportDetails({ report }: { report: ExcelUploadReport }) {
  const outside = report.unmatched.filter((item) => item.reason === "조회 기간 밖");
  const otherDate = report.unmatched.filter((item) => item.reason === "일자가 다름");

  return (
    <details style={detailsStyle}>
      <summary style={summaryStyle}>
        자세히 보기 (이번 조회 밖 {report.unmatched.length}건 · 노선 다름 {report.routeDiffs.length}건)
      </summary>
      <div style={bodyStyle}>
        {report.unmatched.length > 0 ? (
          <>
            <div style={noteStyle}>
              아래 줄은 이번에 조회한 기간·편에 없어서 화면에는 반영하지 않았습니다. 일자와 등록기호가 있으면 등록
              기록에는 저장되어 있어, 해당 일자를 조회하면 자동으로 채워집니다.
            </div>
            {outside.length > 0 ? (
              <div style={groupStyle}>
                <strong>조회 기간 밖 ({outside.length})</strong>
                <span>{outside.map((item) => `${item.flight}(${item.date || "-"})`).join(", ")}</span>
              </div>
            ) : null}
            {otherDate.length > 0 ? (
              <div style={groupStyle}>
                <strong>같은 편명, 다른 일자 ({otherDate.length})</strong>
                <span>{otherDate.map((item) => `${item.flight}(${item.date || "-"})`).join(", ")}</span>
              </div>
            ) : null}
          </>
        ) : null}
        {report.routeDiffs.length > 0 ? (
          <div style={groupStyle}>
            <strong>노선 다름 ({report.routeDiffs.length}) — 엑셀 값은 반영했습니다. 엑셀 오타인지 확인해 보세요.</strong>
            <span>
              {report.routeDiffs
                .map((item) => `${item.flight} 엑셀 ${item.excelRoute} / 조회 ${item.rowRoute}`)
                .join(" · ")}
            </span>
          </div>
        ) : null}
      </div>
    </details>
  );
}

const detailsStyle: CSSProperties = {
  marginTop: 8,
  color: "#cbd5e1",
  fontSize: 12,
};

const summaryStyle: CSSProperties = {
  cursor: "pointer",
  fontWeight: 800,
  color: "#93c5fd",
};

const bodyStyle: CSSProperties = {
  marginTop: 8,
  maxHeight: 260,
  overflowY: "auto",
  display: "grid",
  gap: 10,
  lineHeight: 1.6,
};

const noteStyle: CSSProperties = {
  color: "#94a3b8",
};

const groupStyle: CSSProperties = {
  display: "grid",
  gap: 2,
};
