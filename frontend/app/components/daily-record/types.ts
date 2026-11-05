import { type ImageSlot, type ImageSlotKey, type SavedImage } from "../ImageSlotCard";
import { type ChangeEvent, type Dispatch, type RefObject, type SetStateAction } from "react";

export type DailyStatus = "normal" | "issue";

export type SavedImageWithMemo = SavedImage & {
  memo?: string;
};

export type DailyNotionRecord = {
  pageId: string;
  url?: string;
  savedAt: string;
};

export type DailyRecordCardProps = {
  dailyStatus: DailyStatus;
  setDailyStatus: Dispatch<SetStateAction<DailyStatus>>;
  dailyWorkDate: string;
  dailyWorkDateTitle: string;
  setDailyWorkDate: (value: string) => void;
  resetDailyWorkDateToToday: () => void;
  workDateMismatchWarning?: string;
  images: SavedImage[];
  imageSlots: ImageSlot[];
  getImageBySlot: (images: SavedImage[], slotKey: ImageSlotKey) => SavedImage | null;
  openCamera: (slotKey: ImageSlotKey) => void;
  openPhotoLibrary: (slotKey: ImageSlotKey) => void;
  openLatestImage: (image: SavedImage) => void;
  handleDeleteImageSlot: (slotKey: ImageSlotKey) => void;
  handleDeleteSingleImage: (image: SavedImage) => void;
  cameraInputRef: RefObject<HTMLInputElement | null>;
  libraryInputRef: RefObject<HTMLInputElement | null>;
  handleImageSelected: (
    event: ChangeEvent<HTMLInputElement>,
    sourceLabel: "카메라 촬영" | "사진첩 선택",
  ) => void;
  handlePastedImage: (slotKey: ImageSlotKey, file: File) => void;
  author: string;
  setAuthor: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  dailyNotionRecord: DailyNotionRecord | null;
  /** Notion 조회 상태: checking=확인 중, verified=Notion에서 확인, unverified=조회 실패(이 기기 기록 기준) */
  dailyNotionCheck?: "checking" | "verified" | "unverified";
  isDailySaving: boolean;
  isDailyTextSyncing: boolean;
  dailyTextSyncStatus: string;
  handleSaveDailyTextToSupabase: () => void;
  handleLoadDailyTextFromSupabase: () => void;
  handleSaveDailyDraft: () => void;
  handleSaveDailyToNotion: () => void;
  handleUpdateDailyToNotion: () => void;
  handleDeleteDailyFromNotion: () => void;
  openDailyNotionPage: () => void;
  openNotionDatabase: (kind: "daily" | "issue") => void;
  handleResetLocalDraft: () => void;
};
