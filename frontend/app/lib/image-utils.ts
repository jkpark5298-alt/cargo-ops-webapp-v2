/** 사진 용량을 줄이기 위한 리사이즈(JPEG) — 초기화면과 AFOCS SKD 화면이 함께 사용합니다. */
export function resizeImageDataUrl(dataUrl: string, maxSize = 1280, quality = 0.72): Promise<string> {
  if (typeof window === "undefined") return Promise.resolve(dataUrl);
  if (!dataUrl.startsWith("data:image/")) return Promise.resolve(dataUrl);

  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      try {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");

        if (!context) {
          resolve(dataUrl);
          return;
        }

        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(dataUrl);
      }
    };

    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}
