"use client";

import { type FlightRow } from "../../lib/flight-types";
import {
  resolveAfocsSkdForDisplay,
  splitAfocsSkdParts,
  splitAfocsSkdPartsStoredOnly,
} from "../../lib/afocs-skd";
import { useEffect, useState } from "react";
import { combineAfocsSkdParts } from "../lib/helpers";
import { hlInlineInputStyle } from "../styles";

export function AfocsSkdPartInputs({
  flightKey,
  storedValue,
  draftValue,
  row,
  onChange,
}: {
  flightKey: string;
  storedValue: string;
  draftValue?: string;
  row: FlightRow;
  onChange: (flight: string, value: string) => void;
}) {
  const sourceValue = draftValue !== undefined ? draftValue : resolveAfocsSkdForDisplay(storedValue, row);
  const seedParts = (() => {
    if (draftValue !== undefined) {
      const storedOnly = splitAfocsSkdPartsStoredOnly(draftValue);
      if (storedOnly.date || storedOnly.time) return storedOnly;
    }
    return splitAfocsSkdParts(sourceValue, row);
  })();
  const [dateValue, setDateValue] = useState(seedParts.date);
  const [timeValue, setTimeValue] = useState(seedParts.time);

  useEffect(() => {
    const nextParts = (() => {
      if (draftValue !== undefined) {
        const storedOnly = splitAfocsSkdPartsStoredOnly(draftValue);
        if (storedOnly.date || storedOnly.time) return storedOnly;
        return splitAfocsSkdParts(draftValue, row);
      }
      return splitAfocsSkdParts(storedValue, row);
    })();
    setDateValue(nextParts.date);
    setTimeValue(nextParts.time);
    // row identity는 flightKey로 대체
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightKey, storedValue, draftValue]);

  const commit = (nextDate: string, nextTime: string) => {
    onChange(flightKey, combineAfocsSkdParts(nextDate, nextTime));
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <input
        value={dateValue}
        onChange={(event) => setDateValue(event.target.value)}
        onBlur={() => commit(dateValue, timeValue)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        placeholder="MM.DD"
        style={{
          ...hlInlineInputStyle,
          minWidth: 58,
          width: 64,
          color: "#fcd34d",
          fontWeight: 800,
          border: "1px solid rgba(59, 130, 246, 0.4)",
          textAlign: "center",
        }}
        aria-label={`${flightKey} AFOCS 월일`}
      />
      <input
        value={timeValue}
        onChange={(event) => setTimeValue(event.target.value)}
        onBlur={() => commit(dateValue, timeValue)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        placeholder="HH:mm"
        style={{
          ...hlInlineInputStyle,
          minWidth: 54,
          width: 58,
          color: "#fcd34d",
          fontWeight: 800,
          border: "1px solid rgba(59, 130, 246, 0.4)",
          textAlign: "center",
        }}
        aria-label={`${flightKey} AFOCS 시간`}
      />
    </div>
  );
}
