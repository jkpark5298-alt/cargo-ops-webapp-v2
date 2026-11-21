"use client";

import { useState } from "react";
import { parseDepartureInput, splitDeparture, toMonthDay } from "../../../lib/departure-times";
import { CompactDateTimeFields } from "./CompactDateTimeFields";
import { type FlightRouteItem } from "../types";

/**
 * 인천 도착편 카드의 '출발' 일자·시각 입력(표시용).
 * 월일과 시각이 모두 채워지면 자동 저장하고, 둘 다 비우면 저장된 값을 지운다.
 * 월일은 저장된 값이 없으면 예정 도착일로 미리 채워 둔다.
 */
export function DepartureRow({
  item,
  stored,
  disabled = false,
  onSave,
}: {
  item: FlightRouteItem;
  /** 서버에 저장된 출발 일시 'YYYY-MM-DD HH:MM' (없으면 빈 문자열) */
  stored: string;
  disabled?: boolean;
  /** departure 가 빈 문자열이면 삭제 */
  onSave: (item: FlightRouteItem, departure: string) => Promise<void> | void;
}) {
  const [message, setMessage] = useState("");
  const parts = splitDeparture(stored);
  const defaultDate = toMonthDay(item.scheduleDate);

  const handleSave = (_flight: string, date: string, time: string) => {
    const parsed = parseDepartureInput(date, time, item.scheduleDate);
    if (parsed.kind === "incomplete") {
      setMessage("");
      return;
    }
    if (parsed.kind === "invalid") {
      setMessage(parsed.message);
      return;
    }
    const next = parsed.kind === "ok" ? parsed.value : "";
    if (next === stored) {
      setMessage("");
      return;
    }
    // 저장된 값이 없는 상태에서 미리 채운 월일만 남은 경우(둘 다 비움)는 지울 것이 없다
    if (parsed.kind === "empty" && !stored) {
      setMessage("");
      return;
    }
    setMessage("");
    Promise.resolve(onSave(item, next)).catch((error) => {
      setMessage(error instanceof Error ? error.message : "출발 일시 저장에 실패했습니다.");
    });
  };

  return (
    <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
      <CompactDateTimeFields
        label="출발"
        labelNote="KST"
        date={parts.date || defaultDate}
        time={parts.time}
        tone="departure"
        flight={item.flight}
        editable={!disabled}
        onSave={handleSave}
      />
      {message ? (
        <div role="alert" style={{ color: "#fca5a5", fontSize: 11, fontWeight: 700 }}>
          {message}
        </div>
      ) : null}
    </div>
  );
}
