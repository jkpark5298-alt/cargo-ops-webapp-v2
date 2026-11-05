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

export const formGridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  marginTop: 14,
};

export const orangeButtonStyle: CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 14,
  border: "none",
  background: "#f97316",
  color: "#111827",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
};

export const disabledButtonStyle: CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 14,
  border: "1px solid #475569",
  background: "#334155",
  color: "#94a3b8",
  fontSize: 15,
  fontWeight: 900,
  cursor: "not-allowed",
  opacity: 0.72,
};

export const notionIssueSavedBoxStyle: CSSProperties = {
  marginTop: 14,
  border: "1px solid #9a3412",
  background: "#431407",
  borderRadius: 16,
  padding: 12,
};

export const notionIssueSavedTextStyle: CSSProperties = {
  color: "#fed7aa",
  fontSize: 13,
  fontWeight: 900,
  marginBottom: 10,
};

export const notionIssueStatusSavedBoxStyle: CSSProperties = {
  marginTop: 12,
  border: "1px solid rgba(249, 115, 22, 0.55)",
  background: "rgba(67, 20, 7, 0.55)",
  borderRadius: 14,
  padding: "12px 14px",
};

export const notionIssueStatusPendingBoxStyle: CSSProperties = {
  marginTop: 12,
  border: "1px solid rgba(245, 158, 11, 0.55)",
  background: "rgba(120, 53, 15, 0.35)",
  borderRadius: 14,
  padding: "12px 14px",
};

export const notionIssueStatusLabelStyle: CSSProperties = {
  color: "#e2e8f0",
  fontSize: 12,
  fontWeight: 950,
  letterSpacing: "0.02em",
  marginBottom: 4,
};

export const notionIssueStatusValueStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 850,
  lineHeight: 1.45,
};

export { buttonStackStyle, cardDescriptionStyle, cardLabelStyle, cardStyle, cardTitleStyle, compactDisabledButtonStyle, compactImageButtonStyle, compactPasteButtonStyle, compactViewButtonStyle, dangerButtonStyle, darkButtonStyle, fieldBlockStyle, fieldLabelStyle, imageRegistrationButtonRowStyle, imageRegistrationCardStyle, imageRegistrationDescStyle, imageRegistrationHeaderStyle, imageRegistrationTitleStyle, inputStyle, multiImageDeleteButtonStyle, multiImageIndexBadgeStyle, multiImagePreviewButtonStyle, multiImagePreviewGridStyle, multiImagePreviewItemStyle, multiImagePreviewStyle, noteStyle, pasteTargetStyle, resetButtonStyle };
