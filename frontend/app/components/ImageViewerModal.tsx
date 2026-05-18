"use client";

import { useState, type CSSProperties } from "react";

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
  onSaveAnnotatedImage: (dataUrl: string, memo: string) => void;
};

export function ImageViewerModal({
  image,
  title,
  description,
  onClose,
  onCameraChange,
  onLibraryChange,
  onDelete,
  onSaveAnnotatedImage,
}: ImageViewerModalProps) {
  const [memo, setMemo] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  if (!image) return null;

  const saveMemoOnImage = async () => {
    const cleanMemo = memo.trim();

    if (!cleanMemo) {
      window.alert("사진에 넣을 글씨를 입력하세요.");
      return;
    }

    try {
      setIsSaving(true);
      const dataUrl = await drawMemoOnImage(image.dataUrl, cleanMemo);
      onSaveAnnotatedImage(dataUrl, cleanMemo);
      setMemo("");
    } catch {
      window.alert("사진에 글씨를 넣는 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

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

        <div style={editBoxStyle}>
          <label style={editLabelStyle}>사진에 글씨 쓰기</label>
          <textarea
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="예: 게이트 C01 → C02 변경, 점검 완료, 이상 없음"
            style={memoInputStyle}
          />
          <button
            type="button"
            onClick={saveMemoOnImage}
            disabled={isSaving}
            style={annotateButtonStyle}
          >
            {isSaving ? "수정본 저장 중..." : "글씨 넣고 수정본 저장"}
          </button>
          <div style={hintStyle}>입력한 글씨는 사진 하단에 박스 형태로 들어가며, 저장하면 기존 사진을 교체합니다.</div>
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

function drawMemoOnImage(dataUrl: string, memo: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      const scale = Math.min(1, 1600 / Math.max(width, height));
      const canvasWidth = Math.max(1, Math.round(width * scale));
      const canvasHeight = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Canvas context is not available."));
        return;
      }

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      ctx.drawImage(image, 0, 0, canvasWidth, canvasHeight);

      const padding = Math.max(18, Math.round(canvasWidth * 0.035));
      const fontSize = Math.max(26, Math.round(canvasWidth * 0.045));
      const lineHeight = Math.round(fontSize * 1.35);
      const maxTextWidth = canvasWidth - padding * 2;

      ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      const lines = wrapText(ctx, memo, maxTextWidth).slice(0, 4);
      const boxHeight = padding * 2 + lines.length * lineHeight;
      const boxTop = Math.max(0, canvasHeight - boxHeight);

      ctx.fillStyle = "rgba(2, 6, 23, 0.78)";
      ctx.fillRect(0, boxTop, canvasWidth, boxHeight);
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "top";

      lines.forEach((line, index) => {
        ctx.fillText(line, padding, boxTop + padding + index * lineHeight, maxTextWidth);
      });

      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };

    image.onerror = () => reject(new Error("Image load failed."));
    image.src = dataUrl;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let currentLine = "";

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(nextLine).width <= maxWidth) {
      currentLine = nextLine;
      return;
    }

    if (currentLine) lines.push(currentLine);

    if (ctx.measureText(word).width <= maxWidth) {
      currentLine = word;
      return;
    }

    let partial = "";
    for (const char of word) {
      const nextPartial = `${partial}${char}`;
      if (ctx.measureText(nextPartial).width > maxWidth && partial) {
        lines.push(partial);
        partial = char;
      } else {
        partial = nextPartial;
      }
    }
    currentLine = partial;
  });

  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [text];
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

const editBoxStyle: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 16,
  border: "1px solid rgba(96, 165, 250, 0.22)",
  background: "rgba(15, 23, 42, 0.7)",
};

const editLabelStyle: CSSProperties = {
  display: "block",
  color: "#bfdbfe",
  fontSize: 13,
  fontWeight: 950,
  marginBottom: 8,
};

const memoInputStyle: CSSProperties = {
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

const hintStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 750,
  lineHeight: 1.45,
  marginTop: 8,
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

const annotateButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  width: "100%",
  marginTop: 10,
  border: "1px solid rgba(34, 197, 94, 0.45)",
  background: "#047857",
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
