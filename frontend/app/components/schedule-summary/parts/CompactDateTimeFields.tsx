"use client";

import { useEffect, useState } from "react";
import { afocsCompactFieldStyles, changeCompactFieldStyles } from "../helpers";
import { compactDateTimeLabelStyle } from "../styles";

export function CompactDateTimeFields({
  label,
  date,
  time,
  tone,
  flight,
  editable = false,
  readOnly = false,
  onSave,
}: {
  label: string;
  date: string;
  time: string;
  tone: "afocs" | "change";
  flight?: string;
  editable?: boolean;
  readOnly?: boolean;
  onSave?: (flight: string, date: string, time: string) => void;
}) {
  const [dateValue, setDateValue] = useState(date);
  const [timeValue, setTimeValue] = useState(time);
  const fieldStyles = tone === "afocs" ? afocsCompactFieldStyles : changeCompactFieldStyles;

  useEffect(() => {
    setDateValue(date);
    setTimeValue(time);
  }, [date, time, flight]);

  const commit = (nextDate: string, nextTime: string) => {
    if (flight && onSave) {
      onSave(flight, nextDate, nextTime);
    }
  };

  const showEditor = editable && !readOnly && onSave && flight;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "nowrap" }}>
      <style>{`
        input.cargo-ops-skd-part::placeholder {
          color: #64748b !important;
          opacity: 1;
          font-weight: 600;
        }
      `}</style>
      <span style={compactDateTimeLabelStyle}>{label}</span>
      {showEditor ? (
        <>
          <input
            key={`${flight}-${tone}-date-${date}`}
            className="cargo-ops-skd-part"
            type="text"
            inputMode="text"
            enterKeyHint="done"
            value={dateValue}
            placeholder="MM.DD"
            onChange={(event) => setDateValue(event.target.value)}
            onBlur={() => commit(dateValue, timeValue)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            style={fieldStyles.date}
            aria-label={`${flight} ${label} 월일`}
          />
          <input
            key={`${flight}-${tone}-time-${time}`}
            className="cargo-ops-skd-part"
            type="text"
            inputMode="numeric"
            enterKeyHint="done"
            value={timeValue}
            placeholder="HH:mm"
            onChange={(event) => setTimeValue(event.target.value)}
            onBlur={() => commit(dateValue, timeValue)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            style={fieldStyles.time}
            aria-label={`${flight} ${label} 시간`}
          />
        </>
      ) : (
        <>
          <span style={fieldStyles.date}>{date || "-"}</span>
          <span style={fieldStyles.time}>{time || "-"}</span>
        </>
      )}
    </div>
  );
}
