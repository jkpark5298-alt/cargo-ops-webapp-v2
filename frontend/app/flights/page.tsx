"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useRouter } from "next/navigation";
import { FlightsModeTabs } from "./components/FlightsModeTabs";
import { ScheduleSlotCards } from "./components/ScheduleSlotCards";
import {
  clearAllScheduleSlotsOnServer,
  deleteScheduleSlotOnServer,
  type FlightMode,
  formatScheduleCardName,
  linkScheduleSlotOnServer,
  loadScheduleSlotsFromServer,
  saveScheduleSlotToServer,
  type ScheduleSlotKey,
  type ScheduleSlotsState,
  slotsToRooms,
  swapScheduleSlotsOnServer,
} from "./lib/schedule-slots";
import { mergeRowPreservingAfocsSkd, prepareAfocsSkdForSave } from "../lib/afocs-skd";
import { getComputedFlightStatus, getFlightNoColor } from "../lib/flight-status";
import {
  type AircraftRegistrationRecord,
  type FlightRow,
  type MonitorRoom,
} from "../lib/flight-types";
import { normalizeFlightKey, normalizeFlightsInput, normalizeHlNumber } from "../lib/flight-keys";
import {
  applyRegistrationToRows,
  fetchAircraftRegistrationRecordsFromServer,
  getAircraftRegistrationDateFromRow,
  loadAircraftRegistrationRecords,
  mergeAircraftRegistrationRecords,
  saveAircraftRegistrationRecords,
  saveAircraftRegistrationRecordsToServer,
} from "../lib/aircraft-registration";
import {
  buildScheduleRowsForFlights,
  isActiveScheduleRoom,
  loadLatestScheduleFromServer,
  loadRooms,
  mergeLatestScheduleRoom,
  normalizeScheduleRoomRows,
  removeEmptyScheduleRooms,
  removeFlightFromScheduleRoom,
  saveLatestScheduleToServer,
  saveRooms,
} from "../lib/schedule-store";
import { BACKEND_URL } from "../lib/api-config";
import {
  applyHlMappingToRows,
  applyInlineHlDraftsToRows,
  buildDateTime,
  clearFlightAlertBaselineAndHistory,
  filterRowsByFlightInput,
  findBestExcelRowForScheduleRow,
  formatFlightDisplayWithMarker,
  getActiveRefreshFlights,
  getAlertCounts,
  getDatePart,
  getDefaultEndDateTime,
  getDefaultStartDateTime,
  getEditableHlValue,
  getFlightDisplay,
  getFlightKeyFromRow,
  getFlightLookupCacheKey,
  getRefreshExcludeReason,
  getRegistrationNo,
  getRowBackground,
  getRowKey,
  getSelectionKey,
  getStatusColor,
  getTimePart,
  isFinalCompletedRow,
  loadFlightLookupCache,
  loadHlMappingText,
  loadRegistrationQueryRange,
  mergeManualRegistrationFields,
  mergeRowsKeepFinal,
  parseAircraftRegistrationRows,
  parseHlMappingText,
  parseRegistrationAfocsExcelRows,
  patchScheduleRowsWithRegistrationFields,
  saveFlightLookupCache,
  saveHlMappingText,
  saveRegistrationQueryRange,
  serializeHlMapping,
  sheetToRegistrationAfocsRows,
  uniqueHlByFlightFromExcel,
} from "./lib/helpers";
import { LAST_FIXED_ROOM_KEY, REFRESH_INTERVAL_MINUTES } from "./lib/constants";
import {
  afocsSkdLinkBtn,
  badgeNormal,
  badgeOrange,
  badgePurple,
  badgeRed,
  dateInputStyle,
  disabledBtn,
  hlExcelUploadButtonStyle,
  hlInlineHelpStyle,
  hlInlineSaveRowStyle,
  hlMappingDeleteButtonStyle,
  hlMappingSaveButtonStyle,
  hlMappingStatusStyle,
  homeButtonStyle,
  inlineDateInputStyle,
  modeActiveBtn,
  modeBtn,
  primaryBtn,
  queryButtonRowStyle,
  refreshBtn,
  saveScheduleBtn,
  scheduleSaveGuideStyle,
  scheduleSaveStatusStyle,
  scheduleSaveStatusSubStyle,
  tdStyle,
  thStyle,
} from "./styles";
import { TimeSelect24 } from "./components/TimeSelect24";
import { HlRegistrationInput } from "./components/HlRegistrationInput";
import { FixedResultsTable } from "./components/FixedResultsTable";

export const dynamic = "force-dynamic";

export default function FlightsPage() {
  const router = useRouter();
  const registrationExcelInputRef = useRef<HTMLInputElement | null>(null);
  const [flightMode, setFlightMode] = useState<FlightMode>("query");
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlotsState>({
    active: null,
    archive: null,
    linkedSlot: "active",
  });
  const [selectedSlotKey, setSelectedSlotKey] = useState<ScheduleSlotKey | null>(null);
  const [queryMode, setQueryMode] = useState<"manual" | "kj-all">("manual");
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<FlightRow[]>([]);
  const [selectedScheduleKeys, setSelectedScheduleKeys] = useState<Record<string, boolean>>({});
  const [selectedScheduleOrder, setSelectedScheduleOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");
  // ③ 등록번호/AFOCS 전용 조회 기간 (Schedule Flight 카드 기간과 분리)
  const [registrationStartDateTime, setRegistrationStartDateTime] = useState("");
  const [registrationEndDateTime, setRegistrationEndDateTime] = useState("");

  const [fixed, setFixed] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState("");

  const [rooms, setRooms] = useState<MonitorRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [expandedDetailKeys, setExpandedDetailKeys] = useState<Record<string, boolean>>({});
  const [hlMappingText, setHlMappingText] = useState("");
  const [hlMappingStatus, setHlMappingStatus] = useState("");
  const [hlInlineDrafts, setHlInlineDrafts] = useState<Record<string, string>>({});
  const [afocsSkdInlineDrafts, setAfocsSkdInlineDrafts] = useState<Record<string, string>>({});
  const [aircraftRegistrationRecords, setAircraftRegistrationRecords] = useState<AircraftRegistrationRecord[]>([]);
  const aircraftRegistrationRecordsRef = useRef<AircraftRegistrationRecord[]>([]);

  const currentRangeText = useMemo(() => {
    return `${startDateTime.replace("T", " ")} ~ ${endDateTime.replace("T", " ")}`;
  }, [startDateTime, endDateTime]);

  const registrationRangeText = useMemo(() => {
    return `${registrationStartDateTime.replace("T", " ")} ~ ${registrationEndDateTime.replace("T", " ")}`;
  }, [registrationStartDateTime, registrationEndDateTime]);

  const alertCounts = useMemo(() => getAlertCounts(rows), [rows]);

  const hlNumberMap = useMemo(() => parseHlMappingText(hlMappingText), [hlMappingText]);

  useEffect(() => {
    aircraftRegistrationRecordsRef.current = aircraftRegistrationRecords;
  }, [aircraftRegistrationRecords]);

  useEffect(() => {
    const defaultStart = getDefaultStartDateTime();
    const defaultEnd = getDefaultEndDateTime();
    setStartDateTime(defaultStart);
    setEndDateTime(defaultEnd);
    const savedRegistrationRange = loadRegistrationQueryRange();
    setRegistrationStartDateTime(savedRegistrationRange?.start || defaultStart);
    setRegistrationEndDateTime(savedRegistrationRange?.end || defaultEnd);
    setHlMappingText(loadHlMappingText());

    const localRecords = loadAircraftRegistrationRecords();
    setAircraftRegistrationRecords(localRecords);
    aircraftRegistrationRecordsRef.current = localRecords;

    void fetchAircraftRegistrationRecordsFromServer()
      .then(async (serverRecords) => {
        let finalRecords = serverRecords;
        if (serverRecords.length === 0 && localRecords.length > 0) {
          try {
            finalRecords = await saveAircraftRegistrationRecordsToServer(localRecords, "replace");
            saveAircraftRegistrationRecords(finalRecords);
          } catch (restoreError) {
            console.error("Failed to restore records to server:", restoreError);
            finalRecords = localRecords;
          }
        }

        setAircraftRegistrationRecords(finalRecords);
        aircraftRegistrationRecordsRef.current = finalRecords;
        setRows((prevRows) => applyRegistrationToRows(prevRows, finalRecords));
        setRooms((prevRooms) => {
          const nextRooms = prevRooms.map((room) => ({
            ...room,
            rows: applyRegistrationToRows(room.rows || [], finalRecords),
          }));
          saveRooms(nextRooms);
          return nextRooms;
        });
      })
      .catch(() => {
        // 서버 등록기호 DB 조회 실패 시 현재 기기의 로컬 데이터로 계속 동작합니다.
      });
  }, []);

  const selectedScheduleRows = useMemo(() => {
    const rowMap = new Map<string, FlightRow>();

    rows.forEach((row, idx) => {
      const key = getSelectionKey(row, idx);
      if (selectedScheduleKeys[key]) {
        rowMap.set(key, row);
      }
    });

    return selectedScheduleOrder
      .map((key) => rowMap.get(key))
      .filter((row): row is FlightRow => Boolean(row));
  }, [rows, selectedScheduleKeys, selectedScheduleOrder]);

  const refreshExcludedRows = useMemo(() => rows.filter(isFinalCompletedRow), [rows]);
  const refreshActiveRows = useMemo(() => rows.filter((row) => !isFinalCompletedRow(row)), [rows]);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) || null,
    [rooms, selectedRoomId]
  );

  const isSelectedFixedRoom = Boolean(selectedRoom?.fixed);

  const applyScheduleSlotsState = (slots: ScheduleSlotsState, preferredSlot?: ScheduleSlotKey | null) => {
    setScheduleSlots(slots);
    const nextRooms = slotsToRooms(slots);
    setRooms(nextRooms);
    saveRooms(nextRooms);

    const slotOrder: ScheduleSlotKey[] = preferredSlot
      ? [preferredSlot, preferredSlot === "active" ? "archive" : "active"]
      : ["active", "archive"];
    const nextSelectedSlot =
      slotOrder.find((slotKey) => {
        const entry = slots[slotKey];
        return entry && isActiveScheduleRoom(entry.room);
      }) || null;

    setSelectedSlotKey(nextSelectedSlot);
    if (nextSelectedSlot && slots[nextSelectedSlot]) {
      const room = slots[nextSelectedSlot]!.room;
      setSelectedRoomId(room.id);
    } else {
      setSelectedRoomId("");
    }
  };

  const loadScheduleSlots = async (preferredSlot?: ScheduleSlotKey | null) => {
    const slots = await loadScheduleSlotsFromServer();
    applyScheduleSlotsState(slots, preferredSlot);
    return slots;
  };

  /** 등록 화면에서 저장한 HL/AFOCS를 기존 Schedule Flight 카드에만 병합 (카드 기간·편명 목록 유지) */
  const syncRegistrationFieldsToScheduleSlots = async (sourceRows: FlightRow[]) => {
    // 항상 서버 최신 카드를 읽어 PC 로컬 state 공백/지연으로 동기화가 스킵되지 않게 합니다.
    let nextSlots: ScheduleSlotsState = await loadScheduleSlotsFromServer();
    let synced = 0;
    let linkedPatchedRoom: MonitorRoom | null = null;

    for (const key of ["active", "archive"] as const) {
      const entry = nextSlots[key];
      if (!entry?.room || !isActiveScheduleRoom(entry.room)) continue;

      const patchedRows = patchScheduleRowsWithRegistrationFields(entry.room.rows || [], sourceRows);
      const updatedRoom: MonitorRoom = {
        ...entry.room,
        fixed: true,
        rows: patchedRows,
      };

      const result = await saveScheduleSlotToServer(updatedRoom, {
        rotate: false,
        slot: key,
      });
      nextSlots = {
        active: result.active,
        archive: result.archive,
        linkedSlot: result.linkedSlot,
      };
      synced += 1;

      if (key === result.linkedSlot || key === nextSlots.linkedSlot) {
        linkedPatchedRoom = updatedRoom;
      }
    }

    if (synced > 0) {
      // 연동 슬롯 → latest-schedule을 명시적으로 한 번 더 맞춰 아이폰 초기화면 반영을 보장합니다.
      const linkedKey = nextSlots.linkedSlot;
      const linkedRoom =
        linkedPatchedRoom ||
        (nextSlots[linkedKey]?.room && isActiveScheduleRoom(nextSlots[linkedKey]!.room)
          ? nextSlots[linkedKey]!.room
          : null);
      if (linkedRoom) {
        try {
          await saveLatestScheduleToServer(normalizeScheduleRoomRows(linkedRoom));
        } catch (latestError) {
          console.error("Failed to sync registration fields to latest-schedule:", latestError);
        }
      }

      setScheduleSlots(nextSlots);
      const nextRooms = slotsToRooms(nextSlots);
      setRooms(nextRooms);
      saveRooms(nextRooms);
    }

    return synced;
  };

  const handleSelectSlot = (slotKey: ScheduleSlotKey) => {
    // 등록번호/AFOCS 모드는 왼쪽 카드와 분리된 작업 화면입니다.
    if (flightMode === "registration") return;

    const entry = scheduleSlots[slotKey];
    if (!entry || !isActiveScheduleRoom(entry.room)) return;

    setSelectedSlotKey(slotKey);
    setSelectedRoomId(entry.room.id);
    setInput(entry.room.flightsInput);
    setStartDateTime(entry.room.startDateTime);
    setEndDateTime(entry.room.endDateTime);
    // 등록번호/AFOCS 조회 기간은 카드 기간과 분리 유지 (슬롯 선택 시 덮어쓰지 않음)
    setRegistrationStartDateTime((prev) => prev || loadRegistrationQueryRange()?.start || getDefaultStartDateTime());
    setRegistrationEndDateTime((prev) => prev || loadRegistrationQueryRange()?.end || getDefaultEndDateTime());
    setFixed(true);
    setLastFetchedAt(entry.room.lastFetchedAt);
    setRows(entry.room.rows || []);
    setQueryMode("manual");
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});
    setError("");
  };

  const handleDeleteSlot = async (slotKey: ScheduleSlotKey) => {
    const entry = scheduleSlots[slotKey];
    if (!entry) return;

    const confirmed = window.confirm(
      slotKey === "active"
        ? "활성 Schedule Flight 카드를 삭제할까요? 직전 보관 카드가 있으면 활성으로 승격됩니다."
        : "직전 보관 Schedule Flight 카드를 삭제할까요?",
    );
    if (!confirmed) return;

    try {
      const nextSlots = await deleteScheduleSlotOnServer(slotKey);
      applyScheduleSlotsState(nextSlots);
      if (selectedSlotKey === slotKey) {
        resetLookupView();
        setFixed(false);
        setInput("");
      }
      clearFlightAlertBaselineAndHistory();
      if (typeof window !== "undefined") {
        window.localStorage.setItem("cargo_ops_latest_schedule_updated_at", new Date().toISOString());
      }

      const verifiedSlots = await loadScheduleSlotsFromServer();
      applyScheduleSlotsState(verifiedSlots);

      setError(
        slotKey === "active"
          ? "활성 Schedule Flight 카드를 삭제했습니다. 초기화면과 AFOCS SKD에도 반영됩니다."
          : "직전 보관 Schedule Flight 카드를 삭제했습니다.",
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Schedule Flight 카드 삭제 중 오류가 발생했습니다.",
      );
    }
  };

  const handleDeleteAllSlots = async () => {
    const hasAnySlot = Boolean(scheduleSlots.active || scheduleSlots.archive);
    if (!hasAnySlot) {
      setError("삭제할 Schedule Flight 카드가 없습니다.");
      return;
    }

    const confirmed = window.confirm(
      "저장된 Schedule Flight 카드를 모두 삭제할까요? NOW FLT·After 카드와 초기화면/AFOCS SKD 연동이 함께 비워집니다.",
    );
    if (!confirmed) return;

    try {
      const nextSlots = await clearAllScheduleSlotsOnServer();
      applyScheduleSlotsState(nextSlots);
      resetLookupView();
      setFixed(false);
      setSelectedSlotKey(null);
      setInput("");
      saveRooms([]);
      clearFlightAlertBaselineAndHistory();
      if (typeof window !== "undefined") {
        window.localStorage.setItem("cargo_ops_latest_schedule_updated_at", new Date().toISOString());
      }

      const verifiedSlots = await loadScheduleSlotsFromServer();
      if (isActiveScheduleRoom(verifiedSlots.active?.room) || isActiveScheduleRoom(verifiedSlots.archive?.room)) {
        throw new Error("삭제 후에도 Schedule Flight 카드가 남아 있습니다.");
      }
      applyScheduleSlotsState(verifiedSlots);

      setError("Schedule Flight 카드를 모두 삭제했습니다. 초기화면과 AFOCS SKD에도 반영됩니다.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Schedule Flight 전체 삭제 중 오류가 발생했습니다.",
      );
    }
  };

  const handleRestoreArchiveSlot = async () => {
    if (!scheduleSlots.archive) {
      setError("복원할 직전 보관 카드가 없습니다.");
      return;
    }

    try {
      const nextSlots = await swapScheduleSlotsOnServer();
      applyScheduleSlotsState(nextSlots, "active");
      const activeRoom = nextSlots.active?.room;
      if (activeRoom) {
        setInput(activeRoom.flightsInput);
        setRows(activeRoom.rows || []);
        setLastFetchedAt(activeRoom.lastFetchedAt);
        setFixed(true);
      }
      clearFlightAlertBaselineAndHistory();
      if (typeof window !== "undefined") {
        window.localStorage.setItem("cargo_ops_latest_schedule_updated_at", new Date().toISOString());
      }
      setError("직전 보관 카드를 활성 Schedule Flight로 복원했습니다.");
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "Schedule Flight 카드 복원 중 오류가 발생했습니다.",
      );
    }
  };

  const handleLinkSlot = async (slotKey: ScheduleSlotKey) => {
    try {
      const nextSlots = await linkScheduleSlotOnServer(slotKey);
      applyScheduleSlotsState(nextSlots, slotKey);
      clearFlightAlertBaselineAndHistory();
      if (typeof window !== "undefined") {
        window.localStorage.setItem("cargo_ops_latest_schedule_updated_at", new Date().toISOString());
      }
      setError("초기화면 Scheduled Flight 연동 카드를 변경했습니다.");
    } catch (linkError) {
      setError(
        linkError instanceof Error
          ? linkError.message
          : "초기화면 연동 변경 중 오류가 발생했습니다.",
      );
    }
  };

  const handleSelectAllScheduleRows = () => {
    const initialKeys: Record<string, boolean> = {};
    const initialOrder: string[] = [];
    rows.forEach((row, idx) => {
      if (!isFinalCompletedRow(row)) {
        const key = getSelectionKey(row, idx);
        initialKeys[key] = true;
        initialOrder.push(key);
      }
    });
    setSelectedScheduleKeys(initialKeys);
    setSelectedScheduleOrder(initialOrder);
  };

  const handleClearAllScheduleRows = () => {
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
  };

  const applyAllRegistrationSources = (
    targetRows: FlightRow[],
    records: AircraftRegistrationRecord[] = aircraftRegistrationRecordsRef.current,
  ) => {
    const latestRecords = records.length > 0 ? records : loadAircraftRegistrationRecords();
    const manualRows: FlightRow[] = [];
    (["active", "archive"] as const).forEach((slotKey) => {
      const slotRows = scheduleSlots[slotKey]?.room?.rows;
      if (Array.isArray(slotRows)) manualRows.push(...slotRows);
    });
    rooms.forEach((room) => {
      if (Array.isArray(room.rows)) manualRows.push(...room.rows);
    });
    const withManual = mergeManualRegistrationFields(manualRows, targetRows);
    const withDrafts = applyInlineHlDraftsToRows(withManual, hlInlineDrafts);
    return applyRegistrationToRows(applyHlMappingToRows(withDrafts, hlNumberMap), latestRecords);
  };

  const ensureAircraftRegistrationRecordsFromServer = async () => {
    const seed =
      aircraftRegistrationRecordsRef.current.length > 0
        ? aircraftRegistrationRecordsRef.current
        : loadAircraftRegistrationRecords();

    try {
      const serverRecords = await fetchAircraftRegistrationRecordsFromServer();
      let finalRecords = serverRecords;
      if (serverRecords.length === 0 && seed.length > 0) {
        try {
          finalRecords = await saveAircraftRegistrationRecordsToServer(seed, "replace");
        } catch {
          finalRecords = seed;
        }
      }
      aircraftRegistrationRecordsRef.current = finalRecords;
      setAircraftRegistrationRecords(finalRecords);
      return finalRecords;
    } catch {
      return seed;
    }
  };

  const persistRegistrationDraftsForRows = async (targetRows: FlightRow[]) => {
    const nextMap: Record<string, string> = { ...hlNumberMap };
    const incomingRecords = targetRows
      .map((row) => {
        const flight = getFlightKeyFromRow(row);
        if (!flight || flight === "-") return null;

        const rawValue = Object.prototype.hasOwnProperty.call(hlInlineDrafts, flight)
          ? hlInlineDrafts[flight]
          : getEditableHlValue(row, hlNumberMap, {});

        const registrationNo = normalizeHlNumber(rawValue || "");
        if (!/^HL\d{3,5}$/i.test(registrationNo)) return null;

        nextMap[flight] = registrationNo;
        return {
          date: getAircraftRegistrationDateFromRow(row),
          flight,
          departureCode: row.departureCode || "",
          arrivalCode: row.arrivalCode || "",
          registrationNo,
          updatedAt: new Date().toISOString(),
        } satisfies AircraftRegistrationRecord;
      })
      .filter((record): record is AircraftRegistrationRecord => Boolean(record));

    if (incomingRecords.length === 0) return;

    const normalizedText = serializeHlMapping(nextMap);
    setHlMappingText(normalizedText);
    saveHlMappingText(normalizedText);

    const latestRecords = loadAircraftRegistrationRecords();
    let nextAircraftRegistrationRecords = mergeAircraftRegistrationRecords(
      latestRecords,
      incomingRecords,
    );

    try {
      nextAircraftRegistrationRecords = await saveAircraftRegistrationRecordsToServer(
        incomingRecords,
        "merge",
      );
    } catch {
      saveAircraftRegistrationRecords(nextAircraftRegistrationRecords);
    }

    setAircraftRegistrationRecords(nextAircraftRegistrationRecords);
    saveAircraftRegistrationRecords(nextAircraftRegistrationRecords);
    setHlInlineDrafts({});
  };

  const updateSelectedRoomDraft = (updates: Partial<MonitorRoom>) => {
    if (!selectedRoomId) return;

    setRooms((prevRooms) => {
      const nextRooms = prevRooms.map((room) =>
        room.id === selectedRoomId ? { ...room, ...updates } : room
      );
      saveRooms(nextRooms);
      return nextRooms;
    });
  };

  const handleHlInlineDraftChange = (flight: string, value: string) => {
    const key = normalizeFlightKey(flight);
    if (!key) return;

    setHlInlineDrafts((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleAfocsSkdInlineDraftChange = (flight: string, value: string) => {
    const key = normalizeFlightKey(flight);
    if (!key) return;

    setAfocsSkdInlineDrafts((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSaveInlineAfocsSkd = async () => {
    if (flightMode === "registration") {
      if (rows.length === 0) {
        setHlMappingStatus("먼저 등록 전용 기간으로 조회한 뒤 AFOCS SKD를 입력하세요.");
        return;
      }

      const updatedRows = rows.map((row) => {
        const flightKey = getFlightKeyFromRow(row);
        if (Object.prototype.hasOwnProperty.call(afocsSkdInlineDrafts, flightKey)) {
          return {
            ...row,
            afocsSkd: prepareAfocsSkdForSave(afocsSkdInlineDrafts[flightKey], row),
          };
        }
        return row;
      });

      setRows(updatedRows);
      setAfocsSkdInlineDrafts({});

      try {
        const synced = await syncRegistrationFieldsToScheduleSlots(updatedRows);
        setHlMappingStatus(
          synced > 0
            ? `AFOCS SKD 저장 완료 · Schedule Flight 카드 ${synced}장에 동일 편명 반영`
            : "AFOCS SKD 저장 완료 · 반영할 Schedule Flight 카드가 없어 등록 조회 결과에만 유지됩니다.",
        );
      } catch (syncError) {
        setHlMappingStatus(
          syncError instanceof Error
            ? `AFOCS SKD 로컬 저장 완료 · 카드 반영 실패: ${syncError.message}`
            : "AFOCS SKD 로컬 저장 완료 · 카드 반영 실패",
        );
      }
      return;
    }

    if (!selectedRoom || !selectedRoom.fixed) {
      setHlMappingStatus("수정할 Schedule Flight 방이 선택되지 않았습니다.");
      return;
    }

    const updatedRows = (selectedRoom.rows || []).map((row) => {
      const flightKey = getFlightKeyFromRow(row);
      if (Object.prototype.hasOwnProperty.call(afocsSkdInlineDrafts, flightKey)) {
        return {
          ...row,
          afocsSkd: prepareAfocsSkdForSave(afocsSkdInlineDrafts[flightKey], row),
        };
      }
      return row;
    });

    const updatedRoom: MonitorRoom = {
      ...selectedRoom,
      rows: updatedRows,
      lastFetchedAt: new Date().toLocaleString("ko-KR"),
    };

    const nextRooms = rooms.map((room) =>
      room.id === selectedRoom.id ? updatedRoom : room
    );

    setRooms(nextRooms);
    saveRooms(nextRooms);
    setRows(updatedRows);
    setAfocsSkdInlineDrafts({});

    try {
      await saveLatestScheduleToServer(updatedRoom);
      setHlMappingStatus("AFOCS SKD 날짜·시간을 저장했습니다. AFOCS SKD에 실시간 반영됩니다.");
    } catch (syncError) {
      setHlMappingStatus(
        syncError instanceof Error
          ? `AFOCS SKD 로컬 저장 완료 · 서버 반영 실패: ${syncError.message}`
          : "AFOCS SKD 로컬 저장 완료 · 서버 반영 실패",
      );
    }
  };

  const handleCombinedRegistrationAfocsExcelUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (rows.length === 0) {
      setHlMappingStatus("먼저 등록 전용 기간으로 조회한 뒤 엑셀을 업로드하세요.");
      return;
    }

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
      if (!firstSheet) {
        setHlMappingStatus("엑셀 시트를 찾지 못했습니다.");
        return;
      }

      const rawRows = sheetToRegistrationAfocsRows(firstSheet);
      const parsedRecords = parseAircraftRegistrationRows(rawRows);
      const excelRows = parseRegistrationAfocsExcelRows(rawRows);
      const { unique: uniqueHlByFlight, conflicting: conflictingHlFlights } =
        uniqueHlByFlightFromExcel(excelRows);

      const hlCount = excelRows.filter((row) => row.registrationNo).length;
      const afocsCount = excelRows.filter((row) => row.afocsSkd).length;
      if (parsedRecords.length === 0 && hlCount === 0 && afocsCount === 0) {
        setHlMappingStatus(
          "엑셀에서 등록기호/AFOCS 데이터를 찾지 못했습니다. 제목 행 아래 헤더에 편명·등록기호·일자·ETD/ETA가 있는지 확인해 주세요.",
        );
        return;
      }

      // 엑셀 업로드는 기존(매뉴얼 포함) 값을 덮어씁니다. 이후 표에서 직접 수정·저장한 값이 다시 우선합니다.
      const uploadedAt = new Date().toISOString();
      const rowRecords: AircraftRegistrationRecord[] = [];
      let matchedHl = 0;
      let matchedAfocs = 0;
      let nextRows = rows.map((row) => {
        const matchedExcel = findBestExcelRowForScheduleRow(excelRows, row);
        let next = row;
        if (matchedExcel?.registrationNo) {
          matchedHl += 1;
          const changed = matchedExcel.registrationNo !== normalizeHlNumber(getRegistrationNo(row));
          next = {
            ...next,
            hlnbr: matchedExcel.registrationNo,
            registrationNo: matchedExcel.registrationNo,
            aircraftRegNo: matchedExcel.registrationNo,
            registrationNoEdited: Boolean(row.registrationNoEdited || changed),
          };
          // 일자 열이 없거나 노선 표기가 달라도 서버에 저장되도록 행 기준 키로도 기록합니다.
          rowRecords.push({
            date: getAircraftRegistrationDateFromRow(row),
            flight: getFlightKeyFromRow(row),
            departureCode: row.departureCode || "",
            arrivalCode: row.arrivalCode || "",
            registrationNo: matchedExcel.registrationNo,
            updatedAt: uploadedAt,
          });
        }
        if (matchedExcel?.afocsSkd) {
          matchedAfocs += 1;
          next = { ...next, afocsSkd: matchedExcel.afocsSkd };
        }
        return next;
      });

      const uploadRecords = [...parsedRecords, ...rowRecords];
      const latestRecords = loadAircraftRegistrationRecords();
      let nextRecords =
        uploadRecords.length > 0
          ? mergeAircraftRegistrationRecords(latestRecords, uploadRecords)
          : latestRecords;
      nextRows = applyRegistrationToRows(nextRows, nextRecords);

      if (matchedHl === 0 && matchedAfocs === 0) {
        setHlMappingStatus(
          `엑셀에서 등록기호 ${hlCount}건 · AFOCS ${afocsCount}건을 읽었지만, 현재 조회 목록과 일치하는 편명이 없습니다.`,
        );
        return;
      }

      setRows(nextRows);
      setHlInlineDrafts({});
      setAfocsSkdInlineDrafts({});

      let serverMessage = "";
      if (uploadRecords.length > 0) {
        try {
          nextRecords = await saveAircraftRegistrationRecordsToServer(uploadRecords, "merge");
          saveAircraftRegistrationRecords(nextRecords);
          serverMessage = " · 등록기호 서버 저장";
        } catch (serverError) {
          saveAircraftRegistrationRecords(nextRecords);
          serverMessage =
            serverError instanceof Error
              ? ` · 등록기호 서버 저장 실패: ${serverError.message}`
              : " · 등록기호 서버 저장 실패";
        }
      } else {
        saveAircraftRegistrationRecords(nextRecords);
      }
      setAircraftRegistrationRecords(nextRecords);

      const nextMap = { ...hlNumberMap, ...uniqueHlByFlight };
      conflictingHlFlights.forEach((flight) => {
        delete nextMap[flight];
      });
      const normalizedText = serializeHlMapping(nextMap);
      setHlMappingText(normalizedText);
      saveHlMappingText(normalizedText);

      try {
        const synced = await syncRegistrationFieldsToScheduleSlots(nextRows);
        setHlMappingStatus(
          `엑셀 반영 · 등록기호 ${matchedHl}건 · AFOCS ${matchedAfocs}건${serverMessage}${
            synced > 0 ? ` · Schedule Flight 카드 ${synced}장 동기화` : ""
          }`,
        );
      } catch (syncError) {
        setHlMappingStatus(
          syncError instanceof Error
            ? `엑셀 반영 · 등록기호 ${matchedHl}건 · AFOCS ${matchedAfocs}건${serverMessage} · 카드 동기화 실패: ${syncError.message}`
            : `엑셀 반영 · 등록기호 ${matchedHl}건 · AFOCS ${matchedAfocs}건${serverMessage} · 카드 동기화 실패`,
        );
      }
    } catch (error) {
      setHlMappingStatus(
        error instanceof Error
          ? `엑셀 업로드 실패: ${error.message}`
          : "엑셀 업로드 중 오류가 발생했습니다.",
      );
    }
  };

  const handleSaveInlineHlMapping = async () => {
    const nextMap: Record<string, string> = { ...hlNumberMap };
    let savedCount = 0;

    rows.forEach((row) => {
      const flight = getFlightKeyFromRow(row);
      if (!flight || flight === "-") return;

      const rawValue = Object.prototype.hasOwnProperty.call(hlInlineDrafts, flight)
        ? hlInlineDrafts[flight]
        : getEditableHlValue(row, hlNumberMap, {});

      const normalizedHl = normalizeHlNumber(rawValue || "");
      if (!/^HL\d{3,5}$/i.test(normalizedHl)) return;

      nextMap[flight] = normalizedHl;
      savedCount += 1;
    });

    if (savedCount === 0) {
      setHlMappingStatus("저장할 등록기호가 없습니다. 표의 등록기호 칸에 숫자만 입력해 주세요.");
      return;
    }

    const normalizedText = serializeHlMapping(nextMap);
    setHlMappingText(normalizedText);
    saveHlMappingText(normalizedText);

    const incomingRecords = rows
      .map((row) => {
        const flight = getFlightKeyFromRow(row);
        if (!flight || flight === "-") return null;

        const rawValue = Object.prototype.hasOwnProperty.call(hlInlineDrafts, flight)
          ? hlInlineDrafts[flight]
          : getEditableHlValue(row, nextMap, {});
        const registrationNo = normalizeHlNumber(rawValue || "");
        if (!/^HL\d{3,5}$/i.test(registrationNo)) return null;

        return {
          date: getAircraftRegistrationDateFromRow(row),
          flight,
          departureCode: row.departureCode || "",
          arrivalCode: row.arrivalCode || "",
          registrationNo,
          updatedAt: new Date().toISOString(),
        } satisfies AircraftRegistrationRecord;
      })
      .filter((record): record is AircraftRegistrationRecord => Boolean(record));

    const latestRecords = loadAircraftRegistrationRecords();
    let nextAircraftRegistrationRecords = mergeAircraftRegistrationRecords(
      latestRecords,
      incomingRecords,
    );
    let serverRegistrationSyncMessage = "";

    if (incomingRecords.length > 0) {
      try {
        nextAircraftRegistrationRecords = await saveAircraftRegistrationRecordsToServer(incomingRecords, "merge");
        serverRegistrationSyncMessage = " · 서버 저장";
      } catch (serverError) {
        saveAircraftRegistrationRecords(nextAircraftRegistrationRecords);
        serverRegistrationSyncMessage =
          serverError instanceof Error
            ? ` · 서버 저장 실패: ${serverError.message}`
            : " · 서버 저장 실패";
      }
    } else {
      saveAircraftRegistrationRecords(nextAircraftRegistrationRecords);
    }

    setAircraftRegistrationRecords(nextAircraftRegistrationRecords);

    // 이번에 실제로 값이 바뀐 편명만 수동 수정으로 취급 (기존 값이 있어도 새 값으로 덮어씀)
    const changedByFlight = new Map<string, string>();
    rows.forEach((row) => {
      const flight = getFlightKeyFromRow(row);
      if (!flight || flight === "-") return;
      if (!Object.prototype.hasOwnProperty.call(hlInlineDrafts, flight)) return;
      const draftNo = normalizeHlNumber(hlInlineDrafts[flight] || "");
      if (!/^HL\d{3,5}$/i.test(draftNo)) return;
      if (draftNo !== normalizeHlNumber(getRegistrationNo(row))) changedByFlight.set(flight, draftNo);
    });
    const applyChangedOverrides = (targetRows: FlightRow[]) =>
      targetRows.map((row) => {
        const registrationNo = changedByFlight.get(getFlightKeyFromRow(row));
        return registrationNo
          ? {
              ...row,
              hlnbr: registrationNo,
              registrationNo,
              aircraftRegNo: registrationNo,
              registrationNoEdited: true,
            }
          : row;
      });

    const nextRows = applyChangedOverrides(
      applyRegistrationToRows(applyHlMappingToRows(rows, nextMap), nextAircraftRegistrationRecords),
    );
    const nextRooms = rooms.map((room) => ({
      ...room,
      rows: applyChangedOverrides(
        applyRegistrationToRows(applyHlMappingToRows(room.rows || [], nextMap), nextAircraftRegistrationRecords),
      ),
    }));

    setRows(nextRows);
    setRooms(nextRooms);
    saveRooms(nextRooms);
    setHlInlineDrafts({});

    if (flightMode === "registration") {
      try {
        const synced = await syncRegistrationFieldsToScheduleSlots(nextRows);
        setHlMappingStatus(
          `등록기호 ${savedCount}건 저장${serverRegistrationSyncMessage}${
            synced > 0 ? ` · Schedule Flight 카드 ${synced}장 반영` : ""
          }`,
        );
      } catch (error) {
        setHlMappingStatus(
          error instanceof Error
            ? `등록기호 ${savedCount}건 저장${serverRegistrationSyncMessage} · 카드 반영 실패: ${error.message}`
            : `등록기호 ${savedCount}건 저장${serverRegistrationSyncMessage} · 카드 반영 실패`,
        );
      }
      return;
    }

    const nextSelectedRoom = selectedRoom
      ? nextRooms.find((room) => room.id === selectedRoom.id) || null
      : null;

    if (nextSelectedRoom?.fixed) {
      try {
        await saveLatestScheduleToServer(normalizeScheduleRoomRows(nextSelectedRoom));
        setHlMappingStatus(`등록기호 ${savedCount}건 저장${serverRegistrationSyncMessage} · AFOCS SKD/초기화면 반영`);
      } catch (error) {
        setHlMappingStatus(
          error instanceof Error
            ? `등록기호 로컬 저장 완료 · 서버 반영 실패: ${error.message}`
            : "등록기호 로컬 저장 완료 · 서버 반영 실패",
        );
      }
      return;
    }

    setHlMappingStatus(`등록기호 ${savedCount}건 저장${serverRegistrationSyncMessage}`);
  };

  const handleFlightsInputChange = (value: string) => {
    setInput(value.toUpperCase());
  };

  const clearSelectedScheduleFlight = async () => {
    if (!selectedRoom || !selectedRoom.fixed) return;

    const updatedRoom: MonitorRoom = {
      ...selectedRoom,
      flightsInput: "",
      rows: [],
      lastFetchedAt: new Date().toLocaleString("ko-KR"),
    };

    const nextRooms = rooms.map((room) =>
      room.id === selectedRoom.id ? updatedRoom : room
    );

    setInput("");
    setRooms(nextRooms);
    saveRooms(nextRooms);
    setRows([]);
    clearFlightAlertBaselineAndHistory();
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});

    try {
      await saveLatestScheduleToServer(updatedRoom);
      setError("Schedule Flight를 비웠습니다. 초기화면과 AFOCS SKD에도 반영됩니다.");
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? `로컬 Schedule Flight 비우기 완료. 서버 동기화 실패: ${syncError.message}`
          : "로컬 Schedule Flight 비우기 완료. 서버 동기화 중 오류가 발생했습니다.",
      );
    }
  };

  const syncFixedRoomFlightsInput = async () => {
    const normalizedFlights = normalizeFlightsInput(input);
    const normalizedInput = normalizedFlights.join(", ");

    setInput(normalizedInput);

    if (!selectedRoom || !selectedRoom.fixed) return;

    const nextRows = normalizedFlights.length > 0
      ? filterRowsByFlightInput(selectedRoom.rows || [], normalizedFlights)
      : [];
    const updatedRoom: MonitorRoom = {
      ...selectedRoom,
      flightsInput: normalizedInput,
      rows: nextRows,
      lastFetchedAt: new Date().toLocaleString("ko-KR"),
    };

    const nextRooms = rooms.map((room) =>
      room.id === selectedRoom.id ? updatedRoom : room
    );

    setRooms(nextRooms);
    saveRooms(nextRooms);
    setRows(nextRows);
    clearFlightAlertBaselineAndHistory();
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});

    try {
      await saveLatestScheduleToServer(updatedRoom);
      setError(
        normalizedFlights.length > 0
          ? "Schedule Flight 편명 변경을 AFOCS SKD와 최근 Schedule Flight에 동기화했습니다."
          : "Schedule Flight 편명을 모두 비웠습니다. AFOCS SKD와 최근 Schedule Flight도 비워졌습니다.",
      );
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? `로컬 편명 변경 완료. 서버 동기화 실패: ${syncError.message}`
          : "로컬 편명 변경 완료. 서버 동기화 중 오류가 발생했습니다.",
      );
    }
  };

  const resetLookupView = () => {
    setRows([]);
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});
    setError("");
    setLastFetchedAt("");
    setSelectedRoomId("");
    setFixed(false);
  };

  const switchToManualMode = () => {
    setQueryMode("manual");
    if (input === "KJ 전체") setInput("");
    resetLookupView();
  };

  const switchToKjAllMode = () => {
    setQueryMode("kj-all");
    setInput("");
    resetLookupView();
  };

  const handleStartDateTimeChange = (value: string) => {
    setStartDateTime(value);
    if (flightMode !== "registration") {
      updateSelectedRoomDraft({ startDateTime: value });
    }
  };

  const handleEndDateTimeChange = (value: string) => {
    setEndDateTime(value);
    if (flightMode !== "registration") {
      updateSelectedRoomDraft({ endDateTime: value });
    }
  };

  const handleStartDateChange = (value: string) => {
    handleStartDateTimeChange(buildDateTime(value, getTimePart(startDateTime)));
  };

  const handleStartTimeChange = (value: string) => {
    handleStartDateTimeChange(buildDateTime(getDatePart(startDateTime), value));
  };

  const handleEndDateChange = (value: string) => {
    handleEndDateTimeChange(buildDateTime(value, getTimePart(endDateTime)));
  };

  const handleEndTimeChange = (value: string) => {
    handleEndDateTimeChange(buildDateTime(getDatePart(endDateTime), value));
  };

  const handleRegistrationStartDateChange = (value: string) => {
    setRegistrationStartDateTime((prev) => {
      const next = buildDateTime(value, getTimePart(prev));
      saveRegistrationQueryRange(next, registrationEndDateTime || getDefaultEndDateTime());
      return next;
    });
  };

  const handleRegistrationStartTimeChange = (value: string) => {
    setRegistrationStartDateTime((prev) => {
      const next = buildDateTime(getDatePart(prev), value);
      saveRegistrationQueryRange(next, registrationEndDateTime || getDefaultEndDateTime());
      return next;
    });
  };

  const handleRegistrationEndDateChange = (value: string) => {
    setRegistrationEndDateTime((prev) => {
      const next = buildDateTime(value, getTimePart(prev));
      saveRegistrationQueryRange(registrationStartDateTime || getDefaultStartDateTime(), next);
      return next;
    });
  };

  const handleRegistrationEndTimeChange = (value: string) => {
    setRegistrationEndDateTime((prev) => {
      const next = buildDateTime(getDatePart(prev), value);
      saveRegistrationQueryRange(registrationStartDateTime || getDefaultStartDateTime(), next);
      return next;
    });
  };

  const refreshRoomData = async (
    room: MonitorRoom,
    showLoading = true,
    rangeOverride?: { start: string; end: string },
  ) => {
    if (showLoading) {
      setLoading(true);
    }

    setError("");

    try {
      const activeFlights = getActiveRefreshFlights(room);
      const excludedCount = (room.rows || []).filter(isFinalCompletedRow).length;
      let nextRows: FlightRow[];
      const queryStart = rangeOverride?.start || room.startDateTime;
      const queryEnd = rangeOverride?.end || room.endDateTime;

      if (activeFlights.length === 0) {
        nextRows = room.rows || [];
        if (excludedCount > 0) {
          setError("모든 Schedule Flight가 API remark 기준으로 도착 또는 결항 확정되어 재조회 대상에서 제외되었습니다. 화면에는 기존 결과를 유지합니다.");
        }
      } else {
        const res = await fetch(`${BACKEND_URL}/flights/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            flights: activeFlights,
            start: queryStart,
            end: queryEnd,
          }),
        });

        const json = await res.json();

        if (!res.ok || json.success === false) {
          throw new Error(json.message || json.detail || `서버 오류 (${res.status})`);
        }

        nextRows = mergeRowsKeepFinal(room.rows || [], json.data || []);
        nextRows = mergeManualRegistrationFields(room.rows || [], nextRows);
        nextRows = applyRegistrationToRows(
          applyHlMappingToRows(nextRows, hlNumberMap),
          aircraftRegistrationRecordsRef.current.length > 0
            ? aircraftRegistrationRecordsRef.current
            : aircraftRegistrationRecords,
        );
      }

      const fetchedAt = new Date().toLocaleString("ko-KR");
      // 등록번호/AFOCS 전용 기간 조회 시에도 Schedule Flight 카드의 저장 기간은 유지합니다.
      const updatedRoom: MonitorRoom = normalizeScheduleRoomRows({
        ...room,
        rows: nextRows,
        lastFetchedAt: fetchedAt,
      });

      setRooms((prevRooms) => {
        const nextRooms = prevRooms.map((prevRoom) =>
          prevRoom.id === updatedRoom.id ? updatedRoom : prevRoom
        );
        saveRooms(nextRooms);
        return nextRooms;
      });

      if (selectedRoomId === updatedRoom.id) {
        setInput(updatedRoom.flightsInput);
        if (!rangeOverride) {
          setStartDateTime(updatedRoom.startDateTime);
          setEndDateTime(updatedRoom.endDateTime);
        }
        setFixed(updatedRoom.fixed);
        setRows(updatedRoom.rows);
        setLastFetchedAt(fetchedAt);
        setExpandedDetailKeys({});
      }
    } catch (e: any) {
      setError(e.message || "조회 실패");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const savedRooms = loadRooms();
    setRooms(savedRooms);

    void loadScheduleSlots()
      .then((slots) => {
        const activeRoom = slots.active?.room;
        if (activeRoom && isActiveScheduleRoom(activeRoom)) {
          mergeLatestScheduleRoom(loadRooms(), activeRoom);
        }
      })
      .catch(() => {
        void loadLatestScheduleFromServer()
          .then((serverRoom) => {
            const mergedRooms = mergeLatestScheduleRoom(loadRooms(), serverRoom);
            setRooms(mergedRooms);
            saveRooms(mergedRooms);
          })
          .catch(() => {
            // 서버 기준 조회 실패 시 기기 저장값을 유지합니다.
          });
      });

    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get("mode");
    if (modeParam === "edit" || modeParam === "registration" || modeParam === "query") {
      setFlightMode(modeParam);
    }
    const q = params.get("flight");
    const roomId = params.get("roomId");

    if (roomId) {
      setFlightMode("edit");
      void loadScheduleSlots().then((slots) => {
        const matchedSlot =
          (slots.active?.room.id === roomId ? "active" : null) ||
          (slots.archive?.room.id === roomId ? "archive" : null);
        if (matchedSlot) {
          handleSelectSlot(matchedSlot);
        }
      });
      return;
    }

    if (q) {
      const upper = q.toUpperCase();
      const normalized = normalizeFlightsInput(upper).join(", ");
      setQueryMode("manual");
      setInput(normalized);
      void fetchFlights(normalized);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistRoom = (
    roomId: string,
    nextRows: FlightRow[],
    fetchedAt: string,
    nextFixed: boolean = fixed,
    nextInput: string = input,
    nextStartDateTime: string = startDateTime,
    nextEndDateTime: string = endDateTime
  ) => {
    const nextRooms = rooms.map((room) =>
      room.id === roomId
        ? {
            ...room,
            flightsInput: nextInput,
            startDateTime: nextStartDateTime,
            endDateTime: nextEndDateTime,
            fixed: nextFixed,
            lastFetchedAt: fetchedAt,
            rows: nextRows,
          }
        : room
    );
    setRooms(nextRooms);
    saveRooms(nextRooms);
  };

  const fetchFlights = async (flightArg?: string) => {
    const finalInput = (flightArg ?? input).trim();

    if (!finalInput) {
      setError("편명을 입력하세요.");
      return;
    }

    const flights = normalizeFlightsInput(finalInput);

    if (flights.length === 0) {
      setError("편명을 입력하세요.");
      return;
    }

    const keepScheduleContext = Boolean(selectedRoom?.fixed);
    const previousScheduleRows = keepScheduleContext ? selectedRoom?.rows || [] : [];
    const normalizedInput = flights.join(", ");
    const cacheKey = getFlightLookupCacheKey("manual", normalizedInput, startDateTime, endDateTime);
    const cachedLookup = loadFlightLookupCache(cacheKey);

    setQueryMode("manual");
    setInput(normalizedInput);
    if (!keepScheduleContext) {
      setSelectedRoomId("");
      setFixed(false);
    }
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});
    setError("");
    setHlInlineDrafts({});

    const registrationPromise = ensureAircraftRegistrationRecordsFromServer();

    if (cachedLookup) {
      const cachedRows = applyAllRegistrationSources(cachedLookup.rows || []);
      setRows(cachedRows);
      setLastFetchedAt(`${cachedLookup.fetchedAt} · 캐시`);
      setError("최근 조회 결과를 먼저 표시했습니다. 최신 정보로 갱신 중입니다.");

      const initialKeys: Record<string, boolean> = {};
      const initialOrder: string[] = [];
      cachedRows.forEach((row, idx) => {
        if (!isFinalCompletedRow(row)) {
          const key = getSelectionKey(row, idx);
          initialKeys[key] = true;
          initialOrder.push(key);
        }
      });
      setSelectedScheduleKeys(initialKeys);
      setSelectedScheduleOrder(initialOrder);
    } else {
      setRows([]);
      setLastFetchedAt("");
    }

    setLoading(true);

    try {
      const [res, registrationRecords] = await Promise.all([
        fetch(`${BACKEND_URL}/flights/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            flights,
            start: startDateTime,
            end: endDateTime,
          }),
        }),
        registrationPromise,
      ]);

      const json = await res.json();

      if (!res.ok || json.success === false) {
        throw new Error(json.message || json.detail || `서버 오류 (${res.status})`);
      }

      const nextRows = applyAllRegistrationSources(json.data || [], registrationRecords);
      const fetchedAt = new Date().toLocaleString("ko-KR");
      saveFlightLookupCache(cacheKey, nextRows, fetchedAt);

      setRows(nextRows);
      setLastFetchedAt(json.cached ? `${fetchedAt} · 서버 캐시` : fetchedAt);
      setExpandedDetailKeys({});

      const initialKeys: Record<string, boolean> = {};
      const initialOrder: string[] = [];
      nextRows.forEach((row, idx) => {
        if (!isFinalCompletedRow(row)) {
          const key = getSelectionKey(row, idx);
          initialKeys[key] = true;
          initialOrder.push(key);
        }
      });
      setSelectedScheduleKeys(initialKeys);
      setSelectedScheduleOrder(initialOrder);

      if (keepScheduleContext && selectedRoom) {
        const mergedInput = mergeFlightsInput(selectedRoom.flightsInput, normalizedInput);
        const mergedRows = mergeScheduleRowsByFlight(previousScheduleRows, nextRows);
        const updatedRoom: MonitorRoom = {
          ...selectedRoom,
          flightsInput: mergedInput,
          rows: mergedRows,
          lastFetchedAt: fetchedAt,
        };

        const nextRooms = mergeLatestScheduleRoom(rooms, updatedRoom);
        setRooms(nextRooms);
        saveRooms(nextRooms);
        setSelectedRoomId(updatedRoom.id);
        setFixed(true);
        const missingFlights = getMissingInputFlights(flights.join(", "), nextRows);
        setError(
          missingFlights.length > 0
            ? `추가 편명 조회 완료. 조회 결과가 없는 편명은 저장 대상에서 제외됩니다: ${missingFlights.join(", ")}`
            : "추가 편명 조회 완료. 결과 행의 +를 선택한 뒤 ‘선택한 Schedule Flight 저장’을 누르면 기존 정보에 병합됩니다.",
        );
        return;
      }

      if (selectedRoomId) {
        persistRoom(
          selectedRoomId,
          nextRows,
          fetchedAt,
          fixed,
          normalizedInput,
          startDateTime,
          endDateTime
        );
      }
    } catch (e: any) {
      setError(e.message || "조회 실패");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllKjFlights = async () => {
    const cacheKey = getFlightLookupCacheKey("kj-all", "KJ_ALL", startDateTime, endDateTime);
    const cachedLookup = loadFlightLookupCache(cacheKey);

    setQueryMode("kj-all");
    setSelectedRoomId("");
    setFixed(false);
    setExpandedDetailKeys({});
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setError("");
    setHlInlineDrafts({});

    const registrationPromise = ensureAircraftRegistrationRecordsFromServer();

    if (cachedLookup) {
      const cachedRows = applyAllRegistrationSources(cachedLookup.rows || []);
      setRows(cachedRows);
      setLastFetchedAt(`${cachedLookup.fetchedAt} · 캐시`);
      setError("최근 KJ 전체 조회 결과를 먼저 표시했습니다. 최신 정보로 갱신 중입니다.");

      const initialKeys: Record<string, boolean> = {};
      const initialOrder: string[] = [];
      cachedRows.forEach((row, idx) => {
        if (!isFinalCompletedRow(row)) {
          const key = getSelectionKey(row, idx);
          initialKeys[key] = true;
          initialOrder.push(key);
        }
      });
      setSelectedScheduleKeys(initialKeys);
      setSelectedScheduleOrder(initialOrder);
    } else {
      setRows([]);
      setLastFetchedAt("");
    }

    setLoading(true);

    try {
      const [res, registrationRecords] = await Promise.all([
        fetch(`${BACKEND_URL}/flights/kj-all`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            start: startDateTime,
            end: endDateTime,
          }),
        }),
        registrationPromise,
      ]);

      const json = await res.json();

      if (!res.ok || json.success === false) {
        throw new Error(
          json.message ||
            json.detail ||
            (res.status === 404
              ? "KJ 전체 조회 API가 아직 백엔드에 반영되지 않았습니다. Render 백엔드 배포를 확인하세요."
              : `서버 오류 (${res.status})`)
        );
      }

      const nextRows = applyAllRegistrationSources(json.data || [], registrationRecords);
      const fetchedAt = new Date().toLocaleString("ko-KR");
      saveFlightLookupCache(cacheKey, nextRows, fetchedAt);

      setRows(nextRows);
      setLastFetchedAt(json.cached ? `${fetchedAt} · 서버 캐시` : fetchedAt);
      setExpandedDetailKeys({});

      const initialKeys: Record<string, boolean> = {};
      const initialOrder: string[] = [];
      nextRows.forEach((row, idx) => {
        if (!isFinalCompletedRow(row)) {
          const key = getSelectionKey(row, idx);
          initialKeys[key] = true;
          initialOrder.push(key);
        }
      });
      setSelectedScheduleKeys(initialKeys);
      setSelectedScheduleOrder(initialOrder);
      if (nextRows.length === 0) {
        setError(json.message || "조회 결과가 없습니다. 기간을 넓히거나 인천 화물기 API 상태를 확인하세요.");
      }
    } catch (e: any) {
      setError(e.message || "KJ 전체 조회 실패");
    } finally {
      setLoading(false);
    }
  };

  const fetchRegistrationFlights = async () => {
    if (!registrationStartDateTime || !registrationEndDateTime) {
      setError("등록번호/AFOCS 조회 기간을 먼저 설정하세요.");
      return;
    }

    const flights = normalizeFlightsInput(input);
    if (flights.length === 0) {
      setError("편명을 입력하세요. 예: 247,972 또는 KJ247,KJ972");
      return;
    }

    saveRegistrationQueryRange(registrationStartDateTime, registrationEndDateTime);
    const normalizedInput = flights.join(", ");
    const cacheKey = getFlightLookupCacheKey(
      "manual",
      `REG|${normalizedInput}`,
      registrationStartDateTime,
      registrationEndDateTime,
    );

    setQueryMode("manual");
    setInput(normalizedInput);
    setFixed(false);
    setSelectedRoomId("");
    setSelectedSlotKey(null);
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});
    setError("");
    setHlInlineDrafts({});
    setLoading(true);

    try {
      const [res, registrationRecords] = await Promise.all([
        fetch(`${BACKEND_URL}/flights/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flights,
            start: registrationStartDateTime,
            end: registrationEndDateTime,
          }),
        }),
        ensureAircraftRegistrationRecordsFromServer(),
      ]);
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.message || json.detail || `서버 오류 (${res.status})`);
      }

      const nextRows = applyAllRegistrationSources(json.data || [], registrationRecords);
      const fetchedAt = new Date().toLocaleString("ko-KR");
      saveFlightLookupCache(cacheKey, nextRows, fetchedAt);
      setRows(nextRows);
      setLastFetchedAt(json.cached ? `${fetchedAt} · 서버 캐시` : fetchedAt);
      setHlMappingStatus(
        `등록 전용 기간(${registrationStartDateTime.replace("T", " ")} ~ ${registrationEndDateTime.replace("T", " ")}) 편명 조회 ${nextRows.length}건`,
      );
      if (nextRows.length === 0) {
        setError("조회 결과가 없습니다. 기간 또는 편명을 확인해 주세요.");
      }
    } catch (e: any) {
      setError(e.message || "등록 조회 실패");
    } finally {
      setLoading(false);
    }
  };

  const fetchRegistrationKjAll = async () => {
    if (!registrationStartDateTime || !registrationEndDateTime) {
      setError("등록번호/AFOCS 조회 기간을 먼저 설정하세요.");
      return;
    }

    saveRegistrationQueryRange(registrationStartDateTime, registrationEndDateTime);
    const cacheKey = getFlightLookupCacheKey(
      "kj-all",
      "REG_KJ_ALL",
      registrationStartDateTime,
      registrationEndDateTime,
    );

    setQueryMode("kj-all");
    setFixed(false);
    setSelectedRoomId("");
    setSelectedSlotKey(null);
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});
    setError("");
    setHlInlineDrafts({});
    setLoading(true);

    try {
      const [res, registrationRecords] = await Promise.all([
        fetch(`${BACKEND_URL}/flights/kj-all`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start: registrationStartDateTime,
            end: registrationEndDateTime,
          }),
        }),
        ensureAircraftRegistrationRecordsFromServer(),
      ]);
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.message || json.detail || `서버 오류 (${res.status})`);
      }

      const nextRows = applyAllRegistrationSources(json.data || [], registrationRecords);
      const fetchedAt = new Date().toLocaleString("ko-KR");
      saveFlightLookupCache(cacheKey, nextRows, fetchedAt);
      setRows(nextRows);
      setLastFetchedAt(json.cached ? `${fetchedAt} · 서버 캐시` : fetchedAt);
      setHlMappingStatus(
        `등록 전용 기간(${registrationStartDateTime.replace("T", " ")} ~ ${registrationEndDateTime.replace("T", " ")}) KJ 전체 ${nextRows.length}건`,
      );
      if (nextRows.length === 0) {
        setError(json.message || "조회 결과가 없습니다. 기간을 확인해 주세요.");
      }
    } catch (e: any) {
      setError(e.message || "등록 KJ 전체 조회 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleScheduleSelection = (row: FlightRow, idx: number) => {
    if (isFinalCompletedRow(row)) return;

    const key = getSelectionKey(row, idx);

    setSelectedScheduleKeys((prev) => {
      const nextSelected = !prev[key];

      setSelectedScheduleOrder((prevOrder) => {
        if (nextSelected) {
          return prevOrder.includes(key) ? prevOrder : [...prevOrder, key];
        }

        return prevOrder.filter((itemKey) => itemKey !== key);
      });

      return {
        ...prev,
        [key]: nextSelected,
      };
    });
  };

  const handleDeleteSelectedFlightsFromSchedule = async () => {
    if (!selectedRoom?.fixed || selectedScheduleRows.length === 0) return;

    const targetFlights = selectedScheduleRows
      .map((r) => normalizeFlightKey(getFlightDisplay(r)))
      .filter((f): f is string => Boolean(f));

    if (targetFlights.length === 0) return;

    const confirmed = window.confirm(
      `선택한 ${targetFlights.length}개 편명을 Schedule Flight에서 삭제할까요?`
    );
    if (!confirmed) return;

    let updatedRoom = selectedRoom;
    for (const flight of targetFlights) {
      updatedRoom = removeFlightFromScheduleRoom(updatedRoom, flight);
    }

    const hasRemaining = isActiveScheduleRoom(updatedRoom);

    const nextRooms = hasRemaining
      ? mergeLatestScheduleRoom(rooms, updatedRoom)
      : removeEmptyScheduleRooms(rooms.map((room) => (room.id === selectedRoom.id ? updatedRoom : room)));

    setRooms(nextRooms);
    saveRooms(nextRooms);
    setRows(updatedRoom.rows || []);
    setInput(updatedRoom.flightsInput);
    setLastFetchedAt(updatedRoom.lastFetchedAt);
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});
    clearFlightAlertBaselineAndHistory();

    if (!hasRemaining) {
      setSelectedRoomId("");
      setFixed(false);
    } else {
      setSelectedRoomId(updatedRoom.id);
      setFixed(true);
    }

    try {
      const targetSlot = selectedSlotKey || "active";
      const result = await saveScheduleSlotToServer(updatedRoom, {
        rotate: false,
        slot: targetSlot,
      });
      applyScheduleSlotsState(
        {
          active: result.active,
          archive: result.archive,
          linkedSlot: result.linkedSlot,
        },
        targetSlot,
      );
      // 연동 슬롯 삭제는 latest-schedule에도 명시 반영해 초기화면 재진입 시 되살림을 막습니다.
      if (targetSlot === result.linkedSlot) {
        await saveLatestScheduleToServer(normalizeScheduleRoomRows(updatedRoom));
      }
      if (typeof window !== "undefined") {
        if (!hasRemaining) {
          window.localStorage.removeItem(LAST_FIXED_ROOM_KEY);
        }
        window.localStorage.setItem("cargo_ops_latest_schedule_updated_at", new Date().toISOString());
      }

      setError(
        hasRemaining
          ? `선택한 편명(${targetFlights.join(", ")}) 삭제 완료. 초기화면과 AFOCS SKD에도 반영됩니다.`
          : `선택한 편명 삭제 완료. 남은 편명이 없어 Schedule Flight를 비웠습니다.`,
      );
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? `로컬 삭제 완료. 서버 동기화 실패: ${syncError.message}`
          : `로컬 삭제 완료. 서버 동기화 중 오류가 발생했습니다.`,
      );
    }
  };

  const mergeScheduleRowsByFlight = (baseRows: FlightRow[], addRows: FlightRow[]) => {
    const mergedMap = new Map<string, FlightRow>();

    baseRows.forEach((row) => {
      const flight = (row.flightId || row.flightNo || "").replace(/\s+/g, "").toUpperCase();
      if (!flight) return;
      mergedMap.set(flight, row);
    });

    addRows.forEach((row) => {
      const flight = (row.flightId || row.flightNo || "").replace(/\s+/g, "").toUpperCase();
      if (!flight) return;
      const existing = mergedMap.get(flight);
      mergedMap.set(flight, existing ? mergeRowPreservingAfocsSkd(existing, row) : row);
    });

    return Array.from(mergedMap.values());
  };

  const mergeFlightsInput = (baseInput: string, addInput: string) => {
    const values = [...normalizeFlightsInput(baseInput), ...normalizeFlightsInput(addInput)];
    const seen = new Set<string>();
    const merged: string[] = [];

    values.forEach((flight) => {
      const key = flight.replace(/\s+/g, "").toUpperCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(key);
    });

    return merged.join(", ");
  };

  const getFlightsFromRowsInOrder = (targetRows: FlightRow[]) => {
    const seen = new Set<string>();
    const flights: string[] = [];

    targetRows.forEach((row) => {
      const flight = (row.flightId || row.flightNo || "").replace(/\s+/g, "").toUpperCase();
      if (!flight || seen.has(flight)) return;
      seen.add(flight);
      flights.push(flight);
    });

    return flights;
  };

  const getMissingInputFlights = (inputText: string, targetRows: FlightRow[]) => {
    const found = new Set(
      targetRows
        .map((row) => (row.flightId || row.flightNo || "").replace(/\s+/g, "").toUpperCase())
        .filter(Boolean),
    );

    return normalizeFlightsInput(inputText).filter((flight) => !found.has(flight));
  };

  const buildScheduleFlightsInputFromRows = (targetRows: FlightRow[]) => {
    return getFlightsFromRowsInOrder(targetRows).join(", ");
  };

  const handleSaveSelectedSchedule = async () => {
    if (selectedScheduleRows.length === 0) {
      const missingFlights = getMissingInputFlights(input, rows);
      setError(
        missingFlights.length > 0
          ? `조회 결과가 없는 편명은 Schedule Flight에 저장할 수 없습니다: ${missingFlights.join(", ")}`
          : "저장할 항공편을 선택하세요.",
      );
      return;
    }

    const selectedRowsWithDrafts = applyInlineHlDraftsToRows(selectedScheduleRows, hlInlineDrafts);
    await persistRegistrationDraftsForRows(selectedRowsWithDrafts);
    const selectedRowsWithHl = applyAllRegistrationSources(selectedRowsWithDrafts);
    const selectedFlights = getFlightsFromRowsInOrder(selectedRowsWithHl);
    if (selectedFlights.length === 0) {
      setError("선택한 결과에서 편명을 확인하지 못했습니다.");
      return;
    }

    const missingFlights = getMissingInputFlights(input, rows);
    const now = new Date();
    const editBaseRoom =
      flightMode === "edit" && selectedSlotKey
        ? scheduleSlots[selectedSlotKey]?.room
        : flightMode === "edit" && selectedRoom?.fixed
          ? selectedRoom
          : null;
    const baseScheduleRoom = editBaseRoom ? normalizeScheduleRoomRows(editBaseRoom) : null;
    const selectedOnlyRows = buildScheduleRowsForFlights(selectedRowsWithHl, selectedFlights);
    const baseRows = baseScheduleRoom
      ? buildScheduleRowsForFlights(baseScheduleRoom.rows || [], normalizeFlightsInput(baseScheduleRoom.flightsInput))
      : [];
    const mergedRows = baseScheduleRoom
      ? mergeScheduleRowsByFlight(baseRows, selectedOnlyRows)
      : selectedOnlyRows;
    const mergedFlightsInput = buildScheduleFlightsInputFromRows(mergedRows);

    const baseRoom: MonitorRoom = normalizeScheduleRoomRows({
      id: baseScheduleRoom?.id || `${now.getTime()}`,
      name:
        baseScheduleRoom?.name ||
        formatScheduleCardName(baseScheduleRoom?.startDateTime || startDateTime, now),
      flightsInput: mergedFlightsInput,
      startDateTime: baseScheduleRoom?.startDateTime || startDateTime,
      endDateTime: baseScheduleRoom?.endDateTime || endDateTime,
      fixed: true,
      lastFetchedAt: new Date().toISOString(),
      rows: mergedRows,
    });

    const shouldRotate = flightMode === "query";
    const targetSlot =
      flightMode === "edit" ? selectedSlotKey || "active" : undefined;

    if (flightMode === "edit" && !targetSlot) {
      setError("수정할 Schedule Flight 카드를 먼저 선택하세요.");
      return;
    }

    setError(
      shouldRotate
        ? "Schedule Flight 활성 카드로 저장 중입니다. 기존 활성 카드는 직전 보관으로 이동합니다."
        : "선택한 Schedule Flight 카드에 저장 중입니다.",
    );

    let finalRoom = baseRoom;

    try {
      const result = await saveScheduleSlotToServer(baseRoom, {
        rotate: shouldRotate,
        slot: targetSlot,
      });
      applyScheduleSlotsState(
        {
          active: result.active,
          archive: result.archive,
          linkedSlot: result.linkedSlot,
        },
        shouldRotate ? "active" : targetSlot || "active",
      );

      finalRoom =
        (shouldRotate ? result.active?.room : result[targetSlot || "active"]?.room) || baseRoom;
      finalRoom = normalizeScheduleRoomRows(finalRoom);

      setError(
        missingFlights.length > 0
          ? `저장 완료. 조회 결과가 없는 편명은 제외했습니다: ${missingFlights.join(", ")}${
              result.rotated ? " · 직전 활성 카드는 보관 슬롯으로 이동했습니다." : ""
            }`
          : result.rotated
            ? "저장 완료 · 활성 카드 갱신 · 직전 활성은 보관 · 초기화면/AFOCS SKD 반영"
            : "저장 완료 · 선택 카드 반영 · 초기화면/AFOCS SKD 반영",
      );
    } catch (syncError) {
      const nextRooms = mergeLatestScheduleRoom(rooms, baseRoom);
      setRooms(nextRooms);
      saveRooms(nextRooms);
      setError(
        syncError instanceof Error
          ? `서버 동기화 실패. 이 기기에는 저장했습니다: ${syncError.message}`
          : "서버 동기화 실패. 이 기기에는 저장했습니다.",
      );
      finalRoom = baseRoom;
    }

    clearFlightAlertBaselineAndHistory();
    setSelectedRoomId(finalRoom.id);
    setInput(finalRoom.flightsInput);
    setRows(finalRoom.rows);
    setLastFetchedAt(finalRoom.lastFetchedAt);
    setFixed(flightMode !== "query");
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});

    if (typeof window !== "undefined") {
      window.localStorage.setItem("cargo_ops_latest_schedule_updated_at", new Date().toISOString());
    }
  };

  const refreshSelectedRoom = async () => {
    if (!selectedRoom) {
      setError("다시 조회할 Monitor를 먼저 선택하세요.");
      return;
    }

    if (flightMode === "registration") {
      if (!registrationStartDateTime || !registrationEndDateTime) {
        setError("등록번호/AFOCS 조회 기간을 먼저 설정하세요.");
        return;
      }
      saveRegistrationQueryRange(registrationStartDateTime, registrationEndDateTime);
      await refreshRoomData(selectedRoom, true, {
        start: registrationStartDateTime,
        end: registrationEndDateTime,
      });
      setHlMappingStatus(
        `등록 전용 기간(${registrationStartDateTime.replace("T", " ")} ~ ${registrationEndDateTime.replace("T", " ")})으로 조회했습니다. Schedule Flight 카드 저장 기간은 유지됩니다.`,
      );
      return;
    }

    await refreshRoomData(selectedRoom);
  };

  const handleToggleDetail = (rowKey: string) => {
    setExpandedDetailKeys((prev) => ({
      ...prev,
      [rowKey]: !prev[rowKey],
    }));
  };

  const openAfocsSkd = () => {
    if (!selectedRoom) {
      setError("선택된 Schedule Flight가 없습니다.");
      return;
    }

    router.push("/fixed-lite");
  };

  const handleFlightModeChange = (mode: FlightMode) => {
    setFlightMode(mode);
    setError("");

    if (mode === "home-link") {
      setFixed(false);
      setSelectedScheduleKeys({});
      setSelectedScheduleOrder([]);
      return;
    }

    if (mode === "query") {
      setFixed(false);
      setSelectedScheduleKeys({});
      setSelectedScheduleOrder([]);
      return;
    }

    if (mode === "registration") {
      const saved = loadRegistrationQueryRange();
      setRegistrationStartDateTime(
        (prev) => prev || saved?.start || getDefaultStartDateTime(),
      );
      setRegistrationEndDateTime(
        (prev) => prev || saved?.end || getDefaultEndDateTime(),
      );
      setFixed(false);
      setSelectedSlotKey(null);
      setSelectedRoomId("");
      setSelectedScheduleKeys({});
      setSelectedScheduleOrder([]);
      setExpandedDetailKeys({});
      setRows([]);
      setLastFetchedAt("");
      setError("");
      setHlMappingStatus("");
      setQueryMode("kj-all");
      return;
    }

    const preferredSlot =
      selectedSlotKey ||
      (scheduleSlots.active ? "active" : scheduleSlots.archive ? "archive" : null);

    if (!preferredSlot) {
      setError("먼저 ① 편명 조회 및 저장에서 Schedule Flight 카드를 저장하세요.");
      return;
    }

    handleSelectSlot(preferredSlot);
  };

  const selectedRoomCounts = useMemo(
    () => (selectedRoom ? getAlertCounts(selectedRoom.rows) : null),
    [selectedRoom]
  );

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#07152b",
        color: "white",
      }}
    >
      <aside
        style={{
          width: 340,
          borderRight: "1px solid #1f2a44",
          padding: 20,
          background: "#06101f",
        }}
      >
        <h3 style={{ fontSize: 20, marginBottom: 8 }}>Schedule Flight</h3>
        <p style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.5, marginBottom: 16 }}>
          최대 2장(NOW FLT + After). 초기화면 연동은 보라색 NOW FLT 카드에서 선택합니다.
        </p>

        <ScheduleSlotCards
          slots={scheduleSlots}
          selectedSlot={selectedSlotKey}
          onSelect={handleSelectSlot}
          onDelete={(slotKey) => void handleDeleteSlot(slotKey)}
          onDeleteAll={() => void handleDeleteAllSlots()}
          onLink={(slotKey) => void handleLinkSlot(slotKey)}
          onRestore={() => void handleRestoreArchiveSlot()}
          showRestore={flightMode === "edit"}
        />
      </aside>

      <main style={{ flex: 1, padding: 40 }}>
        <FlightsModeTabs mode={flightMode} onChange={handleFlightModeChange} />

        {flightMode === "home-link" && (
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 24, margin: "0 0 8px 0" }}>④ 초기화면 선택</h2>
            <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
              NOW FLT 또는 After 카드 중 초기화면 Scheduled Flight에 연동할 카드를 선택하세요.
            </p>
            <ScheduleSlotCards
              slots={scheduleSlots}
              selectedSlot={scheduleSlots.linkedSlot}
              onSelect={(slotKey) => void handleLinkSlot(slotKey)}
              onDelete={(slotKey) => void handleDeleteSlot(slotKey)}
              onDeleteAll={() => void handleDeleteAllSlots()}
              onLink={(slotKey) => void handleLinkSlot(slotKey)}
            />
          </section>
        )}

        {flightMode === "edit" && !selectedSlotKey && (
          <div style={{ color: "#94a3b8", marginBottom: 16, fontSize: 14 }}>
            왼쪽에서 수정할 Schedule Flight 카드를 선택하세요.
          </div>
        )}

        {flightMode === "registration" && (
          <div style={{ color: "#94a3b8", marginBottom: 12, fontSize: 13, lineHeight: 1.55 }}>
            왼쪽 Schedule Flight 카드와 별개로 동작합니다. 카드 선택 없이 전용 기간으로 조회·등록하세요.
            <br />
            등록번호 확정: ① 편명조회에서 직접 등록한 값(매뉴얼) → ② 이 화면(등록번호/AFOCS) 저장값. 매뉴얼 값이 있으면 AFOCS 값으로 덮지 않습니다.
          </div>
        )}

        {flightMode === "edit" && selectedSlotKey && fixed ? (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 20,
              }}
            >
              <div>
                <h2 style={{ fontSize: 28, margin: 0 }}>✈️ 편명 수정</h2>
                <p style={{ color: "#9fb3c8", margin: "6px 0 0 0", fontSize: 14 }}>
                  선택한 Schedule Flight 카드의 편명을 추가·삭제합니다.
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    setFixed(false);
                    setExpandedDetailKeys({});
                  }}
                  style={{
                    padding: "10px 18px",
                    background: "#2563eb",
                    color: "white",
                    border: "none",
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 800,
                    cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
                  }}
                >
                  + 편명 추가/조회
                </button>
                <button
                  type="button"
                  onClick={openAfocsSkd}
                  style={{
                    padding: "10px 18px",
                    background: "#1e293b",
                    color: "#bfdbfe",
                    border: "1px solid rgba(96, 165, 250, 0.3)",
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  AFOCS SKD 열기
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  style={{
                    padding: "10px 18px",
                    background: "#334155",
                    color: "#f8fafc",
                    border: "none",
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  초기화면
                </button>
              </div>
            </div>
          </>
        ) : null}

        {flightMode === "registration" && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 20,
              }}
            >
              <div>
                <h2 style={{ fontSize: 28, margin: 0 }}>✈️ 등록번호 / AFOCS 저장</h2>
                <p style={{ color: "#9fb3c8", margin: "6px 0 0 0", fontSize: 14 }}>
                  전용 조회 기간으로 조회한 뒤 등록번호·AFOCS SKD를 입력·저장합니다. 편명조회에서 이미 등록한 번호가 있으면 그대로 두고, 없는 편만 여기서 채웁니다.
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={openAfocsSkd} style={homeButtonStyle}>
                  AFOCS SKD 열기
                </button>
                <button type="button" onClick={() => router.push("/")} style={homeButtonStyle}>
                  초기화면
                </button>
              </div>
            </div>

            <div
              style={{
                marginBottom: 16,
                padding: 16,
                background: "#0a1528",
                border: "1px solid #3b82f6",
                borderRadius: 10,
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 6, color: "#e5edf7", fontSize: 16 }}>
                ① 등록번호 / AFOCS 전용 조회 기간
              </div>
              <div style={{ color: "#9fb3c8", fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>
                왼쪽 카드 기간·편명과 무관합니다. 기간을 설정한 뒤 편명 또는 KJ 전체로 조회하세요.
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 180px 90px 140px",
                  gap: 12,
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <label style={{ color: "#9fb3c8", fontSize: 13 }}>시작일</label>
                <input
                  type="date"
                  value={getDatePart(registrationStartDateTime)}
                  onChange={(e) => handleRegistrationStartDateChange(e.target.value)}
                  style={dateInputStyle}
                />
                <label style={{ color: "#9fb3c8", fontSize: 13 }}>시작시간</label>
                <TimeSelect24
                  value={getTimePart(registrationStartDateTime)}
                  onChange={handleRegistrationStartTimeChange}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 180px 90px 140px",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <label style={{ color: "#9fb3c8", fontSize: 13 }}>종료일</label>
                <input
                  type="date"
                  value={getDatePart(registrationEndDateTime)}
                  onChange={(e) => handleRegistrationEndDateChange(e.target.value)}
                  style={dateInputStyle}
                />
                <label style={{ color: "#9fb3c8", fontSize: 13 }}>종료시간</label>
                <TimeSelect24
                  value={getTimePart(registrationEndDateTime)}
                  onChange={handleRegistrationEndTimeChange}
                />
              </div>

              <div style={{ color: "#93c5fd", marginTop: 12, fontSize: 13 }}>
                등록 조회 범위: {registrationRangeText}
              </div>
            </div>

            <div style={queryButtonRowStyle}>
              <button
                onClick={() => {
                  setQueryMode("manual");
                  if (input === "KJ 전체") setInput("");
                }}
                style={queryMode === "manual" ? modeActiveBtn : modeBtn}
              >
                편명 직접 조회
              </button>
              <button
                onClick={() => {
                  setQueryMode("kj-all");
                  setInput("");
                }}
                style={queryMode === "kj-all" ? modeActiveBtn : modeBtn}
              >
                KJ 전체 조회
              </button>
            </div>

            {queryMode === "manual" ? (
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <input
                  value={input}
                  onChange={(e) => handleFlightsInputChange(e.target.value)}
                  placeholder="예: 247,972 또는 KJ247,KJ972"
                  style={{
                    flex: 1,
                    padding: 12,
                    background: "#111",
                    border: "1px solid #444",
                    borderRadius: 6,
                    color: "white",
                    fontSize: 16,
                  }}
                />
              </div>
            ) : (
              <div style={{ marginTop: 14, color: "#93c5fd", fontSize: 14, lineHeight: 1.55 }}>
                등록 전용 기간의 KJ 화물기를 전체 조회합니다. Schedule Flight 카드는 변경되지 않습니다.
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              {queryMode === "manual" ? (
                <button
                  onClick={() => void fetchRegistrationFlights()}
                  disabled={loading}
                  style={primaryBtn}
                >
                  ② 이 기간으로 편명 조회
                </button>
              ) : (
                <button
                  onClick={() => void fetchRegistrationKjAll()}
                  disabled={loading}
                  style={primaryBtn}
                >
                  ② 이 기간으로 KJ 전체 조회
                </button>
              )}
            </div>
          </>
        )}

        {(flightMode === "query" || (flightMode === "edit" && !fixed)) && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 20,
              }}
            >
              <div>
                <h2 style={{ fontSize: 28, margin: 0 }}>
                  {flightMode === "query" ? "✈️ 편명 조회 및 저장" : "✈️ 편명 추가/조회"}
                </h2>
                <p style={{ color: "#9fb3c8", margin: "6px 0 0 0", fontSize: 14 }}>
                  {flightMode === "query"
                    ? "편명 또는 KJ 전체를 조회한 뒤 선택 항목을 Schedule Flight 활성 카드로 저장합니다."
                    : "추가할 편명을 조회한 뒤 선택 카드에 병합 저장합니다."}
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {flightMode === "edit" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedSlotKey) handleSelectSlot(selectedSlotKey);
                    }}
                    style={homeButtonStyle}
                  >
                    ◀ 편명 목록으로
                  </button>
                )}
                <button type="button" onClick={() => router.push("/")} style={homeButtonStyle}>
                  초기화면
                </button>
              </div>
            </div>

            <div style={queryButtonRowStyle}>
              <button
                onClick={switchToManualMode}
                style={queryMode === "manual" ? modeActiveBtn : modeBtn}
              >
                편명 직접 조회
              </button>
              <button
                onClick={switchToKjAllMode}
                style={queryMode === "kj-all" ? modeActiveBtn : modeBtn}
              >
                KJ 전체 조회
              </button>
              <button onClick={() => router.push("/")} style={homeButtonStyle}>
                초기화면
              </button>
            </div>

            {queryMode === "manual" ? (
              <>
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <input
                    value={input}
                    onChange={(e) => handleFlightsInputChange(e.target.value)}
                    onBlur={() => {
                      if (isSelectedFixedRoom && input.trim() === "") {
                        void clearSelectedScheduleFlight();
                        return;
                      }

                      void syncFixedRoomFlightsInput();
                    }}
                    placeholder="예: 247,972 또는 KJ247,KJ972"
                    style={{
                      flex: 1,
                      padding: 12,
                      background: "#111",
                      border: "1px solid #444",
                      borderRadius: 6,
                      color: "white",
                      fontSize: 16,
                    }}
                  />
                </div>

                <div style={{ marginTop: 8, color: "#9fb3c8", fontSize: 13 }}>
                  숫자 3~4자리만 입력하면 KJ를 자동으로 붙여 조회합니다.
                </div>
              </>
            ) : (
              <div style={{ marginTop: 14, color: "#93c5fd", fontSize: 14, lineHeight: 1.55 }}>
                기본 24시간 범위의 KJ 화물기를 전체 조회합니다. 시작/종료 시간은 아래에서 변경할 수 있습니다.
                <br />
                KJ 전체 조회로 전환하면 기존 편명 직접 조회 결과는 비우고 새 조회 결과만 표시합니다.
                <br />
                remark가 도착 또는 결항으로 확정된 항목은 Schedule Flight 선택 대상에서 제외됩니다.
              </div>
            )}

            {!isSelectedFixedRoom && (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "90px 180px 90px 140px",
                    gap: 12,
                    marginTop: 16,
                    alignItems: "center",
                  }}
                >
                  <label>시작일</label>
                  <input
                    type="date"
                    value={getDatePart(startDateTime)}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    style={dateInputStyle}
                  />

                  <label>시작시간</label>
                  <TimeSelect24
                    value={getTimePart(startDateTime)}
                    onChange={handleStartTimeChange}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "90px 180px 90px 140px",
                    gap: 12,
                    marginTop: 12,
                    alignItems: "center",
                  }}
                >
                  <label>종료일</label>
                  <input
                    type="date"
                    value={getDatePart(endDateTime)}
                    onChange={(e) => handleEndDateChange(e.target.value)}
                    style={dateInputStyle}
                  />

                  <label>종료시간</label>
                  <TimeSelect24
                    value={getTimePart(endDateTime)}
                    onChange={handleEndTimeChange}
                  />
                </div>

                <div style={{ marginTop: 10, color: "#9fb3c8", fontSize: 14 }}>
                  현재 조회 범위: {currentRangeText}
                </div>
              </>
            )}

            {flightMode === "edit" && isSelectedFixedRoom && (
              <div style={scheduleSaveGuideStyle}>
                선택한 Schedule Flight 카드에 병합 저장합니다. 필요 시 체크를 해제해 제외하세요.
              </div>
            )}

            {flightMode === "query" && scheduleSlots.active && (
              <div style={scheduleSaveGuideStyle}>
                저장 시 기존 <b style={{ color: "#c084fc" }}>NOW FLT</b> 카드는{" "}
                <b style={{ color: "#94a3b8" }}>After</b>로 이동합니다.
                {scheduleSlots.linkedSlot === "archive" ? (
                  <>
                    {" "}
                    현재 <b style={{ color: "#c084fc" }}>초기화면 연동</b>은 After 카드에 연결되어 있어,
                    새 저장만으로는 초기화면이 바뀌지 않습니다.
                  </>
                ) : (
                  <>
                    {" "}
                    초기화면 연동이 <b style={{ color: "#c084fc" }}>NOW FLT</b>에 연결되어 있으면 저장과
                    함께 초기화면도 갱신됩니다.
                  </>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              {queryMode === "manual" ? (
                <button onClick={() => void fetchFlights()} disabled={loading} style={primaryBtn}>
                  편명 조회
                </button>
              ) : (
                <button onClick={() => void fetchAllKjFlights()} disabled={loading} style={primaryBtn}>
                  KJ 전체 조회
                </button>
              )}

              {rows.length > 0 && (
                <>
                  <button type="button" onClick={handleSelectAllScheduleRows} style={modeBtn}>
                    전체 선택
                  </button>
                  <button type="button" onClick={handleClearAllScheduleRows} style={modeBtn}>
                    전체 해제
                  </button>
                </>
              )}

              <button
                onClick={() => void handleSaveSelectedSchedule()}
                disabled={selectedScheduleRows.length === 0}
                style={selectedScheduleRows.length > 0 ? saveScheduleBtn : disabledBtn}
              >
                {selectedScheduleRows.length > 0
                  ? flightMode === "query"
                    ? `선택 ${selectedScheduleRows.length}건 NOW FLT 저장`
                    : `선택 ${selectedScheduleRows.length}건 카드에 저장`
                  : "저장할 항공편 선택"}
              </button>
            </div>
          </>
        )}

        {lastFetchedAt && (
          <div style={{ marginTop: 6, color: "#9fb3c8", fontSize: 13 }}>
            마지막 조회 시각: {lastFetchedAt}
          </div>
        )}

        <div
          style={{
            marginTop: 18,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {alertCounts.delay > 0 && <span style={badgeOrange}>지연 {alertCounts.delay}</span>}
          {alertCounts.gateChanged > 0 && (
            <span style={badgePurple}>게이트 변경 {alertCounts.gateChanged}</span>
          )}
          {alertCounts.canceled > 0 && <span style={badgeRed}>결항 {alertCounts.canceled}</span>}
          {rows.length > 0 &&
            alertCounts.delay + alertCounts.gateChanged + alertCounts.canceled === 0 && (
              <span style={badgeNormal}>이상 없음</span>
            )}
        </div>

        {(flightMode === "query" || (flightMode === "edit" && !fixed)) && rows.length > 0 && (
          <div style={scheduleSaveStatusStyle}>
            저장 선택 {selectedScheduleRows.length}건
            <div style={scheduleSaveStatusSubStyle}>
              재조회 {refreshActiveRows.length}건 · 제외 {refreshExcludedRows.length}건
            </div>
          </div>
        )}

        {selectedRoom && flightMode === "edit" && (
          <div
            style={{
              marginTop: 20,
              padding: 18,
              background: "#0d1a30",
              border: "1px solid #2b4269",
              borderRadius: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 20,
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 360 }}>
                <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>
                  선택된 Monitor 상세
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                  {selectedRoom.name}
                </div>
                <div style={{ color: "#cbd5e1", marginBottom: 6 }}>
                  편명: {selectedRoom.flightsInput}
                </div>
                <div style={{ color: "#cbd5e1", marginBottom: 6 }}>
                  Schedule Flight 기간:{" "}
                  {(selectedRoom.startDateTime || startDateTime).replace("T", " ")} ~{" "}
                  {(selectedRoom.endDateTime || endDateTime).replace("T", " ")}
                </div>
                <div style={{ color: "#cbd5e1", marginBottom: 6 }}>
                  마지막 조회: {selectedRoom.lastFetchedAt || "-"}
                </div>
                <div style={{ color: selectedRoom.fixed ? "#facc15" : "#cbd5e1", marginBottom: 12 }}>
                  상태: {selectedRoom.fixed ? "Schedule Flight" : "일반"}
                </div>

                {selectedRoom.fixed && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 14,
                      background: "#0a1528",
                      border: "1px solid #28436b",
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 12, color: "#e5edf7" }}>
                      Schedule Flight 조회 기간 수정
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "90px 1fr 90px 160px",
                        gap: 10,
                        alignItems: "center",
                        marginBottom: 10,
                      }}
                    >
                      <label style={{ color: "#9fb3c8", fontSize: 13 }}>시작일</label>
                      <input
                        type="date"
                        value={getDatePart(startDateTime)}
                        onChange={(e) => handleStartDateChange(e.target.value)}
                        style={inlineDateInputStyle}
                      />

                      <label style={{ color: "#9fb3c8", fontSize: 13 }}>시작시간</label>
                      <TimeSelect24
                        value={getTimePart(startDateTime)}
                        onChange={handleStartTimeChange}
                      />
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "90px 1fr 90px 160px",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <label style={{ color: "#9fb3c8", fontSize: 13 }}>종료일</label>
                      <input
                        type="date"
                        value={getDatePart(endDateTime)}
                        onChange={(e) => handleEndDateChange(e.target.value)}
                        style={inlineDateInputStyle}
                      />

                      <label style={{ color: "#9fb3c8", fontSize: 13 }}>종료시간</label>
                      <TimeSelect24
                        value={getTimePart(endDateTime)}
                        onChange={handleEndTimeChange}
                      />
                    </div>

                    <div style={{ color: "#93c5fd", marginTop: 12, fontSize: 13 }}>
                      PC 화면은 자동조회하지 않습니다.
                    </div>
                    <div style={{ color: "#93c5fd", marginTop: 4, fontSize: 13 }}>
                      자동조회는 AFOCS SKD에서만 {REFRESH_INTERVAL_MINUTES}분마다 적용됩니다.
                    </div>
                  </div>
                )}
              </div>

              <div style={{ minWidth: 260 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>이상 현황</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                  {selectedRoomCounts && selectedRoomCounts.delay > 0 && (
                    <span style={badgeOrange}>지연 {selectedRoomCounts.delay}건</span>
                  )}
                  {selectedRoomCounts && selectedRoomCounts.gateChanged > 0 && (
                    <span style={badgePurple}>
                      게이트 변경 {selectedRoomCounts.gateChanged}건
                    </span>
                  )}
                  {selectedRoomCounts && selectedRoomCounts.canceled > 0 && (
                    <span style={badgeRed}>결항 {selectedRoomCounts.canceled}건</span>
                  )}
                  {selectedRoomCounts &&
                    selectedRoomCounts.delay +
                      selectedRoomCounts.gateChanged +
                      selectedRoomCounts.canceled ===
                      0 && <span style={badgeNormal}>이상 없음</span>}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={() => void refreshSelectedRoom()} disabled={loading} style={refreshBtn}>
                    선택된 Monitor 다시 조회
                  </button>

                  <button
                    onClick={openAfocsSkd}
                    style={afocsSkdLinkBtn}
                    title="아이폰용 AFOCS SKD 화면 열기"
                  >
                    AFOCS SKD 열기
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {loading && <p style={{ marginTop: 20 }}>조회중...</p>}
        {error && <p style={{ marginTop: 20, color: "#f87171" }}>{error}</p>}

        {flightMode === "edit" && fixed && rows.length > 0 && (
          <div style={hlInlineSaveRowStyle}>
            <button type="button" onClick={() => void handleSaveInlineHlMapping()} style={hlMappingSaveButtonStyle}>
              등록기호 저장
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteSelectedFlightsFromSchedule()}
              disabled={selectedScheduleRows.length === 0}
              style={selectedScheduleRows.length > 0 ? hlMappingDeleteButtonStyle : disabledBtn}
            >
              {selectedScheduleRows.length > 0
                ? `선택 ${selectedScheduleRows.length}건 삭제`
                : "삭제할 항공편 선택"}
            </button>
            <span style={hlInlineHelpStyle}>편명 삭제 후 저장하려면 조회 결과에서 선택하고 저장하거나, 여기서 바로 삭제할 수 있습니다.</span>
          </div>
        )}

        {flightMode === "registration" && rows.length > 0 && (
          <>
            <div style={{ marginTop: 18, marginBottom: 8, fontWeight: 800, color: "#e5edf7", fontSize: 16 }}>
              ③ 등록번호 / AFOCS 저장
            </div>
            <div style={hlInlineSaveRowStyle}>
              <input
                ref={registrationExcelInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(event) => void handleCombinedRegistrationAfocsExcelUpload(event)}
                style={{ display: "none" }}
              />
              <button
                type="button"
                onClick={() => registrationExcelInputRef.current?.click()}
                style={{
                  ...hlExcelUploadButtonStyle,
                  background: "#7c3aed",
                  border: "1px solid rgba(196, 181, 253, 0.45)",
                }}
              >
                등록기호 + AFOCS 엑셀 업로드
              </button>
              <button type="button" onClick={() => void handleSaveInlineHlMapping()} style={hlMappingSaveButtonStyle}>
                등록기호 저장
              </button>
              <button
                type="button"
                onClick={() => void handleSaveInlineAfocsSkd()}
                style={{
                  ...hlMappingSaveButtonStyle,
                  background: "#d97706",
                }}
              >
                AFOCS SKD 저장
              </button>
              <span style={hlInlineHelpStyle}>
                확정 순서 ① 매뉴얼(편명조회 직접 등록) → ② 등록번호/AFOCS. 엑셀 업로드는 기존 값을 덮어쓰고, 이후 표에서 직접 수정·저장한 값이 우선합니다 · 관리{" "}
                {aircraftRegistrationRecords.length}건
              </span>
            </div>
          </>
        )}

        {hlMappingStatus ? <div style={hlMappingStatusStyle}>{hlMappingStatus}</div> : null}

        {(flightMode === "query" || (flightMode === "edit" && !fixed)) && rows.length > 0 && (
          <div style={{ ...hlInlineSaveRowStyle, marginTop: 16 }}>
            <button type="button" onClick={() => void handleSaveInlineHlMapping()} style={hlMappingSaveButtonStyle}>
              등록기호 저장
            </button>
            <span style={hlInlineHelpStyle}>
              여기서 입력·저장한 등록번호가 1순위입니다. 비어 있으면 등록번호/AFOCS 저장값이 2순위로 채워집니다.
            </span>
          </div>
        )}

        {(flightMode === "query" || (flightMode === "edit" && !fixed)) && (
          <div style={{ marginTop: 30, overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 1200,
                background: "#081427",
                border: "1px solid #22314e",
              }}
            >
              <thead>
                <tr style={{ background: "#18263f" }}>
                  <th style={thStyle}>선택</th>
                  <th style={thStyle}>현황</th>
                  <th style={thStyle}>편명</th>
                  <th style={thStyle}>등록기호</th>
                  <th style={thStyle}>출발지코드</th>
                  <th style={thStyle}>출발지공항명</th>
                  <th style={thStyle}>도착지코드</th>
                  <th style={thStyle}>도착지공항명</th>
                  <th style={thStyle}>예정일시</th>
                  <th style={thStyle}>변경일시</th>
                  <th style={thStyle}>게이트</th>
                  <th style={thStyle}>터미널</th>
                  <th style={thStyle}>마스터 편명</th>
                  <th style={thStyle}>코드쉐어</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td style={tdStyle} colSpan={14}>
                      조회 결과가 없습니다.
                    </td>
                  </tr>
                )}
                {rows.map((r, i) => {
                  const selectionKey = getSelectionKey(r, i);
                  const finalCompleted = isFinalCompletedRow(r);
                  const selected = Boolean(selectedScheduleKeys[selectionKey]);

                  return (
                    <tr
                      key={getRowKey(r, i)}
                      style={{
                        borderBottom: "1px solid #2b4269",
                        background: getRowBackground(r),
                        opacity: finalCompleted ? 0.72 : 1,
                      }}
                    >
                      <td style={tdStyle}>
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            cursor: finalCompleted ? "not-allowed" : "pointer",
                          }}
                          title={finalCompleted ? `${getRefreshExcludeReason(r)}으로 API 재조회 제외` : "Schedule Flight 추가 선택"}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={finalCompleted}
                            onChange={() => handleToggleScheduleSelection(r, i)}
                          />
                        </label>
                        {finalCompleted && (
                          <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 4 }}>
                            조회 제외
                            <br />
                            {getRefreshExcludeReason(r)}
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          color: getStatusColor(r),
                          fontWeight: 700,
                        }}
                      >
                        {getComputedFlightStatus(r)}
                      </td>
                      <td style={{ ...tdStyle, color: getFlightNoColor(r.departureCode, r.arrivalCode) }}>
                        {formatFlightDisplayWithMarker(r, hlInlineDrafts)}
                      </td>
                      <td style={tdStyle}>
                        <HlRegistrationInput
                          flightKey={getFlightKeyFromRow(r)}
                          rowIndex={i}
                          value={getEditableHlValue(r, hlNumberMap, hlInlineDrafts)}
                          onChange={(value) => handleHlInlineDraftChange(getFlightKeyFromRow(r), value)}
                        />
                      </td>
                      <td style={tdStyle}>{r.departureCode || "-"}</td>
                      <td style={tdStyle}>{r.departureName || "-"}</td>
                      <td style={tdStyle}>{r.arrivalCode || "-"}</td>
                      <td style={tdStyle}>{r.arrivalName || "-"}</td>
                      <td style={tdStyle}>{r.formattedScheduleTime || "-"}</td>
                      <td style={tdStyle}>{r.formattedEstimatedTime || "-"}</td>
                      <td style={tdStyle}>{r.gatenumber || "-"}</td>
                      <td style={tdStyle}>{r.terminalid || "-"}</td>
                      <td style={tdStyle}>{r.masterflightid || "-"}</td>
                      <td style={tdStyle}>{r.codeshare || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {((flightMode === "edit" && fixed) || (flightMode === "registration" && rows.length > 0)) && (
          <FixedResultsTable
            rows={rows}
            expandedKeys={expandedDetailKeys}
            selectedKeys={selectedScheduleKeys}
            hlNumberMap={hlNumberMap}
            hlDrafts={hlInlineDrafts}
            onHlDraftChange={handleHlInlineDraftChange}
            afocsSkdDrafts={afocsSkdInlineDrafts}
            onAfocsSkdDraftChange={handleAfocsSkdInlineDraftChange}
            onToggleDetail={handleToggleDetail}
            onToggleSelect={handleToggleScheduleSelection}
            showSelection={flightMode === "edit"}
          />
        )}

        {!loading && !error && rows.length === 0 && (
          <div style={{ marginTop: 30, color: "#9fb3c8" }}>
            조회 결과가 없습니다.
          </div>
        )}
      </main>
    </div>
  );
}
