import { useEffect, useState } from "react";
import {
  DEFAULT_DAILY_AUTHOR,
  loadDailyDraft,
  normalizeDailyAuthor,
  saveDailyDraft,
  saveImages,
  saveNote,
} from "../../lib/local-storage";
import { BACKEND_URL } from "../../lib/api-config";
import { SavedImage } from "../types";
import { getTodayDateInputValue } from "../helpers";

export type UseDailyTextSyncParams = {
  author: string;
  authorRef: React.MutableRefObject<string>;
  dailyLocalEditAtRef: React.MutableRefObject<number>;
  dailyStatus: "normal" | "issue";
  dailyStatusRef: React.MutableRefObject<"normal" | "issue">;
  dailyWorkDate: string;
  dailyWorkDateRef: React.MutableRefObject<string>;
  draftHydrated: boolean;
  images: import("../types").SavedImage[];
  imagesRef: React.MutableRefObject<import("../types").SavedImage[]>;
  imagesSavingRef: React.MutableRefObject<boolean>;
  lastSavedValuesRef: React.MutableRefObject<{ status: "normal" | "issue"; author: string; note: string; imagesJson: string; workDate: string; }>;
  note: string;
  noteRef: React.MutableRefObject<string>;
  setAuthor: React.Dispatch<React.SetStateAction<string>>;
  setDailyStatus: React.Dispatch<React.SetStateAction<"normal" | "issue">>;
  setDailyWorkDate: React.Dispatch<React.SetStateAction<string>>;
  setImages: React.Dispatch<React.SetStateAction<import("../types").SavedImage[]>>;
  setNote: React.Dispatch<React.SetStateAction<string>>;
  setNotice: React.Dispatch<React.SetStateAction<string>>;
};

/** Daily 업무보고 텍스트의 Supabase 공유(저장·불러오기·자동 동기화) */
export function useDailyTextSync({
  author,
  authorRef,
  dailyLocalEditAtRef,
  dailyStatus,
  dailyStatusRef,
  dailyWorkDate,
  dailyWorkDateRef,
  draftHydrated,
  images,
  imagesRef,
  imagesSavingRef,
  lastSavedValuesRef,
  note,
  noteRef,
  setAuthor,
  setDailyStatus,
  setDailyWorkDate,
  setImages,
  setNote,
  setNotice,
}: UseDailyTextSyncParams) {
  const [isDailyTextSyncing, setIsDailyTextSyncing] = useState(false);
  const [dailyTextSyncStatus, setDailyTextSyncStatus] = useState("");



  const applyDailyReportText = (report: unknown) => {
    if (!report || typeof report !== "object") return false;

    const record = report as {
      workDate?: string;
      status?: string;
      author?: string;
      note?: string;
      images?: SavedImage[];
    };

    const nextStatus = record.status === "issue" ? "issue" : "normal";
    const nextAuthor = normalizeDailyAuthor(
      typeof record.author === "string" ? record.author : author,
    );
    const nextNote = typeof record.note === "string" ? record.note : "";
    const nextImages = Array.isArray(record.images) ? record.images : [];

    setDailyStatus(nextStatus);
    setAuthor(nextAuthor);
    setNote(nextNote);

    const today = getTodayDateInputValue();
    const recordWorkDate =
      typeof record.workDate === "string" && record.workDate.trim() ? record.workDate.trim() : "";
    const targetWorkDate = recordWorkDate || dailyWorkDate || today;

    if (recordWorkDate) {
      setDailyWorkDate(recordWorkDate);
    }

    saveNote(nextNote);
    saveDailyDraft({
      note: nextNote,
      status: nextStatus,
      author: nextAuthor,
      workDate: targetWorkDate,
      savedAt: new Date().toISOString(),
    });

    if (Array.isArray(record.images)) {
      setImages(nextImages);
      saveImages(nextImages);
    }

    lastSavedValuesRef.current = {
      status: nextStatus,
      author: nextAuthor,
      note: nextNote,
      imagesJson: JSON.stringify(nextImages),
      workDate: targetWorkDate,
    };

    return true;
  };

  const handleSaveDailyTextToSupabase = async () => {
    const nextAuthor = normalizeDailyAuthor(author);
    if (nextAuthor !== author) setAuthor(nextAuthor);

    setIsDailyTextSyncing(true);
    setDailyTextSyncStatus("Supabase 데이터 저장 중...");

    try {
      const response = await fetch(`${BACKEND_URL}/flights/daily-report-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workDate: dailyWorkDate,
          status: dailyStatus,
          author: nextAuthor,
          note,
          images,
          savedAt: new Date().toISOString(),
        }),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok || !json?.success) {
        throw new Error(json?.message || "Daily 텍스트 공유 저장에 실패했습니다.");
      }

      setDailyTextSyncStatus("Supabase 데이터 저장 완료");
      setNotice("Daily 업무보고 데이터를 Supabase에 공유 저장했습니다.");

      lastSavedValuesRef.current = {
        status: dailyStatus,
        author: nextAuthor,
        note,
        imagesJson: JSON.stringify(images),
        workDate: dailyWorkDate,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Daily 데이터 공유 저장 중 오류가 발생했습니다.";
      setDailyTextSyncStatus(message);
      setNotice(message);
    } finally {
      setIsDailyTextSyncing(false);
    }
  };

  const silentSyncDailyReportFromSupabase = async () => {
    try {
      const workDate = dailyWorkDateRef.current || dailyWorkDate;
      const query = new URLSearchParams({ workDate });
      const response = await fetch(`${BACKEND_URL}/flights/daily-report-text?${query.toString()}`, {
        cache: "no-store",
      });
      const json = await response.json().catch(() => null);
      if (response.ok && json?.success && json.report) {
        const report = json.report;
        const serverStatus = report.status === "issue" ? "issue" : "normal";
        const serverAuthor = normalizeDailyAuthor(report.author || "");
        const serverNote = report.note || "";
        const serverImages = Array.isArray(report.images) ? report.images : [];
        const serverSavedAt = Date.parse(String(report.savedAt || "")) || 0;

        const localStatus = dailyStatusRef.current;
        const localAuthor = normalizeDailyAuthor(authorRef.current);
        const localNote = noteRef.current;
        const localImages = imagesRef.current;

        const recentlyEditedLocally =
          Date.now() - dailyLocalEditAtRef.current < 60_000;
        const isUserTyping =
          document.activeElement?.tagName === "TEXTAREA" ||
          document.activeElement?.tagName === "INPUT";
        const protectTextFields = recentlyEditedLocally || isUserTyping;

        const localDraft = loadDailyDraft();
        const localDraftAt = Date.parse(String(localDraft?.savedAt || "")) || 0;
        const localTextIsNewer = localDraftAt > serverSavedAt;

        const statusChanged = serverStatus !== localStatus;
        const authorChanged = serverAuthor !== localAuthor;
        const noteChanged = serverNote !== localNote;
        const imagesChanged = JSON.stringify(serverImages) !== JSON.stringify(localImages);

        if (statusChanged || authorChanged || noteChanged || imagesChanged) {
          if (statusChanged && !protectTextFields) setDailyStatus(serverStatus);

          if (!protectTextFields && !localTextIsNewer) {
            if (authorChanged) setAuthor(serverAuthor);
            if (noteChanged) {
              setNote(serverNote);
              saveNote(serverNote);
            }
          } else if (authorChanged && localAuthor === DEFAULT_DAILY_AUTHOR && serverAuthor !== DEFAULT_DAILY_AUTHOR) {
            // 로컬이 기본값일 때만 서버 작성자 반영 (현장 모바일은 normalize로 jkpark)
            setAuthor(serverAuthor);
          }

          if (imagesChanged && !imagesSavingRef.current) {
            setImages(serverImages);
            saveImages(serverImages);
          }

          lastSavedValuesRef.current = {
            status: !protectTextFields && statusChanged ? serverStatus : localStatus,
            author:
              !protectTextFields && !localTextIsNewer && authorChanged
                ? serverAuthor
                : localAuthor,
            note:
              !protectTextFields && !localTextIsNewer && noteChanged
                ? serverNote
                : localNote,
            imagesJson: JSON.stringify(imagesChanged ? serverImages : localImages),
            workDate,
          };
        }
      }
    } catch (e) {
      console.warn("Background sync error:", e);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!draftHydrated) return;

    void silentSyncDailyReportFromSupabase();

    const interval = setInterval(() => {
      void silentSyncDailyReportFromSupabase();
    }, 15000);

    return () => clearInterval(interval);
    // 입력 중 note/author 변경으로 sync가 재실행되어 덮어쓰지 않도록 업무일자만 구독
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyWorkDate, draftHydrated]);

  const handleLoadDailyTextFromSupabase = async () => {
    setIsDailyTextSyncing(true);
    setDailyTextSyncStatus("Supabase 텍스트 불러오는 중...");

    try {
      const query = new URLSearchParams({ workDate: dailyWorkDate });
      const response = await fetch(`${BACKEND_URL}/flights/daily-report-text?${query.toString()}`);
      const json = await response.json().catch(() => null);

      if (!response.ok || !json?.success) {
        throw new Error(json?.message || "Daily 텍스트 공유 불러오기에 실패했습니다.");
      }

      if (!json.report) {
        setDailyTextSyncStatus("해당 업무일자의 Supabase 텍스트 저장본이 없습니다.");
        setNotice("해당 업무일자의 Supabase 텍스트 저장본이 없습니다.");
        return;
      }

      if (!applyDailyReportText(json.report)) {
        throw new Error("Supabase 텍스트 저장본을 화면에 적용하지 못했습니다.");
      }

      setDailyTextSyncStatus("Supabase 텍스트 불러오기 완료");
      setNotice("Daily 업무보고 텍스트를 Supabase에서 불러왔습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Daily 텍스트 공유 불러오기 중 오류가 발생했습니다.";
      setDailyTextSyncStatus(message);
      setNotice(message);
    } finally {
      setIsDailyTextSyncing(false);
    }
  };

  return {
    dailyTextSyncStatus,
    handleLoadDailyTextFromSupabase,
    handleSaveDailyTextToSupabase,
    isDailyTextSyncing,
    setDailyTextSyncStatus,
    setIsDailyTextSyncing,
  };
}
