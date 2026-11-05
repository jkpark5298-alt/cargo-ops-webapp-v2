import { type CSSProperties } from "react";

export const flightAlertHistoryCardStyle: CSSProperties = {
  background: "linear-gradient(145deg, #0b1120, #111827)",
  border: "1px solid #1e3a8a",
  borderRadius: 18,
  padding: 14,
  boxShadow: "0 12px 30px rgba(0,0,0,0.20)",
};

export const flightAlertTopStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 7,
  alignItems: "flex-start",
  marginBottom: 8,
};

export const cardLabelStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 1.5,
  textTransform: "uppercase",
};

export const flightAlertTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#f8fafc",
  fontSize: 20,
  lineHeight: 1.15,
  fontWeight: 950,
};

export const activeBadgeStyle: CSSProperties = {
  padding: "5px 9px",
  borderRadius: 999,
  background: "#b45309",
  color: "#fffbeb",
  fontSize: 12,
  fontWeight: 950,
  whiteSpace: "nowrap",
};

export const idleBadgeStyle: CSSProperties = {
  ...activeBadgeStyle,
  background: "#14532d",
  color: "#dcfce7",
};

export const flightAlertMetaStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.5,
  marginTop: 8,
};

export const flightAlertListStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  marginBottom: 8,
};

export const flightAlertHistoryItemStyle: CSSProperties = {
  border: "1px solid rgba(59, 130, 246, 0.22)",
  background: "rgba(30, 64, 175, 0.16)",
  borderRadius: 14,
  padding: "8px 10px",
};

export const flightAlertHistoryItemHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
};

export const flightAlertItemTitleStyle: CSSProperties = {
  color: "#fef3c7",
  fontSize: 15,
  fontWeight: 950,
  marginBottom: 4,
};

export const flightAlertItemDescStyle: CSSProperties = {
  color: "#fde68a",
  fontSize: 15,
  lineHeight: 1.45,
  fontWeight: 800,
  whiteSpace: "pre-line",
};

export const alertHighlightLineStyle: CSSProperties = {
  color: "#fca5a5",
  fontSize: 17,
  fontWeight: 950,
};

export const showAllButtonStyle: CSSProperties = {
  minHeight: 38,
  border: "1px solid rgba(96, 165, 250, 0.45)",
  borderRadius: 12,
  color: "#dbeafe",
  background: "rgba(30, 64, 175, 0.58)",
  fontSize: 13,
  fontWeight: 950,
  cursor: "pointer",
};

export const serverActionRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 7,
  marginBottom: 8,
};

export const serverButtonStyle: CSSProperties = {
  minHeight: 40,
  border: "1px solid rgba(59, 130, 246, 0.45)",
  borderRadius: 11,
  color: "#dbeafe",
  background: "#1d4ed8",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

export const disabledServerButtonStyle: CSSProperties = {
  ...serverButtonStyle,
  opacity: 0.5,
  cursor: "not-allowed",
};

export const dangerButtonStyle: CSSProperties = {
  ...serverButtonStyle,
  border: "1px solid rgba(248, 113, 113, 0.48)",
  background: "rgba(127, 29, 29, 0.72)",
  color: "#fecaca",
};

export const serverStatusStyle: CSSProperties = {
  color: "#93c5fd",
  fontSize: 11,
  fontWeight: 800,
  lineHeight: 1.35,
  marginTop: 8,
};

export const deleteItemButtonStyle: CSSProperties = {
  border: "1px solid rgba(248, 113, 113, 0.42)",
  borderRadius: 999,
  padding: "4px 8px",
  background: "rgba(127, 29, 29, 0.38)",
  color: "#fecaca",
  fontSize: 11,
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
