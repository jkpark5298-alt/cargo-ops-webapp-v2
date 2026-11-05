import { type CSSProperties } from "react";

export const queryButtonRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 20,
  flexWrap: "nowrap",
  alignItems: "center",
  overflowX: "auto",
  paddingBottom: 2,
};

export const homeButtonStyle: CSSProperties = {
  padding: "10px 14px",
  background: "#0f172a",
  color: "#dbeafe",
  border: "1px solid rgba(147, 197, 253, 0.34)",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 800,
};

export const thStyle: CSSProperties = {
  borderBottom: "1px solid #334155",
  padding: "12px 10px",
  textAlign: "left",
  fontSize: 14,
  color: "#e2e8f0",
  whiteSpace: "nowrap",
};

export const tdStyle: CSSProperties = {
  borderBottom: "1px solid #1f2937",
  padding: "12px 10px",
  fontSize: 14,
  verticalAlign: "top",
  whiteSpace: "nowrap",
};

export const hlInlineSaveRowStyle: CSSProperties = {
  marginTop: 16,
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

export const hlInlineHelpStyle: CSSProperties = {
  color: "#9fb3c8",
  fontSize: 13,
  fontWeight: 700,
};

export const hlExcelUploadButtonStyle: CSSProperties = {
  color: "#dbeafe",
  background: "#1e3a8a",
  border: "1px solid rgba(147, 197, 253, 0.45)",
  borderRadius: 10,
  padding: "12px 16px",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
};

export const hlInlineInputStyle: CSSProperties = {
  width: 112,
  minWidth: 108,
  minHeight: 34,
  padding: "7px 9px",
  borderRadius: 8,
  border: "1px solid rgba(96, 165, 250, 0.45)",
  background: "#020617",
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 800,
  outline: "none",
  letterSpacing: 0.3,
};

export const detailThStyle: CSSProperties = {
  borderBottom: "1px solid #334155",
  padding: "10px 12px",
  textAlign: "left",
  fontSize: 13,
  color: "#e2e8f0",
  whiteSpace: "nowrap",
};

export const detailTdStyle: CSSProperties = {
  borderBottom: "1px solid #22314e",
  padding: "10px 12px",
  fontSize: 13,
  color: "#e5edf7",
};

export const detailTdLabelStyle: CSSProperties = {
  ...detailTdStyle,
  width: 180,
  color: "#a7b7ce",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

export const dateInputStyle: CSSProperties = {
  padding: "10px 12px",
  background: "#111",
  border: "1px solid #444",
  borderRadius: 6,
  color: "white",
  fontSize: 14,
};

export const inlineDateInputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "#111",
  border: "1px solid #444",
  borderRadius: 6,
  color: "white",
  fontSize: 14,
};

export const selectInputStyle: CSSProperties = {
  padding: "10px 12px",
  background: "#111",
  border: "1px solid #444",
  borderRadius: 6,
  color: "white",
  fontSize: 14,
  minWidth: 78,
};

export const hlMappingButtonStyle: CSSProperties = {
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid rgba(147, 197, 253, 0.34)",
  background: "#1d4ed8",
  color: "#ffffff",
  fontWeight: 850,
  cursor: "pointer",
};

export const hlMappingSaveButtonStyle: CSSProperties = {
  ...hlMappingButtonStyle,
  background: "#16a34a",
  border: "none",
};

export const hlMappingDeleteButtonStyle: CSSProperties = {
  ...hlMappingButtonStyle,
  background: "#dc2626",
  border: "none",
};

export const hlMappingStatusStyle: CSSProperties = {
  marginTop: 10,
  color: "#bbf7d0",
  fontSize: 13,
  fontWeight: 800,
};

export const scheduleSaveGuideStyle: CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(250, 204, 21, 0.28)",
  background: "rgba(250, 204, 21, 0.08)",
  color: "#fde68a",
  fontSize: 13,
  lineHeight: 1.5,
};

export const scheduleSaveStatusStyle: CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #22314e",
  background: "#081427",
  color: "#e5edf7",
  fontSize: 14,
  fontWeight: 800,
};

export const scheduleSaveStatusSubStyle: CSSProperties = {
  marginTop: 4,
  color: "#93c5fd",
  fontSize: 13,
  fontWeight: 700,
};

export const modeBtn: CSSProperties = {
  padding: "10px 14px",
  background: "#111827",
  color: "#cbd5e1",
  border: "1px solid #334155",
  borderRadius: 9999,
  cursor: "pointer",
  fontWeight: 800,
};

export const modeActiveBtn: CSSProperties = {
  ...modeBtn,
  background: "#1d4ed8",
  color: "white",
  border: "1px solid #60a5fa",
};

export const saveScheduleBtn: CSSProperties = {
  padding: "10px 18px",
  background: "#16a34a",
  color: "white",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 800,
};

export const disabledBtn: CSSProperties = {
  padding: "10px 18px",
  background: "#334155",
  color: "#94a3b8",
  border: "none",
  borderRadius: 6,
  cursor: "not-allowed",
  fontWeight: 700,
};

export const primaryBtn: CSSProperties = {
  padding: "10px 18px",
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 700,
};

export const refreshBtn: CSSProperties = {
  flex: 1,
  minWidth: 180,
  padding: "10px 12px",
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 700,
};

export const afocsSkdLinkBtn: CSSProperties = {
  flex: 1,
  minWidth: 160,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 12px",
  background: "#0f766e",
  color: "white",
  borderRadius: 6,
  fontWeight: 700,
  border: "none",
  cursor: "pointer",
};

export const badgeBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "4px 8px",
  borderRadius: 9999,
  fontSize: 12,
  fontWeight: 700,
};

export const badgeOrange: CSSProperties = {
  ...badgeBase,
  background: "rgba(245, 158, 11, 0.18)",
  color: "#fbbf24",
};

export const badgePurple: CSSProperties = {
  ...badgeBase,
  background: "rgba(168, 85, 247, 0.18)",
  color: "#c084fc",
};

export const badgeRed: CSSProperties = {
  ...badgeBase,
  background: "rgba(239, 68, 68, 0.18)",
  color: "#f87171",
};

export const badgeNormal: CSSProperties = {
  ...badgeBase,
  background: "rgba(148, 163, 184, 0.16)",
  color: "#cbd5e1",
};
