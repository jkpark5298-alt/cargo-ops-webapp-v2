import { type CSSProperties } from "react";
import { buttonStackStyle, cardStyle } from "../shared-styles";

export const apiSyncStatusStyle: CSSProperties = {
  marginTop: 12,
  color: "#fde68a",
  fontSize: 12,
  fontWeight: 850,
  textAlign: "right",
  lineHeight: 1.4,
};

export const syncStatusStyle: CSSProperties = {
  marginTop: 12,
  color: "#bfdbfe",
  fontSize: 12,
  fontWeight: 850,
  textAlign: "right",
};

export const sectionTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  marginBottom: 12,
  color: "#f8fafc",
};

export const statsFilterRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 12,
  flexWrap: "wrap",
};

export const scheduleSummaryCardStyle: CSSProperties = {
  border: "1px solid #24354f",
  background: "#0a1528",
  color: "white",
  borderRadius: 12,
  padding: "10px 12px",
};

export const scheduleSummaryCardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 4,
};

export const scheduleSummaryFlightListStyle: CSSProperties = {
  fontSize: 12,
  color: "#b8c7db",
  wordBreak: "break-all",
  lineHeight: 1.5,
};

export const scheduleMetaRowStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  marginBottom: 8,
  color: "#cbd5e1",
  fontSize: 12,
  fontWeight: 850,
  lineHeight: 1.4,
};

export const infoListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  marginTop: 4,
};

export const infoValueStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 15,
  lineHeight: 1.45,
  fontWeight: 800,
  wordBreak: "break-word",
};

export const apiGuideStyle: CSSProperties = {
  color: "#93c5fd",
  fontSize: 12,
  lineHeight: 1.45,
  marginTop: 8,
  marginBottom: 10,
  fontWeight: 750,
};

export const refreshButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 58,
  border: "1px solid rgba(147, 197, 253, 0.34)",
  borderRadius: 16,
  color: "#dbeafe",
  background: "#0f172a",
  fontSize: 17,
  fontWeight: 950,
  cursor: "pointer",
};

export const secondaryButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 58,
  border: "none",
  borderRadius: 16,
  color: "#ffffff",
  background: "#2563eb",
  fontSize: 17,
  fontWeight: 950,
  cursor: "pointer",
};

export const csmTransferButtonStyle: CSSProperties = {
  border: "1px solid rgba(52, 211, 153, 0.45)",
  borderRadius: 8,
  background: "rgba(6, 78, 59, 0.55)",
  color: "#6ee7b7",
  fontSize: 11,
  fontWeight: 850,
  padding: "4px 9px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export const csmTransferStatusStyle: CSSProperties = {
  marginTop: 8,
  marginBottom: 4,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid rgba(52, 211, 153, 0.35)",
  background: "rgba(6, 78, 59, 0.28)",
  color: "#a7f3d0",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.45,
};

export const csmTransferErrorStyle: CSSProperties = {
  ...csmTransferStatusStyle,
  border: "1px solid rgba(251, 113, 133, 0.45)",
  background: "rgba(136, 19, 55, 0.28)",
  color: "#fecdd3",
};

export const focusBadgeStyle: CSSProperties = {
  color: "#fbbf24",
  background: "#fbbf2422",
  border: "1px solid #fbbf2455",
  borderRadius: 999,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

export const completedBadgeStyle: CSSProperties = {
  color: "#93c5fd",
  background: "#93c5fd22",
  border: "1px solid #93c5fd55",
  borderRadius: 999,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

export const compactDateTimeLabelStyle: CSSProperties = {
  fontSize: 10,
  color: "#92a7c5",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

export const compactFieldBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#091326",
  border: "1px solid #3b82f6",
  fontWeight: 800,
  padding: "4px 4px",
  borderRadius: 8,
  fontSize: 13,
  textAlign: "center",
  fontFamily: "monospace",
  boxSizing: "border-box",
};

export { buttonStackStyle, cardStyle };
