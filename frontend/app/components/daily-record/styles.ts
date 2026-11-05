import { type CSSProperties } from "react";
import {
  buttonStackStyle,
  cardDescriptionStyle,
  cardLabelStyle,
  cardStyle,
  cardTitleStyle,
  compactDisabledButtonStyle,
  compactImageButtonStyle,
  compactPasteButtonStyle,
  compactViewButtonStyle,
  dangerButtonStyle,
  darkButtonStyle,
  fieldBlockStyle,
  fieldLabelStyle,
  imageRegistrationButtonRowStyle,
  imageRegistrationCardStyle,
  imageRegistrationDescStyle,
  imageRegistrationHeaderStyle,
  imageRegistrationTitleStyle,
  inputStyle,
  multiImageDeleteButtonStyle,
  multiImageIndexBadgeStyle,
  multiImagePreviewButtonStyle,
  multiImagePreviewGridStyle,
  multiImagePreviewItemStyle,
  multiImagePreviewStyle,
  noteStyle,
  pasteTargetStyle,
  resetButtonStyle,
} from "../shared-styles";

export const supabaseTextSyncBoxStyle: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 16,
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(96, 165, 250, 0.24)",
  display: "grid",
  gap: 8,
};

export const supabaseTextSyncTitleStyle: CSSProperties = {
  color: "#bfdbfe",
  fontSize: 13,
  fontWeight: 900,
};

export const supabaseTextSyncDescStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.45,
};

export const supabaseTextSyncButtonRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

export const supabaseTextSaveButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 12,
  background: "#2563eb",
  color: "#ffffff",
  padding: "10px 8px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

export const supabaseTextLoadButtonStyle: CSSProperties = {
  ...supabaseTextSaveButtonStyle,
  background: "#0f766e",
};

export const supabaseTextSyncButtonDisabledStyle: CSSProperties = {
  ...supabaseTextSaveButtonStyle,
  background: "#475569",
  color: "#cbd5e1",
  cursor: "wait",
};

export const supabaseTextSyncStatusStyle: CSSProperties = {
  color: "#fde68a",
  fontSize: 12,
  lineHeight: 1.45,
  fontWeight: 800,
};

export const datePickerBoxStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 10,
  margin: "14px 0 16px",
  padding: 14,
  borderRadius: 16,
  border: "1px solid rgba(96, 165, 250, 0.28)",
  background: "rgba(15, 23, 42, 0.72)",
};

export const dateTitleStyle: CSSProperties = {
  color: "#e0f2fe",
  fontSize: 16,
  fontWeight: 950,
  marginTop: 6,
};

export const dateControlStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 8,
};

export const dateInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  border: "1px solid #334155",
  borderRadius: 14,
  background: "#020817",
  color: "#f8fafc",
  padding: "12px 13px",
  fontSize: 15,
  fontWeight: 850,
  outline: "none",
  colorScheme: "dark",
};

export const dateInputWarningStyle: CSSProperties = {
  ...dateInputStyle,
  border: "1px solid #ef4444",
  boxShadow: "0 0 0 1px rgba(239, 68, 68, 0.35)",
};

export const workDateMismatchWarningStyle: CSSProperties = {
  margin: "-6px 0 16px",
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(239, 68, 68, 0.75)",
  background: "rgba(127, 29, 29, 0.45)",
  color: "#fecaca",
  fontSize: 13,
  fontWeight: 750,
  lineHeight: 1.55,
  display: "grid",
  gap: 10,
};

export const workDateMismatchWarningTitleStyle: CSSProperties = {
  color: "#fee2e2",
  fontSize: 14,
  fontWeight: 950,
};

export const workDateFixButtonStyle: CSSProperties = {
  justifySelf: "start",
  border: "1px solid rgba(252, 165, 165, 0.65)",
  borderRadius: 12,
  background: "rgba(185, 28, 28, 0.9)",
  color: "#fff1f2",
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
};

export const todayButtonStyle: CSSProperties = {
  border: "1px solid rgba(96, 165, 250, 0.42)",
  borderRadius: 14,
  background: "#1d4ed8",
  color: "#ffffff",
  padding: "0 14px",
  fontSize: 14,
  fontWeight: 950,
  cursor: "pointer",
};

export const statusToggleStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  margin: "14px 0 16px",
};

export const statusButtonStyle: CSSProperties = {
  width: "100%",
  padding: "13px 12px",
  borderRadius: 14,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  background: "#111827",
  color: "#dbeafe",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
};

export const statusActiveButtonStyle: CSSProperties = {
  ...statusButtonStyle,
  borderColor: "#16a34a",
  background: "#14532d",
  color: "#dcfce7",
};

export const statusIssueButtonStyle: CSSProperties = {
  ...statusButtonStyle,
  borderColor: "#f97316",
  background: "#431407",
  color: "#fed7aa",
};

export const imageSlotListStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

export const photoMemoPreviewBoxStyle: CSSProperties = {
  marginTop: 8,
  border: "1px solid rgba(34, 197, 94, 0.18)",
  borderRadius: 14,
  background: "rgba(5, 46, 22, 0.24)",
  padding: 10,
};

export const photoMemoPreviewTitleStyle: CSSProperties = {
  color: "#bbf7d0",
  fontSize: 12,
  fontWeight: 950,
  marginBottom: 6,
};

export const photoMemoPreviewItemStyle: CSSProperties = {
  color: "#dcfce7",
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1.45,
  wordBreak: "break-word",
};

export const photoMemoPreviewMoreStyle: CSSProperties = {
  color: "#86efac",
  fontSize: 12,
  fontWeight: 850,
  marginTop: 4,
};

export const greenButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 58,
  border: "none",
  borderRadius: 16,
  color: "#ffffff",
  background: "#16a34a",
  fontSize: 17,
  fontWeight: 950,
  cursor: "pointer",
};

export const disabledButtonStyle: CSSProperties = {
  ...darkButtonStyle,
  background: "#334155",
  color: "#94a3b8",
  cursor: "not-allowed",
  opacity: 0.72,
};

export const notionSavedBoxStyle: CSSProperties = {
  marginTop: 14,
  border: "1px solid #166534",
  background: "#052e16",
  borderRadius: 16,
  padding: 12,
};

export const notionSavedTextStyle: CSSProperties = {
  color: "#bbf7d0",
  fontSize: 13,
  fontWeight: 900,
  marginBottom: 10,
};

export const notionStatusSavedBoxStyle: CSSProperties = {
  marginTop: 12,
  border: "1px solid rgba(34, 197, 94, 0.55)",
  background: "rgba(5, 46, 22, 0.55)",
  borderRadius: 14,
  padding: "12px 14px",
};

export const notionStatusPendingBoxStyle: CSSProperties = {
  marginTop: 12,
  border: "1px solid rgba(245, 158, 11, 0.55)",
  background: "rgba(120, 53, 15, 0.35)",
  borderRadius: 14,
  padding: "12px 14px",
};

export const notionStatusLabelStyle: CSSProperties = {
  color: "#e2e8f0",
  fontSize: 12,
  fontWeight: 950,
  letterSpacing: "0.02em",
  marginBottom: 4,
};

export const notionStatusValueStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 850,
  lineHeight: 1.45,
};

export { buttonStackStyle, cardDescriptionStyle, cardLabelStyle, cardStyle, cardTitleStyle, compactDisabledButtonStyle, compactImageButtonStyle, compactPasteButtonStyle, compactViewButtonStyle, dangerButtonStyle, darkButtonStyle, fieldBlockStyle, fieldLabelStyle, imageRegistrationButtonRowStyle, imageRegistrationCardStyle, imageRegistrationDescStyle, imageRegistrationHeaderStyle, imageRegistrationTitleStyle, inputStyle, multiImageDeleteButtonStyle, multiImageIndexBadgeStyle, multiImagePreviewButtonStyle, multiImagePreviewGridStyle, multiImagePreviewItemStyle, multiImagePreviewStyle, noteStyle, pasteTargetStyle, resetButtonStyle };
