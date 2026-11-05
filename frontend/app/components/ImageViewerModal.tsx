"use client";

import { useEffect, useRef, useState } from "react";
import { CropDragMode, CropRect, ImageViewerModalProps } from "./image-viewer/types";
import {
  cropBoxStyle,
  cropImageByRect,
  drawMemoOnImage,
  getZoomStageStyle,
} from "./image-viewer/helpers";
import {
  actionGridStyle,
  annotateButtonStyle,
  closeButtonStyle,
  cropBoxLabelStyle,
  cropButtonGridStyle,
  cropOverlayStyle,
  dangerButtonStyle,
  descStyle,
  editBoxStyle,
  editLabelStyle,
  headerStyle,
  hintStyle,
  imageStyle,
  imageWrapStyle,
  labelStyle,
  memoInputStyle,
  memoSaveButtonStyle,
  metaStyle,
  modalStyle,
  optionButtonStyle,
  overlayStyle,
  photoInfoStyle,
  photoMemoBoxStyle,
  primaryButtonStyle,
  resizeHandleStyle,
  secondaryButtonStyle,
  selectedOptionButtonStyle,
  titleStyle,
  toolGridStyle,
  zoomButtonStyle,
  zoomControlRowStyle,
  zoomGuideStyle,
} from "./image-viewer/styles";
import { useImageTransform } from "./image-viewer/hooks/useImageTransform";

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
  const {
    cropRect,
    endCropDrag,
    handleImageDoubleClick,
    handleImageTouchEnd,
    handleImageTouchMove,
    handleImageTouchStart,
    handleImageWheel,
    isCropMode,
    lastTapRef,
    moveCropDrag,
    resetCropRect,
    resetZoom,
    setIsCropMode,
    setZoomPan,
    setZoomScale,
    startCropDrag,
    toggleCropMode,
    zoomIn,
    zoomOut,
    zoomPan,
    zoomScale,
    zoomTouchRef,
  } = useImageTransform({ cropDragRef, imageElementRef });

  const [memo, setMemo] = useState("");
  const [photoMemo, setPhotoMemo] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setPhotoMemo(image?.memo || "");
    setZoomScale(1);
    setZoomPan({ x: 0, y: 0 });
    zoomTouchRef.current = null;
    lastTapRef.current = 0;
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