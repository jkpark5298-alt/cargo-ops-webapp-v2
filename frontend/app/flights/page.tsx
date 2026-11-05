"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FlightsModeTabs } from "./components/FlightsModeTabs";
import { ScheduleSlotCards } from "./components/ScheduleSlotCards";
import { type FlightMode } from "./lib/schedule-slots";
import { type FlightRow, type MonitorRoom } from "../lib/flight-types";
import { normalizeFlightsInput } from "../lib/flight-keys";
import {
  applyRegistrationToRows,
  fetchAircraftRegistrationRecordsFromServer,
  loadAircraftRegistrationRecords,
} from "../lib/aircraft-registration";
import {
  isActiveScheduleRoom,
  loadLatestScheduleFromServer,
  loadRooms,
  mergeLatestScheduleRoom,
  saveLatestScheduleToServer,
  saveRooms,
} from "../lib/schedule-store";
import {
  buildDateTime,
  clearFlightAlertBaselineAndHistory,
  filterRowsByFlightInput,
  getAlertCounts,
  getDatePart,
  getDefaultEndDateTime,
  getDefaultStartDateTime,
  getSelectionKey,
  getTimePart,
  isFinalCompletedRow,
  loadHlMappingText,
  loadRegistrationQueryRange,
  saveRegistrationQueryRange,
} from "./lib/helpers";
import {
  badgeNormal,
  badgeOrange,
  badgePurple,
  badgeRed,
  disabledBtn,
  hlExcelUploadButtonStyle,
  hlInlineHelpStyle,
  hlInlineSaveRowStyle,
  hlMappingDeleteButtonStyle,
  hlMappingSaveButtonStyle,
  hlMappingStatusStyle,
  scheduleSaveStatusStyle,
  scheduleSaveStatusSubStyle,
} from "./styles";
import { FixedResultsTable } from "./components/FixedResultsTable";
import { useScheduleSlots } from "./hooks/useScheduleSlots";
import { useRegistrationEditor } from "./hooks/useRegistrationEditor";
import { useScheduleSelection } from "./hooks/useScheduleSelection";
import { useFlightLookup } from "./hooks/useFlightLookup";
import { QueryResultsTable } from "./components/QueryResultsTable";
import { ScheduleRoomEditor } from "./components/ScheduleRoomEditor";
import { QueryPanel } from "./components/QueryPanel";
import { RegistrationModeHint } from "./components/RegistrationModeHint";
import { FixedSlotPanel } from "./components/FixedSlotPanel";
import { RegistrationPanel } from "./components/RegistrationPanel";

export const dynamic = "force-dynamic";

export default function FlightsPage() {
  const router = useRouter();
  const [flightMode, setFlightMode] = useState<FlightMode>("query");
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

  const currentRangeText = useMemo(() => {
    return `${startDateTime.replace("T", " ")} ~ ${endDateTime.replace("T", " ")}`;
  }, [startDateTime, endDateTime]);

  const registrationRangeText = useMemo(() => {
    return `${registrationStartDateTime.replace("T", " ")} ~ ${registrationEndDateTime.replace("T", " ")}`;
  }, [registrationStartDateTime, registrationEndDateTime]);

  const alertCounts = useMemo(() => getAlertCounts(rows), [rows]);

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
      .then((finalRecords) => {
        // 서버 기록과 브라우저 기록을 합친 결과입니다. (서버가 비어 있으면 브라우저 기록이 서버로 복구됩니다)
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
  const {
    applyScheduleSlotsState,
    handleDeleteAllSlots,
    handleDeleteSlot,
    handleLinkSlot,
    handleRestoreArchiveSlot,
    handleSelectSlot,
    loadScheduleSlots,
    scheduleSlots,
    selectedSlotKey,
    setSelectedSlotKey,
    syncRegistrationFieldsToScheduleSlots,
  } = useScheduleSlots({ flightMode, resetLookupView, setEndDateTime, setError, setExpandedDetailKeys, setFixed, setInput, setLastFetchedAt, setQueryMode, setRegistrationEndDateTime, setRegistrationStartDateTime, setRooms, setRows, setSelectedRoomId, setSelectedScheduleKeys, setSelectedScheduleOrder, setStartDateTime });
  const {
    afocsSkdInlineDrafts,
    aircraftRegistrationRecords,
    aircraftRegistrationRecordsRef,
    applyAllRegistrationSources,
    ensureAircraftRegistrationRecordsFromServer,
    handleAfocsSkdInlineDraftChange,
    handleCombinedRegistrationAfocsExcelUpload,
    handleHlInlineDraftChange,
    handleSaveInlineAfocsSkd,
    handleSaveInlineHlMapping,
    hlInlineDrafts,
    hlMappingStatus,
    hlNumberMap,
    persistRegistrationDraftsForRows,
    registrationExcelInputRef,
    setAircraftRegistrationRecords,
    setHlInlineDrafts,
    setHlMappingStatus,
    setHlMappingText,
  } = useRegistrationEditor({ flightMode, rooms, rows, scheduleSlots, selectedRoom, setRooms, setRows, syncRegistrationFieldsToScheduleSlots });

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
  const {
    getMissingInputFlights,
    handleDeleteSelectedFlightsFromSchedule,
    handleSaveSelectedSchedule,
    handleToggleScheduleSelection,
    mergeFlightsInput,
    mergeScheduleRowsByFlight,
  } = useScheduleSelection({ applyAllRegistrationSources, applyScheduleSlotsState, endDateTime, flightMode, hlInlineDrafts, input, persistRegistrationDraftsForRows, rooms, rows, scheduleSlots, selectedRoom, selectedScheduleRows, selectedSlotKey, setError, setExpandedDetailKeys, setFixed, setInput, setLastFetchedAt, setRooms, setRows, setSelectedRoomId, setSelectedScheduleKeys, setSelectedScheduleOrder, startDateTime });
  const {
    fetchAllKjFlights,
    fetchFlights,
    fetchRegistrationFlights,
    fetchRegistrationKjAll,
    refreshSelectedRoom,
  } = useFlightLookup({ aircraftRegistrationRecords, aircraftRegistrationRecordsRef, applyAllRegistrationSources, endDateTime, ensureAircraftRegistrationRecordsFromServer, fixed, flightMode, getMissingInputFlights, hlNumberMap, input, mergeFlightsInput, mergeScheduleRowsByFlight, registrationEndDateTime, registrationStartDateTime, rooms, selectedRoom, selectedRoomId, setEndDateTime, setError, setExpandedDetailKeys, setFixed, setHlInlineDrafts, setHlMappingStatus, setInput, setLastFetchedAt, setLoading, setQueryMode, setRooms, setRows, setSelectedRoomId, setSelectedScheduleKeys, setSelectedScheduleOrder, setSelectedSlotKey, setStartDateTime, startDateTime });

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

    router.push("/afocs-skd");
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

        {<RegistrationModeHint flightMode={flightMode} />}

        {<FixedSlotPanel fixed={fixed} flightMode={flightMode} openAfocsSkd={openAfocsSkd} router={router} selectedSlotKey={selectedSlotKey} setExpandedDetailKeys={setExpandedDetailKeys} setFixed={setFixed} />}

        {<RegistrationPanel fetchRegistrationFlights={fetchRegistrationFlights} fetchRegistrationKjAll={fetchRegistrationKjAll} flightMode={flightMode} handleFlightsInputChange={handleFlightsInputChange} handleRegistrationEndDateChange={handleRegistrationEndDateChange} handleRegistrationEndTimeChange={handleRegistrationEndTimeChange} handleRegistrationStartDateChange={handleRegistrationStartDateChange} handleRegistrationStartTimeChange={handleRegistrationStartTimeChange} input={input} loading={loading} openAfocsSkd={openAfocsSkd} queryMode={queryMode} registrationEndDateTime={registrationEndDateTime} registrationRangeText={registrationRangeText} registrationStartDateTime={registrationStartDateTime} router={router} setInput={setInput} setQueryMode={setQueryMode} />}

        {<QueryPanel clearSelectedScheduleFlight={clearSelectedScheduleFlight} currentRangeText={currentRangeText} endDateTime={endDateTime} fetchAllKjFlights={fetchAllKjFlights} fetchFlights={fetchFlights} fixed={fixed} flightMode={flightMode} handleClearAllScheduleRows={handleClearAllScheduleRows} handleEndDateChange={handleEndDateChange} handleEndTimeChange={handleEndTimeChange} handleFlightsInputChange={handleFlightsInputChange} handleSaveSelectedSchedule={handleSaveSelectedSchedule} handleSelectAllScheduleRows={handleSelectAllScheduleRows} handleSelectSlot={handleSelectSlot} handleStartDateChange={handleStartDateChange} handleStartTimeChange={handleStartTimeChange} input={input} isSelectedFixedRoom={isSelectedFixedRoom} loading={loading} queryMode={queryMode} router={router} rows={rows} scheduleSlots={scheduleSlots} selectedScheduleRows={selectedScheduleRows} selectedSlotKey={selectedSlotKey} startDateTime={startDateTime} switchToKjAllMode={switchToKjAllMode} switchToManualMode={switchToManualMode} syncFixedRoomFlightsInput={syncFixedRoomFlightsInput} />}

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

        {<ScheduleRoomEditor endDateTime={endDateTime} flightMode={flightMode} handleEndDateChange={handleEndDateChange} handleEndTimeChange={handleEndTimeChange} handleStartDateChange={handleStartDateChange} handleStartTimeChange={handleStartTimeChange} loading={loading} openAfocsSkd={openAfocsSkd} refreshSelectedRoom={refreshSelectedRoom} selectedRoom={selectedRoom} selectedRoomCounts={selectedRoomCounts} startDateTime={startDateTime} />}

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

        {<QueryResultsTable fixed={fixed} flightMode={flightMode} handleHlInlineDraftChange={handleHlInlineDraftChange} handleToggleScheduleSelection={handleToggleScheduleSelection} hlInlineDrafts={hlInlineDrafts} hlNumberMap={hlNumberMap} rows={rows} selectedScheduleKeys={selectedScheduleKeys} />}

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
