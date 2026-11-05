"use client";

import { selectInputStyle } from "../styles";

export function TimeSelect24({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const hour = (value || "00:00").slice(0, 2);
  const minute = (value || "00:00").slice(3, 5);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <select
        value={hour}
        onChange={(e) => onChange(`${e.target.value}:${minute}`)}
        style={selectInputStyle}
      >
        {Array.from({ length: 24 }, (_, i) => {
          const v = String(i).padStart(2, "0");
          return (
            <option key={v} value={v}>
              {v}
            </option>
          );
        })}
      </select>

      <span style={{ color: "#9fb3c8" }}>:</span>

      <select
        value={minute}
        onChange={(e) => onChange(`${hour}:${e.target.value}`)}
        style={selectInputStyle}
      >
        {Array.from({ length: 60 }, (_, i) => {
          const v = String(i).padStart(2, "0");
          return (
            <option key={v} value={v}>
              {v}
            </option>
          );
        })}
      </select>
    </div>
  );
}
