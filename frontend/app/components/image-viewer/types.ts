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

export type CropRect = { x: number; y: number; width: number; height: number };

export type CropDragMode = "move" | "resize";

export type ZoomTouchState =
  | { mode: "pan"; startX: number; startY: number; startPanX: number; startPanY: number }
  | { mode: "pinch"; startDistance: number; startScale: number; startPanX: number; startPanY: number; centerX: number; centerY: number };

export type ImageViewerModalProps = {
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
