"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type TouchEvent, type WheelEvent } from "react";

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
type ZoomTouchState =
  | { mode: "pan"; startX: number; startY: number; startPanX: number; startPanY: number }
  | { mode: "pinch"; startDistance: number; startScale: number; startPanX: number; startPanY: number; centerX: number; centerY: number };

type TextPositionOption = "top" | "middle" | "bottom";
type TextSizeOption = "small" | "medium" | "large";
type TextColorOption = "white" | "yellow" | "red";

type TextAnnotationOptions = {
  position: TextPositionOption;
  size: TextSizeOption;
  color: TextColorOption;
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
  const zoomTouchRef = useRef<ZoomTouchState | null>(null);
  const lastTapRef = useRef(0);

  const [memo, setMemo] = useState("");
  const [textPosition, setTextPosition] = useState<TextPositionOption>("bottom");
  const [textSize, setTextSize] = useState<TextSizeOption>("medium");
  const [textColor, setTextColor] = useState<TextColorOption>("white");
  const [photoMemo, setPhotoMemo] = useState("");
  const [isCropMode, setIsCropMode] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect>(defaultCropRect);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomPan, setZoomPan] = useState({ x: 0, y: 0 });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setPhotoMemo(image?.memo || "");
    setZoomScale(1);
    setZoomPan({ x: 0, y: 0 });
    zoomTouchRef.current = null;
    lastTapRef.current = 0;
  }, [image?.id, image?.memo]);

  const resetZoom = () => {
    setZoomScale(1);
    setZoomPan({ x: 0, y: 0 });
    zoomTouchRef.current = null;
  };

  const zoomIn = () => {
    setZoomScale((current) => clamp(Number((current + 0.5).toFixed(2)), 1, 5));
  };

  const zoomOut = () => {
    setZoomScale((current) => {
      const nextScale = clamp(Number((current - 0.5).toFixed(2)), 1, 5);

      if (nextScale === 1) {
        setZoomPan({ x: 0, y: 0 });
      }

      return nextScale;
    });
  };

  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;

    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;

    return Math.hypot(dx, dy);
  };

  const getTouchCenter = (touches: React.TouchList) => {
    if (touches.length < 2) {
      return { x: touches[0]?.clientX || 0, y: touches[0]?.clientY || 0 };
    }

    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  };

  const handleImageTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (isCropMode) return;

    if (event.touches.length === 2) {
      event.preventDefault();
      const center = getTouchCenter(event.touches);
      zoomTouchRef.current = {
        mode: "pinch",
        startDistance: getTouchDistance(event.touches),
        startScale: zoomScale,
        startPanX: zoomPan.x,
        startPanY: zoomPan.y,
        centerX: center.x,
        centerY: center.y,
      };
      return;
    }

    if (event.touches.length === 1) {
      const now = Date.now();

      if (now - lastTapRef.current < 280) {
        event.preventDefault();

        if (zoomScale > 1) {
          resetZoom();
        } else {
          setZoomScale(2);
          setZoomPan({ x: 0, y: 0 });
        }

        lastTapRef.current = 0;
        return;
      }

      lastTapRef.current = now;

      zoomTouchRef.current = {
        mode: "pan",
        startX: event.touches[0].clientX,
        startY: event.touches[0].clientY,
        startPanX: zoomPan.x,
        startPanY: zoomPan.y,
      };
    }
  };

  const handleImageTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (isCropMode) return;

    const touchState = zoomTouchRef.current;

    if (!touchState) return;

    if (touchState.mode === "pinch" && event.touches.length >= 2) {
      event.preventDefault();
      const nextDistance = getTouchDistance(event.touches);
      if (touchState.startDistance <= 0 || nextDistance <= 0) return;

      const nextScale = clamp(Number((touchState.startScale * (nextDistance / touchState.startDistance)).toFixed(2)), 1, 5);

      setZoomScale(nextScale);

      if (nextScale === 1) {
        setZoomPan({ x: 0, y: 0 });
      } else {
        const center = getTouchCenter(event.touches);
        setZoomPan({
          x: touchState.startPanX + (center.x - touchState.centerX),
          y: touchState.startPanY + (center.y - touchState.centerY),
        });
      }

      return;
    }

    if (touchState.mode === "pan" && event.touches.length === 1 && zoomScale > 1) {
      event.preventDefault();
      setZoomPan({
        x: touchState.startPanX + event.touches[0].clientX - touchState.startX,
        y: touchState.startPanY + event.touches[0].clientY - touchState.startY,
      });
    }
  };

  const handleImageTouchEnd = () => {
    zoomTouchRef.current = null;

    if (zoomScale <= 1) {
      setZoomScale(1);
      setZoomPan({ x: 0, y: 0 });
    }
  };

  const handleImageDoubleClick = () => {
    if (isCropMode) return;

    if (zoomScale > 1) {
      resetZoom();
      return;
    }

    setZoomScale(2);
    setZoomPan({ x: 0, y: 0 });
  };

  const handleImageWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (isCropMode) return;

    event.preventDefault();

    setZoomScale((current) => {
      const nextScale = clamp(Number((current + (event.deltaY < 0 ? 0.2 : -0.2)).toFixed(2)), 1, 5);

      if (nextScale === 1) {
        setZoomPan({ x: 0, y: 0 });
      }

      return nextScale;
    });
  };

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
      const dataUrl = await drawMemoOnImage(image.dataUrl, cleanMemo, {
        position: textPosition,
        size: textSize,
        color: textColor,
      });
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
    setIsCropMode((current) => {
      const nextValue = !current;

      if (nextValue) {
        resetZoom();
      }

      return nextValue;
    });
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

        <div
          style={imageWrapStyle}
          onTouchStart={handleImageTouchStart}
          onTouchMove={handleImageTouchMove}
          onTouchEnd={handleImageTouchEnd}
          onTouchCancel={handleImageTouchEnd}
          onDoubleClick={handleImageDoubleClick}
          onWheel={handleImageWheel}
        >
          <div style={getZoomStageStyle(zoomScale, zoomPan, isCropMode)}>
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

        <div style={zoomControlRowStyle}>
          <button type="button" onClick={zoomOut} style={zoomButtonStyle} disabled={isCropMode || zoomScale <= 1}>
            축소
          </button>
          <button type="button" onClick={resetZoom} style={zoomButtonStyle} disabled={isCropMode || zoomScale === 1}>
            원래 크기
          </button>
          <button type="button" onClick={zoomIn} style={zoomButtonStyle} disabled={isCropMode || zoomScale >= 5}>
            확대
          </button>
          <span style={zoomGuideStyle}>
            {isCropMode ? "자르기 모드에서는 확대/축소가 잠시 꺼집니다." : `확대 ${Math.round(zoomScale * 100)}% · 두 손가락 확대/축소 · 더블탭`}
          </span>
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

            <div style={textOptionSectionStyle}>
              <div>
                <div style={textOptionLabelStyle}>글씨 위치</div>
                <div style={textOptionGridStyle}>
                  {[
                    ["top", "상단"],
                    ["middle", "가운데"],
                    ["bottom", "하단"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTextPosition(value as TextPositionOption)}
                      style={textPosition === value ? selectedOptionButtonStyle : optionButtonStyle}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={textOptionLabelStyle}>글씨 크기</div>
                <div style={textOptionGridStyle}>
                  {[
                    ["small", "작게"],
                    ["medium", "보통"],
                    ["large", "크게"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTextSize(value as TextSizeOption)}
                      style={textSize === value ? selectedOptionButtonStyle : optionButtonStyle}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={textOptionLabelStyle}>글씨 색상</div>
                <div style={textOptionGridStyle}>
                  {[
                    ["white", "흰색"],
                    ["yellow", "노란색"],
                    ["red", "빨간색"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTextColor(value as TextColorOption)}
                      style={textColor === value ? selectedOptionButtonStyle : optionButtonStyle}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={saveMemoOnImage}
              disabled={isSaving}
              style={annotateButtonStyle}
            >
              {isSaving ? "수정본 저장 중..." : "글씨 넣고 수정본 저장"}
            </button>
            <div style={hintStyle}>선택한 위치/크기/색상으로 글씨가 사진에 박스 형태로 들어갑니다.</div>
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

function drawMemoOnImage(
  dataUrl: string,
  memo: string,
  options: TextAnnotationOptions,
): Promise<string> {
  return withImageCanvas(dataUrl, ({ image, canvas, ctx, canvasWidth, canvasHeight }) => {
    ctx.drawImage(image, 0, 0, canvasWidth, canvasHeight);

    const padding = Math.max(18, Math.round(canvasWidth * 0.035));
    const baseFontSize = Math.max(26, Math.round(canvasWidth * 0.045));
    const fontSize =
      options.size === "small"
        ? Math.round(baseFontSize * 0.82)
        : options.size === "large"
          ? Math.round(baseFontSize * 1.22)
          : baseFontSize;
    const lineHeight = Math.round(fontSize * 1.35);
    const maxTextWidth = canvasWidth - padding * 2;

    ctx.font = `800 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const lines = wrapText(ctx, memo, maxTextWidth).slice(0, 5);
    const boxHeight = padding * 2 + lines.length * lineHeight;
    const boxTop = getTextBoxTop(options.position, canvasHeight, boxHeight, padding);

    ctx.fillStyle = getTextBoxBackground(options.color);
    ctx.fillRect(0, boxTop, canvasWidth, boxHeight);
    ctx.fillStyle = getTextColor(options.color);
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = Math.max(2, Math.round(fontSize * 0.08));
    ctx.shadowOffsetX = Math.max(1, Math.round(fontSize * 0.025));
    ctx.shadowOffsetY = Math.max(1, Math.round(fontSize * 0.025));

    lines.forEach((line, index) => {
      ctx.fillText(line, padding, boxTop + padding + index * lineHeight, maxTextWidth);
    });

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    return canvas.toDataURL("image/jpeg", 0.86);
  });
}

function getTextBoxTop(
  position: TextPositionOption,
  canvasHeight: number,
  boxHeight: number,
  padding: number,
) {
  if (position === "top") return 0;
  if (position === "middle") return Math.max(0, Math.round((canvasHeight - boxHeight) / 2));
  return Math.max(0, canvasHeight - boxHeight - Math.round(padding * 0.25));
}

function getTextColor(color: TextColorOption) {
  if (color === "yellow") return "#fde047";
  if (color === "red") return "#fca5a5";
  return "#ffffff";
}

function getTextBoxBackground(color: TextColorOption) {
  if (color === "yellow") return "rgba(66, 32, 6, 0.82)";
  if (color === "red") return "rgba(69, 10, 10, 0.84)";
  return "rgba(2, 6, 23, 0.78)";
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
  minHeight: 220,
  maxHeight: "64vh",
  touchAction: "none",
};

function getZoomStageStyle(
  zoomScale: number,
  zoomPan: { x: number; y: number },
  isCropMode: boolean,
): CSSProperties {
  return {
    position: "relative",
    display: "inline-block",
    maxWidth: "100%",
    margin: "0 auto",
    touchAction: isCropMode ? "none" : "pan-y",
    transform: isCropMode
      ? "none"
      : `translate3d(${zoomPan.x}px, ${zoomPan.y}px, 0) scale(${zoomScale})`,
    transformOrigin: "center center",
    transition: isCropMode ? undefined : "transform 120ms ease-out",
    cursor: isCropMode ? "default" : zoomScale > 1 ? "grab" : "zoom-in",
  };
}

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

const zoomControlRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 10,
};

const zoomButtonStyle: CSSProperties = {
  border: "1px solid rgba(96, 165, 250, 0.38)",
  borderRadius: 999,
  background: "rgba(30, 64, 175, 0.72)",
  color: "#eff6ff",
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 950,
  cursor: "pointer",
};

const zoomGuideStyle: CSSProperties = {
  color: "#bfdbfe",
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.86,
  lineHeight: 1.4,
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

const textOptionSectionStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 10,
};

const textOptionLabelStyle: CSSProperties = {
  color: "#bfdbfe",
  fontSize: 12,
  fontWeight: 950,
  marginBottom: 6,
};

const textOptionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 6,
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