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
  clearFlightAlertHistory,
  clearFlightAlertSnapshot,
  type FlightAlertHistoryItem,
  type FlightAlertSnapshot,
  getCurrentTimeLabel,
  loadFlightAlertHistory,
  loadFlightAlertSnapshot,
  mergeFlightAlertHistoryItems,
  saveFlightAlertHistory,
  saveFlightAlertSnapshot,
} from "./lib/flight-alerts";
import {
  clearDailyDraft,
  clearDailyNotionRecord,
  clearIssueDraft,
  clearIssueNotionRecord,
  DEFAULT_DAILY_AUTHOR,
  getLastDailySaveSignature,
  getLastIssueSaveSignature,
  loadDailyDraft,
  loadDailyNotionRecordForDate,
  loadImages,
  loadIssueDraft,
  loadIssueNotionRecord,
  loadNote,
  normalizeDailyAuthor,
  saveDailyDraft,
  saveDailyNotionRecordForDate,
  saveImages,
  saveIssueDraft,
  saveIssueNotionRecord,
  saveLastDailySaveSignature,
  saveLastIssueSaveSignature,
  saveNote,
} from "./lib/local-storage";
import {
  deleteDailyRecord,
  deleteIssueRecord,
  findDailyRecordByDate,
  getNotionLinks,
  saveDailyRecord,
  saveIssueRecord,
  updateDailyRecord,
  updateIssueRecord,
} from "./lib/notion-api";
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
import {
  BackendScheduleChange,
  BackendScheduleCheckResult,
  DailyNotionRecord,
  ImageSlotKey,
  IncheonApiUsage,
  IssueNotionRecord,
  SavedImage,
  WeatherInfo,
} from "./home/types";
import {
  APP_VERSION,
  APP_VERSION_DATE,
  DEFAULT_WEATHER,
  IMAGE_SLOT_PROPERTY_NAME,
  IMAGE_SLOTS,
  ISSUE_IMAGE_SLOT,
} from "./home/constants";
import {
  formatDailyStatusLabel,
  formatDateForTitle,
  formatDateInputForTitle,
  formatHeaderApiUsageText,
  getCurrentSyncLabel,
  getCurrentTimeText,
  getDailyWorkDateIso,
  getHlnbrByFlight,
  getImageBySlot,
  getImagesBySlot,
  getInitialDailyWorkDate,
  getLatestScheduleRoom,
  getLocalLatestScheduleRoom,
  getRouteByFlight,
  getTodayDateInputValue,
  getWeatherSummary,
  getWorkDateMismatchMessage,
  readImageFileMetadata,
  removeImageBySlot,
  resizeImageDataUrl,
  saveDailyWorkDate,
  upsertImageBySlot,
  urlBase64ToUint8Array,
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

export default function HomePage() {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);
  const dailySavingRef = useRef(false);
  const issueSavingRef = useRef(false);
  const pendingImageSlotRef = useRef<ImageSlotKey>("daily-schedule");
  const lastImmediateApiCheckRef = useRef(0);
  const linkedScheduleSlotRef = useRef<ScheduleSlotKey>("active");
  const [rooms, setRooms] = useState<MonitorRoom[]>([]);
  const [images, setImages] = useState<SavedImage[]>([]);
  const [imageViewerImage, setImageViewerImage] = useState<SavedImage | null>(null);
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");
  const [pwaPermissionLabel, setPwaPermissionLabel] = useState("확인 전");
  const [pwaStatusMessage, setPwaStatusMessage] = useState("");
  const [pwaLoading, setPwaLoading] = useState(false);
  const [pwaTestLoading, setPwaTestLoading] = useState(false);
  const [pwaCheckLoading, setPwaCheckLoading] = useState(false);
  const [autoPushEnabled, setAutoPushEnabled] = useState(false);
  const [autoPushLoading, setAutoPushLoading] = useState(false);
  const [autoPushStatusMessage, setAutoPushStatusMessage] = useState("");
  const [scheduleSyncCheckedAt, setScheduleSyncCheckedAt] = useState("");
  const [scheduleApiSyncStatus, setScheduleApiSyncStatus] = useState("");
  const [scheduleApiSyncLoading, setScheduleApiSyncLoading] = useState(false);
  const [scheduleFlightDeleting, setScheduleFlightDeleting] = useState(false);
  const [incheonApiUsage, setIncheonApiUsage] = useState<IncheonApiUsage | null>(null);
  const [isDailySaving, setIsDailySaving] = useState(false);
  const [isIssueSaving, setIsIssueSaving] = useState(false);
  const [isDailyTextSyncing, setIsDailyTextSyncing] = useState(false);
  const [dailyTextSyncStatus, setDailyTextSyncStatus] = useState("");
  const [weather, setWeather] = useState<WeatherInfo>(DEFAULT_WEATHER);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [, setAlertCheckedAt] = useState("");
  const [flightAlertSnapshot, setFlightAlertSnapshot] =
    useState<FlightAlertSnapshot | null>(null);
  const [flightAlertHistory, setFlightAlertHistory] =
    useState<FlightAlertHistoryItem[]>([]);
  const [flightAlertDetailsVisible, setFlightAlertDetailsVisible] = useState(false);
  const [serverFlightAlertChangeCount, setServerFlightAlertChangeCount] = useState(0);
  const [serverFlightAlertLoading, setServerFlightAlertLoading] = useState(false);
  const [serverFlightAlertStatus, setServerFlightAlertStatus] = useState("");
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

  // Supabase 이미지 전송 중 플래그 → 자동 싱크 이미지 덮어쓰기 방지
  const imagesSavingRef = useRef(false);

  const [issueFlight, setIssueFlight] = useState("");
  const [issueRoute, setIssueRoute] = useState("");
  const [issueHlnbr, setIssueHlnbr] = useState("");
  const [issueText, setIssueText] = useState("");
  const [dailyNotionRecord, setDailyNotionRecord] =
    useState<DailyNotionRecord | null>(null);
  const [dailyNotionCheck, setDailyNotionCheck] =
    useState<"checking" | "verified" | "unverified">("unverified");
  const [issueNotionRecord, setIssueNotionRecord] =
    useState<IssueNotionRecord | null>(null);
  const todayText = useMemo(() => formatDateForTitle(new Date()), []);
  const [dailyWorkDate, setDailyWorkDate] = useState(() => getInitialDailyWorkDate());
  const dailyWorkDateTitle = useMemo(
    () => formatDateInputForTitle(dailyWorkDate),
    [dailyWorkDate],
  );
  const [draftHydrated, setDraftHydrated] = useState(false);
  const latestRoom = useMemo(() => {
    const currentRoom = getLatestScheduleRoom(rooms);
    // rows(AFOCS 포함)는 React state를 우선하고, 등록번호만 로컬 보조 맵을 적용합니다.
    return mergeScheduleRegistrationIntoRoom(currentRoom, getLocalLatestScheduleRoom());
  }, [rooms]);

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

  const markDailyLocalEdit = () => {
    dailyLocalEditAtRef.current = Date.now();
  };

  const systemTodayDate = getTodayDateInputValue();
  const workDateMismatchWarning = getWorkDateMismatchMessage(dailyWorkDate, systemTodayDate);

  const handleDailyWorkDateChange = (value: string) => {
    setDailyWorkDate(value || getTodayDateInputValue());
  };

  const resetDailyWorkDateToToday = () => {
    setDailyWorkDate(getTodayDateInputValue());
  };

  useEffect(() => {
    setRooms(
      loadRooms().map((room) =>
        room.fixed ? (mergeScheduleRegistrationIntoRoom(room, room) as MonitorRoom) : room,
      ),
    );
    const savedDailyDraft = loadDailyDraft();
    const savedIssueDraft = loadIssueDraft();

    setImages(loadImages());
    setNote(savedDailyDraft?.note ?? loadNote());
    setIssueNotionRecord(loadIssueNotionRecord());

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

    if (savedIssueDraft) {
      setIssueFlight(savedIssueDraft.flight);
      setIssueRoute(savedIssueDraft.route);
      setIssueHlnbr(savedIssueDraft.hlnbr);
      setIssueText(savedIssueDraft.text);
      if (savedIssueDraft.author) {
        setAuthor(normalizeDailyAuthor(savedIssueDraft.author));
      }
      if (savedIssueDraft.status === "issue" || savedIssueDraft.text.trim()) {
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
    if (!latestRoom) return;
    if (flightAlertSnapshot?.roomId === latestRoom.id) return;

    const nextSnapshot = buildFlightAlertSnapshot(latestRoom);
    if (!nextSnapshot) return;

    setFlightAlertSnapshot(nextSnapshot);
    saveFlightAlertSnapshot(nextSnapshot);
    setAlertCheckedAt(nextSnapshot.savedAt);
  }, [latestRoom?.id, flightAlertSnapshot?.roomId]);

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

  const handleDeleteFlightAlertHistoryItem = async (targetItem: FlightAlertHistoryItem) => {
    const nextItems = flightAlertHistory.filter((item) => {
      const itemKey = `${item.key}|${item.title}|${item.description}|${item.checkedAt}`;
      const targetKey = `${targetItem.key}|${targetItem.title}|${targetItem.description}|${targetItem.checkedAt}`;
      return itemKey !== targetKey;
    });

    setFlightAlertHistory(nextItems);
    setServerFlightAlertChangeCount(nextItems.length);
    if (nextItems.length === 0) {
      setFlightAlertDetailsVisible(false);
    }
    saveFlightAlertHistory(nextItems);
    setServerFlightAlertStatus("선택한 알림을 삭제하는 중입니다.");

    try {
      await deleteServerFlightAlertHistoryItem(targetItem);
      setServerFlightAlertStatus("선택한 알림을 앱과 서버 이력에서 삭제했습니다.");
    } catch (error) {
      setServerFlightAlertStatus(
        error instanceof Error
          ? `앱에서는 삭제했지만 서버 이력 삭제 실패: ${error.message}`
          : "앱에서는 삭제했지만 서버 이력 삭제 중 오류가 발생했습니다.",
      );
    }
  };

  const handleClearFlightAlertHistory = async () => {
    const confirmed = window.confirm("출도착 알림 이력을 모두 삭제할까요? 앱 알림과 서버 미처리 이력이 함께 정리됩니다.");
    if (!confirmed) return;

    setServerFlightAlertLoading(true);
    setServerFlightAlertStatus("출도착 알림 이력을 전체 삭제하는 중입니다.");

    try {
      setFlightAlertHistory([]);
      setServerFlightAlertChangeCount(0);
      setFlightAlertDetailsVisible(false);
      setFlightAlertSnapshot(null);
      clearFlightAlertHistory();
      clearFlightAlertSnapshot();
      const clearResult = await clearServerFlightAlertHistory();
      if (latestRoom) {
        const nextSnapshot = buildFlightAlertSnapshot(latestRoom);
        if (nextSnapshot) {
          setFlightAlertSnapshot(nextSnapshot);
          saveFlightAlertSnapshot(nextSnapshot);
        }
      }
      setServerFlightAlertStatus(`알림 이력을 전체 삭제했습니다. 서버 이력 ${clearResult.cleared ?? 0}건 정리`);
    } catch (error) {
      setServerFlightAlertStatus(
        error instanceof Error
          ? `앱 이력은 삭제했지만 서버 이력 정리 실패: ${error.message}`
          : "앱 이력은 삭제했지만 서버 이력 정리 중 오류가 발생했습니다.",
      );
    } finally {
      setServerFlightAlertLoading(false);
    }
  };



  const normalizeAlertText = (value?: string) => {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/\s*·\s*/g, " · ")
      .trim();
  };

  const normalizeAlertRoute = (value?: string) => {
    return String(value || "")
      .replace(/\s+/g, "")
      .replace(/-/g, "→")
      .replace(/>/g, "→")
      .toUpperCase()
      .trim();
  };

  const pickAlertText = (value: Record<string, unknown>, keys: string[]) => {
    for (const key of keys) {
      const raw = value[key];
      if (raw === undefined || raw === null) continue;
      const text = normalizeAlertText(String(raw));
      if (text) return text;
    }
    return "";
  };

  const buildValueChangeText = (label: string, beforeValue: string, afterValue: string) => {
    if (beforeValue && afterValue && beforeValue !== afterValue) {
      return `${label} ${beforeValue} → ${afterValue}`;
    }
    if (afterValue) return `${label} ${afterValue}`;
    return "";
  };

  const getReadableChangeKind = (changeText: string) => {
    if (/착륙|도착|상태|remark|REMARK/i.test(changeText)) return "상태 변경";
    if (/게이트|gate/i.test(changeText)) return "게이트 변경";
    if (/터미널|terminal/i.test(changeText)) return "터미널 변경";
    if (/운항시각|시간|예정|estimated|schedule/i.test(changeText)) return "운항시각 변경";
    return "운항 정보 변경";
  };

  const buildDetailedAlertDescription = (
    change: BackendScheduleChange | Record<string, unknown>,
    sourceLabel = "API 확인",
  ) => {
    const value = change as Record<string, unknown>;
    const route = normalizeAlertRoute(
      String(value.route || value.routeText || value.segment || ""),
    );

    const changes = Array.isArray(value.changes)
      ? value.changes.map((item) => normalizeAlertText(String(item))).filter(Boolean)
      : [];

    const directText = pickAlertText(value, [
      "description",
      "message",
      "detail",
      "changeText",
      "change",
      "reason",
      "statusText",
    ]);

    const oldTime = pickAlertText(value, ["oldTime", "beforeTime", "previousTime", "oldEta", "beforeEta", "oldScheduleTime"]);
    const newTime = pickAlertText(value, ["newTime", "afterTime", "currentTime", "newEta", "afterEta", "newScheduleTime"]);
    const oldGate = pickAlertText(value, ["oldGate", "beforeGate", "previousGate"]);
    const newGate = pickAlertText(value, ["newGate", "afterGate", "currentGate", "gate", "gatenumber"]);
    const oldStatus = pickAlertText(value, ["oldStatus", "beforeStatus", "previousStatus"]);
    const newStatus = pickAlertText(value, ["newStatus", "afterStatus", "currentStatus", "status", "remark"]);
    const oldValue = pickAlertText(value, ["oldValue", "before", "previous"]);
    const newValue = pickAlertText(value, ["newValue", "after", "current"]);

    const detailParts = [
      ...changes,
      directText,
      buildValueChangeText("기존/변경", oldTime || oldValue, newTime || newValue),
      buildValueChangeText("게이트", oldGate, newGate),
      buildValueChangeText("상태", oldStatus, newStatus),
    ]
      .map(normalizeAlertText)
      .filter(Boolean);

    const uniqueDetailParts = Array.from(new Set(detailParts));
    const changeSummary = uniqueDetailParts.length
      ? uniqueDetailParts.join(" · ")
      : "운항 정보 변경";

    return [route, changeSummary, sourceLabel]
      .map(normalizeAlertText)
      .filter(Boolean)
      .join(" · ");
  };

  const buildDetailedAlertTitle = (change: BackendScheduleChange | Record<string, unknown>) => {
    const value = change as Record<string, unknown>;
    const flight = normalizeAlertText(String(value.flight || value.flightId || value.flightNo || "Schedule Flight"));
    const rawText = buildDetailedAlertDescription(value, "");
    const kind = getReadableChangeKind(rawText);

    return `${flight} ${kind}`;
  };

  const mapServerNotificationHistory = (rawItems: unknown): FlightAlertHistoryItem[] => {
    const items = Array.isArray(rawItems) ? rawItems : [];

    return items.slice(0, 20).map((item, index) => {
      const value = item as Record<string, unknown>;
      const flight =
        String(value.flight || value.flightId || value.flightNo || "").trim();
      const title =
        String(value.title || "").trim() ||
        buildDetailedAlertTitle(value);
      const route = normalizeAlertRoute(String(value.route || value.routeText || ""));
      const description = String(
        value.description ||
          value.message ||
          value.detail ||
          value.changeText ||
          value.status ||
          "",
      ).trim() || buildDetailedAlertDescription(
        {
          ...value,
          route: route || value.route,
        },
        "",
      );
      const checkedAt =
        String(value.checkedAt || value.createdAt || value.savedAt || value.timestamp || value.time || "");
      const roomName =
        String(value.roomName || value.room || value.source || "서버 알림 이력");
      const originalKey = String(value.key || "").trim();

      return {
        // 서버 원본 key를 유지해야 개별 삭제가 서버와 일치합니다.
        key: originalKey || `server-${checkedAt || Date.now()}-${index}-${flight || title}`,
        title: title || (route ? `${flight} ${route}` : flight) || "Schedule Flight 변경",
        description,
        checkedAt: checkedAt || getCurrentTimeLabel(),
        roomName,
      };
    });
  };


  const syncFlightAlertHistoryFromCheck = async (
    result: BackendScheduleCheckResult,
    sourceLabel: string,
  ) => {
    const changed = result.changed ?? 0;
    if (changed <= 0) return;

    const beforeCount = loadFlightAlertHistory().length;
    await handleLoadServerFlightAlertHistory(false);
    const afterItems = loadFlightAlertHistory();

    // 서버 append가 아직 반영되지 않은 경우에만 로컬 fallback 저장
    if (afterItems.length <= beforeCount) {
      appendBackendFlightAlertHistory(result, sourceLabel);
    }
  };

  const deleteServerFlightAlertHistoryItem = async (item: FlightAlertHistoryItem) => {
    const res = await fetch(`${BACKEND_URL}/flights/notification-history/delete-item`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        key: item.key,
        title: item.title,
        description: item.description,
        checkedAt: item.checkedAt,
        roomName: item.roomName,
      }),
    });
    const json = await res.json();

    if (!res.ok || json.success === false) {
      throw new Error(json.detail || json.message || "서버 알림 이력 개별 삭제 실패");
    }

    return json as { success?: boolean; deleted?: number };
  };

  const clearServerFlightAlertHistory = async () => {
    const res = await fetch(`${BACKEND_URL}/flights/notification-history`, {
      method: "DELETE",
      cache: "no-store",
    });
    const json = await res.json();

    if (!res.ok || json.success === false) {
      throw new Error(json.detail || json.message || "서버 알림 이력 삭제 실패");
    }

    return json as { success?: boolean; cleared?: number };
  };

  const handleLoadServerFlightAlertHistory = async (showStatus = true) => {
    if (showStatus) {
      setServerFlightAlertLoading(true);
      setServerFlightAlertStatus("서버 미처리 이력을 확인하는 중입니다.");
    }

    try {
      const res = await fetch(`${BACKEND_URL}/flights/notification-history`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || json.success === false) {
        throw new Error(json.detail || json.message || "서버 알림 이력 조회 실패");
      }

      const rawItems = json.items || json.history || json.notifications || json.data || [];
      const serverItems = mapServerNotificationHistory(rawItems);
      const localItems = loadFlightAlertHistory();
      // 서버가 비어 있어도 로컬 이력을 지우지 않습니다. (/tmp 재시작·재배포 유실 대비)
      const nextItems =
        serverItems.length > 0
          ? mergeFlightAlertHistoryItems(serverItems, localItems)
          : localItems;

      setFlightAlertHistory(nextItems);
      setServerFlightAlertChangeCount(nextItems.length);
      saveFlightAlertHistory(nextItems);

      const addedCount = Math.max(0, nextItems.length - localItems.length);

      if (showStatus) {
        setServerFlightAlertStatus(
          serverItems.length > 0
            ? `서버 미처리 이력 ${serverItems.length}건 확인 · 출도착 알림 이력에 자동 표시 · 신규 ${addedCount}건`
            : localItems.length > 0
              ? `서버 이력 없음 · 앱 저장 이력 ${localItems.length}건 유지`
              : "서버 미처리 이력이 없습니다.",
        );
      } else if (addedCount > 0) {
        setServerFlightAlertStatus(
          `서버 알림 ${addedCount}건을 출도착 알림 이력에 자동 반영했습니다.`,
        );
      }
    } catch (error) {
      if (showStatus) {
        setServerFlightAlertStatus(
          error instanceof Error
            ? error.message
            : "서버 알림 이력을 불러오는 중 오류가 발생했습니다.",
        );
      }
    } finally {
      if (showStatus) {
        setServerFlightAlertLoading(false);
      }
    }
  };

  const appendBackendFlightAlertHistory = (result: BackendScheduleCheckResult, sourceLabel = "API 확인") => {
    const changes = Array.isArray(result.changes) ? result.changes : [];

    if (!changes.length) return;

    const checkedAt = getCurrentTimeLabel();
    const historyItems: FlightAlertHistoryItem[] = changes.slice(0, 10).map((item, index) => {
      const flight = item.flight || "Schedule Flight";
      const route = normalizeAlertRoute(item.route || "");
      const title = buildDetailedAlertTitle(item);
      const description = buildDetailedAlertDescription(
        {
          ...item,
          route,
        },
        sourceLabel,
      );

      return {
        key: `backend-${Date.now()}-${index}-${flight}`,
        title: title || (route ? `${flight} ${route}` : flight),
        description,
        checkedAt,
        roomName: latestRoom?.name || "Schedule Flight",
      };
    });

    const currentHistory = loadFlightAlertHistory();
    const nextHistory = mergeFlightAlertHistoryItems(historyItems, currentHistory);
    setFlightAlertHistory(nextHistory);
    setServerFlightAlertChangeCount(nextHistory.length);
    setFlightAlertDetailsVisible(false);
    saveFlightAlertHistory(nextHistory);
  };


  const handleRevealServerFlightAlertHistory = async () => {
    if (flightAlertDetailsVisible) {
      setFlightAlertDetailsVisible(false);
      return;
    }

    setFlightAlertDetailsVisible(true);
    await handleLoadServerFlightAlertHistory(true);
  };

  const openFlights = () => router.push("/flights");

  const openScheduleFlight = () => {
    if (latestRoom) {
      router.push("/fixed-lite");
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
      const result = await saveScheduleSlotToServer(updatedRoom, {
        rotate: false,
        slot: linkedScheduleSlotRef.current,
      });
      linkedScheduleSlotRef.current = result.linkedSlot;
      await saveLatestScheduleToServer(updatedRoom);

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
      setScheduleApiSyncStatus(
        error instanceof Error
          ? `${targetFlight} 로컬 삭제 완료 · 서버 반영 실패: ${error.message}`
          : `${targetFlight} 로컬 삭제 완료 · 서버 반영 실패`,
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

  const fetchAutoPushStatus = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/flights/auto-push/status`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || json.success === false) return;

      setAutoPushEnabled(Boolean(json.enabled));
      const modeText = json.mode === "focus" ? "집중 5분 확인" : "일반 30분 확인";
      setAutoPushStatusMessage(`${modeText} · ${json.lastMessage || ""}`);
    } catch {
      // 자동 확인 상태 조회 실패 시 화면만 조용히 유지합니다.
    }
  };

  const savePushSubscription = async (subscription: PushSubscription) => {
    const saveRes = await fetch(`${BACKEND_URL}/flights/push-subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subscription,
        userAgent: navigator.userAgent,
        deviceName: /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "iPhone/iPad PWA" : "Web browser",
      }),
    });
    const saveJson = await saveRes.json();

    if (!saveRes.ok || saveJson.success === false) {
      throw new Error(saveJson.detail || saveJson.message || "Push 구독 저장 실패");
    }

    return saveJson;
  };

  const getPushPublicKey = async () => {
    const keyRes = await fetch(`${BACKEND_URL}/flights/push-public-key`, {
      cache: "no-store",
    });
    const keyJson = await keyRes.json();

    if (!keyRes.ok || keyJson.success === false) {
      throw new Error(keyJson.detail || keyJson.message || "Push 공개키 확인 실패");
    }

    return keyJson as {
      success?: boolean;
      configured?: boolean;
      publicKey?: string;
      detail?: string;
      message?: string;
    };
  };

  const syncPwaPermissionAndSubscription = async (showMessage = false) => {
    if (typeof window === "undefined") return;

    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPwaPermissionLabel("미지원");
      if (showMessage) setPwaStatusMessage("이 브라우저에서는 PWA 푸시 알림을 지원하지 않습니다.");
      return;
    }

    const permission = Notification.permission;
    setPwaPermissionLabel(permission === "granted" ? "허용됨" : permission === "denied" ? "차단됨" : "미설정");

    if (permission !== "granted") {
      if (showMessage) {
        setPwaStatusMessage(
          permission === "denied"
            ? "알림 권한이 차단되어 있습니다. 아이폰 설정에서 알림 허용을 켜 주세요."
            : "알림 권한이 아직 허용되지 않았습니다. 알림 허용 준비를 눌러 주세요.",
        );
      }
      return;
    }

    try {
      const keyJson = await getPushPublicKey();

      if (!keyJson.configured || !keyJson.publicKey) {
        if (showMessage) setPwaStatusMessage("알림 권한은 허용됐지만, 백엔드 WEB_PUSH_PUBLIC_KEY 설정이 없습니다.");
        return;
      }

      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyJson.publicKey),
        });
      }

      await savePushSubscription(subscription);
      setPwaPermissionLabel("허용됨");

      if (showMessage) {
        setPwaStatusMessage("알림 권한과 구독 정보가 정상 연결되어 있습니다.");
      }
    } catch (error) {
      if (showMessage) {
        setPwaStatusMessage(error instanceof Error ? error.message : "PWA 알림 상태 확인 중 오류가 발생했습니다.");
      }
    }
  };

  const handleEnablePwaPush = async () => {
    if (typeof window === "undefined") return;

    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPwaPermissionLabel("미지원");
      setPwaStatusMessage("이 브라우저에서는 PWA 푸시 알림을 지원하지 않습니다.");
      return;
    }

    setPwaLoading(true);
    setPwaStatusMessage("");

    try {
      const permission = await Notification.requestPermission();
      setPwaPermissionLabel(permission === "granted" ? "허용됨" : permission === "denied" ? "차단됨" : "미설정");

      if (permission !== "granted") {
        setPwaStatusMessage("알림 권한이 허용되지 않았습니다. 아이폰 설정 또는 Safari 설정에서 알림 권한을 확인하세요.");
        return;
      }

      await syncPwaPermissionAndSubscription(true);
    } catch (error) {
      setPwaStatusMessage(error instanceof Error ? error.message : "PWA 알림 준비 중 오류가 발생했습니다.");
    } finally {
      setPwaLoading(false);
    }
  };

  const handleSendTestPush = async () => {
    setPwaTestLoading(true);

    try {
      await syncPwaPermissionAndSubscription(false);

      const res = await fetch(`${BACKEND_URL}/flights/push-test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "KJ Cargo Ops 테스트 알림",
          body: "아이폰 PWA 푸시 알림 수신 테스트입니다.",
          url: "/",
        }),
      });
      const json = await res.json();

      if (!res.ok || json.success === false) {
        throw new Error(json.detail || json.message || "테스트 알림 발송 실패");
      }

      setPwaPermissionLabel("허용됨");
      setPwaStatusMessage(`테스트 알림을 발송했습니다. 성공 ${json.sent ?? 0}건 / 실패 ${json.failed ?? 0}건`);
    } catch (error) {
      setPwaStatusMessage(error instanceof Error ? error.message : "테스트 알림 발송 중 오류가 발생했습니다.");
    } finally {
      setPwaTestLoading(false);
    }
  };

  const handleCheckScheduleAndPush = async () => {
    setPwaCheckLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/flights/check-schedule-and-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const json = await res.json();

      if (!res.ok || json.success === false) {
        throw new Error(json.detail || json.message || "Schedule Flight 변경 확인 실패");
      }

      const result = json as BackendScheduleCheckResult;
      await syncFlightAlertHistoryFromCheck(result, "수동 변경 확인");

      const changed = result.changed ?? 0;
      const sent = result.sent ?? 0;
      const failed = result.failed ?? 0;
      const checked = result.checked ?? 0;

      if (changed > 0) {
        setPwaStatusMessage(
          `Schedule Flight 변경 ${changed}건 감지. 푸시 발송 성공 ${sent}건 / 실패 ${failed}건`,
        );
        await syncLatestScheduleFromServer(false);
        await fetchIncheonApiUsage();
      } else {
        setPwaStatusMessage(`Schedule Flight 변경 없음. 재조회 대상 ${checked}건 확인 완료`);
        await syncLatestScheduleFromServer(false);
        await fetchIncheonApiUsage();
        await handleLoadServerFlightAlertHistory(false);
      }
    } catch (error) {
      setPwaStatusMessage(error instanceof Error ? error.message : "Schedule Flight 변경 확인 중 오류가 발생했습니다.");
    } finally {
      setPwaCheckLoading(false);
    }
  };

  const handleToggleAutoPush = async () => {
    setAutoPushLoading(true);

    try {
      await fetchAutoPushStatus();
      setPwaStatusMessage("자동 변경 확인 상태를 새로고침했습니다. Schedule Flight 기준으로 자동 적용됩니다.");
    } catch (error) {
      setPwaStatusMessage(error instanceof Error ? error.message : "자동 변경 확인 상태 조회 중 오류가 발생했습니다.");
    } finally {
      setAutoPushLoading(false);
    }
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

  async function fetchWeather() {
    setWeatherLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/weather/current`, {
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
        ...DEFAULT_WEATHER,
        success: false,
        source: "fallback",
        message: "날씨 API 연결 전이거나 응답이 지연되어 예시값을 표시합니다.",
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

  const openCamera = (slotKey: ImageSlotKey) => {
    pendingImageSlotRef.current = slotKey;
    cameraInputRef.current?.click();
  };

  const openPhotoLibrary = (slotKey: ImageSlotKey) => {
    pendingImageSlotRef.current = slotKey;
    libraryInputRef.current?.click();
  };

  const persistImages = (nextImages: SavedImage[], successMessage: string) => {
    setImages(nextImages);
    const saved = saveImages(nextImages);

    if (saved) {
      saveNote(note);
      saveDailyDraft({
        note,
        status: dailyStatus,
        author,
        workDate: dailyWorkDate,
        savedAt: new Date().toISOString(),
      });

      const hasIssueImage = nextImages.some((image) => image.type === ISSUE_IMAGE_SLOT.key);
      if (dailyStatus === "issue" || hasIssueImage || issueText.trim()) {
        saveIssueDraft({
          flight: issueFlight,
          route: issueRoute,
          hlnbr: issueHlnbr,
          text: issueText,
          status: "issue",
          author,
          savedAt: new Date().toISOString(),
        });
      }

      setNotice(successMessage);
    } else {
      setNotice(
        "이미지를 화면에는 올렸지만, 기기 저장공간 제한으로 재실행 후 복원되지 않을 수 있습니다. 더 작은 사진으로 다시 저장해 주세요.",
      );
    }

    // 이미지 변경(추가/삭제/수정) 즉시 Supabase에 자동 저장 → 15초 자동싱크 덮어쓰기 방지
    imagesSavingRef.current = true;
    void (async () => {
      try {
        const resp = await fetch(`${BACKEND_URL}/flights/daily-report-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workDate: dailyWorkDate,
            status: dailyStatus,
            author,
            note,
            images: nextImages,
            savedAt: new Date().toISOString(),
          }),
        });
        const json = await resp.json().catch(() => null);
        if (resp.ok && json?.success) {
          lastSavedValuesRef.current = {
            ...lastSavedValuesRef.current,
            imagesJson: JSON.stringify(nextImages),
          };
        }
      } catch {
        // 네트워크 오류 시 무시 (이미 localStorage에 저장됨)
      } finally {
        imagesSavingRef.current = false;
      }
    })();
  };

  const saveImageFileToSlot = (
    file: File,
    slotKey: ImageSlotKey,
    sourceLabel: "카메라 촬영" | "사진첩 선택" | "붙여넣기",
  ) => {
    if (!file.type.startsWith("image/")) {
      setNotice("붙여넣기 가능한 이미지가 없습니다. 사진첩 또는 카메라를 사용해 주세요.");
      return;
    }

    const reader = new FileReader();

    reader.onload = async () => {
      const originalDataUrl = String(reader.result || "");

      if (!originalDataUrl) return;

      const metadata = await readImageFileMetadata(file);
      const savedAt = new Date().toLocaleString("ko-KR");
      const slotInfo =
        [...IMAGE_SLOTS, ISSUE_IMAGE_SLOT].find((slot) => slot.key === slotKey) ||
        IMAGE_SLOTS[0];
      const label = `${slotInfo.title} · ${sourceLabel}`;
      const resizePlans =
        sourceLabel === "붙여넣기"
          ? [
              { maxSize: 960, quality: 0.62 },
              { maxSize: 720, quality: 0.55 },
              { maxSize: 540, quality: 0.5 },
            ]
          : [
              { maxSize: 1280, quality: 0.72 },
              { maxSize: 960, quality: 0.62 },
              { maxSize: 720, quality: 0.55 },
            ];

      let savedImage: SavedImage | null = null;
      let savedImages: SavedImage[] = [];
      let saved = false;

      for (const plan of resizePlans) {
        const dataUrl = await resizeImageDataUrl(originalDataUrl, plan.maxSize, plan.quality);
        const nextImage: SavedImage = {
          id: `${Date.now()}`,
          type: slotKey,
          label,
          savedAt,
          dataUrl,
          capturedAt: metadata.capturedAt,
          locationText: metadata.locationText,
        };
        const latestImages = loadImages();
        const nextImages = upsertImageBySlot(latestImages.length > 0 ? latestImages : images, nextImage);

        if (saveImages(nextImages)) {
          savedImage = nextImage;
          savedImages = nextImages;
          saved = true;
          break;
        }
      }

      if (!savedImage) {
        const dataUrl = await resizeImageDataUrl(originalDataUrl, 420, 0.45);
        savedImage = {
          id: `${Date.now()}`,
          type: slotKey,
          label,
          savedAt,
          dataUrl,
          capturedAt: metadata.capturedAt,
          locationText: metadata.locationText,
        };
        savedImages = upsertImageBySlot(images, savedImage);
      }

      persistImages(
        savedImages,
        saved
          ? `${slotInfo.title}를 기기에 저장했습니다.`
          : `${slotInfo.title}를 화면에는 올렸지만, 저장공간 제한으로 복원되지 않을 수 있습니다.`,
      );
      setImageViewerImage((current) =>
        current?.type === slotKey ? savedImage : current,
      );

    };

    reader.onerror = () => {
      setNotice("이미지를 읽는 중 오류가 발생했습니다.");
    };

    reader.readAsDataURL(file);
  };

  const handleImageSelected = (
    event: React.ChangeEvent<HTMLInputElement>,
    sourceLabel: "카메라 촬영" | "사진첩 선택",
  ) => {
    const file = event.target.files?.[0];
    const slotKey = pendingImageSlotRef.current;
    event.target.value = "";

    if (!file) return;

    saveImageFileToSlot(file, slotKey, sourceLabel);
  };

  const handlePastedImage = (slotKey: ImageSlotKey, file: File) => {
    saveImageFileToSlot(file, slotKey, "붙여넣기");
  };

  const handleDeleteImageSlot = (slotKey: ImageSlotKey) => {
    const slotImages = getImagesBySlot(images, slotKey);
    if (slotImages.length === 0) return false;

    const confirmed = window.confirm("이 항목의 이미지를 모두 삭제할까요?");
    if (!confirmed) return false;

    const nextImages = removeImageBySlot(images, slotKey);
    persistImages(nextImages, `${slotImages[0].label} 항목의 이미지를 삭제했습니다.`);
    setImageViewerImage((current) =>
      current?.type === slotKey ? null : current,
    );
    return true;
  };

  const handleDeleteSingleImage = (targetImage: SavedImage) => {
    const confirmed = window.confirm("이 이미지만 삭제할까요?");
    if (!confirmed) return false;

    const nextImages = images.filter((image) => image.id !== targetImage.id);
    persistImages(nextImages, `${targetImage.label} 이미지를 삭제했습니다.`);
    setImageViewerImage((current) =>
      current?.id === targetImage.id ? null : current,
    );
    return true;
  };

  const openLatestImage = (image: SavedImage) => {
    setImageViewerImage(image);
  };

  const closeImageViewer = () => {
    setImageViewerImage(null);
  };

  const getImageViewerSlotInfo = () =>
    [...IMAGE_SLOTS, ISSUE_IMAGE_SLOT].find(
      (slot) => slot.key === imageViewerImage?.type,
    );

  const handleViewerCameraChange = () => {
    if (!imageViewerImage) return;
    openCamera(imageViewerImage.type);
  };

  const handleViewerLibraryChange = () => {
    if (!imageViewerImage) return;
    openPhotoLibrary(imageViewerImage.type);
  };

  const handleViewerDelete = () => {
    if (!imageViewerImage) return;
    handleDeleteImageSlot(imageViewerImage.type);
  };

  const handleSaveAnnotatedImage = (dataUrl: string, memo: string) => {
    if (!imageViewerImage) return;

    const slotInfo =
      [...IMAGE_SLOTS, ISSUE_IMAGE_SLOT].find((slot) => slot.key === imageViewerImage.type) ||
      IMAGE_SLOTS[0];
    const savedAt = new Date().toLocaleString("ko-KR");
    const nextImage: SavedImage = {
      ...imageViewerImage,
      label: `${slotInfo.title} · 글씨 저장`,
      savedAt,
      dataUrl,
    };
    const nextImages = images.map((image) =>
      image.id === imageViewerImage.id ? nextImage : image,
    );

    persistImages(nextImages, `${slotInfo.title}에 글씨를 넣어 저장했습니다.`);
    setImageViewerImage(nextImage);
  };

  const handleSaveImageMemo = (memo: string) => {
    if (!imageViewerImage) return;

    const nextImage: SavedImage = {
      ...imageViewerImage,
      memo: memo.trim(),
    };

    const nextImages = images.map((image) =>
      image.id === imageViewerImage.id ? nextImage : image,
    );

    persistImages(nextImages, memo.trim() ? "사진 메모를 저장했습니다." : "사진 메모를 비웠습니다.");
    setImageViewerImage(nextImage);
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

  const makeSaveSignature = (payload: unknown) => JSON.stringify(payload);

  const isRecentSameSave = (
    previous: { signature: string; savedAt: number } | null,
    signature: string,
  ) => {
    if (!previous) return false;
    const elapsedMs = Date.now() - previous.savedAt;
    return previous.signature === signature && elapsedMs < 10 * 60 * 1000;
  };


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
    resetDailyWorkDateToToday();
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

  const openDailyNotionPage = () => {
    if (!dailyNotionRecord?.url) {
      setNotice("열 수 있는 Notion 링크가 없습니다.");
      return;
    }

    window.open(dailyNotionRecord.url, "_blank", "noopener,noreferrer");
  };

  const buildIssuePayload = () => {
    const issueImage = getImageBySlot(images, ISSUE_IMAGE_SLOT.key);

    return {
      title: `${issueFlight.trim().toUpperCase()} ${issueRoute || ""} 특이사항`,
      date: new Date().toISOString(),
      time: getCurrentTimeText(),
      flight: issueFlight.trim().toUpperCase(),
      route: issueRoute,
      hlnbr: issueHlnbr,
      issue: issueText,
      weather: getWeatherSummary(weather),
      author,
      status: "확인 중",
      image: issueImage
        ? {
            slotKey: ISSUE_IMAGE_SLOT.key,
            type: issueImage.type,
            propertyName: IMAGE_SLOT_PROPERTY_NAME[ISSUE_IMAGE_SLOT.key],
            label: issueImage.label,
            savedAt: issueImage.savedAt,
            capturedAt: issueImage.capturedAt,
            locationText: issueImage.locationText,
            memo: issueImage.memo || "",
            dataUrl: issueImage.dataUrl,
          }
        : null,
    };
  };

  const validateIssueForm = () => {
    if (!issueFlight.trim()) {
      setNotice("특이사항 기록을 위해 편명을 입력하세요.");
      return false;
    }

    if (!issueText.trim()) {
      setNotice("특이사항 내용을 입력하세요.");
      return false;
    }

    return true;
  };

  const handleSaveIssueToNotion = async () => {
    if (issueSavingRef.current) {
      setNotice("Notion 특이사항 기록 저장 중입니다. 잠시만 기다려 주세요.");
      return;
    }

    if (issueNotionRecord?.pageId) {
      setNotice("이미 저장된 특이사항 기록이 있습니다. 새로 만들지 않고 수정 버튼을 사용하세요.");
      return;
    }

    if (!validateIssueForm()) return;

    const payload = buildIssuePayload();
    const signature = makeSaveSignature(payload);

    if (isRecentSameSave(getLastIssueSaveSignature(), signature)) {
      setNotice("방금 같은 특이사항 기록을 저장했습니다. 중복 저장을 막았습니다.");
      return;
    }

    issueSavingRef.current = true;
    setIsIssueSaving(true);

    try {
      const result = await saveIssueRecord(payload);

      const record = {
        pageId: result.pageId,
        url: result.url,
        savedAt: new Date().toLocaleString("ko-KR"),
      };

      setIssueNotionRecord(record);
      saveIssueNotionRecord(record);
      saveLastIssueSaveSignature({ signature, savedAt: Date.now() });
      setNotice("Notion에 특이사항 기록을 저장했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Notion 저장 중 오류가 발생했습니다.");
    } finally {
      issueSavingRef.current = false;
      setIsIssueSaving(false);
    }
  };

  const handleUpdateIssueToNotion = async () => {
    if (!issueNotionRecord?.pageId) {
      setNotice("수정할 Notion 특이사항 기록이 없습니다. 먼저 저장하세요.");
      return;
    }

    if (!validateIssueForm()) return;

    try {
      const result = await updateIssueRecord(issueNotionRecord.pageId, buildIssuePayload());

      const nextRecord = {
        ...issueNotionRecord,
        url: result.url || issueNotionRecord.url,
        savedAt: new Date().toLocaleString("ko-KR"),
      };

      setIssueNotionRecord(nextRecord);
      saveIssueNotionRecord(nextRecord);
      setNotice("Notion 특이사항 기록을 수정했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Notion 수정 중 오류가 발생했습니다.");
    }
  };

  const handleDeleteIssueFromNotion = async () => {
    if (!issueNotionRecord?.pageId) {
      setNotice("삭제할 Notion 특이사항 기록이 없습니다.");
      return;
    }

    const confirmed = window.confirm("Notion 특이사항 기록을 삭제할까요?");
    if (!confirmed) return;

    try {
      await deleteIssueRecord(issueNotionRecord.pageId);

      clearIssueNotionRecord();
      setIssueNotionRecord(null);
      setNotice("Notion 특이사항 기록을 삭제했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Notion 삭제 중 오류가 발생했습니다.");
    }
  };

  const openIssueNotionPage = () => {
    if (!issueNotionRecord?.url) {
      setNotice("열 수 있는 Notion 특이사항 링크가 없습니다.");
      return;
    }

    window.open(issueNotionRecord.url, "_blank", "noopener,noreferrer");
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

  const imageViewerSlotInfo = getImageViewerSlotInfo();

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
          onRefresh={fetchWeather}
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
