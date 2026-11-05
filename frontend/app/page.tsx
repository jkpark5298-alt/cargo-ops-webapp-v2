"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FlightAlertHistoryCard } from "./components/FlightAlertHistoryCard";
import { WeatherCard } from "./components/WeatherCard";
import { ScheduleSummaryCard } from "./components/ScheduleSummaryCard";
import { DailyRecordCard } from "./components/DailyRecordCard";
import { IssueRecordCard } from "./components/IssueRecordCard";
import { PwaNotificationCard } from "./components/PwaNotificationCard";
import { ImageViewerModal } from "./components/ImageViewerModal";
import {
  buildFlightAlertSnapshot,
  clearFlightAlertSnapshot,
  getCurrentTimeLabel,
  loadFlightAlertHistory,
  loadFlightAlertSnapshot,
  saveFlightAlertSnapshot,
} from "./lib/flight-alerts";
import {
  clearDailyDraft,
  clearDailyNotionRecord,
  clearIssueDraft,
  clearIssueNotionRecord,
  DEFAULT_DAILY_AUTHOR,
  loadDailyDraft,
  loadDailyNotionRecordForDate,
  loadImages,
  loadIssueDraft,
  loadIssueNotionRecord,
  loadNote,
  normalizeDailyAuthor,
  saveDailyDraft,
  saveImages,
  saveIssueDraft,
  saveNote,
} from "./lib/local-storage";
import { findDailyRecordByDate, getNotionLinks } from "./lib/notion-api";
import {
  loadScheduleSlotsFromServer,
  saveScheduleSlotToServer,
  type ScheduleSlotKey,
} from "./flights/lib/schedule-slots";
import {
  combineAfocsSkdParts,
  fillEmptyAfocsSkdOnRows,
  hasAfocsSkdUpdates,
  preserveAfocsSkdOnRows,
  seedEmptyAfocsSkdFromSchedule,
} from "./lib/afocs-skd";
import {
  isActiveScheduleRoom,
  loadRooms,
  mergeLatestScheduleRoom,
  mergeScheduleRegistrationIntoRoom,
  removeEmptyScheduleRooms,
  removeFlightFromScheduleOnServer,
  removeFlightFromScheduleRoom,
  saveLatestScheduleToServer,
  saveRooms,
} from "./lib/schedule-store";
import { type FlightRow, type MonitorRoom } from "./lib/flight-types";
import { getFlightNo, normalizeFlightKey, normalizeFlightsInput } from "./lib/flight-keys";
import { BACKEND_URL } from "./lib/api-config";
import {
  applyRegistrationToRows,
  fetchAircraftRegistrationRecordsFromServer,
  loadAircraftRegistrationRecords,
} from "./lib/aircraft-registration";
import { BackendScheduleCheckResult, IncheonApiUsage, SavedImage, WeatherInfo } from "./home/types";
import {
  APP_VERSION,
  APP_VERSION_DATE,
  DEFAULT_WEATHER,
  IMAGE_SLOTS,
  ISSUE_IMAGE_SLOT,
} from "./home/constants";
import {
  formatDateForTitle,
  formatDateInputForTitle,
  formatHeaderApiUsageText,
  getCurrentSyncLabel,
  getCurrentTimeText,
  getHlnbrByFlight,
  getImageBySlot,
  getImagesBySlot,
  getInitialDailyWorkDate,
  getLatestScheduleRoom,
  getLocalLatestScheduleRoom,
  getRouteByFlight,
  getTodayDateInputValue,
  isIssueRecordFromPastDay,
  getCarryOverMissing,
  getWeatherSummary,
  getWorkDateMismatchMessage,
  saveDailyWorkDate,
} from "./home/helpers";
import {
  datePillStyle,
  datePillSubStyle,
  eyebrowStyle,
  footerStyle,
  heroStyle,
  noticeDangerStyle,
  noticeStyle,
  pageStyle,
  stackStyle,
  titleStyle,
} from "./home/styles";
import { ActionCard } from "./home/components/ActionCard";
import { useFlightAlertHistory } from "./home/hooks/useFlightAlertHistory";
import { usePwaPush } from "./home/hooks/usePwaPush";
import { useImageSlots } from "./home/hooks/useImageSlots";
import { useDailyNotionRecord } from "./home/hooks/useDailyNotionRecord";
import { useIssueNotionRecord } from "./home/hooks/useIssueNotionRecord";
import { useDailyTextSync } from "./home/hooks/useDailyTextSync";

export default function HomePage() {
  const router = useRouter();
  const lastImmediateApiCheckRef = useRef(0);
  const linkedScheduleSlotRef = useRef<ScheduleSlotKey>("active");
  const [rooms, setRooms] = useState<MonitorRoom[]>([]);
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");
  const [scheduleSyncCheckedAt, setScheduleSyncCheckedAt] = useState("");
  const [scheduleApiSyncStatus, setScheduleApiSyncStatus] = useState("");
  const [scheduleApiSyncLoading, setScheduleApiSyncLoading] = useState(false);
  const [scheduleFlightDeleting, setScheduleFlightDeleting] = useState(false);
  const [incheonApiUsage, setIncheonApiUsage] = useState<IncheonApiUsage | null>(null);
  const [weather, setWeather] = useState<WeatherInfo>(DEFAULT_WEATHER);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [dailyStatus, setDailyStatus] = useState<"normal" | "issue">("normal");
  const [author, setAuthor] = useState(DEFAULT_DAILY_AUTHOR);

  const lastSavedValuesRef = useRef({
    status: dailyStatus,
    author: DEFAULT_DAILY_AUTHOR,
    note: "",
    imagesJson: "[]",
    workDate: "",
  });
  const dailyLocalEditAtRef = useRef(0);
  const dailyStatusRef = useRef(dailyStatus);
  const authorRef = useRef(author);
  const noteRef = useRef("");
  const imagesRef = useRef<SavedImage[]>([]);
  const dailyWorkDateRef = useRef("");
  /** 앱을 열 때 지난 날짜로 남아 있던 임시저장의 날짜(Notion 저장 후 오늘로 자동 전환) */
  const carryOverDateRef = useRef("");

  const [issueFlight, setIssueFlight] = useState("");
  const [issueRoute, setIssueRoute] = useState("");
  const [issueHlnbr, setIssueHlnbr] = useState("");
  const [issueText, setIssueText] = useState("");
  const todayText = useMemo(() => formatDateForTitle(new Date()), []);
  const [dailyWorkDate, setDailyWorkDate] = useState(() => getInitialDailyWorkDate());
  const {
    cameraInputRef,
    closeImageViewer,
    handleDeleteImageSlot,
    handleDeleteSingleImage,
    handleImageSelected,
    handlePastedImage,
    handleSaveAnnotatedImage,
    handleSaveImageMemo,
    handleViewerCameraChange,
    handleViewerDelete,
    handleViewerLibraryChange,
    imageViewerImage,
    imageViewerSlotInfo,
    images,
    imagesSavingRef,
    libraryInputRef,
    openCamera,
    openLatestImage,
    openPhotoLibrary,
    setImages,
  } = useImageSlots({ author, dailyStatus, dailyWorkDate, issueFlight, issueHlnbr, issueRoute, issueText, lastSavedValuesRef, note, setNotice });
  const {
    handleDeleteIssueFromNotion,
    handleSaveIssueToNotion,
    handleUpdateIssueToNotion,
    isIssueSaving,
    issueNotionRecord,
    openIssueNotionPage,
    setIssueNotionRecord,
  } = useIssueNotionRecord({ author, images, issueFlight, issueHlnbr, issueRoute, issueText, setNotice, weather });
  const dailyWorkDateTitle = useMemo(
    () => formatDateInputForTitle(dailyWorkDate),
    [dailyWorkDate],
  );
  const [draftHydrated, setDraftHydrated] = useState(false);
  const {
    dailyTextSyncStatus,
    handleLoadDailyTextFromSupabase,
    handleSaveDailyTextToSupabase,
    isDailyTextSyncing,
    setDailyTextSyncStatus,
    setIsDailyTextSyncing,
  } = useDailyTextSync({ author, authorRef, dailyLocalEditAtRef, dailyStatus, dailyStatusRef, dailyWorkDate, dailyWorkDateRef, draftHydrated, images, imagesRef, imagesSavingRef, lastSavedValuesRef, note, noteRef, setAuthor, setDailyStatus, setDailyWorkDate, setImages, setNote, setNotice });
  const {
    dailyNotionCheck,
    dailyNotionRecord,
    handleDeleteDailyFromNotion,
    handleSaveDailyToNotion,
    handleUpdateDailyToNotion,
    isDailySaving,
    openDailyNotionPage,
    setDailyNotionRecord,
  } = useDailyNotionRecord({ author, dailyStatus, dailyWorkDate, draftHydrated, images, note, setNotice });
  const latestRoom = useMemo(() => {
    const currentRoom = getLatestScheduleRoom(rooms);
    // rows(AFOCS 포함)는 React state를 우선하고, 등록번호만 로컬 보조 맵을 적용합니다.
    return mergeScheduleRegistrationIntoRoom(currentRoom, getLocalLatestScheduleRoom());
  }, [rooms]);
  const {
    flightAlertDetailsVisible,
    flightAlertHistory,
    handleClearFlightAlertHistory,
    handleDeleteFlightAlertHistoryItem,
    handleLoadServerFlightAlertHistory,
    handleRevealServerFlightAlertHistory,
    serverFlightAlertChangeCount,
    serverFlightAlertLoading,
    serverFlightAlertStatus,
    setAlertCheckedAt,
    setFlightAlertHistory,
    setFlightAlertSnapshot,
    setServerFlightAlertChangeCount,
    syncFlightAlertHistoryFromCheck,
  } = useFlightAlertHistory({ latestRoom });

  useEffect(() => {
    dailyStatusRef.current = dailyStatus;
    authorRef.current = author;
    noteRef.current = note;
    imagesRef.current = images;
    dailyWorkDateRef.current = dailyWorkDate;
  }, [dailyStatus, author, note, images, dailyWorkDate]);

  useEffect(() => {
    saveDailyWorkDate(dailyWorkDate);
  }, [dailyWorkDate]);

  const markDailyLocalEdit = () => {
    dailyLocalEditAtRef.current = Date.now();
  };

  const systemTodayDate = getTodayDateInputValue();
  const dailySavedForDate = Boolean(
    dailyNotionRecord && (!dailyNotionRecord.workDate || dailyNotionRecord.workDate === dailyWorkDate),
  );
  const carryOverMissing = getCarryOverMissing({
    workDate: dailyWorkDate,
    today: systemTodayDate,
    dailySaved: dailySavedForDate,
    issueText,
    issueSaved: Boolean(issueNotionRecord),
  });
  const workDateMismatchWarning =
    carryOverMissing.length > 0
      ? `${formatDateInputForTitle(dailyWorkDate)} ${carryOverMissing.join("·")} 기록이 Notion에 저장되지 않았습니다. Notion에 저장해야 오늘 날짜로 넘어갈 수 있습니다(내용이 비어 있어도 Notion 저장이 필요합니다).`
      : getWorkDateMismatchMessage(dailyWorkDate, systemTodayDate);

  const handleDailyWorkDateChange = (value: string) => {
    setDailyWorkDate(value || getTodayDateInputValue());
  };

  // 저장이 끝난 지난 날짜의 사진·메모·특이사항 입력칸을 비우고 오늘 날짜로 새로 시작한다.
  const startNewDayFresh = (today: string) => {
    carryOverDateRef.current = "";
    setNote("");
    setImages([]);
    setDailyStatus("normal");
    setIssueFlight("");
    setIssueRoute("");
    setIssueHlnbr("");
    setIssueText("");
    setIssueNotionRecord(null);
    clearIssueDraft();
    clearIssueNotionRecord();
    setDailyWorkDate(today);
    setNotice("지난 업무 기록이 Notion에 저장되어 있어 오늘 날짜로 새로 시작했습니다.");
  };

  // 오늘 날짜로 맞추기: 지난 날짜의 기록이 Notion에 저장된 것을 확인한 경우에만 넘어간다.
  const resetDailyWorkDateToToday = async () => {
    const today = getTodayDateInputValue();
    if (dailyWorkDate === today) return;

    let dailySaved = dailySavedForDate;
    if (!dailySaved) {
      try {
        const lookup = await findDailyRecordByDate(dailyWorkDate);
        dailySaved = Boolean(lookup.found && lookup.pageId);
      } catch {
        setNotice("업무일자의 Notion 저장 여부를 확인하지 못했습니다. 잠시 후 다시 시도하세요.");
        return;
      }
    }

    const missing = getCarryOverMissing({
      workDate: dailyWorkDate,
      today,
      dailySaved,
      issueText,
      issueSaved: Boolean(issueNotionRecord),
    });
    if (missing.length > 0) {
      setNotice(
        `업무일자 ${dailyWorkDate} ${missing.join("·")} 기록이 Notion에 저장되지 않았습니다. 먼저 Notion에 저장한 뒤 오늘 날짜로 맞출 수 있습니다.`,
      );
      return;
    }

    startNewDayFresh(today);
  };

  // 지난 날짜 기록이 Notion에 저장되면(이 기기·다른 기기 모두) 자동으로 오늘 날짜로 넘어간다.
  useEffect(() => {
    if (!draftHydrated) return;
    const carry = carryOverDateRef.current;
    if (!carry || carry !== dailyWorkDate) return;

    const today = getTodayDateInputValue();
    const missing = getCarryOverMissing({
      workDate: dailyWorkDate,
      today,
      dailySaved: dailySavedForDate,
      issueText,
      issueSaved: Boolean(issueNotionRecord),
    });
    if (missing.length > 0) return;

    startNewDayFresh(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftHydrated, dailyWorkDate, dailySavedForDate, issueText, issueNotionRecord]);

  useEffect(() => {
    setRooms(
      loadRooms().map((room) =>
        room.fixed ? (mergeScheduleRegistrationIntoRoom(room, room) as MonitorRoom) : room,
      ),
    );
    const savedDailyDraft = loadDailyDraft();
    const savedIssueDraft = loadIssueDraft();

    // 지난 날짜의 임시저장은 Notion에 저장해야 오늘로 넘어간다(아래 자동 전환 효과 참고).
    const today = getTodayDateInputValue();
    const loadedImages = loadImages();
    const loadedNote = savedDailyDraft?.note ?? loadNote();
    const draftWorkDate = savedDailyDraft?.workDate || "";
    if (draftWorkDate && draftWorkDate < today) {
      carryOverDateRef.current = draftWorkDate;
    }

    const savedIssueRecord = loadIssueNotionRecord();
    const rollIssue = isIssueRecordFromPastDay(savedIssueRecord, today);
    setImages(rollIssue ? loadedImages.filter((image) => image.type !== ISSUE_IMAGE_SLOT.key) : loadedImages);
    setNote(loadedNote);
    setIssueNotionRecord(rollIssue ? null : savedIssueRecord);
    if (rollIssue) {
      clearIssueNotionRecord();
      clearIssueDraft();
    }

    if (savedDailyDraft?.status) {
      setDailyStatus(savedDailyDraft.status);
    }
    if (savedDailyDraft?.author) {
      setAuthor(normalizeDailyAuthor(savedDailyDraft.author));
    } else {
      setAuthor(DEFAULT_DAILY_AUTHOR);
    }
    if (savedDailyDraft?.workDate) {
      setDailyWorkDate(savedDailyDraft.workDate);
    }

    const initialWorkDate =
      savedDailyDraft?.workDate || dailyWorkDateRef.current || getTodayDateInputValue();
    setDailyNotionRecord(loadDailyNotionRecordForDate(initialWorkDate));

    if (savedIssueDraft && !rollIssue) {
      setIssueFlight(savedIssueDraft.flight);
      setIssueRoute(savedIssueDraft.route);
      setIssueHlnbr(savedIssueDraft.hlnbr);
      setIssueText(savedIssueDraft.text);
      if (savedIssueDraft.author) {
        setAuthor(normalizeDailyAuthor(savedIssueDraft.author));
      }
      // 일일 임시저장이 없을 때만 특이사항 내용으로 상태를 정한다(열 때마다 "특이사항 있음"으로 바뀌지 않게).
      if (!savedDailyDraft && (savedIssueDraft.status === "issue" || savedIssueDraft.text.trim())) {
        setDailyStatus("issue");
      }
    }

    setDraftHydrated(true);

    const savedSnapshot = loadFlightAlertSnapshot();
    const savedHistory = loadFlightAlertHistory();
    setFlightAlertSnapshot(savedSnapshot);
    setFlightAlertHistory(savedHistory);
    setServerFlightAlertChangeCount(savedHistory.length);
    setAlertCheckedAt(savedSnapshot?.savedAt || getCurrentTimeLabel());

    void fetchWeather();
    void fetchIncheonApiUsage();
    void checkScheduleApiAndSync(false, true);
    void fetchAutoPushStatus();
    void handleLoadServerFlightAlertHistory(false);
    void loadScheduleSlotsFromServer()
      .then((slots) => {
        linkedScheduleSlotRef.current = slots.linkedSlot;
      })
      .catch(() => {});

    const syncTimer = window.setTimeout(() => {
      void checkScheduleApiAndSync(false);
      void syncPwaPermissionAndSubscription(false);
      void handleLoadServerFlightAlertHistory(false);
    }, 1200);

    const alertHistoryTimer = window.setInterval(() => {
      void handleLoadServerFlightAlertHistory(false);
    }, 60_000);

    return () => {
      window.clearTimeout(syncTimer);
      window.clearInterval(alertHistoryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draftHydrated) return;

    saveImages(images);
    saveNote(note);
    saveDailyDraft({
      note,
      status: dailyStatus,
      author: normalizeDailyAuthor(author),
      workDate: dailyWorkDate,
      savedAt: new Date().toISOString(),
    });

    saveIssueDraft({
      flight: issueFlight,
      route: issueRoute,
      hlnbr: issueHlnbr,
      text: issueText,
      status: dailyStatus === "issue" || issueText.trim() ? "issue" : "normal",
      author: normalizeDailyAuthor(author),
      savedAt: new Date().toISOString(),
    });
  }, [
    draftHydrated,
    images,
    note,
    dailyStatus,
    author,
    dailyWorkDate,
    issueFlight,
    issueRoute,
    issueHlnbr,
    issueText,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    void syncPwaPermissionAndSubscription(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const refreshFromResume = () => {
      const savedDailyDraft = loadDailyDraft();
      const savedIssueDraft = loadIssueDraft();

      setImages(loadImages());
      setNote(savedDailyDraft?.note ?? loadNote());

      if (savedDailyDraft?.status) setDailyStatus(savedDailyDraft.status);
      if (savedDailyDraft?.author) setAuthor(normalizeDailyAuthor(savedDailyDraft.author));
      else setAuthor(DEFAULT_DAILY_AUTHOR);
      if (savedDailyDraft?.workDate) setDailyWorkDate(savedDailyDraft.workDate);

      if (savedIssueDraft) {
        setIssueFlight(savedIssueDraft.flight);
        setIssueRoute(savedIssueDraft.route);
        setIssueHlnbr(savedIssueDraft.hlnbr);
        setIssueText(savedIssueDraft.text);
        if (savedIssueDraft.author) setAuthor(normalizeDailyAuthor(savedIssueDraft.author));
      } else {
        // keep daily author
      }

      void checkScheduleApiAndSync(false);
      void syncPwaPermissionAndSubscription(false);
      void fetchAutoPushStatus();
      void handleLoadServerFlightAlertHistory(false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshFromResume();
      }
    };

    window.addEventListener("focus", refreshFromResume);
    window.addEventListener("pageshow", refreshFromResume);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshFromResume);
      window.removeEventListener("pageshow", refreshFromResume);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const route = getRouteByFlight(latestRoom, issueFlight);
    const hlnbr = getHlnbrByFlight(latestRoom, issueFlight);

    if (route) {
      setIssueRoute(route);
    }

    if (hlnbr) {
      setIssueHlnbr(hlnbr);
    }
  }, [issueFlight, latestRoom]);

  const openFlights = () => router.push("/flights");

  const openScheduleFlight = () => {
    if (latestRoom) {
      router.push("/afocs-skd");
      return;
    }
    router.push("/flights");
  };

  const handleUpdateAfocsSkd = async (flight: string, date: string, time: string) => {
    if (!latestRoom) return;

    const flightKey = normalizeFlightKey(flight);
    const matchedRow = (latestRoom.rows || []).find(
      (row) => normalizeFlightKey(getFlightNo(row)) === flightKey,
    );
    const normalizedValue = combineAfocsSkdParts(date, time, matchedRow);

    const updatedRows = (latestRoom.rows || []).map((row) => {
      const rowFlightKey = normalizeFlightKey(getFlightNo(row));
      if (rowFlightKey === flightKey) {
        return { ...row, afocsSkd: normalizedValue };
      }
      return row;
    });

    const exists = (latestRoom.rows || []).some(
      (row) => normalizeFlightKey(getFlightNo(row)) === flightKey,
    );

    let finalRows = updatedRows;
    if (!exists) {
      finalRows = [
        ...updatedRows,
        {
          flightId: flight,
          flightNo: flight,
          afocsSkd: normalizedValue,
        },
      ];
    }

    const updatedRoom: MonitorRoom = {
      ...latestRoom,
      rows: finalRows,
    };

    const nextRooms = mergeLatestScheduleRoom(loadRooms(), updatedRoom);
    setRooms(nextRooms);
    saveRooms(nextRooms);

    try {
      // 슬롯 + latest-schedule 모두에 저장해 아이폰 등 다른 기기가 바로 받을 수 있게 합니다.
      const result = await saveScheduleSlotToServer(updatedRoom, {
        rotate: false,
        slot: linkedScheduleSlotRef.current,
      });
      linkedScheduleSlotRef.current = result.linkedSlot;
      await saveLatestScheduleToServer(updatedRoom);
    } catch (error) {
      console.error("Failed to sync updated AFOCS SKD to server:", error);
      try {
        await saveLatestScheduleToServer(updatedRoom);
      } catch (fallbackError) {
        console.error("Failed to sync AFOCS SKD via latest-schedule:", fallbackError);
      }
    }
  };

  const handleDeleteFlightFromSchedule = async (flight: string) => {
    if (!latestRoom || scheduleFlightDeleting) return;

    const targetFlight = normalizeFlightKey(flight);
    if (!targetFlight) return;

    setScheduleFlightDeleting(true);
    setScheduleApiSyncStatus(`${targetFlight} 삭제 중...`);

    const updatedRoom = removeFlightFromScheduleRoom(latestRoom, targetFlight);
    const hasRemaining = isActiveScheduleRoom(updatedRoom);
    // 서버 삭제에 실패하면 화면을 원래대로 되돌리기 위해 삭제 전 상태를 보관한다.
    const previousRooms = loadRooms();
    const previousSnapshot = buildFlightAlertSnapshot(latestRoom);
    const nextRooms = hasRemaining
      ? mergeLatestScheduleRoom(loadRooms(), updatedRoom)
      : removeEmptyScheduleRooms(
          loadRooms().map((room) => (room.id === latestRoom.id ? updatedRoom : room)),
        );

    setRooms(nextRooms);
    saveRooms(nextRooms);

    // 알림 이력은 유지하고, 기준 스냅샷만 남은 편 기준으로 갱신합니다.
    const nextSnapshot = buildFlightAlertSnapshot(updatedRoom);
    if (nextSnapshot) {
      setFlightAlertSnapshot(nextSnapshot);
      saveFlightAlertSnapshot(nextSnapshot);
    } else {
      setFlightAlertSnapshot(null);
      clearFlightAlertSnapshot();
    }

    try {
      // 서버가 최신 일정과 연동 슬롯에서 한 번에 삭제하고 삭제 기록을 남긴다(되살아남 방지).
      await removeFlightFromScheduleOnServer(targetFlight);

      if (typeof window !== "undefined") {
        window.localStorage.setItem("cargo_ops_latest_schedule_updated_at", new Date().toISOString());
      }

      setScheduleApiSyncStatus(
        hasRemaining
          ? `${targetFlight} 삭제 완료 · 서버/다른 기기 반영`
          : `${targetFlight} 삭제 완료 · 남은 편명이 없어 Schedule Flight를 비웠습니다.`,
      );
      setScheduleSyncCheckedAt(getCurrentSyncLabel());
    } catch (error) {
      // 서버에 반영되지 않았으므로 화면도 되돌린다(그대로 두면 다음 동기화 때 조용히 되살아난다).
      setRooms(previousRooms);
      saveRooms(previousRooms);
      if (previousSnapshot) {
        setFlightAlertSnapshot(previousSnapshot);
        saveFlightAlertSnapshot(previousSnapshot);
      }
      setScheduleApiSyncStatus(
        error instanceof Error
          ? `${targetFlight} 삭제하지 못했습니다(서버 반영 실패): ${error.message} · 편은 그대로 유지됩니다.`
          : `${targetFlight} 삭제하지 못했습니다(서버 반영 실패) · 편은 그대로 유지됩니다.`,
      );
    } finally {
      setScheduleFlightDeleting(false);
    }
  };

  const syncLatestScheduleFromServer = async (showNotice = true) => {
    try {
      const res = await fetch(`${BACKEND_URL}/flights/latest-schedule`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || json.success === false) {
        throw new Error(json.detail || json.message || "Schedule Flight 동기화 실패");
      }

      const rawServerRoom = isActiveScheduleRoom(json.room as MonitorRoom | null)
        ? (json.room as MonitorRoom)
        : null;
      const localLatestRoom = getLocalLatestScheduleRoom();

      // 아이폰 등 다른 기기도 서버 등록기호 DB를 읽어 로컬 캐시만 의존하지 않습니다.
      let serverRegistrationRecords = loadAircraftRegistrationRecords();
      try {
        serverRegistrationRecords = await fetchAircraftRegistrationRecordsFromServer();
      } catch {
        // 등록기호 서버 조회 실패 시 로컬 캐시로 계속합니다.
      }

      let slotAfocsRows: FlightRow[] | undefined;
      try {
        const slots = await loadScheduleSlotsFromServer();
        linkedScheduleSlotRef.current = slots.linkedSlot;
        const linkedEntry = slots[slots.linkedSlot];
        if (linkedEntry?.room?.rows?.length) {
          slotAfocsRows = linkedEntry.room.rows;
        }
      } catch {
        // 슬롯 조회 실패 시 로컬 값으로만 보존합니다.
      }

      const roomWithLocalAfocs = mergeScheduleRegistrationIntoRoom(
        rawServerRoom,
        localLatestRoom,
        serverRegistrationRecords,
      );
      // 슬롯 AFOCS를 최우선으로 덮어 기기 간 수동 입력값을 맞춥니다.
      const rowsFromSlot = preserveAfocsSkdOnRows(roomWithLocalAfocs?.rows || [], slotAfocsRows);
      // 등록번호는 공용 우선순위(최근 저장 기록 → 슬롯 값 → 행 값)로 정합니다.
      const rowsWithSlotRegistration = applyRegistrationToRows(
        rowsFromSlot,
        serverRegistrationRecords,
        slotAfocsRows,
      );
      // latest-schedule(서버) AFOCS로 남은 빈 칸을 채웁니다.
      const rowsFromServer = fillEmptyAfocsSkdOnRows(rowsWithSlotRegistration, rawServerRoom?.rows || []);
      // PC 로컬에만 있던 AFOCS도 빈 칸에 채웁니다.
      const rowsFromLocal = fillEmptyAfocsSkdOnRows(rowsFromServer, localLatestRoom?.rows || []);
      // 그래도 비어 있으면 변경(스케줄) 시각으로 채웁니다.
      const rowsMerged = seedEmptyAfocsSkdFromSchedule(rowsFromLocal);
      const allowedFlightKeys = new Set(
        normalizeFlightsInput(String(roomWithLocalAfocs?.flightsInput || "")).map((flight) =>
          normalizeFlightKey(flight),
        ),
      );
      const rowsBounded =
        allowedFlightKeys.size > 0
          ? rowsMerged.filter((row) => allowedFlightKeys.has(normalizeFlightKey(getFlightNo(row))))
          : rowsMerged;
      const serverRoom = roomWithLocalAfocs
        ? {
            ...roomWithLocalAfocs,
            rows: rowsBounded,
          }
        : null;

      const nextRooms = mergeLatestScheduleRoom(loadRooms(), serverRoom);
      setRooms(nextRooms);
      saveRooms(nextRooms);

      // 로컬/슬롯에서 합쳐진 AFOCS가 서버보다 많으면 서버에 올려 아이폰과 맞춥니다.
      if (
        serverRoom &&
        hasAfocsSkdUpdates(rawServerRoom?.rows || [], rowsBounded)
      ) {
        try {
          const result = await saveScheduleSlotToServer(serverRoom, {
            rotate: false,
            slot: linkedScheduleSlotRef.current,
          });
          linkedScheduleSlotRef.current = result.linkedSlot;
          await saveLatestScheduleToServer(serverRoom);
        } catch (error) {
          console.error("Failed to push merged AFOCS SKD to server:", error);
        }
      }

      if (!serverRoom) {
        setFlightAlertSnapshot(null);
        if (typeof window !== "undefined") localStorage.removeItem("cargo_ops_flight_alert_snapshot_v1");

        const checkedAt = getCurrentSyncLabel();
        setScheduleSyncCheckedAt(checkedAt);
        if (showNotice) setNotice(`Schedule Flight 없음 · 확인 ${checkedAt}`);
        await fetchAutoPushStatus();
        return;
      }

      const nextSnapshot = buildFlightAlertSnapshot(serverRoom);
      if (nextSnapshot) {
        setFlightAlertSnapshot(nextSnapshot);
        saveFlightAlertSnapshot(nextSnapshot);
        setAlertCheckedAt(nextSnapshot.savedAt);
      }

      if (showNotice) {
        const checkedAt = getCurrentSyncLabel();
        setScheduleSyncCheckedAt(checkedAt);
        setNotice(`Schedule Flight 동기화 확인 · ${checkedAt}`);
      }

      await fetchAutoPushStatus();
    } catch (error) {
      if (showNotice) {
        setNotice(error instanceof Error ? error.message : "Schedule Flight 동기화 중 오류가 발생했습니다.");
      }
    }
  };


  const checkScheduleApiAndSync = async (showNotice = false, force = false) => {
    const now = Date.now();
    const showLoading = Boolean(showNotice || force);

    if (showLoading) {
      setScheduleApiSyncLoading(true);
      setScheduleApiSyncStatus("Schedule Flight API 즉시 확인 중...");
    }

    if (!force && now - lastImmediateApiCheckRef.current < 60_000) {
      await syncLatestScheduleFromServer(false);
      if (showLoading) {
        setScheduleApiSyncLoading(false);
      }
      return;
    }

    lastImmediateApiCheckRef.current = now;

    try {
      const res = await fetch(`${BACKEND_URL}/flights/check-schedule-and-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || json.success === false) {
        throw new Error(json.detail || json.message || "Schedule Flight API 즉시 확인 실패");
      }

      const result = json as BackendScheduleCheckResult;
      await syncFlightAlertHistoryFromCheck(result, "API 즉시 확인");
      await syncLatestScheduleFromServer(false);
      await fetchIncheonApiUsage();

      if (showNotice) {
        const changed = result.changed ?? 0;
        const sent = result.sent ?? 0;
        const checkedAt = getCurrentSyncLabel();
        setScheduleSyncCheckedAt(checkedAt);
        const message =
          changed > 0
            ? `API 동기화 완료 · 변경 ${changed}건 · 푸시 ${sent}건 · ${checkedAt}`
            : `API 동기화 완료 · 변경 없음 · ${checkedAt}`;
        setScheduleApiSyncStatus(message);
        setNotice(message);
      }
    } catch (error) {
      await syncLatestScheduleFromServer(false);

      if (showNotice) {
        const checkedAt = getCurrentSyncLabel();
        const rawMessage = error instanceof Error ? error.message : "Schedule Flight API 즉시 확인 중 오류가 발생했습니다.";
        const friendlyMessage = rawMessage.includes("429")
          ? "429 한도 초과 또는 일시 제한"
          : rawMessage;
        const message = `API 즉시 확인 실패 · ${friendlyMessage} · ${checkedAt}`;
        setScheduleApiSyncStatus(message);
        setScheduleSyncCheckedAt(checkedAt);
        setNotice(message);
      }
    } finally {
      if (showLoading) {
        setScheduleApiSyncLoading(false);
      }
    }
  };

  const handleRefreshLatestSchedule = () => {
    void checkScheduleApiAndSync(true, true);
  };


  async function fetchIncheonApiUsage() {
    try {
      const res = await fetch(`${BACKEND_URL}/flights/incheon-api-usage`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || json.success === false) return;

      const departure = Number(json.departure || 0);
      const arrival = Number(json.arrival || 0);
      const total = Number(json.total || departure + arrival);
      const departureRate = Number(json.departureRate || 0);
      const arrivalRate = Number(json.arrivalRate || 0);
      const totalRate = Number(json.totalRate || departureRate + arrivalRate);

      setIncheonApiUsage({
        departure,
        arrival,
        total,
        departureRate,
        arrivalRate,
        totalRate,
        warning: Boolean(json.warning),
        lastCalledAt: json.lastCalledAt,
      });
    } catch {
      // 사용량 조회 실패 시 화면만 조용히 유지합니다.
    }
  }
  const {
    autoPushEnabled,
    autoPushLoading,
    autoPushStatusMessage,
    fetchAutoPushStatus,
    handleCheckScheduleAndPush,
    handleEnablePwaPush,
    handleSendTestPush,
    handleToggleAutoPush,
    pwaCheckLoading,
    pwaLoading,
    pwaPermissionLabel,
    pwaStatusMessage,
    pwaTestLoading,
    syncPwaPermissionAndSubscription,
  } = usePwaPush({ fetchIncheonApiUsage, handleLoadServerFlightAlertHistory, syncFlightAlertHistoryFromCheck, syncLatestScheduleFromServer });

  async function fetchWeather(force = false) {
    setWeatherLoading(true);
    try {
      // 갱신 버튼은 서버 캐시를 건너뛰고(refresh=true) 새로 조회합니다.
      const res = await fetch(`${BACKEND_URL}/weather/current${force ? "?refresh=true" : ""}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.message || json?.detail || `날씨 조회 오류 (${res.status})`);
      }

      setWeather({
        ...DEFAULT_WEATHER,
        ...json,
        success: json?.success !== false,
      });
    } catch (error) {
      setWeather({
        success: false,
        source: "unavailable",
        message: "날씨 정보를 불러오지 못했습니다. 서버 응답이 없거나 지연되고 있습니다. 잠시 후 갱신해 주세요.",
      });
    } finally {
      setWeatherLoading(false);
    }
  }

  const openNaverWeather = () => {
    window.open(
      "https://search.naver.com/search.naver?query=%EC%A4%91%EA%B5%AC%20%EC%9A%B4%EC%84%9C%EB%8F%99%20%EB%82%A0%EC%94%A8",
      "_blank",
      "noopener,noreferrer",
    );
  };


  const saveCurrentDailyDraft = (status: "normal" | "issue" = dailyStatus) => {
    const nextAuthor = normalizeDailyAuthor(author);
    if (nextAuthor !== author) setAuthor(nextAuthor);
    markDailyLocalEdit();
    saveImages(images);
    saveNote(note);
    saveDailyDraft({
      note,
      status,
      author: nextAuthor,
      workDate: dailyWorkDate,
      savedAt: new Date().toISOString(),
    });
  };

  const saveCurrentIssueDraft = (status: "normal" | "issue" = "issue") => {
    saveIssueDraft({
      flight: issueFlight,
      route: issueRoute,
      hlnbr: issueHlnbr,
      text: issueText,
      status,
      author: normalizeDailyAuthor(author),
      savedAt: new Date().toISOString(),
    });
  };

  const handleSaveIssueDraft = () => {
    saveCurrentDailyDraft("issue");
    saveCurrentIssueDraft("issue");
    void handleSaveDailyTextToSupabase();
    setNotice("특이사항을 임시 저장했습니다. 앱을 다시 열어도 입력 내용이 유지됩니다.");
  };

  const handleSaveDailyDraft = () => {
    saveCurrentDailyDraft(dailyStatus);

    if (dailyStatus === "issue") {
      saveCurrentIssueDraft("issue");
    }

    void handleSaveDailyTextToSupabase();

    setNotice(
      dailyStatus === "normal"
        ? "일일 업무 기록을 임시 저장했습니다. 앱을 다시 열어도 유지됩니다."
        : "일일 업무 기록과 특이사항 입력 내용을 임시 저장했습니다. 앱을 다시 열어도 유지됩니다.",
    );
  };

  // 1.5초 디바운스 자동 저장 효과
  useEffect(() => {
    if (!draftHydrated) return;

    const currentImagesJson = JSON.stringify(images);
    const nextAuthor = normalizeDailyAuthor(author);
    const hasChanged =
      dailyStatus !== lastSavedValuesRef.current.status ||
      nextAuthor !== lastSavedValuesRef.current.author ||
      note !== lastSavedValuesRef.current.note ||
      currentImagesJson !== lastSavedValuesRef.current.imagesJson ||
      dailyWorkDate !== lastSavedValuesRef.current.workDate;

    if (!hasChanged) return;

    const timer = setTimeout(() => {
      void (async () => {
        setIsDailyTextSyncing(true);
        setDailyTextSyncStatus("Supabase 자동 저장 중...");
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
          if (response.ok && json?.success) {
            lastSavedValuesRef.current = {
              status: dailyStatus,
              author: nextAuthor,
              note,
              imagesJson: currentImagesJson,
              workDate: dailyWorkDate,
            };
            setDailyTextSyncStatus("Supabase 자동 저장 완료");
          } else {
            setDailyTextSyncStatus("자동 저장 실패");
          }
        } catch (error) {
          console.error("Auto save error:", error);
          setDailyTextSyncStatus("자동 저장 오류");
        } finally {
          setIsDailyTextSyncing(false);
        }
      })();
    }, 1500);

    return () => clearTimeout(timer);
  }, [dailyStatus, author, note, images, dailyWorkDate, draftHydrated]);

  // 특이사항 하나를 Notion에 저장한 뒤 다음 특이사항을 쓰려고 입력칸과 저장 연결만 비운다(일일 보고는 그대로).
  const handleStartNewIssue = () => {
    if (!issueNotionRecord && (issueText.trim() || issueFlight.trim())) {
      const ok = window.confirm("Notion에 저장하지 않은 특이사항 입력 내용이 있습니다. 비우고 새로 작성할까요?");
      if (!ok) return;
    }
    setIssueFlight("");
    setIssueRoute("");
    setIssueHlnbr("");
    setIssueText("");
    setIssueNotionRecord(null);
    setImages((prev) => prev.filter((image) => image.type !== ISSUE_IMAGE_SLOT.key));
    clearIssueDraft();
    clearIssueNotionRecord();
    setNotice("새 특이사항을 작성할 수 있게 입력칸을 비웠습니다. 일일 보고 내용은 그대로입니다.");
  };

  const handleResetLocalDraft = () => {
    const confirmed = window.confirm(
      "앱 화면에 남아 있는 사진, 메모, Notion 저장 연결 상태를 초기화합니다.\n\nNotion DB에 이미 저장된 기록은 삭제되지 않습니다.\n초기화 후에는 이 화면에서 해당 Notion 기록을 수정/삭제할 수 없습니다.\n\n계속할까요?",
    );

    if (!confirmed) return;

    setImages([]);
    setNote("");
    setIssueFlight("");
    setIssueRoute("");
    setIssueHlnbr("");
    setIssueText("");
    setDailyStatus("normal");
    carryOverDateRef.current = "";
    setDailyWorkDate(getTodayDateInputValue());
    setDailyNotionRecord(null);
    setIssueNotionRecord(null);

    saveImages([]);
    saveNote("");
    clearDailyDraft();
    clearIssueDraft();
    clearDailyNotionRecord();
    clearIssueNotionRecord();

    setNotice("앱 화면만 초기화했습니다. Notion DB 기록은 삭제되지 않았습니다.");
  };

  const openNotionDatabase = async (target: "daily" | "issue") => {
    try {
      const result = await getNotionLinks();
      const url = target === "daily" ? result.dailyDbUrl : result.issueDbUrl;

      if (!url) {
        setNotice("열 수 있는 Notion DB 링크가 없습니다.");
        return;
      }

      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Notion DB 링크를 여는 중 오류가 발생했습니다.");
    }
  };

  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <div style={eyebrowStyle}>CARGO OPS</div>
        <h1 style={titleStyle}>KJ 화물기 출도착 모니터링</h1>
        <div style={datePillStyle}>
          <span>{todayText}</span>
          <span style={datePillSubStyle}>
            {formatHeaderApiUsageText(incheonApiUsage)}
            {incheonApiUsage?.warning ? " ⚠️" : ""}
          </span>
        </div>
        <WeatherCard
          weather={weather}
          weatherLoading={weatherLoading}
          onRefresh={() => void fetchWeather(true)}
          onOpenNaver={openNaverWeather}
        />

      </section>

      <section style={stackStyle}>
        <FlightAlertHistoryCard
          historyItems={flightAlertHistory}
          serverLoading={serverFlightAlertLoading}
          serverStatus={serverFlightAlertStatus}
          summaryCount={serverFlightAlertChangeCount}
          detailsVisible={flightAlertDetailsVisible}
          onDeleteItem={handleDeleteFlightAlertHistoryItem}
          onClear={handleClearFlightAlertHistory}
          onLoadServerHistory={handleRevealServerFlightAlertHistory}
        />

        <ScheduleSummaryCard
          latestRoom={latestRoom}
          syncCheckedAt={scheduleSyncCheckedAt}
          apiSyncStatus={scheduleApiSyncStatus}
          apiSyncLoading={scheduleApiSyncLoading}
          flightDeleting={scheduleFlightDeleting}
          onOpenScheduleFlight={openScheduleFlight}
          onRefreshLatestSchedule={handleRefreshLatestSchedule}
          flightAlertHistory={flightAlertHistory}
          onDeleteAlertHistoryItem={handleDeleteFlightAlertHistoryItem}
          onUpdateAfocsSkd={handleUpdateAfocsSkd}
          onDeleteFlight={handleDeleteFlightFromSchedule}
          csmReport={{ text: note, workDate: dailyWorkDate }}
        />

        <ActionCard
          label="오늘 KJ 화물기 조회"
          title="편명조회"
          description="개별 편명 확인과 KJ 전체 조회를 진행합니다. AFOCS SKD는 위 Scheduled Flight 카드에서 MM.DD·HH:mm으로 수정할 수 있습니다."
          buttonLabel="편명조회 열기"
          onClick={openFlights}
          accent="#2563eb"
        />

        <PwaNotificationCard
          permissionLabel={pwaPermissionLabel}
          statusMessage={pwaStatusMessage}
          loading={pwaLoading}
          testLoading={pwaTestLoading}
          checkLoading={pwaCheckLoading}
          autoEnabled={autoPushEnabled}
          autoLoading={autoPushLoading}
          autoStatusMessage={autoPushStatusMessage}
          onEnable={handleEnablePwaPush}
          onSendTest={handleSendTestPush}
          onCheckSchedule={handleCheckScheduleAndPush}
          onToggleAuto={handleToggleAutoPush}
        />

        <DailyRecordCard
          dailyStatus={dailyStatus}
          setDailyStatus={setDailyStatus}
          dailyWorkDate={dailyWorkDate}
          dailyWorkDateTitle={dailyWorkDateTitle}
          setDailyWorkDate={handleDailyWorkDateChange}
          resetDailyWorkDateToToday={resetDailyWorkDateToToday}
          workDateMismatchWarning={workDateMismatchWarning}
          images={images}
          imageSlots={IMAGE_SLOTS}
          getImageBySlot={getImageBySlot}
          openCamera={openCamera}
          openPhotoLibrary={openPhotoLibrary}
          openLatestImage={openLatestImage}
          handleDeleteImageSlot={handleDeleteImageSlot}
          handleDeleteSingleImage={handleDeleteSingleImage}
          cameraInputRef={cameraInputRef}
          libraryInputRef={libraryInputRef}
          handleImageSelected={handleImageSelected}
          handlePastedImage={handlePastedImage}
          author={author}
          setAuthor={(value) => {
            markDailyLocalEdit();
            setAuthor(value.trim() ? value : DEFAULT_DAILY_AUTHOR);
          }}
          note={note}
          setNote={(value) => {
            markDailyLocalEdit();
            setNote(value);
          }}
          dailyNotionRecord={dailyNotionRecord}
          dailyNotionCheck={dailyNotionCheck}
          isDailySaving={isDailySaving}
          isDailyTextSyncing={isDailyTextSyncing}
          dailyTextSyncStatus={dailyTextSyncStatus}
          handleSaveDailyTextToSupabase={handleSaveDailyTextToSupabase}
          handleLoadDailyTextFromSupabase={handleLoadDailyTextFromSupabase}
          handleSaveDailyDraft={handleSaveDailyDraft}
          handleSaveDailyToNotion={handleSaveDailyToNotion}
          handleUpdateDailyToNotion={handleUpdateDailyToNotion}
          handleDeleteDailyFromNotion={handleDeleteDailyFromNotion}
          openDailyNotionPage={openDailyNotionPage}
          openNotionDatabase={openNotionDatabase}
          handleResetLocalDraft={handleResetLocalDraft}
        />

        {dailyStatus === "issue" && (
          <IssueRecordCard
            issueImageSlot={ISSUE_IMAGE_SLOT}
            issueImage={getImageBySlot(images, ISSUE_IMAGE_SLOT.key)}
            issueImages={getImagesBySlot(images, ISSUE_IMAGE_SLOT.key)}
            openCamera={() => openCamera(ISSUE_IMAGE_SLOT.key)}
            openPhotoLibrary={() => openPhotoLibrary(ISSUE_IMAGE_SLOT.key)}
            openLatestImage={openLatestImage}
            handleDeleteImageSlot={() => handleDeleteImageSlot(ISSUE_IMAGE_SLOT.key)}
            handleDeleteSingleImage={handleDeleteSingleImage}
            handlePastedImage={(file) => handlePastedImage(ISSUE_IMAGE_SLOT.key, file)}
            todayText={todayText}
            currentTimeText={getCurrentTimeText()}
            issueFlight={issueFlight}
            setIssueFlight={setIssueFlight}
            issueRoute={issueRoute}
            setIssueRoute={setIssueRoute}
            issueHlnbr={issueHlnbr}
            setIssueHlnbr={setIssueHlnbr}
            author={author}
            setAuthor={(value) => {
              markDailyLocalEdit();
              setAuthor(value.trim() ? value : DEFAULT_DAILY_AUTHOR);
            }}
            weatherSummary={getWeatherSummary(weather)}
            issueText={issueText}
            setIssueText={setIssueText}
            issueNotionRecord={issueNotionRecord}
            isIssueSaving={isIssueSaving}
            handleStartNewIssue={handleStartNewIssue}
            handleSaveIssueDraft={handleSaveIssueDraft}
            handleSaveIssueToNotion={handleSaveIssueToNotion}
            handleUpdateIssueToNotion={handleUpdateIssueToNotion}
            handleDeleteIssueFromNotion={handleDeleteIssueFromNotion}
            openIssueNotionPage={openIssueNotionPage}
            openNotionDatabase={openNotionDatabase}
            handleResetLocalDraft={handleResetLocalDraft}
          />
        )}

        {notice && (
          <div
            style={
              notice.includes("다른 날짜") || notice.includes("업무일자")
                ? noticeDangerStyle
                : noticeStyle
            }
          >
            {notice}
          </div>
        )}
      </section>

      <ImageViewerModal
        image={imageViewerImage}
        title={imageViewerSlotInfo?.title}
        description={imageViewerSlotInfo?.description}
        onClose={closeImageViewer}
        onCameraChange={handleViewerCameraChange}
        onLibraryChange={handleViewerLibraryChange}
        onDelete={handleViewerDelete}
        onSaveAnnotatedImage={handleSaveAnnotatedImage}
        onSaveImageMemo={handleSaveImageMemo}
      />

      <footer style={footerStyle}>by jkpark · {APP_VERSION} · {APP_VERSION_DATE}</footer>
    </main>
  );
}
