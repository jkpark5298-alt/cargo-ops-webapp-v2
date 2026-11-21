"use client";

import { useState } from "react";
import { type FlightRouteItem } from "../types";

/** 입력값을 등록번호로 정리: 4~5자리 숫자만 쓰면 HL 을 붙이고, HL + 숫자 4~5자리가 아니면 null */
export function normalizeRegistrationInput(value: string): string | null {
  let text = String(value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (/^\d{4,5}$/.test(text)) text = `HL${text}`;
  return /^HL\d{4,5}$/.test(text) ? text : null;
}

const smallButton: React.CSSProperties = {
  padding: "3px 9px",
  borderRadius: 8,
  border: "1px solid rgba(148, 163, 184, 0.35)",
  background: "transparent",
  color: "#cbd5e1",
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
};

/**
 * 카드의 등록 번호 줄. 평소에는 읽기 전용 글자이고, '수정'을 누르면 입력칸이 열린다.
 * 저장하면 등록 기록(매뉴얼 수정)으로 남는다.
 */
export function RegistrationRow({
  item,
  disabled = false,
  onSave,
}: {
  item: FlightRouteItem;
  disabled?: boolean;
  onSave?: (item: FlightRouteItem, registrationNo: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const open = () => {
    setValue(item.registrationNo || "");
    setMessage("");
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setMessage("");
  };

  const save = async () => {
    const normalized = normalizeRegistrationInput(value);
    if (!normalized) {
      setMessage("HL + 숫자 4~5자리로 입력하세요. (예: HL8319)");
      return;
    }
    if (normalized === (item.registrationNo || "").toUpperCase()) {
      cancel();
      return;
    }
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(item, normalized);
      setEditing(false);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "등록번호 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ color: "#92a7c5", fontSize: 12 }}>등록 번호</div>
        {editing ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void save();
                if (event.key === "Escape") cancel();
              }}
              autoFocus
              maxLength={9}
              aria-label={`${item.flight} 등록 번호 수정`}
              style={{
                width: 104,
                padding: "4px 8px",
                borderRadius: 8,
                border: "1px solid #22d3ee",
                background: "#040a16",
                color: "white",
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: 0.3,
                textTransform: "uppercase",
              }}
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              style={{ ...smallButton, background: "#2563eb", border: "1px solid #2563eb", color: "white", opacity: saving ? 0.6 : 1 }}
            >
              {saving ? "저장 중" : "저장"}
            </button>
            <button type="button" onClick={cancel} disabled={saving} style={smallButton}>
              취소
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "white", fontVariantNumeric: "tabular-nums" }}>
              {item.registrationNo || "-"}
            </div>
            {item.registrationEdited ? (
              <span style={{ fontSize: 10, fontWeight: 900, color: "#fbbf24" }}>수정됨</span>
            ) : null}
            {onSave ? (
              <button
                type="button"
                onClick={open}
                disabled={disabled}
                style={{ ...smallButton, color: "#22d3ee", border: "1px solid rgba(34, 211, 238, 0.55)", opacity: disabled ? 0.5 : 1 }}
              >
                수정
              </button>
            ) : null}
          </div>
        )}
      </div>
      {message ? (
        <div role="alert" style={{ color: "#fca5a5", fontSize: 11, fontWeight: 700, textAlign: "right" }}>
          {message}
        </div>
      ) : null}
    </div>
  );
}
