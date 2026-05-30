"use client";

import type {
  ChangeEvent,
  ClipboardEvent,
  CSSProperties,
  Dispatch,
  Ref,
  RefObject,
  SetStateAction,
} from "react";
import { type ImageSlot, type ImageSlotKey, type SavedImage } from "./ImageSlotCard";

type DailyStatus = "normal" | "issue";

type SavedImageWithMemo = SavedImage & {
  memo?: string;
};

type DailyNotionRecord = {
  pageId: string;
  url?: string;
  savedAt: string;
};

type DailyRecordCardProps = {
  dailyStatus: DailyStatus;
  setDailyStatus: Dispatch<SetStateAction<DailyStatus>>;
  dailyWorkDate: string;
  dailyWorkDateTitle: string;
  setDailyWorkDate: (value: string) => void;
  resetDailyWorkDateToToday: () => void;
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
  handlePastedImage: (slotKey: ImageSlotKey, file: File) => void;
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
  dailyWorkDate,
  dailyWorkDateTitle,
  setDailyWorkDate,
  resetDailyWorkDateToToday,
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
  handlePastedImage,
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
  const handlePasteImageToSlot = (event: ClipboardEvent<HTMLDivElement>, slotKey: ImageSlotKey) => {
    const imageItem = Array.from(event.clipboardData.items).find((item) =>
      item.type.startsWith("image/"),
    );
    const file = imageItem?.getAsFile();

    event.preventDefault();

    if (!file) return;

    handlePastedImage(slotKey, file);
  };

  const handlePasteButtonToSlot = async (slotKey: ImageSlotKey) => {
    try {
      const clipboard = navigator.clipboard as Clipboard & {
        read?: () => Promise<Array<{ types: string[]; getType: (type: string) => Promise<Blob> }>>;
      };

      if (!clipboard?.read) {
        window.alert("이 브라우저에서는 이미지 붙여넣기 버튼을 지원하지 않습니다. 사진촬영 또는 사진첩을 사용해 주세요.");
        return;
      }

      const items = await clipboard.read();

      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (!imageType) continue;

        const blob = await item.getType(imageType);
        const ext = imageType.includes("png") ? "png" : imageType.includes("webp") ? "webp" : "jpg";
        const file = new File([blob], `pasted-image-${Date.now()}.${ext}`, {
          type: blob.type || imageType,
        });

        handlePastedImage(slotKey, file);
        return;
      }

      window.alert("클립보드에 붙여넣을 이미지가 없습니다. 이미지를 먼저 복사해 주세요.");
    } catch {
      window.alert("이미지 붙여넣기를 완료하지 못했습니다. 아이폰에서는 붙여넣기 허용을 선택하거나 사진첩을 사용해 주세요.");
    }
  };

  return (
    <section style={cardStyle}>
      <div style={cardLabelStyle}>일일 업무 기록</div>
      <h2 style={cardTitleStyle}>Daily 업무 보고</h2>
      <p style={cardDescriptionStyle}>
        항목별로 이미지를 먼저 선택해 저장합니다. 잘못 올린 사진은 보기, 변경, 삭제할 수 있습니다.
      </p>

      <div style={datePickerBoxStyle}>
        <div>
          <label style={fieldLabelStyle}>업무일자</label>
          <div style={dateTitleStyle}>{dailyWorkDateTitle}</div>
        </div>
        <div style={dateControlStyle}>
          <input
            type="date"
            value={dailyWorkDate}
            onClick={(event) => event.currentTarget.showPicker?.()}
            onChange={(event) => setDailyWorkDate(event.target.value)}
            aria-label="업무일자 캘린더 선택"
            title="업무일자 캘린더 선택"
            style={dateInputStyle}
          />
          <button
            type="button"
            onClick={resetDailyWorkDateToToday}
            style={todayButtonStyle}
          >
            오늘
          </button>
        </div>
      </div>

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
        {imageSlots.map((slot) => {
          const slotImages = images.filter((image) => image.type === slot.key) as SavedImageWithMemo[];
          const latestImage = getImageBySlot(images, slot.key);

          return (
            <div
              key={slot.key}
              tabIndex={0}
              contentEditable
              suppressContentEditableWarning
              role="button"
              aria-label={`${slot.title} 이미지 붙여넣기 영역`}
              onPaste={(event) => handlePasteImageToSlot(event, slot.key)}
              style={pasteTargetStyle}
            >
              <ImageRegistrationCard
                slot={slot}
                image={latestImage ?? undefined}
                images={slotImages}
                onCamera={() => openCamera(slot.key)}
                onLibrary={() => openPhotoLibrary(slot.key)}
                onPaste={() => void handlePasteButtonToSlot(slot.key)}
                onView={() => latestImage ? openLatestImage(latestImage) : window.alert("등록된 이미지가 없습니다.")}
                onViewImage={openLatestImage}
              />
              <PhotoMemoPreview images={slotImages} />
            </div>
          );
        })}
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



function ImageRegistrationCard({
  slot,
  image,
  images,
  onCamera,
  onLibrary,
  onPaste,
  onView,
  onViewImage,
}: {
  slot: ImageSlot;
  image?: SavedImage;
  images: SavedImage[];
  onCamera: () => void;
  onLibrary: () => void;
  onPaste: () => void;
  onView: () => void;
  onViewImage: (image: SavedImage) => void;
}) {
  return (
    <div style={imageRegistrationCardStyle}>
      <div style={imageRegistrationHeaderStyle}>
        <div style={imageRegistrationTitleStyle}>{slot.title}</div>
        <div style={imageRegistrationDescStyle}>{slot.description}</div>
      </div>

      <div style={imageRegistrationButtonRowStyle}>
        <button type="button" onClick={onCamera} style={compactImageButtonStyle}>
          촬영
        </button>
        <button type="button" onClick={onLibrary} style={compactImageButtonStyle}>
          사진첩
        </button>
        <button type="button" onClick={onPaste} style={compactPasteButtonStyle}>
          붙여넣기
        </button>
        <button type="button" onClick={onView} style={image ? compactViewButtonStyle : compactDisabledButtonStyle}>
          보기
        </button>
      </div>

      {images.length > 0 ? (
        <div style={multiImagePreviewGridStyle}>
          {images.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onViewImage(item)}
              aria-label={`${slot.title} ${index + 1}번째 이미지 보기`}
              style={multiImagePreviewButtonStyle}
            >
              <img src={item.dataUrl} alt={`${slot.title} ${index + 1}`} style={multiImagePreviewStyle} />
              <span style={multiImageIndexBadgeStyle}>{index + 1}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SimpleImageViewCard({
  slot,
  image,
  onView,
}: {
  slot: ImageSlot;
  image: SavedImage;
  onView: (image: SavedImage) => void;
}) {
  return (
    <div style={simpleImageCardStyle}>
      <div style={simpleImageHeaderStyle}>
        <div>
          <div style={simpleImageTitleStyle}>{slot.title}</div>
          <div style={simpleImageDescStyle}>{slot.description}</div>
        </div>
        <button type="button" onClick={() => onView(image)} style={simpleViewButtonStyle}>
          보기
        </button>
      </div>
      <button
        type="button"
        onClick={() => onView(image)}
        aria-label={`${slot.title} 이미지 보기`}
        style={simpleImagePreviewButtonStyle}
      >
        <img src={image.dataUrl} alt={slot.title} style={simpleImagePreviewStyle} />
      </button>
    </div>
  );
}

function PhotoMemoPreview({ images }: { images: SavedImageWithMemo[] }) {
  const memoItems = images
    .map((image, index) => ({
      id: image.id,
      label: image.label,
      memo: image.memo?.trim(),
      index,
    }))
    .filter((item) => item.memo);

  if (memoItems.length === 0) return null;

  return (
    <div style={photoMemoPreviewBoxStyle}>
      <div style={photoMemoPreviewTitleStyle}>사진 메모</div>
      {memoItems.slice(0, 3).map((item) => (
        <div key={item.id} style={photoMemoPreviewItemStyle}>
          {memoItems.length > 1 ? `${item.index + 1}. ` : ""}
          {item.memo}
        </div>
      ))}
      {memoItems.length > 3 && (
        <div style={photoMemoPreviewMoreStyle}>외 {memoItems.length - 3}건 더 있음</div>
      )}
    </div>
  );
}


const imageRegistrationCardStyle: CSSProperties = {
  background: "#0f172a",
  border: "1px dashed #334155",
  borderRadius: 16,
  padding: 12,
  display: "grid",
  gap: 10,
};

const imageRegistrationHeaderStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

const imageRegistrationTitleStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 15,
  fontWeight: 900,
};

const imageRegistrationDescStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.45,
};

const imageRegistrationButtonRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 5,
};

const compactImageButtonStyle: CSSProperties = {
  border: "1px solid #334155",
  borderRadius: 9,
  background: "#1e293b",
  color: "#e5edf7",
  padding: "8px 2px",
  fontSize: 11,
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const compactPasteButtonStyle: CSSProperties = {
  ...compactImageButtonStyle,
  background: "#2563eb",
  border: "1px solid #60a5fa",
  color: "#ffffff",
};

const compactViewButtonStyle: CSSProperties = {
  ...compactImageButtonStyle,
  background: "#0f766e",
  border: "1px solid #2dd4bf",
  color: "#ffffff",
};

const compactDisabledButtonStyle: CSSProperties = {
  ...compactImageButtonStyle,
  background: "#334155",
  border: "1px solid #475569",
  color: "#94a3b8",
  cursor: "not-allowed",
};

const multiImagePreviewGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
  gap: 8,
};

const multiImagePreviewButtonStyle: CSSProperties = {
  position: "relative",
  border: "1px solid #334155",
  borderRadius: 14,
  padding: 0,
  background: "transparent",
  cursor: "pointer",
  overflow: "hidden",
};

const multiImagePreviewStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: 150,
  objectFit: "cover",
};

const multiImageIndexBadgeStyle: CSSProperties = {
  position: "absolute",
  left: 8,
  top: 8,
  minWidth: 22,
  height: 22,
  borderRadius: 999,
  background: "rgba(15, 23, 42, 0.82)",
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const simpleImageCardStyle: CSSProperties = {
  background: "#0f172a",
  border: "1px solid #26374f",
  borderRadius: 16,
  padding: 12,
  display: "grid",
  gap: 10,
};

const simpleImageHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
};

const simpleImageTitleStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 15,
  fontWeight: 900,
};

const simpleImageDescStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.45,
  marginTop: 3,
};

const simpleViewButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 999,
  padding: "8px 13px",
  background: "#2563eb",
  color: "#ffffff",
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const simpleImagePreviewButtonStyle: CSSProperties = {
  border: "none",
  padding: 0,
  background: "transparent",
  cursor: "pointer",
  width: "100%",
};

const simpleImagePreviewStyle: CSSProperties = {
  display: "block",
  width: "100%",
  maxHeight: 220,
  objectFit: "cover",
  borderRadius: 14,
  border: "1px solid #334155",
};

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


const datePickerBoxStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 10,
  margin: "14px 0 16px",
  padding: 14,
  borderRadius: 16,
  border: "1px solid rgba(96, 165, 250, 0.28)",
  background: "rgba(15, 23, 42, 0.72)",
};

const dateTitleStyle: CSSProperties = {
  color: "#e0f2fe",
  fontSize: 16,
  fontWeight: 950,
  marginTop: 6,
};

const dateControlStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 8,
};

const dateInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  border: "1px solid #334155",
  borderRadius: 14,
  background: "#020817",
  color: "#f8fafc",
  padding: "12px 13px",
  fontSize: 15,
  fontWeight: 850,
  outline: "none",
  colorScheme: "dark",
};

const todayButtonStyle: CSSProperties = {
  border: "1px solid rgba(96, 165, 250, 0.42)",
  borderRadius: 14,
  background: "#1d4ed8",
  color: "#ffffff",
  padding: "0 14px",
  fontSize: 14,
  fontWeight: 950,
  cursor: "pointer",
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

const photoMemoPreviewBoxStyle: CSSProperties = {
  marginTop: 8,
  border: "1px solid rgba(34, 197, 94, 0.18)",
  borderRadius: 14,
  background: "rgba(5, 46, 22, 0.24)",
  padding: 10,
};

const photoMemoPreviewTitleStyle: CSSProperties = {
  color: "#bbf7d0",
  fontSize: 12,
  fontWeight: 950,
  marginBottom: 6,
};

const photoMemoPreviewItemStyle: CSSProperties = {
  color: "#dcfce7",
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1.45,
  wordBreak: "break-word",
};

const photoMemoPreviewMoreStyle: CSSProperties = {
  color: "#86efac",
  fontSize: 12,
  fontWeight: 850,
  marginTop: 4,
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


const pasteTargetStyle: CSSProperties = {
  outline: "none",
  cursor: "text",
  WebkitUserSelect: "text",
  userSelect: "text",
};

