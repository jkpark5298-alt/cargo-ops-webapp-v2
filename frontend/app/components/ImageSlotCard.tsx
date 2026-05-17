"use client";

import type { CSSProperties } from "react";

export type ImageSlotKey =
  | "daily-schedule"
  | "aircraft-check"
  | "inspection-result"
  | "issue";

export type ImageSlot = {
  key: ImageSlotKey;
  title: string;
  description: string;
};

export type SavedImage = {
  id: string;
  type: ImageSlotKey;
  label: string;
  savedAt: string;
  dataUrl: string;
};

type ImageSlotCardProps = {
  slot: ImageSlot;
  image: SavedImage | null;
  images?: SavedImage[];
  onCamera: () => void;
  onLibrary: () => void;
  onView: (image: SavedImage) => void;
  onDelete: () => void;
};

export function ImageSlotCard({
  slot,
  image,
  images = image ? [image] : [],
  onCamera,
  onLibrary,
  onView,
  onDelete,
}: ImageSlotCardProps) {
  return (
    <div style={imageSlotCardStyle}>
      <div>
        <div style={imageSlotTitleStyle}>{slot.title}</div>
        <div style={imageSlotDescStyle}>{slot.description}</div>
      </div>

      {images.length > 0 ? (
        <div style={imageSlotSavedStyle}>
          <button onClick={() => images[0] && onView(images[0])} style={imagePreviewButtonStyle}>
            <img src={images[0]?.dataUrl} alt={images[0]?.label || "저장 이미지"} style={imagePreviewStyle} />
            <span style={imageTextStyle}>
              저장됨
              <small style={imageDateStyle}>{images[0]?.savedAt}</small>
            </span>
          </button>
          {images.length > 1 && (
            <div style={thumbGridStyle}>
              {images.slice(1).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onView(item)}
                  style={thumbButtonStyle}
                  title={item.label}
                >
                  <img src={item.dataUrl} alt={item.label} style={thumbImageStyle} />
                </button>
              ))}
            </div>
          )}

          <div style={imageSlotActionRowStyle}>
            <button onClick={() => images[0] && onView(images[0])} style={miniButtonStyle}>
              보기
            </button>
            <button onClick={onCamera} style={miniButtonStyle}>
              사진 추가
            </button>
            <button onClick={onLibrary} style={miniButtonStyle}>
              사진첩 추가
            </button>
            <button onClick={onDelete} style={miniDangerButtonStyle}>
              삭제
            </button>
          </div>
        </div>
      ) : (
        <div style={imageSlotActionRowStyle}>
          <button onClick={onCamera} style={grayButtonStyle}>
            사진 촬영
          </button>
          <button onClick={onLibrary} style={darkButtonStyle}>
            사진첩에서 가져오기
          </button>
        </div>
      )}
    </div>
  );
}

const imageSlotCardStyle: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 16,
  padding: 14,
  background: "rgba(2, 6, 23, 0.38)",
};

const imageSlotTitleStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 16,
  fontWeight: 950,
};

const imageSlotDescStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
  lineHeight: 1.5,
  marginTop: 4,
};

const imageSlotActionRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  marginTop: 12,
};

const imageSlotSavedStyle: CSSProperties = {
  marginTop: 12,
};

const imagePreviewButtonStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  gap: 12,
  alignItems: "center",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 14,
  padding: 10,
  background: "#0f172a",
  color: "#f8fafc",
  cursor: "pointer",
  textAlign: "left",
};

const imagePreviewStyle: CSSProperties = {
  width: 86,
  height: 70,
  borderRadius: 10,
  objectFit: "cover",
  background: "#020617",
};

const imageTextStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 15,
  fontWeight: 900,
};

const imageDateStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 800,
};

const darkButtonStyle: CSSProperties = {
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

const grayButtonStyle: CSSProperties = {
  ...darkButtonStyle,
  background: "#334155",
};

const miniButtonStyle: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 12,
  padding: "10px 8px",
  background: "#111827",
  color: "#e2e8f0",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
};

const miniDangerButtonStyle: CSSProperties = {
  ...miniButtonStyle,
  borderColor: "rgba(239, 68, 68, 0.55)",
  background: "#450a0a",
  color: "#fecaca",
};


const thumbGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
  marginTop: 10,
};

const thumbButtonStyle: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.35)",
  borderRadius: 12,
  padding: 0,
  background: "#0f172a",
  overflow: "hidden",
  cursor: "pointer",
};

const thumbImageStyle: CSSProperties = {
  width: "100%",
  height: 72,
  objectFit: "cover",
  display: "block",
};
