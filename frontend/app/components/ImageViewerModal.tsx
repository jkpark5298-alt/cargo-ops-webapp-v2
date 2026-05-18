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

type CropRatio = "1:1" | "4:3" | "16:9";
type MarkType = "arrow" | "circle" | "box";
type MarkPosition = "top-left" | "top-right" | "center" | "bottom-left" | "bottom-right";

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

const cropOptions: Array<{ label: string; value: CropRatio; ratio: number }> = [
  { label: "1:1", value: "1:1", ratio: 1 },
  { label: "4:3", value: "4:3", ratio: 4 / 3 },
  { label: "16:9", value: "16:9", ratio: 16 / 9 },
];

const markTypeOptions: Array<{ label: string; value: MarkType }> = [
  { label: "화살표", value: "arrow" },
  { label: "동그라미", value: "circle" },
  { label: "박스", value: "box" },
];

const markPositionOptions: Array<{ label: string; value: MarkPosition }> = [
  { label: "왼쪽 위", value: "top-left" },
  { label: "오른쪽 위", value: "top-right" },
  { label: "가운데", value: "center" },
  { label: "왼쪽 아래", value: "bottom-left" },
  { label: "오른쪽 아래", value: "bottom-right" },
];

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
  const [cropRatio, setCropRatio] = useState<CropRatio>("1:1");
  const [markType, setMarkType] = useState<MarkType>("arrow");
  const [markPosition, setMarkPosition] = useState<MarkPosition>("center");
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
      onSaveAnnotatedImage(dataUrl, "글씨 저장");
      setMemo("");
    } catch {
      window.alert("사진에 글씨를 넣는 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveCroppedImage = async () => {
    const selected = cropOptions.find((option) => option.value === cropRatio) || cropOptions[0];

    try {
      setIsSaving(true);
      const dataUrl = await cropImageToRatio(image.dataUrl, selected.ratio);
      onSaveAnnotatedImage(dataUrl, `자르기 ${selected.label}`);
    } catch {
      window.alert("사진을 자르는 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveMarkedImage = async () => {
    const selectedType = markTypeOptions.find((option) => option.value === markType) || markTypeOptions[0];
    const selectedPosition =
      markPositionOptions.find((option) => option.value === markPosition) || markPositionOptions[2];

    try {
      setIsSaving(true);
      const dataUrl = await drawMarkOnImage(image.dataUrl, markType, markPosition);
      onSaveAnnotatedImage(dataUrl, `${selectedType.label} 표시`);
    } catch {
      window.alert("사진에 표시를 넣는 중 오류가 발생했습니다.");
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

        <div style={toolGridStyle}>
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
            <div style={hintStyle}>입력한 글씨는 사진 하단에 박스 형태로 들어갑니다.</div>
          </div>

          <div style={editBoxStyle}>
            <label style={editLabelStyle}>사진 자르기</label>
            <div style={optionGridStyle}>
              {cropOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setCropRatio(option.value)}
                  style={cropRatio === option.value ? selectedOptionButtonStyle : optionButtonStyle}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={saveCroppedImage}
              disabled={isSaving}
              style={annotateButtonStyle}
            >
              {isSaving ? "수정본 저장 중..." : "자른 사진 저장"}
            </button>
            <div style={hintStyle}>가운데 기준으로 선택한 비율에 맞춰 자르고, 현재 사진 1장만 교체합니다.</div>
          </div>

          <div style={editBoxStyle}>
            <label style={editLabelStyle}>화살표/표시 넣기</label>
            <div style={optionGridStyle}>
              {markTypeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMarkType(option.value)}
                  style={markType === option.value ? selectedOptionButtonStyle : optionButtonStyle}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div style={positionGridStyle}>
              {markPositionOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMarkPosition(option.value)}
                  style={markPosition === option.value ? selectedOptionButtonStyle : optionButtonStyle}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={saveMarkedImage}
              disabled={isSaving}
              style={annotateButtonStyle}
            >
              {isSaving ? "수정본 저장 중..." : "표시 넣고 수정본 저장"}
            </button>
            <div style={hintStyle}>선택한 위치에 빨간 화살표, 동그라미, 박스를 넣고 현재 사진 1장만 교체합니다.</div>
          </div>
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
  return withImageCanvas(dataUrl, ({ image, canvas, ctx, canvasWidth, canvasHeight }) => {
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

    return canvas.toDataURL("image/jpeg", 0.86);
  });
}

function cropImageToRatio(dataUrl: string, targetRatio: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      const sourceRatio = sourceWidth / sourceHeight;
      let sx = 0;
      let sy = 0;
      let sw = sourceWidth;
      let sh = sourceHeight;

      if (sourceRatio > targetRatio) {
        sw = sourceHeight * targetRatio;
        sx = (sourceWidth - sw) / 2;
      } else {
        sh = sourceWidth / targetRatio;
        sy = (sourceHeight - sh) / 2;
      }

      const maxOutput = 1600;
      const outputWidth = Math.round(Math.min(maxOutput, sw));
      const outputHeight = Math.round(outputWidth / targetRatio);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Canvas context is not available."));
        return;
      }

      canvas.width = Math.max(1, outputWidth);
      canvas.height = Math.max(1, outputHeight);
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };

    image.onerror = () => reject(new Error("Image load failed."));
    image.src = dataUrl;
  });
}

function drawMarkOnImage(dataUrl: string, markType: MarkType, position: MarkPosition): Promise<string> {
  return withImageCanvas(dataUrl, ({ image, canvas, ctx, canvasWidth, canvasHeight }) => {
    ctx.drawImage(image, 0, 0, canvasWidth, canvasHeight);

    const target = getPositionPoint(position, canvasWidth, canvasHeight);
    const size = Math.max(70, Math.round(Math.min(canvasWidth, canvasHeight) * 0.18));
    const lineWidth = Math.max(8, Math.round(Math.min(canvasWidth, canvasHeight) * 0.014));

    ctx.strokeStyle = "#ef4444";
    ctx.fillStyle = "rgba(239, 68, 68, 0.16)";
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (markType === "circle") {
      ctx.beginPath();
      ctx.arc(target.x, target.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    if (markType === "box") {
      const x = clamp(target.x - size / 2, lineWidth, canvasWidth - size - lineWidth);
      const y = clamp(target.y - size / 2, lineWidth, canvasHeight - size - lineWidth);
      ctx.fillRect(x, y, size, size);
      ctx.strokeRect(x, y, size, size);
    }

    if (markType === "arrow") {
      const start = getArrowStartPoint(position, target, canvasWidth, canvasHeight, size);
      drawArrow(ctx, start.x, start.y, target.x, target.y, lineWidth, size * 0.32);
    }

    return canvas.toDataURL("image/jpeg", 0.86);
  });
}

function withImageCanvas(
  dataUrl: string,
  draw: (params: {
    image: HTMLImageElement;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    canvasWidth: number;
    canvasHeight: number;
  }) => string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      const scale = Math.min(1, 1600 / Math.max(width, height));
      const canvasWidth = Math.max(1, Math.round(width * scale));
      const canvasHeight = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Canvas context is not available."));
        return;
      }

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      resolve(draw({ image, canvas, ctx, canvasWidth, canvasHeight }));
    };

    image.onerror = () => reject(new Error("Image load failed."));
    image.src = dataUrl;
  });
}

function getPositionPoint(position: MarkPosition, width: number, height: number) {
  const xPad = width * 0.25;
  const yPad = height * 0.25;

  if (position === "top-left") return { x: xPad, y: yPad };
  if (position === "top-right") return { x: width - xPad, y: yPad };
  if (position === "bottom-left") return { x: xPad, y: height - yPad };
  if (position === "bottom-right") return { x: width - xPad, y: height - yPad };
  return { x: width / 2, y: height / 2 };
}

function getArrowStartPoint(
  position: MarkPosition,
  target: { x: number; y: number },
  width: number,
  height: number,
  size: number,
) {
  const offset = size * 1.35;

  if (position === "top-left") return { x: target.x + offset, y: target.y + offset };
  if (position === "top-right") return { x: target.x - offset, y: target.y + offset };
  if (position === "bottom-left") return { x: target.x + offset, y: target.y - offset };
  if (position === "bottom-right") return { x: target.x - offset, y: target.y - offset };
  return { x: Math.min(width - offset * 0.5, target.x + offset), y: Math.max(offset * 0.5, target.y - offset) };
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  lineWidth: number,
  headLength: number,
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
  zIndex: 9999,
  background: "rgba(2, 6, 23, 0.82)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 14,
};

const modalStyle: CSSProperties = {
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

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 14,
};

const labelStyle: CSSProperties = {
  color: "#93c5fd",
  fontSize: 13,
  fontWeight: 900,
  marginBottom: 4,
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 22,
  fontWeight: 950,
};

const descStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#94a3b8",
  lineHeight: 1.5,
  fontSize: 13,
};

const closeButtonStyle: CSSProperties = {
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

const imageWrapStyle: CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "#020617",
  overflow: "hidden",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: 180,
};

const imageStyle: CSSProperties = {
  width: "100%",
  maxHeight: "58vh",
  objectFit: "contain",
  display: "block",
};

const metaStyle: CSSProperties = {
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

const toolGridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  marginTop: 12,
};

const editBoxStyle: CSSProperties = {
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

const optionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 8,
};

const positionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: 8,
  marginTop: 8,
};

const actionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  marginTop: 14,
};

const baseButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: 14,
  color: "#fff",
  padding: "13px 12px",
  fontSize: 15,
  fontWeight: 950,
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  background: "#1d4ed8",
};

const annotateButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  width: "100%",
  marginTop: 10,
  border: "1px solid rgba(34, 197, 94, 0.45)",
  background: "#047857",
};

const optionButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  color: "#dbeafe",
  padding: "10px 8px",
  background: "rgba(30, 41, 59, 0.95)",
  border: "1px solid rgba(148, 163, 184, 0.26)",
};

const selectedOptionButtonStyle: CSSProperties = {
  ...optionButtonStyle,
  color: "#ffffff",
  background: "#2563eb",
  border: "1px solid rgba(191, 219, 254, 0.6)",
};

const secondaryButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  border: "1px solid rgba(148, 163, 184, 0.34)",
  background: "#334155",
};

const dangerButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  border: "1px solid rgba(248, 113, 113, 0.42)",
  background: "#7f1d1d",
};
