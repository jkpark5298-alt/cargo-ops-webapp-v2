"use client";

import { useMemo, useState, type CSSProperties } from "react";
import * as XLSX from "xlsx";
import {
  parseSkdMatrix,
  saveMonthlyRecords,
  textToMatrix,
  type MonthlyInputRecord,
  type ParseResult,
} from "../lib/monthly-schedule";

type Props = {
  /** 저장 후 화면을 다시 읽을 때 사용 */
  onSaved?: () => void;
  /** ③ 등록번호 / AFOCS 화면처럼 좁은 곳에 붙일 때 설명을 줄인다 */
  compact?: boolean;
};

const emptyManual = { flight: "", registrationNo: "", departureCode: "", arrivalCode: "", skdTime: "" };

/**
 * 월간 SKD 입력 — 엑셀 붙여넣기 / 엑셀 파일 / 한 줄 입력.
 * 저장하면 Monthly Scheduled Flight 와 등록기호 기록(③ 등록번호 / AFOCS·초기화면)에 함께 반영된다.
 */
export function MonthlySkdInputPanel({ onSaved, compact = false }: Props) {
  const [pasteText, setPasteText] = useState("");
  const [fileResult, setFileResult] = useState<(ParseResult & { name: string }) | null>(null);
  const [manual, setManual] = useState(emptyManual);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const pasteResult = useMemo(() => (pasteText.trim() ? parseSkdMatrix(textToMatrix(pasteText)) : null), [pasteText]);
  const active = fileResult || pasteResult;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "", blankrows: false });
      setFileResult({ ...parseSkdMatrix(matrix), name: file.name });
      setPasteText("");
      setMessage("");
    } catch (error) {
      setMessage(`엑셀을 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const save = async (records: MonthlyInputRecord[], replaceDates: boolean, source: string) => {
    if (records.length === 0) {
      setMessage("저장할 KJ 편이 없습니다.");
      return false;
    }
    if (replaceDates) {
      const days = new Set(records.map((r) => r.skdTime.slice(0, 10))).size;
      const ok = window.confirm(
        `${records.length}편(${days}일)을 저장합니다.\n\n올린 일자의 기존 편 중 이번 목록에 없는 편은 삭제됩니다. 계속할까요?`,
      );
      if (!ok) return false;
    }
    setSaving(true);
    try {
      const res = await saveMonthlyRecords(records, { replaceDates, source });
      const extra = [
        res.removed ? `빠진 편 ${res.removed}건 삭제` : "",
        res.outsideWindow ? `보관 기간 밖 ${res.outsideWindow}건 제외` : "",
        res.registrationSaved ? `등록기호 ${res.registrationSaved}건은 ③ 등록번호/AFOCS·초기화면에도 반영` : "",
      ].filter(Boolean);
      setMessage(`저장 완료 · ${res.saved}편${extra.length ? " · " + extra.join(" · ") : ""}`);
      onSaved?.();
      return true;
    } catch (error) {
      setMessage(`저장 실패: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveBulk = async () => {
    if (!active) return;
    const ok = await save(active.records, true, fileResult ? "excel" : "paste");
    if (ok) {
      setPasteText("");
      setFileResult(null);
    }
  };

  const saveManual = async () => {
    const parsed = parseSkdMatrix([[manual.flight, manual.registrationNo, manual.departureCode, manual.arrivalCode, manual.skdTime.replace("T", " ")]]);
    if (parsed.records.length === 0) {
      setMessage(parsed.skipped[0]?.reason || "입력값을 확인하세요.");
      return;
    }
    if (await save(parsed.records, false, "manual")) setManual(emptyManual);
  };

  return (
    <section style={panelStyle}>
      <div style={titleStyle}>월간 SKD 입력</div>
      {!compact && (
        <div style={hintStyle}>
          AFOCS 엑셀에서 표를 복사해 붙여넣거나 엑셀 파일을 올리세요. 열: 편명 · 등록기호 · DEP · ARR · ETD/ETA(예: 2026-11-06 23:15).
          KJ 편만 저장하며, 등록기호는 ③ 등록번호 / AFOCS와 초기화면에도 함께 반영됩니다.
        </div>
      )}

      <textarea
        value={pasteText}
        onChange={(e) => {
          setPasteText(e.target.value);
          setFileResult(null);
        }}
        placeholder={"엑셀에서 복사한 표를 붙여넣기\n편명\t등록기호\tDEP\tARR\tETD/ETA"}
        style={textareaStyle}
      />
      <div style={rowStyle}>
        <label style={fileLabelStyle}>
          엑셀 파일 선택
          <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => void handleFile(e.target.files?.[0])} />
        </label>
        {fileResult ? <span style={hintStyle}>{fileResult.name}</span> : null}
      </div>

      {active ? (
        <div style={previewStyle}>
          읽은 편 {active.records.length}건
          {active.records.length > 0
            ? ` · ${active.records[0].skdTime.slice(0, 10)} ~ ${active.records[active.records.length - 1].skdTime.slice(0, 10)}`
            : ""}
          {active.skipped.length > 0 ? (
            <div style={{ color: "#fbbf24", marginTop: 4 }}>
              제외 {active.skipped.length}건: {active.skipped.slice(0, 4).map((s) => `${s.line}행 ${s.reason}`).join(", ")}
              {active.skipped.length > 4 ? " …" : ""}
            </div>
          ) : null}
          <button type="button" onClick={() => void saveBulk()} disabled={saving || active.records.length === 0} style={primaryButtonStyle}>
            {saving ? "저장 중..." : `${active.records.length}편 저장`}
          </button>
        </div>
      ) : null}

      <div style={{ ...hintStyle, marginTop: 10 }}>한 줄 입력 (기존 편은 그대로 두고 추가·수정)</div>
      <div style={manualGridStyle}>
        <input placeholder="편명" value={manual.flight} onChange={(e) => setManual({ ...manual, flight: e.target.value })} style={inputStyle} />
        <input placeholder="등록기호" value={manual.registrationNo} onChange={(e) => setManual({ ...manual, registrationNo: e.target.value })} style={inputStyle} />
        <input placeholder="DEP" value={manual.departureCode} onChange={(e) => setManual({ ...manual, departureCode: e.target.value })} style={inputStyle} />
        <input placeholder="ARR" value={manual.arrivalCode} onChange={(e) => setManual({ ...manual, arrivalCode: e.target.value })} style={inputStyle} />
        <input type="datetime-local" aria-label="ETD/ETA" value={manual.skdTime} onChange={(e) => setManual({ ...manual, skdTime: e.target.value })} style={inputStyle} />
        <button type="button" onClick={() => void saveManual()} disabled={saving} style={secondaryButtonStyle}>
          한 줄 저장
        </button>
      </div>

      {message ? <div style={messageStyle}>{message}</div> : null}
    </section>
  );
}

const panelStyle: CSSProperties = {
  background: "#0b1a33",
  border: "1px solid #1f3a5f",
  borderRadius: 14,
  padding: 14,
  color: "#e2e8f0",
};
const titleStyle: CSSProperties = { fontSize: 16, fontWeight: 800, marginBottom: 6 };
const hintStyle: CSSProperties = { fontSize: 12, color: "#94a3b8", lineHeight: 1.5 };
const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 90,
  marginTop: 8,
  background: "#020817",
  color: "#e2e8f0",
  border: "1px solid #334155",
  borderRadius: 10,
  padding: 10,
  fontSize: 13,
  fontFamily: "monospace",
  boxSizing: "border-box",
};
const rowStyle: CSSProperties = { display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" };
const fileLabelStyle: CSSProperties = {
  padding: "8px 12px",
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};
const previewStyle: CSSProperties = {
  marginTop: 8,
  padding: 10,
  background: "rgba(37, 99, 235, 0.12)",
  border: "1px solid rgba(96, 165, 250, 0.3)",
  borderRadius: 10,
  fontSize: 13,
};
const manualGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))",
  gap: 6,
  marginTop: 6,
};
const inputStyle: CSSProperties = {
  background: "#020817",
  color: "#e2e8f0",
  border: "1px solid #334155",
  borderRadius: 8,
  padding: "8px 8px",
  fontSize: 13,
  minWidth: 0,
};
const primaryButtonStyle: CSSProperties = {
  display: "block",
  marginTop: 8,
  padding: "9px 14px",
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: 8,
  fontWeight: 800,
  cursor: "pointer",
};
const secondaryButtonStyle: CSSProperties = {
  padding: "8px 10px",
  background: "#334155",
  color: "#f8fafc",
  border: "none",
  borderRadius: 8,
  fontWeight: 800,
  cursor: "pointer",
};
const messageStyle: CSSProperties = { marginTop: 8, fontSize: 13, color: "#bfdbfe" };
