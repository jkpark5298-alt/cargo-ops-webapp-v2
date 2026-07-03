"use client";

import type { CSSProperties } from "react";
import {
  countRegistrationRows,
  countTargetFlights,
  getScheduleStatusLabel,
  getSlotLabel,
  isActiveScheduleRoom,
  type ScheduleSlot,
  type ScheduleSlotKey,
  type ScheduleSlotsState,
} from "../lib/schedule-slots";

type ScheduleSlotCardsProps = {
  slots: ScheduleSlotsState;
  selectedSlot: ScheduleSlotKey | null;
  onSelect: (slot: ScheduleSlotKey) => void;
  onDelete: (slot: ScheduleSlotKey) => void;
  onLink: (slot: ScheduleSlotKey) => void;
  onRestore?: (slot: ScheduleSlotKey) => void;
  showRestore?: boolean;
};

export function ScheduleSlotCards({
  slots,
  selectedSlot,
  onSelect,
  onDelete,
  onLink,
  onRestore,
  showRestore = false,
}: ScheduleSlotCardsProps) {
  const entries: { key: ScheduleSlotKey; entry: ScheduleSlot | null }[] = [
    { key: "active", entry: slots.active },
    { key: "archive", entry: slots.archive },
  ];

  const hasAny = entries.some(({ entry }) => entry && isActiveScheduleRoom(entry.room));

  if (!hasAny) {
    return (
      <div style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.6 }}>
        저장된 Schedule Flight 카드가 없습니다.
        <br />
        조회 후 저장하면 최신 저장 카드가 생성됩니다. (최대 2장)
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {entries.map(({ key, entry }) => {
        if (!entry || !isActiveScheduleRoom(entry.room)) {
          return (
            <div key={key} style={emptyCardStyle}>
              <div style={{ fontWeight: 700, color: "#64748b" }}>{getSlotLabel(key)}</div>
              <div style={{ color: "#475569", fontSize: 13, marginTop: 4 }}>비어 있음</div>
            </div>
          );
        }

        const room = entry.room;
        const targetCount = countTargetFlights(room);
        const registrationCount = countRegistrationRows(room.rows || []);
        const statusLabel = getScheduleStatusLabel(room.rows || []);
        const selected = selectedSlot === key;
        const isLinked = slots.linkedSlot === key;

        return (
          <div
            key={key}
            style={{
              ...cardStyle,
              border: selected ? "1px solid #60a5fa" : isLinked ? "1px solid #facc15" : "1px solid #23314f",
              background: selected ? "#0b1b35" : isLinked ? "#121a0a" : "#0a1528",
            }}
          >
            <div onClick={() => onSelect(key)} style={{ cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: isLinked ? "#facc15" : "#94a3b8",
                    letterSpacing: 0.4,
                  }}
                >
                  {getSlotLabel(key)}
                  {isLinked ? " · 초기화면 연동" : ""}
                </span>
              </div>

              <div style={{ fontWeight: 700, marginTop: 8, lineHeight: 1.45 }}>
                {entry.name || room.name}
              </div>

              <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 8 }}>
                대상 {targetCount}편 · 등록 {registrationCount}대 · {statusLabel}
              </div>

              <div
                style={{
                  color: "#cbd5e1",
                  fontSize: 12,
                  marginTop: 6,
                  wordBreak: "break-all",
                }}
              >
                {room.flightsInput}
              </div>

              <div style={{ color: "#64748b", fontSize: 11, marginTop: 6 }}>
                {room.startDateTime.replace("T", " ")} ~ {room.endDateTime.replace("T", " ")}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {!isLinked ? (
                <button type="button" onClick={() => onLink(key)} style={linkBtnStyle}>
                  초기화면 연동
                </button>
              ) : null}
              {showRestore && key === "archive" && onRestore ? (
                <button type="button" onClick={() => onRestore(key)} style={restoreBtnStyle}>
                  최신 저장으로 교체
                </button>
              ) : null}
              <button type="button" onClick={() => onDelete(key)} style={deleteBtnStyle}>
                삭제
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const cardStyle: CSSProperties = {
  borderRadius: 8,
  padding: 12,
};

const emptyCardStyle: CSSProperties = {
  ...cardStyle,
  border: "1px dashed #334155",
  background: "#07101f",
};

const deleteBtnStyle: CSSProperties = {
  flex: 1,
  minWidth: 72,
  padding: "8px 10px",
  background: "#334155",
  color: "white",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
};

const linkBtnStyle: CSSProperties = {
  flex: 1,
  minWidth: 110,
  padding: "8px 10px",
  background: "#ca8a04",
  color: "#111827",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
};

const restoreBtnStyle: CSSProperties = {
  flex: 1,
  minWidth: 110,
  padding: "8px 10px",
  background: "#1d4ed8",
  color: "white",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
};
