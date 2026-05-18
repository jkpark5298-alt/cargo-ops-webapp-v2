"use client";

import type { CSSProperties } from "react";

export type ImageViewerSlotKey =
  | "daily-schedule"
  | "aircraft-check"
  | "inspection-result"
  | "issue";

export type ImageViewerImage = {
  id: string;
  type: ImageViewerSlotKey;
  label: string;
  savedAt: string;
  dataUrl: string;
};

type ImageViewerModalProps = {
  image: ImageViewerImage | null;
  title?: string;
  description?: string;
  onClose: () => void;
  onCameraChange: () => void;
  onLibraryChange: () => void;
  onDelete: () => void;
};

export function ImageViewerModal({
  image,
  title,
  description,
  onClose,
  onCameraChange,
  onLibraryChange,
  onDelete,
}: ImageViewerModalProps) {
  if (!image) return null;

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="사진 보기">
      <div style={modalStyle}>
        <div style={headerStyle}>
          <div>
            <div style={labelStyle}>사진 보기</div>
            <h2 style={titleStyle}>{title || image.label}</h2>
            {description && <p style={descStyle}>{description}</p>}
          </div>
          <button type="button" onClick={onClose} style={closeButtonStyle} aria-label="닫기">
            ×
          </button>
        </div>

        <div style={imageWrapStyle}>
          <img src={image.dataUrl} alt={image.label} style={imageStyle} />
        </div>

        <div style={metaStyle}>
          <div>{image.label}</div>
          <small>저장일시: {image.savedAt}</small>
        </div>

        <div style={actionGridStyle}>
          <button type="button" onClick={onCameraChange} style={primaryButtonStyle}>
            카메라로 변경
          </button>
          <button type="button" onClick={onLibraryChange} style={primaryButtonStyle}>
            사진첩 변경
          </button>
          <button type="button" onClick={onDelete} style={dangerButtonStyle}>
            삭제
          </button>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(2, 6, 23, 0.86)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 14,
};

const modalStyle: CSSProperties = {
  width: "min(560px, 100%)",
  maxHeight: "92vh",
  overflowY: "auto",
  border: "1px solid rgba(96, 165, 250, 0.34)",
  borderRadius: 22,
  background: "linear-gradient(145deg, #020617, #0f172a)",
  boxShadow: "0 24px 80px rgba(0, 0, 0, 0.48)",
  padding: 16,
  color: "#e5edf7",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 14,
};

const labelStyle: CSSProperties = {
  color: "#93c5fd",
  fontSize: 12,
  fontWeight: 950,
  letterSpacing: 0.4,
  marginBottom: 4,
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 21,
  fontWeight: 950,
  lineHeight: 1.25,
};

const descStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#94a3b8",
  fontSize: 13,
  lineHeight: 1.45,
};

const closeButtonStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 999,
  border: "1px solid rgba(148, 163, 184, 0.32)",
  background: "#111827",
  color: "#f8fafc",
  fontSize: 28,
  lineHeight: 1,
  cursor: "pointer",
};

const imageWrapStyle: CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(148, 163, 184, 0.2)",
  background: "#020617",
  overflow: "hidden",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: 220,
  maxHeight: "58vh",
};

const imageStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  maxHeight: "58vh",
  objectFit: "contain",
};

const metaStyle: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 14,
  background: "rgba(15, 23, 42, 0.86)",
  border: "1px solid rgba(148, 163, 184, 0.16)",
  color: "#e2e8f0",
  fontSize: 13,
  fontWeight: 850,
  lineHeight: 1.5,
};

const actionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  marginTop: 14,
};

const baseButtonStyle: CSSProperties = {
  minHeight: 48,
  borderRadius: 14,
  padding: "11px 12px",
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 950,
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  border: "1px solid rgba(96, 165, 250, 0.55)",
  background: "#1d4ed8",
};

const secondaryButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  border: "1px solid rgba(148, 163, 184, 0.34)",
  background: "#334155",
};

const dangerButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  border: "1px solid rgba(248, 113, 113, 0.54)",
  background: "#7f1d1d",
  color: "#fee2e2",
};
