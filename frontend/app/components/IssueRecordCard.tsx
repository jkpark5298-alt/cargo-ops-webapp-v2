"use client";

import type { ClipboardEvent, CSSProperties } from "react";
import { ImageSlotCard, type ImageSlot, type ImageSlotKey, type SavedImage } from "./ImageSlotCard";

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

  return (
    <section style={{ ...cardStyle, borderColor: "#f9731666" }}>
      <div style={cardLabelStyle}>특이사항 기록</div>
      <h2 style={cardTitleStyle}>문제 발생 대비 증빙 기록</h2>
      <p style={cardDescriptionStyle}>
        특이사항 발생 시 날짜, 시간, 편명, 구간, HL NBR, 날씨, 작성자, 이미지와 메모를 함께 저장합니다.
      </p>

      <div
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        role="button"
        aria-label="특이사항 이미지 붙여넣기 영역"
        onClick={(event) => event.currentTarget.focus()}
        onPaste={handlePasteImage}
        style={pasteTargetStyle}
      >
        <div style={pasteHintStyle}>
          PC: 클릭 후 Ctrl+V · 아이폰: 길게 눌러 ‘붙여넣기’
        </div>
        <ImageSlotCard
          slot={issueImageSlot}
        image={issueImage}
        onCamera={openCamera}
        onLibrary={openPhotoLibrary}
        onView={openLatestImage}
          onDelete={handleDeleteImageSlot}
        />
      </div>

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

const pasteHintStyle: CSSProperties = {
  margin: "0 0 8px",
  color: "#fdba74",
  fontSize: 12,
  fontWeight: 800,
};
