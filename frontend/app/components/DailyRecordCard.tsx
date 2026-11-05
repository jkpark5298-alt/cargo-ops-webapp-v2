"use client";

import { type ClipboardEvent, type Ref } from "react";
import { type ImageSlotKey } from "./ImageSlotCard";
import { DailyRecordCardProps, SavedImageWithMemo } from "./daily-record/types";
import {
  buttonStackStyle,
  cardDescriptionStyle,
  cardLabelStyle,
  cardStyle,
  cardTitleStyle,
  dangerButtonStyle,
  darkButtonStyle,
  dateControlStyle,
  dateInputStyle,
  dateInputWarningStyle,
  datePickerBoxStyle,
  dateTitleStyle,
  disabledButtonStyle,
  fieldBlockStyle,
  fieldLabelStyle,
  greenButtonStyle,
  imageSlotListStyle,
  inputStyle,
  noteStyle,
  notionSavedBoxStyle,
  notionSavedTextStyle,
  notionStatusLabelStyle,
  notionStatusPendingBoxStyle,
  notionStatusSavedBoxStyle,
  notionStatusValueStyle,
  pasteTargetStyle,
  resetButtonStyle,
  statusActiveButtonStyle,
  statusButtonStyle,
  statusIssueButtonStyle,
  statusToggleStyle,
  supabaseTextLoadButtonStyle,
  supabaseTextSaveButtonStyle,
  supabaseTextSyncBoxStyle,
  supabaseTextSyncButtonDisabledStyle,
  supabaseTextSyncButtonRowStyle,
  supabaseTextSyncDescStyle,
  supabaseTextSyncStatusStyle,
  supabaseTextSyncTitleStyle,
  todayButtonStyle,
  workDateFixButtonStyle,
  workDateMismatchWarningStyle,
  workDateMismatchWarningTitleStyle,
} from "./daily-record/styles";
import { ImageRegistrationCard } from "./daily-record/parts/ImageRegistrationCard";
import { PhotoMemoPreview } from "./daily-record/parts/PhotoMemoPreview";

export function DailyRecordCard({
  dailyStatus,
  setDailyStatus,
  dailyWorkDate,
  dailyWorkDateTitle,
  setDailyWorkDate,
  resetDailyWorkDateToToday,
  workDateMismatchWarning = "",
  images,
  imageSlots,
  getImageBySlot,
  openCamera,
  openPhotoLibrary,
  openLatestImage,
  handleDeleteImageSlot,
  handleDeleteSingleImage,
  cameraInputRef,
  libraryInputRef,
  handleImageSelected,
  handlePastedImage,
  author,
  setAuthor,
  note,
  setNote,
  dailyNotionRecord,
  dailyNotionCheck = "unverified",
  isDailySaving,
  isDailyTextSyncing,
  dailyTextSyncStatus,
  handleSaveDailyTextToSupabase,
  handleLoadDailyTextFromSupabase,
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

      <div
        style={
          workDateMismatchWarning
            ? {
                ...datePickerBoxStyle,
                border: "1px solid rgba(239, 68, 68, 0.75)",
                background: "rgba(127, 29, 29, 0.22)",
              }
            : datePickerBoxStyle
        }
      >
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
            style={workDateMismatchWarning ? dateInputWarningStyle : dateInputStyle}
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

      {workDateMismatchWarning ? (
        <div style={workDateMismatchWarningStyle} role="alert">
          <div style={workDateMismatchWarningTitleStyle}>업무일자 안내</div>
          <div>{workDateMismatchWarning}</div>
          <button type="button" onClick={resetDailyWorkDateToToday} style={workDateFixButtonStyle}>
            오늘 날짜로 맞추기
          </button>
        </div>
      ) : null}

      <div
        style={dailyNotionRecord ? notionStatusSavedBoxStyle : notionStatusPendingBoxStyle}
        role="status"
        aria-live="polite"
      >
        <div style={notionStatusLabelStyle}>Notion 입력 여부</div>
        <div style={notionStatusValueStyle}>
          {dailyNotionCheck === "checking"
            ? `Notion에서 ${dailyWorkDateTitle} 기록을 확인하는 중입니다…`
            : dailyNotionRecord
              ? `입력 완료 · ${dailyWorkDateTitle} · ${dailyNotionRecord.savedAt}`
              : dailyNotionCheck === "verified"
                ? `미입력 · ${dailyWorkDateTitle} 기록이 Notion에 없습니다`
                : `이 기기에는 ${dailyWorkDateTitle} 저장 기록이 없습니다 (Notion 확인 실패 — 이미 저장했다면 중복될 수 있습니다)`}
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
                onDeleteImage={handleDeleteSingleImage}
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

      <div style={supabaseTextSyncBoxStyle}>
        <div style={supabaseTextSyncTitleStyle}>Supabase 텍스트 공유</div>
        <div style={supabaseTextSyncDescStyle}>
          사진은 건드리지 않고 업무일자, 작성자, 상태, 주요사항 메모만 PC/아이폰에서 공유합니다.
        </div>
        <div style={supabaseTextSyncButtonRowStyle}>
          <button
            type="button"
            onClick={handleSaveDailyTextToSupabase}
            disabled={isDailyTextSyncing}
            style={isDailyTextSyncing ? supabaseTextSyncButtonDisabledStyle : supabaseTextSaveButtonStyle}
          >
            텍스트 공유 저장
          </button>
          <button
            type="button"
            onClick={handleLoadDailyTextFromSupabase}
            disabled={isDailyTextSyncing}
            style={isDailyTextSyncing ? supabaseTextSyncButtonDisabledStyle : supabaseTextLoadButtonStyle}
          >
            텍스트 공유 불러오기
          </button>
        </div>
        {dailyTextSyncStatus ? (
          <div style={supabaseTextSyncStatusStyle}>{dailyTextSyncStatus}</div>
        ) : null}
      </div>

      {dailyNotionRecord ? (
        <div style={notionSavedBoxStyle}>
          <div style={notionSavedTextStyle}>
            Notion 저장 완료 · {dailyNotionRecord.savedAt}
          </div>
          <div style={buttonStackStyle}>
            <button onClick={handleSaveDailyDraft} style={greenButtonStyle}>
              일일 업무 임시 저장
            </button>
            <button onClick={handleUpdateDailyToNotion} style={darkButtonStyle}>
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

