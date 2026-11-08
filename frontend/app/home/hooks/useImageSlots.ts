import { useRef, useState } from "react";
import {
  loadImages,
  saveDailyDraft,
  saveImages,
  saveIssueDraft,
  saveNote,
} from "../../lib/local-storage";
import { BACKEND_URL } from "../../lib/api-config";
import { ImageSlotKey, SavedImage } from "../types";
import { IMAGE_SLOTS, ISSUE_IMAGE_SLOT } from "../constants";
import {
  getImagesBySlot,
  readImageFileMetadata,
  removeImageBySlot,
  upsertImageBySlot,
} from "../helpers";
import { resizeImageDataUrl } from "../../lib/image-utils";

export type UseImageSlotsParams = {
  author: string;
  dailyStatus: "normal" | "issue";
  dailyWorkDate: string;
  issueFlight: string;
  issueHlnbr: string;
  issueRoute: string;
  issueText: string;
  lastSavedValuesRef: React.MutableRefObject<{ status: "normal" | "issue"; author: string; note: string; imagesJson: string; workDate: string; }>;
  note: string;
  setNotice: React.Dispatch<React.SetStateAction<string>>;
};

/** 일일 업무 사진 슬롯(촬영·갤러리·뷰어·메모·저장) */
export function useImageSlots({
  author,
  dailyStatus,
  dailyWorkDate,
  issueFlight,
  issueHlnbr,
  issueRoute,
  issueText,
  lastSavedValuesRef,
  note,
  setNotice,
}: UseImageSlotsParams) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);
  const pendingImageSlotRef = useRef<ImageSlotKey>("daily-schedule");
  const [images, setImages] = useState<SavedImage[]>([]);
  const [imageViewerImage, setImageViewerImage] = useState<SavedImage | null>(null);

  // Supabase 이미지 전송 중 플래그 → 자동 싱크 이미지 덮어쓰기 방지
  const imagesSavingRef = useRef(false);

  const openCamera = (slotKey: ImageSlotKey) => {
    pendingImageSlotRef.current = slotKey;
    cameraInputRef.current?.click();
  };

  const openPhotoLibrary = (slotKey: ImageSlotKey) => {
    pendingImageSlotRef.current = slotKey;
    libraryInputRef.current?.click();
  };

  const persistImages = (nextImages: SavedImage[], successMessage: string) => {
    setImages(nextImages);
    const saved = saveImages(nextImages);

    if (saved) {
      saveNote(note);
      saveDailyDraft({
        note,
        status: dailyStatus,
        author,
        workDate: dailyWorkDate,
        savedAt: new Date().toISOString(),
      });

      const hasIssueImage = nextImages.some((image) => image.type === ISSUE_IMAGE_SLOT.key);
      if (dailyStatus === "issue" || hasIssueImage || issueText.trim()) {
        saveIssueDraft({
          flight: issueFlight,
          route: issueRoute,
          hlnbr: issueHlnbr,
          text: issueText,
          status: "issue",
          author,
          savedAt: new Date().toISOString(),
        });
      }

      setNotice(successMessage);
    } else {
      setNotice(
        "이미지를 화면에는 올렸지만, 기기 저장공간 제한으로 재실행 후 복원되지 않을 수 있습니다. 더 작은 사진으로 다시 저장해 주세요.",
      );
    }

    // 이미지 변경(추가/삭제/수정) 즉시 Supabase에 자동 저장 → 15초 자동싱크 덮어쓰기 방지
    imagesSavingRef.current = true;
    void (async () => {
      try {
        const resp = await fetch(`${BACKEND_URL}/flights/daily-report-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // 사진만 보낸다(메모·작성자는 다른 기기 값을 덮어쓰지 않도록 생략).
          body: JSON.stringify({
            workDate: dailyWorkDate,
            images: nextImages,
            savedAt: new Date().toISOString(),
          }),
        });
        const json = await resp.json().catch(() => null);
        if (resp.ok && json?.success) {
          lastSavedValuesRef.current = {
            ...lastSavedValuesRef.current,
            imagesJson: JSON.stringify(nextImages),
          };
        }
      } catch {
        // 네트워크 오류 시 무시 (이미 localStorage에 저장됨)
      } finally {
        imagesSavingRef.current = false;
      }
    })();
  };

  const saveImageFileToSlot = (
    file: File,
    slotKey: ImageSlotKey,
    sourceLabel: "카메라 촬영" | "사진첩 선택" | "붙여넣기",
  ) => {
    if (!file.type.startsWith("image/")) {
      setNotice("붙여넣기 가능한 이미지가 없습니다. 사진첩 또는 카메라를 사용해 주세요.");
      return;
    }

    const reader = new FileReader();

    reader.onload = async () => {
      const originalDataUrl = String(reader.result || "");

      if (!originalDataUrl) return;

      const metadata = await readImageFileMetadata(file);
      const savedAt = new Date().toLocaleString("ko-KR");
      const slotInfo =
        [...IMAGE_SLOTS, ISSUE_IMAGE_SLOT].find((slot) => slot.key === slotKey) ||
        IMAGE_SLOTS[0];
      const label = `${slotInfo.title} · ${sourceLabel}`;
      const resizePlans =
        sourceLabel === "붙여넣기"
          ? [
              { maxSize: 960, quality: 0.62 },
              { maxSize: 720, quality: 0.55 },
              { maxSize: 540, quality: 0.5 },
            ]
          : [
              { maxSize: 1280, quality: 0.72 },
              { maxSize: 960, quality: 0.62 },
              { maxSize: 720, quality: 0.55 },
            ];

      let savedImage: SavedImage | null = null;
      let savedImages: SavedImage[] = [];
      let saved = false;

      for (const plan of resizePlans) {
        const dataUrl = await resizeImageDataUrl(originalDataUrl, plan.maxSize, plan.quality);
        const nextImage: SavedImage = {
          id: `${Date.now()}`,
          type: slotKey,
          label,
          savedAt,
          dataUrl,
          capturedAt: metadata.capturedAt,
          locationText: metadata.locationText,
        };
        const latestImages = loadImages();
        const nextImages = upsertImageBySlot(latestImages.length > 0 ? latestImages : images, nextImage);

        if (saveImages(nextImages)) {
          savedImage = nextImage;
          savedImages = nextImages;
          saved = true;
          break;
        }
      }

      if (!savedImage) {
        const dataUrl = await resizeImageDataUrl(originalDataUrl, 420, 0.45);
        savedImage = {
          id: `${Date.now()}`,
          type: slotKey,
          label,
          savedAt,
          dataUrl,
          capturedAt: metadata.capturedAt,
          locationText: metadata.locationText,
        };
        savedImages = upsertImageBySlot(images, savedImage);
      }

      persistImages(
        savedImages,
        saved
          ? `${slotInfo.title}를 기기에 저장했습니다.`
          : `${slotInfo.title}를 화면에는 올렸지만, 저장공간 제한으로 복원되지 않을 수 있습니다.`,
      );
      setImageViewerImage((current) =>
        current?.type === slotKey ? savedImage : current,
      );

    };

    reader.onerror = () => {
      setNotice("이미지를 읽는 중 오류가 발생했습니다.");
    };

    reader.readAsDataURL(file);
  };

  const handleImageSelected = (
    event: React.ChangeEvent<HTMLInputElement>,
    sourceLabel: "카메라 촬영" | "사진첩 선택",
  ) => {
    const file = event.target.files?.[0];
    const slotKey = pendingImageSlotRef.current;
    event.target.value = "";

    if (!file) return;

    saveImageFileToSlot(file, slotKey, sourceLabel);
  };

  const handlePastedImage = (slotKey: ImageSlotKey, file: File) => {
    saveImageFileToSlot(file, slotKey, "붙여넣기");
  };

  const handleDeleteImageSlot = (slotKey: ImageSlotKey) => {
    const slotImages = getImagesBySlot(images, slotKey);
    if (slotImages.length === 0) return false;

    const confirmed = window.confirm("이 항목의 이미지를 모두 삭제할까요?");
    if (!confirmed) return false;

    const nextImages = removeImageBySlot(images, slotKey);
    persistImages(nextImages, `${slotImages[0].label} 항목의 이미지를 삭제했습니다.`);
    setImageViewerImage((current) =>
      current?.type === slotKey ? null : current,
    );
    return true;
  };

  const handleDeleteSingleImage = (targetImage: SavedImage) => {
    const confirmed = window.confirm("이 이미지만 삭제할까요?");
    if (!confirmed) return false;

    const nextImages = images.filter((image) => image.id !== targetImage.id);
    persistImages(nextImages, `${targetImage.label} 이미지를 삭제했습니다.`);
    setImageViewerImage((current) =>
      current?.id === targetImage.id ? null : current,
    );
    return true;
  };

  const openLatestImage = (image: SavedImage) => {
    setImageViewerImage(image);
  };

  const closeImageViewer = () => {
    setImageViewerImage(null);
  };

  const getImageViewerSlotInfo = () =>
    [...IMAGE_SLOTS, ISSUE_IMAGE_SLOT].find(
      (slot) => slot.key === imageViewerImage?.type,
    );

  const handleViewerCameraChange = () => {
    if (!imageViewerImage) return;
    openCamera(imageViewerImage.type);
  };

  const handleViewerLibraryChange = () => {
    if (!imageViewerImage) return;
    openPhotoLibrary(imageViewerImage.type);
  };

  const handleViewerDelete = () => {
    if (!imageViewerImage) return;
    handleDeleteImageSlot(imageViewerImage.type);
  };

  const handleSaveAnnotatedImage = (dataUrl: string, memo: string) => {
    if (!imageViewerImage) return;

    const slotInfo =
      [...IMAGE_SLOTS, ISSUE_IMAGE_SLOT].find((slot) => slot.key === imageViewerImage.type) ||
      IMAGE_SLOTS[0];
    const savedAt = new Date().toLocaleString("ko-KR");
    const nextImage: SavedImage = {
      ...imageViewerImage,
      label: `${slotInfo.title} · 글씨 저장`,
      savedAt,
      dataUrl,
    };
    const nextImages = images.map((image) =>
      image.id === imageViewerImage.id ? nextImage : image,
    );

    persistImages(nextImages, `${slotInfo.title}에 글씨를 넣어 저장했습니다.`);
    setImageViewerImage(nextImage);
  };

  const handleSaveImageMemo = (memo: string) => {
    if (!imageViewerImage) return;

    const nextImage: SavedImage = {
      ...imageViewerImage,
      memo: memo.trim(),
    };

    const nextImages = images.map((image) =>
      image.id === imageViewerImage.id ? nextImage : image,
    );

    persistImages(nextImages, memo.trim() ? "사진 메모를 저장했습니다." : "사진 메모를 비웠습니다.");
    setImageViewerImage(nextImage);
  };

  const imageViewerSlotInfo = getImageViewerSlotInfo();

  return {
    cameraInputRef,
    closeImageViewer,
    handleDeleteImageSlot,
    handleDeleteSingleImage,
    handleImageSelected,
    handlePastedImage,
    handleSaveAnnotatedImage,
    handleSaveImageMemo,
    handleViewerCameraChange,
    handleViewerDelete,
    handleViewerLibraryChange,
    imageViewerImage,
    imageViewerSlotInfo,
    images,
    imagesSavingRef,
    libraryInputRef,
    openCamera,
    openLatestImage,
    openPhotoLibrary,
    setImages,
  };
}
