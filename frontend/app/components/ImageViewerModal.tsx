"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

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
  capturedAt?: string;
  locationText?: string;
  memo?: string;
};

type CropRect = { x: number; y: number; width: number; height: number };
type CropDragMode = "move" | "resize";

type ImageViewerModalProps = {
  image: ImageViewerImage | null;
  title?: string;
  description?: string;
  onClose: () => void;
  onCameraChange: () => void;
  onLibraryChange: () => void;
  onDelete: () => void;
  onSaveAnnotatedImage: (dataUrl: string, memo: string) => void;
  onSaveImageMemo: (memo: string) => void;
};

const defaultCropRect: CropRect = { x: 12, y: 12, width: 76, height: 60 };

export function ImageViewerModal({
  image,
  title,
  description,
  onClose,
  onCameraChange,
  onLibraryChange,
  onDelete,
  onSaveAnnotatedImage,
  onSaveImageMemo,
}: ImageViewerModalProps) {
  const imageElementRef = useRef<HTMLImageElement | null>(null);
  const cropDragRef = useRef<{
    mode: CropDragMode;
    pointerId: number;
    startX: number;
    startY: number;
    startRect: CropRect;
    imageWidth: number;
    imageHeight: number;
  } | null>(null);

  const [memo, setMemo] = useState("");
  const [photoMemo, setPhotoMemo] = useState("");
  const [isCropMode, setIsCropMode] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect>(defaultCropRect);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setPhotoMemo(image?.memo || "");
  }, [image?.id, image?.memo]);

  if (!image) return null;

  const savePhotoMemo = () => {
    onSaveImageMemo(photoMemo);
  };

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

  const saveFreeCroppedImage = async () => {
    try {
      setIsSaving(true);
      const dataUrl = await cropImageByRect(image.dataUrl, cropRect);
      onSaveAnnotatedImage(dataUrl, "자유 자르기");
      setIsCropMode(false);
    } catch {
      window.alert("선택 영역을 자르는 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleCropMode = () => {
    setIsCropMode((current) => !current);
  };

  const resetCropRect = () => {
    setCropRect(defaultCropRect);
  };

  const startCropDrag = (event: PointerEvent<HTMLDivElement>, mode: CropDragMode) => {
    if (!imageElementRef.current) return;

    const bounds = imageElementRef.current.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    cropDragRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRect: cropRect,
      imageWidth: bounds.width,
      imageHeight: bounds.height,
    };
  };

  const moveCropDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    const dx = ((event.clientX - drag.startX) / drag.imageWidth) * 100;
    const dy = ((event.clientY - drag.startY) / drag.imageHeight) * 100;

    if (drag.mode === "move") {
      setCropRect({
        ...drag.startRect,
        x: clamp(drag.startRect.x + dx, 0, 100 - drag.startRect.width),
        y: clamp(drag.startRect.y + dy, 0, 100 - drag.startRect.height),
      });
      return;
    }

    const nextWidth = clamp(drag.startRect.width + dx, 16, 100 - drag.startRect.x);
    const nextHeight = clamp(drag.startRect.height + dy, 16, 100 - drag.startRect.y);
    setCropRect({ ...drag.startRect, width: nextWidth, height: nextHeight });
  };

  const endCropDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    cropDragRef.current = null;
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
          <div style={cropStageStyle}>
            <img ref={imageElementRef} src={image.dataUrl} alt={image.label} style={imageStyle} />
            {isCropMode && (
              <div style={cropOverlayStyle}>
                <div
                  style={cropBoxStyle(cropRect)}
                  onPointerDown={(event) => startCropDrag(event, "move")}
                  onPointerMove={moveCropDrag}
                  onPointerUp={endCropDrag}
                  onPointerCancel={endCropDrag}
                >
                  <div style={cropBoxLabelStyle}>이동</div>
                  <div
                    style={resizeHandleStyle}
                    onPointerDown={(event) => startCropDrag(event, "resize")}
                    onPointerMove={moveCropDrag}
                    onPointerUp={endCropDrag}
                    onPointerCancel={endCropDrag}
                    title="크기 조절"
                  />
                </div>
              </div>
            )}

          </div>
        </div>

        <div style={metaStyle}>
          <div>{image.label}</div>
          <small>저장일시: {image.savedAt}</small>
          <div style={photoInfoStyle}>
            <strong>사진 정보</strong>
            <span>촬영일시: {image.capturedAt || "촬영일시 확인 불가"}</span>
            <span>위치정보: {image.locationText || "위치 정보 없음"}</span>
          </div>
        </div>

        <div style={photoMemoBoxStyle}>
          <label style={editLabelStyle}>사진 메모</label>
          <textarea
            value={photoMemo}
            onChange={(event) => setPhotoMemo(event.target.value)}
            placeholder="예: C02 게이트 변경 확인, 점검 완료, 현장 이상 없음"
            style={memoInputStyle}
          />
          <button type="button" onClick={savePhotoMemo} style={memoSaveButtonStyle}>
            메모 저장
          </button>
          <div style={hintStyle}>사진 메모는 이미지에 박히지 않고 업무 기록 데이터로만 저장됩니다.</div>
        </div>

        <div style={toolGridStyle}>
          <div style={editBoxStyle}>
            <label style={editLabelStyle}>자유 자르기</label>
            <div style={cropButtonGridStyle}>
              <button type="button" onClick={toggleCropMode} style={isCropMode ? selectedOptionButtonStyle : optionButtonStyle}>
                {isCropMode ? "자르기 모드 끄기" : "자유 자르기 시작"}
              </button>
              <button type="button" onClick={resetCropRect} style={optionButtonStyle}>
                영역 초기화
              </button>
            </div>
            {isCropMode && (
              <button
                type="button"
                onClick={saveFreeCroppedImage}
                disabled={isSaving}
                style={annotateButtonStyle}
              >
                {isSaving ? "수정본 저장 중..." : "선택 영역 자르기 저장"}
              </button>
            )}
            <div style={hintStyle}>
              자유 자르기 시작 후 사진 위 박스를 움직이고, 오른쪽 아래 손잡이로 크기를 조절하세요. 저장하면 현재 사진 1장만 교체됩니다.
            </div>
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
            <div style={hintStyle}>입력한 글씨는 사진 하단에 박스 형태로 들어갑니다.</div>
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

function cropImageByRect(dataUrl: string, rect: CropRect): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      const sx = clamp(Math.round((rect.x / 100) * sourceWidth), 0, sourceWidth - 1);
      const sy = clamp(Math.round((rect.y / 100) * sourceHeight), 0, sourceHeight - 1);
      const sw = Math.max(1, Math.min(sourceWidth - sx, Math.round((rect.width / 100) * sourceWidth)));
      const sh = Math.max(1, Math.min(sourceHeight - sy, Math.round((rect.height / 100) * sourceHeight)));
      const maxOutput = 1600;
      const scale = Math.min(1, maxOutput / Math.max(sw, sh));
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Canvas context is not available."));
        return;
      }

      canvas.width = Math.max(1, Math.round(sw * scale));
      canvas.height = Math.max(1, Math.round(sh * scale));
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };

    image.onerror = () => reject(new Error("Image load failed."));
    image.src = dataUrl;
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

const cropStageStyle: CSSProperties = {
  position: "relative",
  display: "inline-block",
  maxWidth: "100%",
  margin: "0 auto",
  touchAction: "none",
};

const imageStyle: CSSProperties = {
  width: "auto",
  maxWidth: "100%",
  maxHeight: "58vh",
  objectFit: "contain",
  display: "block",
  userSelect: "none",
};

const cropOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(2, 6, 23, 0.3)",
  pointerEvents: "none",
};

function cropBoxStyle(rect: CropRect): CSSProperties {
  return {
    position: "absolute",
    left: `${rect.x}%`,
    top: `${rect.y}%`,
    width: `${rect.width}%`,
    height: `${rect.height}%`,
    border: "2px solid #22c55e",
    background: "rgba(34, 197, 94, 0.1)",
    boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.38)",
    cursor: "move",
    pointerEvents: "auto",
    touchAction: "none",
    boxSizing: "border-box",
  };
}

const cropBoxLabelStyle: CSSProperties = {
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

const resizeHandleStyle: CSSProperties = {
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

const photoInfoStyle: CSSProperties = {
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

const photoMemoBoxStyle: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 16,
  border: "1px solid rgba(34, 197, 94, 0.22)",
  background: "rgba(5, 46, 22, 0.34)",
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

const cropButtonGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
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

const memoSaveButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  width: "100%",
  marginTop: 10,
  border: "1px solid rgba(96, 165, 250, 0.45)",
  background: "#1d4ed8",
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