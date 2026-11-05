"use client";

import { useState } from "react";
import { hlInlineInputStyle } from "../styles";

export function HlRegistrationInput({
  flightKey,
  rowIndex,
  value,
  onChange,
}: {
  flightKey: string;
  rowIndex: number;
  value: string;
  onChange: (value: string) => void;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const inputId = `hl-reg-${flightKey}-${rowIndex}`;

  return (
    <input
      id={inputId}
      name={inputId}
      value={value}
      readOnly={!unlocked}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="characters"
      spellCheck={false}
      inputMode="text"
      data-lpignore="true"
      data-1p-ignore="true"
      data-form-type="other"
      placeholder="HL번호"
      className="hl-inline-input"
      onTouchStart={(event) => {
        event.currentTarget.removeAttribute("readOnly");
        setUnlocked(true);
      }}
      onFocus={(event) => {
        event.currentTarget.removeAttribute("readOnly");
        setUnlocked(true);
      }}
      onBlur={() => setUnlocked(false)}
      onChange={(event) => onChange(event.target.value.toUpperCase())}
      style={hlInlineInputStyle}
      aria-label={`${flightKey} 등록기호`}
    />
  );
}
