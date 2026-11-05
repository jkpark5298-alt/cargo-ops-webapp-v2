import { useEffect, useRef, useState } from "react";
import {
  clearDailyNotionRecord,
  getLastDailySaveSignature,
  loadDailyNotionRecordForDate,
  saveDailyNotionRecordForDate,
  saveLastDailySaveSignature,
} from "../../lib/local-storage";
import {
  deleteDailyRecord,
  findDailyRecordByDate,
  saveDailyRecord,
  updateDailyRecord,
} from "../../lib/notion-api";
import { DailyNotionRecord } from "../types";
import { IMAGE_SLOT_PROPERTY_NAME, IMAGE_SLOTS } from "../constants";
import {
  formatDailyStatusLabel,
  formatDateInputForTitle,
  getDailyWorkDateIso,
  getImagesBySlot,
  getTodayDateInputValue,
  isRecentSameSave,
  makeSaveSignature,
} from "../helpers";

export type UseDailyNotionRecordParams = {
  author: string;
  dailyStatus: "normal" | "issue";
  dailyWorkDate: string;
  draftHydrated: boolean;
  images: import("../types").SavedImage[];
  note: string;
  setNotice: React.Dispatch<React.SetStateAction<string>>;
};

/** 일일 업무 Notion 기록(저장·수정·삭제·입력 여부 확인) */
export function useDailyNotionRecord({
  author,
  dailyStatus,
  dailyWorkDate,
  draftHydrated,
  images,
  note,
  setNotice,
}: UseDailyNotionRecordParams) {
  const dailySavingRef = useRef(false);
  const [isDailySaving, setIsDailySaving] = useState(false);
  const [dailyNotionRecord, setDailyNotionRecord] =
    useState<DailyNotionRecord | null>(null);
  const [dailyNotionCheck, setDailyNotionCheck] =
    useState<"checking" | "verified" | "unverified">("unverified");

  useEffect(() => {
    if (!draftHydrated) return;

    // 먼저 이 기기의 기록을 보여주고, Notion에 실제로 있는지 조회해 기기 간 차이를 바로잡는다.
    const workDate = dailyWorkDate;
    let cancelled = false;
    setDailyNotionRecord(loadDailyNotionRecordForDate(workDate));
    setDailyNotionCheck("checking");

    void (async () => {
      try {
        const lookup = await findDailyRecordByDate(workDate);
        if (cancelled) return;

        if (lookup.found && lookup.pageId) {
          const local = loadDailyNotionRecordForDate(workDate);
          const record: DailyNotionRecord =
            local?.pageId === lookup.pageId
              ? { ...local, url: lookup.url || local.url, workDate }
              : {
                  pageId: lookup.pageId,
                  url: lookup.url || undefined,
                  savedAt: "Notion 확인",
                  workDate,
                };
          saveDailyNotionRecordForDate(workDate, record);
          setDailyNotionRecord(record);
        } else {
          // Notion에서 삭제된 기록이 이 기기에 남아 있으면 정리한다.
          clearDailyNotionRecord(workDate);
          setDailyNotionRecord(null);
        }
        setDailyNotionCheck("verified");
      } catch {
        if (!cancelled) setDailyNotionCheck("unverified");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dailyWorkDate, draftHydrated]);


  const buildDailyPayload = (workDateOverride?: string) => {
    const workDate = workDateOverride || dailyWorkDate || getTodayDateInputValue();
    const workDateTitle = formatDateInputForTitle(workDate);
    const dailyImages = IMAGE_SLOTS.flatMap((slot) =>
      getImagesBySlot(images, slot.key).map((image) => ({
        slotKey: slot.key,
        type: image.type,
        propertyName: IMAGE_SLOT_PROPERTY_NAME[slot.key],
        label: image.label,
        savedAt: image.savedAt,
        capturedAt: image.capturedAt,
        locationText: image.locationText,
        memo: image.memo || "",
        dataUrl: image.dataUrl,
      })),
    );

    return {
      title: `${workDateTitle} KJ 일일 업무`,
      date: getDailyWorkDateIso(workDate),
      workDate,
      workDateText: workDateTitle,
      author,
      status: dailyStatus === "normal" ? "이상 없음" : "특이사항 있음",
      memo: note,
      images: dailyImages,
    };
  };

  const handleSaveDailyToNotion = async () => {
    if (dailySavingRef.current) {
      setNotice("Notion 일일 업무 기록 저장 중입니다. 잠시만 기다려 주세요.");
      return;
    }

    if (dailyNotionRecord?.pageId) {
      setNotice("이미 저장된 일일 업무 기록이 있습니다. 새로 만들지 않고 수정 버튼을 사용하세요.");
      return;
    }

    const payload = buildDailyPayload(dailyWorkDate || getTodayDateInputValue());
    const signature = makeSaveSignature(payload);
    const statusLabel = formatDailyStatusLabel(dailyStatus);

    if (isRecentSameSave(getLastDailySaveSignature(), signature)) {
      setNotice("방금 같은 일일 업무 기록을 저장했습니다. 중복 저장을 막았습니다.");
      return;
    }

    dailySavingRef.current = true;
    setIsDailySaving(true);

    try {
      // 다른 기기에서 이미 저장했다면 새로 만들지 않고 그 기록에 연결한다.
      const existingWorkDate = dailyWorkDate || getTodayDateInputValue();
      try {
        const existing = await findDailyRecordByDate(existingWorkDate);
        if (existing.found && existing.pageId) {
          const linked: DailyNotionRecord = {
            pageId: existing.pageId,
            url: existing.url || undefined,
            savedAt: "Notion 확인",
            workDate: existingWorkDate,
          };
          setDailyNotionRecord(linked);
          saveDailyNotionRecordForDate(existingWorkDate, linked);
          setDailyNotionCheck("verified");
          setNotice(
            `${payload.workDateText} 기록이 이미 Notion에 있어 새로 만들지 않았습니다. 내용을 바꾸려면 'Notion 일일 기록 수정'을 사용하세요.`,
          );
          return;
        }
      } catch {
        // 조회 실패 시에는 기존 동작대로 저장을 진행한다.
      }

      const result = await saveDailyRecord(payload);

      if (!result?.success || !result?.pageId) {
        throw new Error(result?.detail || result?.message || "Notion 저장 완료를 확인하지 못했습니다.");
      }

      const workDate = dailyWorkDate || getTodayDateInputValue();
      const record = {
        pageId: result.pageId,
        url: result.url,
        savedAt: new Date().toLocaleString("ko-KR"),
        workDate,
      };

      setDailyNotionRecord(record);
      saveDailyNotionRecordForDate(workDate, record);
      saveLastDailySaveSignature({ signature, savedAt: Date.now() });
      setNotice(`Notion 일일 기록 저장 완료 · ${payload.workDateText} · ${statusLabel}`);
    } catch (error) {
      setNotice(
        `Notion 일일 기록 저장 실패 · ${error instanceof Error ? error.message : "저장 중 오류가 발생했습니다."}`,
      );
    } finally {
      dailySavingRef.current = false;
      setIsDailySaving(false);
    }
  };

  const handleUpdateDailyToNotion = async () => {
    if (!dailyNotionRecord?.pageId) {
      setNotice("수정할 Notion 일일 기록이 없습니다. 먼저 저장하세요.");
      return;
    }

    const payload = buildDailyPayload(dailyWorkDate || getTodayDateInputValue());
    const statusLabel = formatDailyStatusLabel(dailyStatus);

    if (payload.workDate !== getTodayDateInputValue()) {
      const confirmed = window.confirm(
        `${payload.workDateText} Notion 기록을 지금 화면의 메모·사진 내용으로 덮어씁니다.\n\n다른 날짜의 내용이 아닌지 확인하세요. 계속할까요?`,
      );
      if (!confirmed) return;
    }

    try {
      const result = await updateDailyRecord(dailyNotionRecord.pageId, payload);

      if (!result?.success || !result?.pageId) {
        throw new Error(result?.detail || result?.message || "Notion 수정 완료를 확인하지 못했습니다.");
      }

      const workDate = dailyWorkDate || getTodayDateInputValue();
      const nextRecord = {
        ...dailyNotionRecord,
        url: result.url || dailyNotionRecord.url,
        savedAt: new Date().toLocaleString("ko-KR"),
        workDate,
      };

      setDailyNotionRecord(nextRecord);
      saveDailyNotionRecordForDate(workDate, nextRecord);
      setNotice(`Notion 일일 기록 수정 완료 · ${payload.workDateText} · ${statusLabel}`);
    } catch (error) {
      setNotice(
        `Notion 일일 기록 수정 실패 · ${error instanceof Error ? error.message : "수정 중 오류가 발생했습니다."}`,
      );
    }
  };

  const handleDeleteDailyFromNotion = async () => {
    if (!dailyNotionRecord?.pageId) {
      setNotice("삭제할 Notion 일일 기록이 없습니다.");
      return;
    }

    const confirmed = window.confirm("Notion 일일 업무 기록을 삭제할까요?");
    if (!confirmed) return;

    try {
      await deleteDailyRecord(dailyNotionRecord.pageId);

      const workDate = dailyNotionRecord.workDate || dailyWorkDate || getTodayDateInputValue();
      clearDailyNotionRecord(workDate);
      setDailyNotionRecord(null);
      setNotice("Notion 일일 업무 기록을 삭제했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Notion 삭제 중 오류가 발생했습니다.");
    }
  };

  const openDailyNotionPage = () => {
    if (!dailyNotionRecord?.url) {
      setNotice("열 수 있는 Notion 링크가 없습니다.");
      return;
    }

    window.open(dailyNotionRecord.url, "_blank", "noopener,noreferrer");
  };

  return {
    dailyNotionCheck,
    dailyNotionRecord,
    handleDeleteDailyFromNotion,
    handleSaveDailyToNotion,
    handleUpdateDailyToNotion,
    isDailySaving,
    openDailyNotionPage,
    setDailyNotionRecord,
  };
}
