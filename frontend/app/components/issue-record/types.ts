import { type ImageSlot, type SavedImage } from "../ImageSlotCard";

export type IssueNotionRecord = {
  pageId: string;
  url?: string;
  savedAt: string;
};

export type IssueRecordCardProps = {
  issueImageSlot: ImageSlot;
  issueImage: SavedImage | null;
  issueImages: SavedImage[];
  openCamera: () => void;
  openPhotoLibrary: () => void;
  openLatestImage: (image: SavedImage) => void;
  handleDeleteImageSlot: () => void;
  handleDeleteSingleImage: (image: SavedImage) => void;
  handlePastedImage: (file: File) => void;
  todayText: string;
  currentTimeText: string;
  issueFlight: string;
  setIssueFlight: (value: string) => void;
  issueRoute: string;
  setIssueRoute: (value: string) => void;
  issueHlnbr: string;
  setIssueHlnbr: (value: string) => void;
  author: string;
  setAuthor: (value: string) => void;
  weatherSummary: string;
  issueText: string;
  setIssueText: (value: string) => void;
  issueNotionRecord: IssueNotionRecord | null;
  isIssueSaving: boolean;
  handleSaveIssueDraft: () => void;
  handleSaveIssueToNotion: () => void;
  handleUpdateIssueToNotion: () => void;
  /** 저장한 특이사항은 두고, 다음 특이사항을 쓰려고 입력칸과 저장 연결만 비운다 */
  handleStartNewIssue: () => void;
  handleDeleteIssueFromNotion: () => void;
  openIssueNotionPage: () => void;
  openNotionDatabase: (kind: "daily" | "issue") => void;
  handleResetLocalDraft: () => void;
};
