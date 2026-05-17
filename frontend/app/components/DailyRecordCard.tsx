"use client";

import type {
  ChangeEvent,
  CSSProperties,
  Dispatch,
  Ref,
  RefObject,
  SetStateAction,
} from "react";
import { ImageSlotCard, type ImageSlot, type ImageSlotKey, type SavedImage } from "./ImageSlotCard";

type DailyStatus = "normal" | "issue";

type DailyNotionRecord = {
  pageId: string;
  url?: string;
  savedAt: string;
};

type DailyRecordCardProps = {
  dailyStatus: DailyStatus;
  setDailyStatus: Dispatch<SetStateAction<DailyStatus>>;
  images: SavedImage[];
  imageSlots: ImageSlot[];
  getImageBySlot: (images: SavedImage[], slotKey: ImageSlotKey) => SavedImage | null;
  openCamera: (slotKey: ImageSlotKey) => void;
  openPhotoLibrary: (slotKey: ImageSlotKey) => void;
  openLatestImage: (image: SavedImage) => void;
  handleDeleteImageSlot: (slotKey: ImageSlotKey) => void;
  cameraInputRef: RefObject<HTMLInputElement | null>;
  libraryInputRef: RefObject<HTMLInputElement | null>;
  handleImageSelected: (
    event: ChangeEvent<HTMLInputElement>,
    sourceLabel: "카메라 촬영" | "사진첩 선택",
  ) => void;
  author: string;
  setAuthor: Dispatch<SetStateAction<string>>;
  note: string;
  setNote: Dispatch<SetStateAction<string>>;
  dailyNotionRecord: DailyNotionRecord | null;
  isDailySaving: boolean;
  handleSaveDailyDraft: () => void;
  handleSaveDailyToNotion: () => void;
  handleUpdateDailyToNotion: () => void;
  handleDeleteDailyFromNotion: () => void;
  openDailyNotionPage: () => void;
  openNotionDatabase: (kind: "daily" | "issue") => void;
  handleResetLocalDraft: () => void;
};

export function DailyRecordCard({
  dailyStatus,
  setDailyStatus,
  images,
  imageSlots,
  getImageBySlot,
  openCamera,
  openPhotoLibrary,
  openLatestImage,
  handleDeleteImageSlot,
  cameraInputRef,
  libraryInputRef,
  handleImageSelected,
  author,
  setAuthor,
  note,
  setNote,
  dailyNotionRecord,
  isDailySaving,
  handleSaveDailyDraft,
  handleSaveDailyToNotion,
  handleUpdateDailyToNotion,
  handleDeleteDailyFromNotion,
  openDailyNotionPage,
  openNotionDatabase,
  handleResetLocalDraft,
}: DailyRecordCardProps) {
  return (
    <section style={cardStyle}>
      <div style={cardLabelStyle}>일일 업무 기록</div>
      <h2 style={cardTitleStyle}>사진 중심 업무 내용 정리</h2>
      <p style={cardDescriptionStyle}>
        항목별로 이미지를 먼저 선택해 저장합니다. 잘못 올린 사진은 보기, 변경, 삭제할 수 있습니다.
      </p>

      <div style={statusToggleStyle}>
        <button
          onClick={() => setDailyStatus("normal")}
          style={dailyStatus === "normal" ? statusActiveButtonStyle : statusButtonStyle}
        >
          이상 없음
        </button>
        <button
          onClick={() => setDailyStatus("issue")}
          style={dailyStatus === "issue" ? statusIssueButtonStyle : statusButtonStyle}
        >
          특이사항 있음
        </button>
      </div>

      <div style={imageSlotListStyle}>
        {imageSlots.map((slot) => (
          <ImageSlotCard
            key={slot.key}
            slot={slot}
            image={getImageBySlot(images, slot.key)}
            images={images.filter((image) => image.type === slot.key)}
            onCamera={() => openCamera(slot.key)}
            onLibrary={() => openPhotoLibrary(slot.key)}
            onView={openLatestImage}
            onDelete={() => handleDeleteImageSlot(slot.key)}
          />
        ))}
      </div>

      <input
        ref={cameraInputRef as Ref<HTMLInputElement>}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => handleImageSelected(event, "카메라 촬영")}
        style={{ display: "none" }}
      />
      <input
        ref={libraryInputRef as Ref<HTMLInputElement>}
        type="file"
        accept="image/*"
        onChange={(event) => handleImageSelected(event, "사진첩 선택")}
        style={{ display: "none" }}
      />

      <div style={fieldBlockStyle}>
        <label style={fieldLabelStyle}>작성자</label>
        <input
          value={author}
          onChange={(event) => setAuthor(event.target.value)}
          placeholder="작성자"
          style={inputStyle}
        />
      </div>

      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="주요 사항을 입력하세요. 예: 점검 대상 결과 이상 없음."
        style={noteStyle}
      />

      {dailyNotionRecord ? (
        <div style={notionSavedBoxStyle}>
          <div style={notionSavedTextStyle}>
            Notion 저장 완료 · {dailyNotionRecord.savedAt}
          </div>
          <div style={buttonStackStyle}>
            <button onClick={handleUpdateDailyToNotion} style={greenButtonStyle}>
              Notion 일일 기록 수정
            </button>
            <button onClick={handleDeleteDailyFromNotion} style={dangerButtonStyle}>
              Notion 일일 기록 삭제
            </button>
            <button onClick={openDailyNotionPage} style={darkButtonStyle}>
              Notion에서 보기
            </button>
            <button onClick={() => openNotionDatabase("daily")} style={darkButtonStyle}>
              Notion 일일 업무 DB 열기
            </button>
            <button onClick={handleResetLocalDraft} style={resetButtonStyle}>
              앱 화면만 초기화
            </button>
          </div>
        </div>
      ) : (
        <div style={buttonStackStyle}>
          <button onClick={handleSaveDailyDraft} style={greenButtonStyle}>
            일일 업무 임시 저장
          </button>
          <button
            onClick={handleSaveDailyToNotion}
            disabled={isDailySaving}
            style={isDailySaving ? disabledButtonStyle : darkButtonStyle}
          >
            {isDailySaving ? "Notion 일일 기록 저장 중..." : "Notion 일일 기록 저장"}
          </button>
          <button onClick={() => openNotionDatabase("daily")} style={darkButtonStyle}>
            Notion 일일 업무 DB 열기
          </button>
          <button onClick={handleResetLocalDraft} style={resetButtonStyle}>
            앱 화면만 초기화
          </button>
        </div>
      )}
    </section>
  );
}

const cardStyle: CSSProperties = {
  background: "#111827",
  border: "1px solid #26374f",
  borderRadius: 22,
  padding: 18,
  boxShadow: "0 18px 45px rgba(0,0,0,0.22)",
};

const cardLabelStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: 2,
  textTransform: "uppercase",
};

const cardTitleStyle: CSSProperties = {
  margin: "6px 0 8px",
  color: "#f8fafc",
  fontSize: 21,
  lineHeight: 1.25,
  fontWeight: 950,
};

const cardDescriptionStyle: CSSProperties = {
  color: "#94a3b8",
  margin: "0 0 14px",
  lineHeight: 1.55,
  fontSize: 14,
};

const statusToggleStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  margin: "14px 0 16px",
};

const statusButtonStyle: CSSProperties = {
  width: "100%",
  padding: "13px 12px",
  borderRadius: 14,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  background: "#111827",
  color: "#dbeafe",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
};

const statusActiveButtonStyle: CSSProperties = {
  ...statusButtonStyle,
  borderColor: "#16a34a",
  background: "#14532d",
  color: "#dcfce7",
};

const statusIssueButtonStyle: CSSProperties = {
  ...statusButtonStyle,
  borderColor: "#f97316",
  background: "#431407",
  color: "#fed7aa",
};

const imageSlotListStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const fieldBlockStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginTop: 14,
};

const fieldLabelStyle: CSSProperties = {
  color: "#cbd5e1",
  fontSize: 13,
  fontWeight: 900,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #334155",
  borderRadius: 14,
  background: "#020817",
  color: "#f8fafc",
  padding: "13px 14px",
  fontSize: 15,
  fontWeight: 800,
  outline: "none",
};

const noteStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 130,
  resize: "vertical",
  marginTop: 14,
  fontWeight: 700,
  lineHeight: 1.5,
};

const buttonStackStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 14,
};

const greenButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 58,
  border: "none",
  borderRadius: 16,
  color: "#ffffff",
  background: "#16a34a",
  fontSize: 17,
  fontWeight: 950,
  cursor: "pointer",
};

const darkButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 58,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 16,
  color: "#ffffff",
  background: "#111827",
  fontSize: 17,
  fontWeight: 950,
  cursor: "pointer",
};

const disabledButtonStyle: CSSProperties = {
  ...darkButtonStyle,
  background: "#334155",
  color: "#94a3b8",
  cursor: "not-allowed",
  opacity: 0.72,
};

const grayButtonStyle: CSSProperties = {
  ...darkButtonStyle,
  background: "#334155",
};

const resetButtonStyle: CSSProperties = {
  ...darkButtonStyle,
  background: "#1f2937",
};

const notionSavedBoxStyle: CSSProperties = {
  marginTop: 14,
  border: "1px solid #166534",
  background: "#052e16",
  borderRadius: 16,
  padding: 12,
};

const notionSavedTextStyle: CSSProperties = {
  color: "#bbf7d0",
  fontSize: 13,
  fontWeight: 900,
  marginBottom: 10,
};

const dangerButtonStyle: CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 14,
  border: "none",
  background: "#dc2626",
  color: "white",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
};
