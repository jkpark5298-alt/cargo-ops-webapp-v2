import { type CSSProperties } from "react";
import { CropRect } from "./types";

export const defaultCropRect: CropRect = { x: 12, y: 12, width: 76, height: 60 };

export function drawMemoOnImage(dataUrl: string, memo: string): Promise<string> {
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

export function cropImageByRect(dataUrl: string, rect: CropRect): Promise<string> {
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

export function withImageCanvas(
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

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
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

export function getZoomStageStyle(
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

export function cropBoxStyle(rect: CropRect): CSSProperties {
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
