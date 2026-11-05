import { useEffect, useRef, useState } from "react";
import { DEFAULT_DAILY_AUTHOR, normalizeDailyAuthor } from "../../lib/local-storage";
import { BACKEND_URL } from "../../lib/api-config";
import { SavedImage } from "../types";
import { DAILY_IMAGES_CACHE_KEY } from "../constants";
import { resizeImageDataUrl } from "../../lib/image-utils";

/** 일일 업무보고(메모·사진) Supabase 동기화와 편별 사진 촬영 */
export function useDailyReportSync() {
  // Daily report states & logic
  const [dailyStatus, setDailyStatus] = useState<"normal" | "issue">("normal");
  const [author, setAuthor] = useState(DEFAULT_DAILY_AUTHOR);
  const [note, setNote] = useState("");
  const [images, setImages] = useState<SavedImage[]>([]);
  const [dailyWorkDate] = useState(() => {
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return now.toISOString().split("T")[0];
  });
  const [isDailySyncing, setIsDailySyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const lastSavedValuesRef = useRef({
    status: dailyStatus,
    author: DEFAULT_DAILY_AUTHOR,
    note,
    imagesJson: JSON.stringify(images),
    workDate: dailyWorkDate,
  });
  const dailyLocalEditAtRef = useRef(0);

  const loadDailyReportFromSupabase = async (dateStr: string) => {
    setIsDailySyncing(true);
    try {
      const query = new URLSearchParams({ workDate: dateStr });
      const response = await fetch(`${BACKEND_URL}/flights/daily-report-text?${query.toString()}`, { cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (response.ok && json?.success && json.report) {
        const loadedImages = Array.isArray(json.report.images) ? json.report.images : [];
        setDailyStatus(json.report.status === "issue" ? "issue" : "normal");
        setAuthor(normalizeDailyAuthor(json.report.author));
        setNote(json.report.note || "");
        setImages(loadedImages);

        // 이미지를 로컬스토리지에도 백업 (앱 재진입 시 복구용)
        if (typeof window !== "undefined" && loadedImages.length > 0) {
          try {
            localStorage.setItem(
              `${DAILY_IMAGES_CACHE_KEY}_${dateStr}`,
              JSON.stringify(loadedImages),
            );
          } catch {/* 무시 */}
        }

        lastSavedValuesRef.current = {
          status: json.report.status === "issue" ? "issue" : "normal",
          author: json.report.author || "",
          note: json.report.note || "",
          imagesJson: JSON.stringify(loadedImages),
          workDate: dateStr,
        };

        setSyncMessage("동기화 완료");
      } else {
        // 서버 데이터 없을 때 로컬스토리지 캐시에서 이미지 복구
        if (typeof window !== "undefined") {
          try {
            const cachedRaw = localStorage.getItem(`${DAILY_IMAGES_CACHE_KEY}_${dateStr}`);
            if (cachedRaw) {
              const cachedImages = JSON.parse(cachedRaw) as SavedImage[];
              if (Array.isArray(cachedImages) && cachedImages.length > 0) {
                setImages(cachedImages);
                setSyncMessage("로컬 이미지 복구됨");
                lastSavedValuesRef.current = {
                  status: dailyStatus,
                  author: author,
                  note: note,
                  imagesJson: JSON.stringify(cachedImages),
                  workDate: dateStr,
                };
                return;
              }
            }
          } catch {/* 무시 */}
        }
        setSyncMessage("저장된 일일 보고 없음");
        lastSavedValuesRef.current = {
          status: dailyStatus,
          author: author,
          note: note,
          imagesJson: JSON.stringify(images),
          workDate: dateStr,
        };
      }
    } catch (e) {
      // 네트워크 오류 시 로컬스토리지 캐시에서 이미지 복구
      if (typeof window !== "undefined") {
        try {
          const cachedRaw = localStorage.getItem(`${DAILY_IMAGES_CACHE_KEY}_${dateStr}`);
          if (cachedRaw) {
            const cachedImages = JSON.parse(cachedRaw) as SavedImage[];
            if (Array.isArray(cachedImages) && cachedImages.length > 0) {
              setImages(cachedImages);
            }
          }
        } catch {/* 무시 */}
      }
      setSyncMessage("동기화 실패");
    } finally {
      setIsDailySyncing(false);
    }
  };

  const saveDailyReportToSupabase = async (statusOverride?: "normal" | "issue", imagesOverride?: SavedImage[]) => {
    setIsDailySyncing(true);
    setSyncMessage("저장 중...");
    const targetStatus = statusOverride || dailyStatus;
    const targetImages = imagesOverride || images;
    try {
      const response = await fetch(`${BACKEND_URL}/flights/daily-report-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workDate: dailyWorkDate,
          status: targetStatus,
          author: normalizeDailyAuthor(author),
          note,
          images: targetImages,
          savedAt: new Date().toISOString(),
        }),
      });
      const json = await response.json().catch(() => null);
      if (response.ok && json?.success) {
        setSyncMessage("저장 완료");
        if (json.report) {
          const report = json.report;
          setDailyStatus(report.status === "issue" ? "issue" : "normal");
          setAuthor(normalizeDailyAuthor(report.author));
          setNote(report.note || "");
          setImages(Array.isArray(report.images) ? report.images : []);

          lastSavedValuesRef.current = {
            status: report.status === "issue" ? "issue" : "normal",
            author: normalizeDailyAuthor(report.author),
            note: report.note || "",
            imagesJson: JSON.stringify(Array.isArray(report.images) ? report.images : []),
            workDate: dailyWorkDate,
          };
        }
      } else {
        setSyncMessage("저장 실패");
      }
    } catch (e) {
      setSyncMessage("저장 에러");
    } finally {
      setIsDailySyncing(false);
    }
  };

  // 1.5초 디바운스 자동 저장 효과
  useEffect(() => {
    const currentImagesJson = JSON.stringify(images);
    const hasChanged =
      dailyStatus !== lastSavedValuesRef.current.status ||
      author !== lastSavedValuesRef.current.author ||
      note !== lastSavedValuesRef.current.note ||
      currentImagesJson !== lastSavedValuesRef.current.imagesJson ||
      dailyWorkDate !== lastSavedValuesRef.current.workDate;

    if (!hasChanged) return;

    const timer = setTimeout(() => {
      // update ref immediately to prevent multiple triggers
      lastSavedValuesRef.current = {
        status: dailyStatus,
        author,
        note,
        imagesJson: currentImagesJson,
        workDate: dailyWorkDate,
      };

      void saveDailyReportToSupabase();
    }, 1500);

    return () => clearTimeout(timer);
  }, [dailyStatus, author, note, images, dailyWorkDate]);

  const handleCameraUpload = async (flightNo: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSyncMessage("사진 처리 중...");

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawDataUrl = event.target?.result as string;
      if (!rawDataUrl) return;

      try {
        const compressedUrl = await resizeImageDataUrl(rawDataUrl);

        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        const capturedTime = `${hh}:${mm}`;

        const newImage: SavedImage = {
          id: "img_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
          type: "issue",
          label: `[${flightNo}] 화물 적재 / 주기장 상황`,
          savedAt: now.toISOString(),
          capturedAt: capturedTime,
          dataUrl: compressedUrl,
        };

        const nextImages = [newImage, ...images].slice(0, 20);
        setImages(nextImages);
        setDailyStatus("issue");

        // 로컬스토리지에도 즉시 백업 (앱 나가도 유지)
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(
              `${DAILY_IMAGES_CACHE_KEY}_${dailyWorkDate}`,
              JSON.stringify(nextImages),
            );
          } catch {/* 무시 */}
        }

        await saveDailyReportToSupabase("issue", nextImages);
        alert(`${flightNo} 화물 사진이 특이사항 이미지로 PC 대시보드에 업로드되었습니다!`);
      } catch (err) {
        console.error(err);
        alert("사진 업로드 중 오류가 발생했습니다.");
      }
    };
    reader.readAsDataURL(file);
  };

  return {
    author,
    dailyLocalEditAtRef,
    dailyStatus,
    dailyWorkDate,
    handleCameraUpload,
    isDailySyncing,
    loadDailyReportFromSupabase,
    note,
    saveDailyReportToSupabase,
    setAuthor,
    setDailyStatus,
    setNote,
    syncMessage,
  };
}
