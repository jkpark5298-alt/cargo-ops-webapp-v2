"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { FlightMode } from "../lib/schedule-slots";

type FlightsModeTabsProps = {
  mode: FlightMode;
  onChange: (mode: FlightMode) => void;
};

const baseTabs: { id: FlightMode; label: string }[] = [
  { id: "query", label: "① 편명 조회 및 저장" },
  { id: "edit", label: "② 편명 수정" },
  { id: "registration", label: "③ 등록번호 / AFOCS" },
];

const homeLinkTab = { id: "home-link" as const, label: "④ 초기화면 선택" };

function isAppleMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function FlightsModeTabs({ mode, onChange }: FlightsModeTabsProps) {
  const [showHomeLinkTab, setShowHomeLinkTab] = useState(false);

  useEffect(() => {
    setShowHomeLinkTab(isAppleMobileDevice());
  }, []);

  const tabs = showHomeLinkTab ? [...baseTabs, homeLinkTab] : baseTabs;

  return (
    <div style={wrapStyle}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          style={{
            ...tabStyle,
            background: mode === tab.id ? "#2563eb" : "#1e293b",
            color: mode === tab.id ? "#ffffff" : "#cbd5e1",
            border: mode === tab.id ? "1px solid #60a5fa" : "1px solid #334155",
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

const wrapStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 20,
};

const tabStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
};
