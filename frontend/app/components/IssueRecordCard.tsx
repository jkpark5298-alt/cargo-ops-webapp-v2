"use client";

import { type ClipboardEvent } from "react";
import { IssueRecordCardProps } from "./issue-record/types";
import {
  buttonStackStyle,
  cardDescriptionStyle,
  cardLabelStyle,
  cardStyle,
  cardTitleStyle,
  dangerButtonStyle,
  darkButtonStyle,
  disabledButtonStyle,
  fieldBlockStyle,
  fieldLabelStyle,
  formGridStyle,
  inputStyle,
  noteStyle,
  notionIssueSavedBoxStyle,
  notionIssueSavedTextStyle,
  notionIssueStatusLabelStyle,
  notionIssueStatusPendingBoxStyle,
  notionIssueStatusSavedBoxStyle,
  notionIssueStatusValueStyle,
  orangeButtonStyle,
  pasteTargetStyle,
  resetButtonStyle,
} from "./issue-record/styles";
import { ImageRegistrationCard } from "./issue-record/parts/ImageRegistrationCard";

export function IssueRecordCard({
  issueImageSlot,
  issueImage,
  issueImages,
  openCamera,
  openPhotoLibrary,
  openLatestImage,
  handleDeleteImageSlot,
  handleDeleteSingleImage,
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
          image={issueImage}
          images={issueImages}
          onCamera={openCamera}
          onLibrary={openPhotoLibrary}
          onPaste={() => void handlePasteButton()}
          onView={() => issueImage ? openLatestImage(issueImage) : window.alert("등록된 이미지가 없습니다.")}
          onViewImage={openLatestImage}
          onDeleteImage={handleDeleteSingleImage}
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

      <div
        style={issueNotionRecord ? notionIssueStatusSavedBoxStyle : notionIssueStatusPendingBoxStyle}
        role="status"
        aria-live="polite"
      >
        <div style={notionIssueStatusLabelStyle}>Notion 입력 여부</div>
        <div style={notionIssueStatusValueStyle}>
          {issueNotionRecord
            ? `입력 완료 · ${issueNotionRecord.savedAt}`
            : "미입력 · 특이사항을 아직 Notion에 저장하지 않았습니다"}
        </div>
      </div>

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

