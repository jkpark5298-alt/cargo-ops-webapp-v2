"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { MonthlySkdInputPanel } from "../components/MonthlySkdInputPanel";
import {
  SHIFTS,
  SLOTS,
  addDays,
  assignSlots,
  assigneeName,
  datesBetween,
  deleteMonthlyFlight,
  displayTime,
  fetchMonthlySchedule,
  flightsForShift,
  isIcnDeparture,
  saveMonthlyAssignees,
  setMonthlyAssigneeSlot,
  shortDateTime,
  todayKst,
  type MonthlyScheduleData,
  type ShiftCode,
  type ViewType,
} from "../lib/monthly-schedule";

/** 지금(한국 시각)의 근무조와 그 근무조의 기준 일자. 06:30 이전 새벽은 전날 S조. */
function currentShift(nowMs: number = Date.now()): { date: string; shift: ShiftCode } {
  const kst = new Date(nowMs + 9 * 3600_000).toISOString();
  const today = kst.slice(0, 10);
  const hm = kst.slice(11, 16);
  if (hm >= "06:31" && hm <= "14:00") return { date: today, shift: "A" };
  if (hm >= "14:01" && hm < "23:00") return { date: today, shift: "C" };
  if (hm >= "23:00") return { date: today, shift: "S" };
  return { date: addDays(today, -1), shift: "S" };
}

function formatDateLabel(value: string) {
  const [, m, d] = value.split("-");
  const day = ["일", "월", "화", "수", "목", "금", "토"][new Date(`${value}T00:00:00Z`).getUTCDay()];
  return `${Number(m)}/${Number(d)}(${day})`;
}

/** Monthly Scheduled Flight — 월간 SKD를 일자·근무조별로 보여준다 (예전 AFOCS SKD 주소 그대로 사용) */
export default function MonthlyScheduledFlightPage() {
  const initial = useMemo(() => currentShift(), []);
  const [data, setData] = useState<MonthlyScheduleData | null>(null);
  const [viewType, setViewType] = useState<ViewType>(1);
  const [date, setDate] = useState(initial.date);
  const [shift, setShift] = useState<ShiftCode>(initial.shift);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [names, setNames] = useState({ nameA: "", nameB: "", nameC: "" });

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true);
    try {
      const json = await fetchMonthlySchedule(refresh);
      setData(json);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "월간 SKD를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
    // 화면을 열어 둔 동안 5분마다 다시 읽는다(인천 API 갱신은 서버가 10분 간격으로만 수행)
    const timer = window.setInterval(() => void load(true), 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  // 유형 1: 오늘·내일·모레 (새벽 S조 시간대에는 전날 S조도 선택 가능)
  const dateOptions = useMemo(() => {
    if (viewType === 1) {
      const today = todayKst();
      const base = [today, addDays(today, 1), addDays(today, 2)];
      return initial.date < today ? [initial.date, ...base] : base;
    }
    return data ? datesBetween(data.window.start, data.window.end) : [];
  }, [viewType, data, initial.date]);

  useEffect(() => {
    if (dateOptions.length > 0 && !dateOptions.includes(date)) setDate(dateOptions[0]);
  }, [dateOptions, date]);

  const assignee = useMemo(
    () => data?.assignees.find((a) => a.flightDate === date && a.shift === shift) || null,
    [data, date, shift],
  );
  useEffect(() => {
    setNames({ nameA: assignee?.nameA || "", nameB: assignee?.nameB || "", nameC: assignee?.nameC || "" });
  }, [assignee, date, shift]);

  const list = useMemo(() => (data ? flightsForShift(data.flights, date, shift, viewType) : []), [data, date, shift, viewType]);
  const slots = useMemo(() => assignSlots(list), [list]);
  const shiftCounts = useMemo(
    () => Object.fromEntries(SHIFTS.map((s) => [s.code, data ? flightsForShift(data.flights, date, s.code, viewType).length : 0])),
    [data, date, viewType],
  );

  const saveNames = async () => {
    if ((assignee?.nameA || "") === names.nameA && (assignee?.nameB || "") === names.nameB && (assignee?.nameC || "") === names.nameC) return;
    try {
      await saveMonthlyAssignees({ flightDate: date, shift, ...names });
      await load(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "담당 이름 저장 실패");
    }
  };

  const changeSlot = async (recordKey: string, slot: string) => {
    try {
      await setMonthlyAssigneeSlot(recordKey, slot);
      await load(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "담당 지정 실패");
    }
  };

  const removeFlight = async (recordKey: string, flight: string) => {
    if (!window.confirm(`${flight} 편을 월간 SKD에서 삭제할까요?`)) return;
    try {
      await deleteMonthlyFlight(recordKey);
      await load(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  const shiftInfo = SHIFTS.find((s) => s.code === shift)!;

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <section style={sectionStyle}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3 }}>
            {data?.title || "Monthly Scheduled Flight"}
          </div>
          <div style={hintStyle}>
            월간 SKD 기준 · 유형 1은 오늘~모레 편에 인천 API 변경시각·주기장을 반영(주기장은 당일 무렵 배정)
            {data?.apiRefreshedAt ? ` · API 반영 ${data.apiRefreshedAt.slice(5, 16).replace("T", " ")}` : ""}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button type="button" onClick={() => (window.location.href = "/")} style={navButtonStyle}>초기화면으로</button>
            <button type="button" onClick={() => (window.location.href = "/flights")} style={navButtonStyle}>편명조회로</button>
            <button type="button" onClick={() => void load(true)} disabled={loading} style={navButtonStyle}>
              {loading ? "불러오는 중..." : "새로고침"}
            </button>
            <button type="button" onClick={() => setShowInput((v) => !v)} style={navButtonStyle}>
              {showInput ? "입력 닫기" : "월간 SKD 입력"}
            </button>
          </div>
        </section>

        {showInput ? <MonthlySkdInputPanel onSaved={() => void load(false)} /> : null}

        <section style={sectionStyle}>
          <div style={tabRowStyle}>
            {([1, 2] as ViewType[]).map((t) => (
              <button key={t} type="button" onClick={() => setViewType(t)} style={t === viewType ? tabActiveStyle : tabStyle}>
                {t === 1 ? "유형 1 · 실시간(오늘~모레)" : "유형 2 · 월간 SKD(추정)"}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <span style={labelStyle}>일자</span>
            <select value={date} onChange={(e) => setDate(e.target.value)} style={selectStyle} aria-label="일자 선택">
              {dateOptions.map((d) => (
                <option key={d} value={d}>{formatDateLabel(d)}</option>
              ))}
            </select>
          </div>

          <div style={{ ...tabRowStyle, marginTop: 10 }}>
            {SHIFTS.map((s) => (
              <button key={s.code} type="button" onClick={() => setShift(s.code)} style={s.code === shift ? tabActiveStyle : tabStyle}>
                {s.label} {s.range} ({shiftCounts[s.code] ?? 0})
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <span style={labelStyle}>담당</span>
            {SLOTS.map((slot) => {
              const key = `name${slot}` as "nameA" | "nameB" | "nameC";
              return (
                <label key={slot} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                  {slot}
                  <input
                    value={names[key]}
                    onChange={(e) => setNames({ ...names, [key]: e.target.value })}
                    onBlur={() => void saveNames()}
                    placeholder={slot}
                    style={nameInputStyle}
                    aria-label={`담당 ${slot} 이름`}
                  />
                </label>
              );
            })}
            <label style={{ fontSize: 12, color: "#94a3b8", marginLeft: "auto" }}>
              <input type="checkbox" checked={editMode} onChange={(e) => setEditMode(e.target.checked)} /> 편 삭제
            </label>
          </div>
          {error ? <div style={errorStyle}>{error}</div> : null}
        </section>

        <section style={{ ...sectionStyle, padding: 0, overflowX: "auto", background: "#ffffff" }}>
          <div style={sheetTitleStyle}>
            Daily Job SKD ({date}) · {shiftInfo.label} {shiftInfo.range} · {viewType === 1 ? "실시간" : "월간 SKD 추정"}
          </div>
          <table style={tableStyle}>
            <thead>
              <tr>
                {["편명", "등록기호", "DEP", "ARR", "ETD/ETA", "담당자", "T/O R/I", "주기장"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
                {editMode ? <th style={thStyle} /> : null}
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={editMode ? 9 : 8} style={{ ...tdStyle, color: "#64748b", padding: 16 }}>
                    {data ? "이 근무조에 해당하는 편이 없습니다." : loading ? "불러오는 중..." : "월간 SKD가 없습니다. '월간 SKD 입력'에서 올려 주세요."}
                  </td>
                </tr>
              ) : (
                list.map((f) => {
                  const time = displayTime(f, viewType);
                  const changed = viewType === 1 && f.apiTime && f.apiTime !== f.skdTime;
                  const slot = slots[f.recordKey];
                  return (
                    <tr key={f.recordKey} style={{ background: isIcnDeparture(f) ? "#fff59d" : "#ffffff" }}>
                      <td style={tdStyle}>{f.flight}</td>
                      <td style={tdStyle}>{f.registrationNo || "-"}</td>
                      <td style={tdStyle}>{f.departureCode}</td>
                      <td style={tdStyle}>{f.arrivalCode}</td>
                      <td style={tdStyle}>
                        {shortDateTime(time)}
                        {changed ? <div style={subTextStyle}>SKD {f.skdTime.slice(11, 16)}</div> : null}
                        {viewType === 1 && f.apiRemark ? <div style={remarkStyle}>{f.apiRemark}</div> : null}
                      </td>
                      <td style={tdStyle}>
                        <select
                          value={f.assigneeSlot || ""}
                          onChange={(e) => void changeSlot(f.recordKey, e.target.value)}
                          style={slotSelectStyle}
                          aria-label={`${f.flight} 담당`}
                        >
                          <option value="">{assigneeName(slot, assignee)}</option>
                          {SLOTS.map((s) => (
                            <option key={s} value={s}>{`${s} · ${assigneeName(s, assignee)}`}</option>
                          ))}
                        </select>
                      </td>
                      <td style={tdStyle} />
                      <td style={tdStyle}>{viewType === 1 ? f.apiGate : ""}</td>
                      {editMode ? (
                        <td style={tdStyle}>
                          <button type="button" onClick={() => void removeFlight(f.recordKey, f.flight)} style={deleteButtonStyle}>삭제</button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  background: "#07152b",
  color: "white",
  padding: "16px 14px 28px",
  fontFamily: "Inter, Apple SD Gothic Neo, SF Pro Display, Segoe UI, sans-serif",
};
const containerStyle: CSSProperties = { maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 };
const sectionStyle: CSSProperties = { background: "#0b1a33", border: "1px solid #1f3a5f", borderRadius: 14, padding: 14 };
const hintStyle: CSSProperties = { fontSize: 12, color: "#94a3b8", lineHeight: 1.5, marginTop: 4 };
const labelStyle: CSSProperties = { fontSize: 13, color: "#bfdbfe", fontWeight: 700 };
const navButtonStyle: CSSProperties = {
  padding: "8px 12px",
  background: "#1e293b",
  color: "#e2e8f0",
  border: "1px solid #334155",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};
const tabRowStyle: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap" };
const tabStyle: CSSProperties = { ...navButtonStyle, background: "#0f172a", color: "#94a3b8" };
const tabActiveStyle: CSSProperties = { ...navButtonStyle, background: "#2563eb", border: "1px solid #2563eb", color: "white" };
const selectStyle: CSSProperties = { background: "#020817", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 8, padding: "6px 8px", fontSize: 14 };
const nameInputStyle: CSSProperties = { width: 80, background: "#020817", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 8, padding: "6px 8px", fontSize: 13 };
const errorStyle: CSSProperties = { marginTop: 8, color: "#fca5a5", fontSize: 13 };
const sheetTitleStyle: CSSProperties = { color: "#111827", textAlign: "center", fontSize: 15, fontWeight: 700, padding: "8px 6px", borderBottom: "1px solid #cbd5e1" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", color: "#111827", fontSize: 13, minWidth: 640 };
const thStyle: CSSProperties = { border: "1px solid #94a3b8", padding: "6px 6px", background: "#f8fafc", fontWeight: 800, whiteSpace: "nowrap" };
const tdStyle: CSSProperties = { border: "1px solid #cbd5e1", padding: "6px 6px", textAlign: "center", whiteSpace: "nowrap" };
const subTextStyle: CSSProperties = { fontSize: 11, color: "#64748b" };
const remarkStyle: CSSProperties = { fontSize: 11, color: "#b45309", fontWeight: 700 };
const slotSelectStyle: CSSProperties = { border: "none", background: "transparent", color: "#111827", fontSize: 13, fontWeight: 700 };
const deleteButtonStyle: CSSProperties = { padding: "4px 8px", background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5", borderRadius: 6, fontSize: 12, cursor: "pointer" };
