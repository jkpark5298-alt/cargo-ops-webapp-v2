import { type CSSProperties } from "react";

export const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top right, rgba(37, 99, 235, 0.26), transparent 32%), linear-gradient(180deg, #061121 0%, #07152b 52%, #020817 100%)",
  color: "#f8fafc",
  padding:
    "max(14px, env(safe-area-inset-top)) 12px max(20px, env(safe-area-inset-bottom))",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
};

export const heroStyle: CSSProperties = {
  width: "100%",
  maxWidth: 520,
  margin: "0 auto",
  padding: "12px 0 8px",
};

export const eyebrowStyle: CSSProperties = {
  color: "#9fb3c8",
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: "0.22em",
  marginBottom: 6,
};

export const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "clamp(28px, 8vw, 38px)",
  lineHeight: 1.08,
  letterSpacing: "-0.06em",
  fontWeight: 950,
  wordBreak: "keep-all",
};

export const datePillStyle: CSSProperties = {
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 3,
  marginTop: 10,
  padding: "9px 16px",
  borderRadius: 22,
  background: "rgba(37, 99, 235, 0.18)",
  border: "1px solid rgba(147, 197, 253, 0.28)",
  color: "#dbeafe",
  fontSize: 15,
  fontWeight: 900,
  lineHeight: 1.35,
  whiteSpace: "normal",
  wordBreak: "keep-all",
};

export const datePillSubStyle: CSSProperties = {
  color: "#bfdbfe",
  fontSize: 14,
  fontWeight: 850,
  lineHeight: 1.35,
};

export const stackStyle: CSSProperties = {
  width: "100%",
  maxWidth: 520,
  margin: "12px auto 0",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

export const cardStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: 12,
  borderRadius: 20,
  background: "rgba(8, 20, 39, 0.84)",
  border: "1px solid rgba(148, 163, 184, 0.22)",
  boxShadow: "0 12px 32px rgba(0, 0, 0, 0.22)",
  overflow: "hidden",
};

export const cardLabelStyle: CSSProperties = {
  color: "#9fb3c8",
  fontSize: 13,
  letterSpacing: "0.12em",
  fontWeight: 900,
  textTransform: "uppercase",
  marginBottom: 6,
};

export const cardTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 21,
  lineHeight: 1.25,
  letterSpacing: "-0.04em",
  fontWeight: 900,
  wordBreak: "keep-all",
};

export const cardDescriptionStyle: CSSProperties = {
  margin: "10px 0 12px",
  color: "#b8c5d8",
  fontSize: 14,
  lineHeight: 1.45,
  wordBreak: "keep-all",
};

export const primaryButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 46,
  border: "none",
  borderRadius: 14,
  color: "white",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
};

export const noticeStyle: CSSProperties = {
  padding: 12,
  borderRadius: 18,
  background: "rgba(250, 204, 21, 0.12)",
  border: "1px solid rgba(250, 204, 21, 0.26)",
  color: "#fde68a",
  fontSize: 14,
  lineHeight: 1.5,
};

export const noticeDangerStyle: CSSProperties = {
  padding: 12,
  borderRadius: 18,
  background: "rgba(127, 29, 29, 0.45)",
  border: "1px solid rgba(239, 68, 68, 0.75)",
  color: "#fecaca",
  fontSize: 14,
  lineHeight: 1.5,
  fontWeight: 750,
};

export const footerStyle: CSSProperties = {
  maxWidth: 520,
  margin: "16px auto 0",
  padding: "8px 0",
  color: "#64748b",
  textAlign: "center",
  fontSize: 13,
  fontWeight: 800,
};
