import { type CSSProperties } from "react";

/** 여러 카드가 똑같이 쓰는 스타일 */
export const imageRegistrationCardStyle: CSSProperties = {
  background: "#0f172a",
  border: "1px dashed #334155",
  borderRadius: 16,
  padding: 12,
  display: "grid",
  gap: 10,
};

export const imageRegistrationHeaderStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

export const imageRegistrationTitleStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 15,
  fontWeight: 900,
};

export const imageRegistrationDescStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.45,
};

export const imageRegistrationButtonRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 5,
};

export const compactImageButtonStyle: CSSProperties = {
  border: "1px solid #334155",
  borderRadius: 9,
  background: "#1e293b",
  color: "#e5edf7",
  padding: "8px 2px",
  fontSize: 11,
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export const compactPasteButtonStyle: CSSProperties = {
  ...compactImageButtonStyle,
  background: "#2563eb",
  border: "1px solid #60a5fa",
  color: "#ffffff",
};

export const compactViewButtonStyle: CSSProperties = {
  ...compactImageButtonStyle,
  background: "#0f766e",
  border: "1px solid #2dd4bf",
  color: "#ffffff",
};

export const compactDisabledButtonStyle: CSSProperties = {
  ...compactImageButtonStyle,
  background: "#334155",
  border: "1px solid #475569",
  color: "#94a3b8",
  cursor: "not-allowed",
};

export const multiImagePreviewGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
  gap: 8,
};

export const multiImagePreviewItemStyle: CSSProperties = {
  position: "relative",
};

export const multiImagePreviewButtonStyle: CSSProperties = {
  position: "relative",
  border: "1px solid #334155",
  borderRadius: 14,
  padding: 0,
  background: "transparent",
  cursor: "pointer",
  overflow: "hidden",
  width: "100%",
};

export const multiImagePreviewStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: 150,
  objectFit: "cover",
};

export const multiImageIndexBadgeStyle: CSSProperties = {
  position: "absolute",
  left: 8,
  top: 8,
  minWidth: 22,
  height: 22,
  borderRadius: 999,
  background: "rgba(15, 23, 42, 0.82)",
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

export const multiImageDeleteButtonStyle: CSSProperties = {
  position: "absolute",
  right: 8,
  top: 8,
  width: 28,
  height: 28,
  border: "1px solid rgba(248, 113, 113, 0.75)",
  borderRadius: 999,
  background: "rgba(127, 29, 29, 0.92)",
  color: "#ffffff",
  fontSize: 18,
  lineHeight: "24px",
  fontWeight: 900,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2,
};

export const cardStyle: CSSProperties = {
  background: "#111827",
  border: "1px solid #26374f",
  borderRadius: 22,
  padding: 18,
  boxShadow: "0 18px 45px rgba(0,0,0,0.22)",
};

export const cardLabelStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: 2,
  textTransform: "uppercase",
};

export const cardTitleStyle: CSSProperties = {
  margin: "6px 0 8px",
  color: "#f8fafc",
  fontSize: 21,
  lineHeight: 1.25,
  fontWeight: 950,
};

export const cardDescriptionStyle: CSSProperties = {
  color: "#94a3b8",
  margin: "0 0 14px",
  lineHeight: 1.55,
  fontSize: 14,
};

export const fieldBlockStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginTop: 14,
};

export const fieldLabelStyle: CSSProperties = {
  color: "#cbd5e1",
  fontSize: 13,
  fontWeight: 900,
};

export const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #334155",
  borderRadius: 14,
  background: "#020817",
  color: "#f8fafc",
  padding: "13px 14px",
  fontSize: 15,
  fontWeight: 800,
  outline: "none",
};

export const noteStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 130,
  resize: "vertical",
  marginTop: 14,
  fontWeight: 700,
  lineHeight: 1.5,
};

export const buttonStackStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 14,
};

export const darkButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 58,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 16,
  color: "#ffffff",
  background: "#111827",
  fontSize: 17,
  fontWeight: 950,
  cursor: "pointer",
};

export const resetButtonStyle: CSSProperties = {
  ...darkButtonStyle,
  background: "#1f2937",
};

export const dangerButtonStyle: CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 14,
  border: "none",
  background: "#dc2626",
  color: "white",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
};

export const pasteTargetStyle: CSSProperties = {
  outline: "none",
  cursor: "text",
  WebkitUserSelect: "text",
  userSelect: "text",
};
