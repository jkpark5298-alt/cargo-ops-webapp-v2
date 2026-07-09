"use client";

import type { CSSProperties } from "react";
import {
  countRegistrationRows,
  countTargetFlights,
  getScheduleStatusLabel,
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
  onDeleteAll?: () => void;
  onLink: (slot: ScheduleSlotKey) => void;
  onRestore?: (slot: ScheduleSlotKey) => void;
  showRestore?: boolean;
};

function SlotTitle({
  variant,
  isLinked,
}: {
  variant: "now" | "after";
  isLinked: boolean;
}) {
  if (variant === "now") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 82,
            height: 82,
            borderRadius: "50%",
            border: `3px solid ${isLinked ? "#a855f7" : "#475569"}`,
            background: isLinked ? "rgba(168, 85, 247, 0.2)" : "rgba(15, 23, 42, 0.85)",
            color: isLinked ? "#e9d5ff" : "#94a3b8",
            fontSize: isLinked ? 16 : 14,
            fontWeight: 900,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            lineHeight: 1.15,
            flexShrink: 0,
            boxShadow: isLinked ? "0 0 18px rgba(168, 85, 247, 0.35)" : "none",
          }}
        >
          <span>
            ✈️
            <br />
            NOW FLT
          </span>
        </div>
        {isLinked ? (
          <span style={{ color: "#c084fc", fontSize: 11, fontWeight: 800 }}>초기화면 연동</span>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span
        style={{
          fontSize: 24,
          fontWeight: 900,
          color: isLinked ? "#c084fc" : "#94a3b8",
          letterSpacing: 0.6,
        }}
      >
        After
      </span>
      {isLinked ? (
        <span style={{ color: "#c084fc", fontSize: 11, fontWeight: 800 }}>초기화면 연동</span>
      ) : null}
    </div>
  );
}

export function ScheduleSlotCards({
  slots,
  selectedSlot,
  onSelect,
  onDelete,
  onDeleteAll,
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
        조회 후 저장하면 NOW FLT 카드가 생성됩니다. (최대 2장)
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {entries.map(({ key, entry }) => {
        if (!entry || !isActiveScheduleRoom(entry.room)) {
          const emptyVariant: "now" | "after" = key === "active" ? "now" : "after";
          return (
            <div key={key} style={emptyCardStyle}>
              <SlotTitle variant={emptyVariant} isLinked={false} />
              <div style={{ color: "#475569", fontSize: 13, marginTop: 8 }}>비어 있음</div>
            </div>
          );
        }

        const room = entry.room;
        const targetCount = countTargetFlights(room);
        const registrationCount = countRegistrationRows(room.rows || []);
        const statusLabel = getScheduleStatusLabel(room.rows || []);
        const selected = selectedSlot === key;
        const isLinked = slots.linkedSlot === key;
        const titleVariant: "now" | "after" = isLinked ? "now" : "after";

        return (
          <div
            key={key}
            style={{
              ...cardStyle,
              border: selected
                ? "1px solid #60a5fa"
                : isLinked
                  ? "2px solid #a855f7"
                  : "1px solid #23314f",
              background: selected ? "#0b1b35" : isLinked ? "#140d24" : "#0a1528",
              boxShadow: isLinked ? "0 0 0 1px rgba(168, 85, 247, 0.25)" : "none",
            }}
          >
            <div onClick={() => onSelect(key)} style={{ cursor: "pointer" }}>
              <SlotTitle variant={titleVariant} isLinked={isLinked} />

              <div style={{ fontWeight: 700, marginTop: 10, lineHeight: 1.45, color: "#e2e8f0" }}>
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
                  NOW FLT로 교체
                </button>
              ) : null}
              <button type="button" onClick={() => onDelete(key)} style={deleteBtnStyle}>
                삭제
              </button>
            </div>
          </div>
        );
      })}

      {onDeleteAll ? (
        <button type="button" onClick={onDeleteAll} style={deleteAllBtnStyle}>
          전체 삭제
        </button>
      ) : null}
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

const deleteAllBtnStyle: CSSProperties = {
  marginTop: 4,
  padding: "10px 12px",
  background: "#7f1d1d",
  color: "#fecaca",
  border: "1px solid rgba(248, 113, 113, 0.35)",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
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
