import { type PointerEvent, type TouchEvent, useRef, useState, type WheelEvent } from "react";
import { CropDragMode, CropRect, ZoomTouchState } from "../types";
import { clamp, defaultCropRect } from "../helpers";

export type UseImageTransformParams = {
  cropDragRef: React.MutableRefObject<{ mode: import("../types").CropDragMode; pointerId: number; startX: number; startY: number; startRect: import("../types").CropRect; imageWidth: number; imageHeight: number; } | null>;
  imageElementRef: React.MutableRefObject<HTMLImageElement | null>;
};

/** 사진 확대·이동(터치·휠·더블탭)과 자유 자르기 영역 */
export function useImageTransform({
  cropDragRef,
  imageElementRef,
}: UseImageTransformParams) {
  const zoomTouchRef = useRef<ZoomTouchState | null>(null);
  const lastTapRef = useRef(0);
  const [isCropMode, setIsCropMode] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect>(defaultCropRect);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomPan, setZoomPan] = useState({ x: 0, y: 0 });

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

  return {
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
  };
}
