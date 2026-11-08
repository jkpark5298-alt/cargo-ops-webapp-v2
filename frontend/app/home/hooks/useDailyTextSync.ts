import { useEffect, useState } from "react";
import {
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
  const [dailySyncTick, setDailySyncTick] = useState(0);



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
      if (response.ok && json?.success) {
        const base = lastSavedValuesRef.current;
        const synced = base.workDate === workDate;
        const report = json.report;

        // 서버에 저장된 값(없으면 빈 값)
        const serverStatus: "normal" | "issue" = report?.status === "issue" ? "issue" : "normal";
        const serverAuthor = normalizeDailyAuthor(report?.author || "");
        const serverNote: string = report?.note || "";
        const serverImages: SavedImage[] = Array.isArray(report?.images) ? report.images : [];
        const serverImagesJson = JSON.stringify(serverImages);

        const localStatus = dailyStatusRef.current;
        const localAuthor = normalizeDailyAuthor(authorRef.current);
        const localNote = noteRef.current;
        const localImagesJson = JSON.stringify(imagesRef.current);

        const typing =
          Date.now() - dailyLocalEditAtRef.current < 60_000 ||
          document.activeElement?.tagName === "TEXTAREA" ||
          document.activeElement?.tagName === "INPUT";

        // 이 기기에서 아직 서버에 올리지 않은 변경인지(마지막 동기화 값과 다른지) 판단한다.
        // 처음 동기화(기준값 없음)는 서버에 값이 있으면 서버 값을 쓰고, 서버가 비어 있으면 이 기기 값을 유지해 올린다.
        const keepLocal = (local: string, baseValue: string, serverValue: string) => {
          if (local === serverValue) return false;
          if (!report) return true; // 서버에 저장본이 없으면 이 기기 값을 유지해 올린다
          if (typing) return true;
          return synced ? local !== baseValue : serverValue === "" || serverValue === "[]";
        };

        const next = { ...base, workDate };

        const keepStatus = keepLocal(localStatus, base.status, serverStatus);
        if (!keepStatus && localStatus !== serverStatus) setDailyStatus(serverStatus);
        next.status = keepStatus ? (synced ? base.status : serverStatus) : serverStatus;

        const keepAuthor = keepLocal(localAuthor, base.author, serverAuthor);
        if (!keepAuthor && localAuthor !== serverAuthor) setAuthor(serverAuthor);
        next.author = keepAuthor ? (synced ? base.author : serverAuthor) : serverAuthor;

        const keepNote = keepLocal(localNote, base.note, serverNote);
        if (!keepNote && localNote !== serverNote) {
          setNote(serverNote);
          saveNote(serverNote);
        }
        next.note = keepNote ? (synced ? base.note : serverNote) : serverNote;

        const keepImages =
          imagesSavingRef.current || keepLocal(localImagesJson, base.imagesJson, serverImagesJson);
        if (!keepImages && localImagesJson !== serverImagesJson) {
          setImages(serverImages);
          saveImages(serverImages);
        }
        next.imagesJson = keepImages ? (synced ? base.imagesJson : serverImagesJson) : serverImagesJson;

        lastSavedValuesRef.current = next;
        // 자동 저장 효과가 "이 기기에서 바꾼 항목"을 다시 확인하도록 알린다.
        setDailySyncTick((tick) => tick + 1);
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
    dailySyncTick,
    dailyTextSyncStatus,
    handleLoadDailyTextFromSupabase,
    handleSaveDailyTextToSupabase,
    isDailyTextSyncing,
    setDailyTextSyncStatus,
    setIsDailyTextSyncing,
  };
}
