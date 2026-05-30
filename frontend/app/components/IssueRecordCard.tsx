"use client";

import type { ClipboardEvent, CSSProperties } from "react";
import { type ImageSlot, type ImageSlotKey, type SavedImage } from "./ImageSlotCard";

type IssueNotionRecord = {
  pageId: string;
  url?: string;
  savedAt: string;
};

type IssueRecordCardProps = {
  issueImageSlot: ImageSlot;
  issueImage: SavedImage | null;
  openCamera: () => void;
  openPhotoLibrary: () => void;
  openLatestImage: (image: SavedImage) => void;
  handleDeleteImageSlot: () => void;
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
  handleDeleteIssueFromNotion: () => void;
  openIssueNotionPage: () => void;
  openNotionDatabase: (kind: "daily" | "issue") => void;
  handleResetLocalDraft: () => void;
};

export function IssueRecordCard({
  issueImageSlot,
  issueImage,
  openCamera,
  openPhotoLibrary,
  openLatestImage,
  handleDeleteImageSlot,
  handlePastedImage,
  todayText,
  currentTimeText,
  issueFlight,
  setIssueFlight,
  issueRoute,
  setIssueRoute,
  issueHlnbr,
  setIssueHlnbr,
  author,
  setAuthor,
  weatherSummary,
  issueText,
  setIssueText,
  issueNotionRecord,
  isIssueSaving,
  handleSaveIssueDraft,
  handleSaveIssueToNotion,
  handleUpdateIssueToNotion,
  handleDeleteIssueFromNotion,
  openIssueNotionPage,
  openNotionDatabase,
  handleResetLocalDraft,
}: IssueRecordCardProps) {
  const handlePasteImage = (event: ClipboardEvent<HTMLDivElement>) => {
    const imageItem = Array.from(event.clipboardData.items).find((item) =>
      item.type.startsWith("image/"),
    );
    const file = imageItem?.getAsFile();

    event.preventDefault();

    if (!file) return;

    handlePastedImage(file);
  };

  const handlePasteButton = async () => {
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

        handlePastedImage(file);
        return;
      }

      window.alert("클립보드에 붙여넣을 이미지가 없습니다. 이미지를 먼저 복사해 주세요.");
    } catch {
      window.alert("이미지 붙여넣기를 완료하지 못했습니다. 아이폰에서는 붙여넣기 허용을 선택하거나 사진첩을 사용해 주세요.");
    }
  };

  return (
    <section style={{ ...cardStyle, borderColor: "#f9731666" }}>
      <div style={cardLabelStyle}>특이사항 기록</div>
      <h2 style={cardTitleStyle}>문제 발생 대비 증빙 기록</h2>
      <p style={cardDescriptionStyle}>
        특이사항 발생 시 날짜, 시간, 편명, 구간, HL NBR, 날씨, 작성자, 이미지와 메모를 함께 저장합니다.
      </p>

      {issueImage ? (
        <SimpleIssueImageViewCard
          slot={issueImageSlot}
          image={issueImage}
          onView={openLatestImage}
        />
      ) : (
        <div
          tabIndex={0}
          contentEditable
          suppressContentEditableWarning
          role="button"
          aria-label="특이사항 이미지 붙여넣기 영역"
          onPaste={handlePasteImage}
          style={pasteTargetStyle}
        >
          <ImageRegistrationCard
            slot={issueImageSlot}
            onCamera={openCamera}
            onLibrary={openPhotoLibrary}
            onPaste={() => void handlePasteButton()}
          />
        </div>
      )}

      <div style={formGridStyle}>
        <div style={fieldBlockStyle}>
          <label style={fieldLabelStyle}>날짜</label>
          <input value={todayText} readOnly style={inputStyle} />
        </div>

        <div style={fieldBlockStyle}>
          <label style={fieldLabelStyle}>시간</label>
          <input value={currentTimeText} readOnly style={inputStyle} />
        </div>

        <div style={fieldBlockStyle}>
          <label style={fieldLabelStyle}>편명</label>
          <input
            value={issueFlight}
            onChange={(event) => setIssueFlight(event.target.value.toUpperCase())}
            placeholder="예: KJ919"
            style={inputStyle}
          />
        </div>

        <div style={fieldBlockStyle}>
          <label style={fieldLabelStyle}>구간</label>
          <input
            value={issueRoute}
            onChange={(event) => setIssueRoute(event.target.value.toUpperCase())}
            placeholder="편명 입력 시 자동 표시"
            style={inputStyle}
          />
        </div>

        <div style={fieldBlockStyle}>
          <label style={fieldLabelStyle}>HL NBR</label>
          <input
            value={issueHlnbr}
            onChange={(event) => setIssueHlnbr(event.target.value.toUpperCase())}
            placeholder="예: HL8000"
            style={inputStyle}
          />
        </div>

        <div style={fieldBlockStyle}>
          <label style={fieldLabelStyle}>작성자</label>
          <input
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            placeholder="작성자"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={fieldBlockStyle}>
        <label style={fieldLabelStyle}>날씨</label>
        <input value={weatherSummary} readOnly style={inputStyle} />
      </div>

      <textarea
        value={issueText}
        onChange={(event) => setIssueText(event.target.value)}
        placeholder="특이사항을 입력하세요. 예: 게이트 변경, 지연, 점검 결과 이상 등"
        style={noteStyle}
      />

      {issueNotionRecord ? (
        <div style={notionIssueSavedBoxStyle}>
          <div style={notionIssueSavedTextStyle}>
            Notion 특이사항 저장 완료 · {issueNotionRecord.savedAt}
          </div>
          <div style={buttonStackStyle}>
            <button onClick={handleSaveIssueDraft} style={darkButtonStyle}>
              특이사항 임시 저장
            </button>
            <button onClick={handleUpdateIssueToNotion} style={orangeButtonStyle}>
              Notion 특이사항 수정
            </button>
            <button onClick={handleDeleteIssueFromNotion} style={dangerButtonStyle}>
              Notion 특이사항 삭제
            </button>
            <button onClick={openIssueNotionPage} style={darkButtonStyle}>
              Notion에서 보기
            </button>
            <button onClick={() => openNotionDatabase("issue")} style={darkButtonStyle}>
              Notion 특이사항 DB 열기
            </button>
            <button onClick={handleResetLocalDraft} style={resetButtonStyle}>
              앱 화면만 초기화
            </button>
          </div>
        </div>
      ) : (
        <div style={buttonStackStyle}>
          <button onClick={handleSaveIssueDraft} style={darkButtonStyle}>
            특이사항 임시 저장
          </button>
          <button
            onClick={handleSaveIssueToNotion}
            disabled={isIssueSaving}
            style={isIssueSaving ? disabledButtonStyle : orangeButtonStyle}
          >
            {isIssueSaving ? "Notion 특이사항 저장 중..." : "Notion 특이사항 저장"}
          </button>
          <button onClick={() => openNotionDatabase("issue")} style={darkButtonStyle}>
            Notion 특이사항 DB 열기
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
  onCamera,
  onLibrary,
  onPaste,
}: {
  slot: ImageSlot;
  onCamera: () => void;
  onLibrary: () => void;
  onPaste: () => void;
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
      </div>
    </div>
  );
}

function SimpleIssueImageViewCard({
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
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 6,
};

const compactImageButtonStyle: CSSProperties = {
  border: "1px solid #334155",
  borderRadius: 10,
  background: "#1e293b",
  color: "#e5edf7",
  padding: "8px 4px",
  fontSize: 12,
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

const formGridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  marginTop: 14,
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

const resetButtonStyle: CSSProperties = {
  ...darkButtonStyle,
  background: "#1f2937",
};

const orangeButtonStyle: CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 14,
  border: "none",
  background: "#f97316",
  color: "#111827",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
};

const disabledButtonStyle: CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 14,
  border: "1px solid #475569",
  background: "#334155",
  color: "#94a3b8",
  fontSize: 15,
  fontWeight: 900,
  cursor: "not-allowed",
  opacity: 0.72,
};

const notionIssueSavedBoxStyle: CSSProperties = {
  marginTop: 14,
  border: "1px solid #9a3412",
  background: "#431407",
  borderRadius: 16,
  padding: 12,
};

const notionIssueSavedTextStyle: CSSProperties = {
  color: "#fed7aa",
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

