"use client";

import { DEFAULT_DAILY_AUTHOR } from "../../lib/local-storage";
import { sectionStyle } from "../styles";

export type DailyReportFormProps = {
  author: string;
  dailyLocalEditAtRef: React.MutableRefObject<number>;
  dailyStatus: "normal" | "issue";
  isDailySyncing: boolean;
  note: string;
  saveDailyReportToSupabase: (statusOverride?: "normal" | "issue" | undefined, imagesOverride?: import("../types").SavedImage[] | undefined) => Promise<void>;
  setAuthor: React.Dispatch<React.SetStateAction<string>>;
  setDailyStatus: React.Dispatch<React.SetStateAction<"normal" | "issue">>;
  setNote: React.Dispatch<React.SetStateAction<string>>;
  syncMessage: string;
};

/** 일일 업무보고 입력(작성자·메모·상태)과 Supabase 동기화 */
export function DailyReportForm({
  author,
  dailyLocalEditAtRef,
  dailyStatus,
  isDailySyncing,
  note,
  saveDailyReportToSupabase,
  setAuthor,
  setDailyStatus,
  setNote,
  syncMessage,
}: DailyReportFormProps) {
  return (
    <section style={sectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#60a5fa" }}>📝 당일 업무 메모 및 보고</div>
            <span style={{ fontSize: 11, color: isDailySyncing ? "#f59e0b" : "#b8c7db" }}>
              {syncMessage || (isDailySyncing ? "동기화 중..." : "동기화 대기")}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 4 }}>작성자</label>
              <input
                type="text"
                placeholder="이름 또는 부서 입력"
                value={author}
                onChange={(e) => {
                  dailyLocalEditAtRef.current = Date.now();
                  setAuthor(e.target.value.trim() ? e.target.value : DEFAULT_DAILY_AUTHOR);
                }}
                style={{
                  width: "100%",
                  background: "#091326",
                  border: "1px solid #1f2c43",
                  color: "white",
                  padding: "8px 12px",
                  borderRadius: 10,
                  fontSize: 14,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 4 }}>업무 상태</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    setDailyStatus("normal");
                    void saveDailyReportToSupabase("normal");
                  }}
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: 8,
                    border: dailyStatus === "normal" ? "1px solid #10b981" : "1px solid #1f2c43",
                    background: dailyStatus === "normal" ? "#064e3b" : "#091326",
                    color: dailyStatus === "normal" ? "#34d399" : "#94a3b8",
                    fontSize: 13,
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  🟢 이상 없음
                </button>
                <button
                  onClick={() => {
                    setDailyStatus("issue");
                    void saveDailyReportToSupabase("issue");
                  }}
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: 8,
                    border: dailyStatus === "issue" ? "1px solid #ef4444" : "1px solid #1f2c43",
                    background: dailyStatus === "issue" ? "#7f1d1d" : "#091326",
                    color: dailyStatus === "issue" ? "#fca5a5" : "#94a3b8",
                    fontSize: 13,
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  🔴 특이사항 있음
                </button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 4 }}>업무 메모 내용</label>
              <textarea
                placeholder="PC 대시보드와 실시간 연동되는 업무 메모 내용입니다."
                value={note}
                onChange={(e) => {
                  dailyLocalEditAtRef.current = Date.now();
                  setNote(e.target.value);
                }}
                rows={4}
                style={{
                  width: "100%",
                  background: "#091326",
                  border: "1px solid #1f2c43",
                  color: "white",
                  padding: "8px 12px",
                  borderRadius: 10,
                  fontSize: 14,
                  resize: "vertical",
                }}
              />
            </div>

            <button
              onClick={() => void saveDailyReportToSupabase()}
              style={{
                width: "100%",
                background: "#2563eb",
                color: "white",
                border: "none",
                borderRadius: 10,
                padding: "10px",
                fontSize: 14,
                fontWeight: "bold",
                cursor: "pointer",
                marginTop: 4,
                boxShadow: "0 4px 6px -1px rgba(37, 99, 235, 0.4)",
              }}
            >
              💾 Supabase에 저장 및 동기화
            </button>
          </div>
        </section>
  );
}
