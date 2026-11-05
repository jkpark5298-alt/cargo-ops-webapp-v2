import { type CSSProperties } from "react";

export const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background: "rgba(2, 6, 23, 0.82)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 14,
};

export const modalStyle: CSSProperties = {
  width: "min(680px, 100%)",
  maxHeight: "92vh",
  overflowY: "auto",
  borderRadius: 22,
  border: "1px solid rgba(96, 165, 250, 0.38)",
  background: "#071426",
  color: "#e5edf7",
  boxShadow: "0 24px 80px rgba(0, 0, 0, 0.42)",
  padding: 16,
};

export const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 14,
};

export const labelStyle: CSSProperties = {
  color: "#93c5fd",
  fontSize: 13,
  fontWeight: 900,
  marginBottom: 4,
};

export const titleStyle: CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 22,
  fontWeight: 950,
};

export const descStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#94a3b8",
  lineHeight: 1.5,
  fontSize: 13,
};

export const closeButtonStyle: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 999,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  background: "rgba(15, 23, 42, 0.82)",
  color: "#f8fafc",
  fontSize: 24,
  fontWeight: 900,
  cursor: "pointer",
};

export const imageWrapStyle: CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "#020617",
  overflow: "hidden",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: 220,
  maxHeight: "64vh",
  touchAction: "none",
};

export const imageStyle: CSSProperties = {
  width: "auto",
  maxWidth: "100%",
  maxHeight: "58vh",
  objectFit: "contain",
  display: "block",
  userSelect: "none",
};

export const cropOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(2, 6, 23, 0.3)",
  pointerEvents: "none",
};

export const cropBoxLabelStyle: CSSProperties = {
  position: "absolute",
  left: 8,
  top: 8,
  borderRadius: 999,
  background: "rgba(2, 6, 23, 0.78)",
  color: "#bbf7d0",
  fontSize: 12,
  fontWeight: 950,
  padding: "4px 8px",
  pointerEvents: "none",
};

export const resizeHandleStyle: CSSProperties = {
  position: "absolute",
  right: -10,
  bottom: -10,
  width: 28,
  height: 28,
  borderRadius: 999,
  border: "2px solid #bbf7d0",
  background: "#16a34a",
  boxShadow: "0 8px 18px rgba(0, 0, 0, 0.35)",
  cursor: "nwse-resize",
  touchAction: "none",
  pointerEvents: "auto",
};

export const zoomControlRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 10,
};

export const zoomButtonStyle: CSSProperties = {
  border: "1px solid rgba(96, 165, 250, 0.38)",
  borderRadius: 999,
  background: "rgba(30, 64, 175, 0.72)",
  color: "#eff6ff",
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 950,
  cursor: "pointer",
};

export const zoomGuideStyle: CSSProperties = {
  color: "#bfdbfe",
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.86,
  lineHeight: 1.4,
};

export const metaStyle: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 14,
  border: "1px solid rgba(148, 163, 184, 0.2)",
  background: "rgba(15, 23, 42, 0.74)",
  color: "#dbeafe",
  fontSize: 14,
  fontWeight: 850,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  lineHeight: 1.5,
};

export const photoInfoStyle: CSSProperties = {
  marginTop: 8,
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(96, 165, 250, 0.2)",
  background: "rgba(2, 6, 23, 0.42)",
  color: "#bfdbfe",
  display: "flex",
  flexDirection: "column",
  gap: 3,
  fontSize: 12,
  fontWeight: 750,
};

export const photoMemoBoxStyle: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 16,
  border: "1px solid rgba(34, 197, 94, 0.22)",
  background: "rgba(5, 46, 22, 0.34)",
};

export const toolGridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  marginTop: 12,
};

export const editBoxStyle: CSSProperties = {
  padding: 12,
  borderRadius: 16,
  border: "1px solid rgba(96, 165, 250, 0.22)",
  background: "rgba(15, 23, 42, 0.7)",
};

export const editLabelStyle: CSSProperties = {
  display: "block",
  color: "#bfdbfe",
  fontSize: 13,
  fontWeight: 950,
  marginBottom: 8,
};

export const memoInputStyle: CSSProperties = {
  width: "100%",
  minHeight: 74,
  boxSizing: "border-box",
  border: "1px solid rgba(148, 163, 184, 0.32)",
  borderRadius: 14,
  background: "#020617",
  color: "#f8fafc",
  padding: 12,
  fontSize: 15,
  fontWeight: 750,
  lineHeight: 1.45,
  resize: "vertical",
};

export const hintStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 750,
  lineHeight: 1.45,
  marginTop: 8,
};

export const cropButtonGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};

export const actionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  marginTop: 14,
};

export const baseButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: 14,
  color: "#fff",
  padding: "13px 12px",
  fontSize: 15,
  fontWeight: 950,
  cursor: "pointer",
};

export const primaryButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  background: "#1d4ed8",
};

export const annotateButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  width: "100%",
  marginTop: 10,
  border: "1px solid rgba(34, 197, 94, 0.45)",
  background: "#047857",
};

export const memoSaveButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  width: "100%",
  marginTop: 10,
  border: "1px solid rgba(96, 165, 250, 0.45)",
  background: "#1d4ed8",
};

export const optionButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  color: "#dbeafe",
  padding: "10px 8px",
  background: "rgba(30, 41, 59, 0.95)",
  border: "1px solid rgba(148, 163, 184, 0.26)",
};

export const selectedOptionButtonStyle: CSSProperties = {
  ...optionButtonStyle,
  color: "#ffffff",
  background: "#2563eb",
  border: "1px solid rgba(191, 219, 254, 0.6)",
};

export const secondaryButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  border: "1px solid rgba(148, 163, 184, 0.34)",
  background: "#334155",
};

export const dangerButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  border: "1px solid rgba(248, 113, 113, 0.42)",
  background: "#7f1d1d",
};
