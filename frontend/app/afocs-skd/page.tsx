"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { prepareAfocsSkdForSave } from "../lib/afocs-skd";
import { type FlightRow, type MonitorRoom } from "../lib/flight-types";
import { getRegistrationNo, normalizeFlightKey, normalizeFlightsInput } from "../lib/flight-keys";
import { BACKEND_URL } from "../lib/api-config";
import {
  isActiveScheduleRoom,
  loadLatestScheduleFromServer,
  loadRooms,
  mergeLatestScheduleRoom,
  mergeScheduleRegistrationIntoRoom,
  saveLatestScheduleToServer,
  saveRooms,
} from "../lib/schedule-store";
import {
  applyRegistrationToRows,
  fetchAircraftRegistrationRecordsFromServer,
  loadAircraftRegistrationRecords,
} from "../lib/aircraft-registration";
import { WidgetSummaryItem, WidgetSummaryResponse } from "./types";
import { DEFAULT_REFRESH_MINUTES, LAST_FIXED_ROOM_KEY } from "./constants";
import {
  formatDisplayItemFromRow,
  formatFallbackDisplayItem,
  getCompletedFlightSetFromRows,
  getLatestRowsByFlight,
  getNextRefreshMinutes,
  getRefreshExcludeReasonMapFromRows,
  isFinalCompletedStatus,
} from "./helpers";
import { homeButtonStyle, sectionStyle } from "./styles";
import { useWeather } from "./hooks/useWeather";
import { useDailyReportSync } from "./hooks/useDailyReportSync";
import { useFlightOrder } from "./hooks/useFlightOrder";
import { SelectedRoomSection } from "./components/SelectedRoomSection";
import { WeatherBanner } from "./components/WeatherBanner";
import { DailyReportForm } from "./components/DailyReportForm";
import { FixedRoomsSection } from "./components/FixedRoomsSection";

export default function FixedLitePage() {
  const [rooms, setRooms] = useState<MonitorRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [summary, setSummary] = useState<WidgetSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverSyncLoading, setServerSyncLoading] = useState(true);
  const [error, setError] = useState("");
  const [nextRefreshAt, setNextRefreshAt] = useState<Date | null>(null);
  const [currentIntervalMinutes, setCurrentIntervalMinutes] = useState<number | null>(null);
  const [completedFlightsByRoom, setCompletedFlightsByRoom] = useState<Record<string, string[]>>({});
  const [lastKnownItemsByRoom, setLastKnownItemsByRoom] = useState<
    Record<string, WidgetSummaryItem[]>
  >({});
  const [showAllFlights, setShowAllFlights] = useState(false);

  const timerRef = useRef<number | null>(null);
  const {
    fetchWeather,
    weather,
    weatherLoading,
  } = useWeather();
  const {
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
  } = useDailyReportSync();

  const handleUpdateAfocsSkd = async (flight: string, val: string) => {
    if (!selectedRoom) return;

    const flightKey = normalizeFlightKey(flight);
    const matchedRow = (selectedRoom.rows || []).find(
      (row) => normalizeFlightKey(row.flightId || row.flightNo || "") === flightKey,
    );
    const normalizedValue = prepareAfocsSkdForSave(val, matchedRow);

    const updatedRows = (selectedRoom.rows || []).map((row) => {
      const rowFlightKey = normalizeFlightKey(row.flightId || row.flightNo || "");
      if (rowFlightKey === flightKey) {
        return { ...row, afocsSkd: normalizedValue };
      }
      return row;
    });

    const exists = (selectedRoom.rows || []).some(
      (row) => normalizeFlightKey(row.flightId || row.flightNo || "") === flightKey
    );

    let finalRows = updatedRows;
    if (!exists) {
      const newDummyRow: FlightRow = {
        flightId: flight,
        flightNo: flight,
        afocsSkd: normalizedValue,
      };
      finalRows = [...updatedRows, newDummyRow];
    }

    const updatedRoom = {
      ...selectedRoom,
      rows: finalRows,
    };

    const nextRooms = rooms.map((room) => (room.id === selectedRoom.id ? updatedRoom : room));
    setRooms(nextRooms);
    saveRooms(nextRooms);

    try {
      await saveLatestScheduleToServer(updatedRoom);
    } catch (err) {
      console.error("Failed to sync updated AFOCS SKD to server:", err);
    }
  };

  useEffect(() => {
    void fetchWeather();
    void loadDailyReportFromSupabase(dailyWorkDate);

    const weatherTimer = setInterval(() => {
      void fetchWeather();
    }, 60000);

    const syncTimer = setInterval(() => {
      const isUserTyping =
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "INPUT";
      const recentlyEdited = Date.now() - dailyLocalEditAtRef.current < 60_000;
      if (!isUserTyping && !recentlyEdited) {
        void loadDailyReportFromSupabase(dailyWorkDate);
      }
    }, 15000);

    return () => {
      clearInterval(weatherTimer);
      clearInterval(syncTimer);
    };
  }, [dailyWorkDate]);

  const fixedRooms = useMemo(
    () => rooms.filter((room) => room.fixed && isActiveScheduleRoom(room)),
    [rooms],
  );

  const selectedRoom = useMemo(
    () => fixedRooms.find((room) => room.id === selectedRoomId) || null,
    [fixedRooms, selectedRoomId]
  );

  const displayItemsForSelectedRoom = useMemo(() => {
    if (!selectedRoom) return [];

    const requested = normalizeFlightsInput(selectedRoom.flightsInput);
    const latestRowMap = getLatestRowsByFlight(selectedRoom.rows);
    const reasonMap = getRefreshExcludeReasonMapFromRows(selectedRoom.rows || []);
    const knownItemsMap = new Map(
      (lastKnownItemsByRoom[selectedRoom.id] || []).map((item) => [item.flight, item])
    );

    return requested.map((flight) => {
      const known = knownItemsMap.get(flight);
      const excludeReason = reasonMap.get(flight);
      const latestRow = latestRowMap.get(flight)?.row;
      if (known) {
        const registrationNo = latestRow ? getRegistrationNo(latestRow) : known.registrationNo || "";
        const afocsSkd =
          String(latestRow?.afocsSkd || "").trim() || known.afocsSkd || "";
        return { ...known, registrationNo, afocsSkd, excludeReason };
      }

      if (latestRow) return { ...formatDisplayItemFromRow(flight, latestRow), excludeReason };

      return { ...formatFallbackDisplayItem(flight), excludeReason };
    });
  }, [selectedRoom, lastKnownItemsByRoom]);
  const {
    activeItems,
    canDragReorder,
    completedItems,
    draggingIndex,
    endDrag,
    handleSortModeChange,
    onDragMove,
    orderedDisplayItems,
    sortMode,
    startDrag,
    visibleDisplayItems,
  } = useFlightOrder({ displayItemsForSelectedRoom, selectedRoom, showAllFlights });

  const activeItemsForSelectedRoom = useMemo(() => {
    if (!selectedRoom) return [];

    const completedFromRows = getCompletedFlightSetFromRows(selectedRoom.rows);
    const completedFromSummary = new Set(completedFlightsByRoom[selectedRoom.id] || []);

    return displayItemsForSelectedRoom.filter((item) => {
      if (completedFromRows.has(item.flight)) return false;
      if (completedFromSummary.has(item.flight)) return false;
      if (isFinalCompletedStatus(item.status)) return false;
      return true;
    });
  }, [selectedRoom, displayItemsForSelectedRoom, completedFlightsByRoom]);

  const backToFlightsHref = selectedRoomId
    ? `/flights?roomId=${encodeURIComponent(selectedRoomId)}`
    : "/flights";

  function clearTimer() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function scheduleNext(room: MonitorRoom, activeItems: WidgetSummaryItem[]) {
    clearTimer();

    const nextMinutes = getNextRefreshMinutes(activeItems);

    if (!nextMinutes) {
      setCurrentIntervalMinutes(null);
      setNextRefreshAt(null);
      return;
    }

    setCurrentIntervalMinutes(nextMinutes);
    setNextRefreshAt(new Date(Date.now() + nextMinutes * 60 * 1000));

    timerRef.current = window.setTimeout(() => {
      void fetchSummary(room);
    }, nextMinutes * 60 * 1000);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const selectTargetRoom = (nextRooms: MonitorRoom[]) => {
      const fixedOnly = nextRooms.filter((room) => room.fixed);
      const params = new URLSearchParams(window.location.search);
      const roomIdFromQuery = params.get("roomId") || "";
      const lastRoomId = localStorage.getItem(LAST_FIXED_ROOM_KEY);

      let target: MonitorRoom | undefined;

      if (roomIdFromQuery) {
        target = fixedOnly.find((room) => room.id === roomIdFromQuery);
      }

      if (!target && lastRoomId) {
        target = fixedOnly.find((room) => room.id === lastRoomId);
      }

      if (!target && fixedOnly.length > 0) {
        target = fixedOnly[0];
      }

      if (target) {
        setSelectedRoomId(target.id);
        localStorage.setItem(LAST_FIXED_ROOM_KEY, target.id);
      }
    };

    const savedRooms = loadRooms().map((room) =>
      room.fixed ? (mergeScheduleRegistrationIntoRoom(room, room) as MonitorRoom) : room,
    );
    setRooms([]);
    setSelectedRoomId("");
    setServerSyncLoading(true);

    void loadLatestScheduleFromServer()
      .then(async (serverRoom) => {
        let registrationRecords = loadAircraftRegistrationRecords();
        try {
          registrationRecords = await fetchAircraftRegistrationRecordsFromServer();
        } catch {
          // 등록기호 서버 조회 실패 시 로컬 캐시로 계속합니다.
        }

        const roomWithRegs = serverRoom
          ? mergeScheduleRegistrationIntoRoom(serverRoom, serverRoom, registrationRecords)
          : null;
        const nextRooms = mergeLatestScheduleRoom(savedRooms, roomWithRegs);
        setRooms(nextRooms);
        saveRooms(nextRooms);

        if (roomWithRegs) {
          setSelectedRoomId(roomWithRegs.id);
          localStorage.setItem(LAST_FIXED_ROOM_KEY, roomWithRegs.id);
          return;
        }

        localStorage.removeItem(LAST_FIXED_ROOM_KEY);
        selectTargetRoom(nextRooms);
      })
      .catch(() => {
        // 서버 동기화 실패 시 로컬 Schedule Flight를 그대로 사용합니다.
        setRooms(savedRooms);
        selectTargetRoom(savedRooms);
      })
      .finally(() => {
        setServerSyncLoading(false);
      });
  }, []);

  useEffect(() => {
    clearTimer();

    if (!selectedRoom || (!selectedRoom.flightsInput.trim() && (selectedRoom.rows || []).length === 0)) {
      setSummary(null);
      setNextRefreshAt(null);
      setCurrentIntervalMinutes(null);
      return;
    }

    void fetchSummary(selectedRoom);

    return () => clearTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoomId]);

  async function fetchSummary(room: MonitorRoom) {
    const requestedFlights = normalizeFlightsInput(room.flightsInput);

    if (requestedFlights.length === 0) {
      setError("조회할 편명이 없습니다.");
      setSummary(null);
      scheduleNext(room, []);
      return;
    }

    const completedSet = getCompletedFlightSetFromRows(room.rows || []);
    const activeFlights = requestedFlights.filter((flight) => !completedSet.has(flight));

    setLoading(true);
    setError("");

    try {
      let nextRows: FlightRow[] = room.rows || [];
      let refreshIntervalMinutes = DEFAULT_REFRESH_MINUTES;

      if (activeFlights.length > 0) {
        const res = await fetch(`${BACKEND_URL}/flights/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            flights: activeFlights,
            start: room.startDateTime,
            end: room.endDateTime,
            includeScheduled: true,
          }),
        });

        const json = (await res.json()) as {
          success?: boolean;
          data?: FlightRow[];
          message?: string;
          detail?: string;
          refreshIntervalMinutes?: number;
        };

        if (!res.ok || json.success === false) {
          throw new Error(json.message || json.detail || `요약 조회에 실패했습니다. (${res.status})`);
        }

        refreshIntervalMinutes = json.refreshIntervalMinutes || DEFAULT_REFRESH_MINUTES;
        const refreshedRows = Array.isArray(json.data) ? json.data : [];
        const refreshedFlightSet = new Set(
          refreshedRows
            .map((row) => row.flightId || row.flightNo || "")
            .filter(Boolean)
        );
        const rowsToKeep = (room.rows || []).filter((row) => {
          const flight = row.flightId || row.flightNo || "";
          return Boolean(flight) && !refreshedFlightSet.has(flight);
        });
        nextRows = [...rowsToKeep, ...refreshedRows];
      }

      let registrationRecords = loadAircraftRegistrationRecords();
      try {
        registrationRecords = await fetchAircraftRegistrationRecordsFromServer();
      } catch {
        // 등록기호 서버 조회 실패 시 로컬 캐시로 계속합니다.
      }
      nextRows = applyRegistrationToRows(nextRows, registrationRecords, room.rows);

      const latestRowMap = getLatestRowsByFlight(nextRows);
      const excludeReasonMap = getRefreshExcludeReasonMapFromRows(nextRows);
      const nextItems = requestedFlights.map((flight) => {
        const latestRow = latestRowMap.get(flight)?.row;
        const excludeReason = excludeReasonMap.get(flight);
        if (latestRow) return { ...formatDisplayItemFromRow(flight, latestRow), excludeReason };
        return { ...formatFallbackDisplayItem(flight), excludeReason };
      });

      const fetchedAt = new Date().toLocaleString("ko-KR");
      const updatedRoom: MonitorRoom = {
        ...room,
        rows: nextRows,
        lastFetchedAt: fetchedAt,
      };

      setRooms((prevRooms) => {
        const nextRooms = prevRooms.map((prevRoom) =>
          prevRoom.id === updatedRoom.id ? updatedRoom : prevRoom
        );
        saveRooms(nextRooms);
        return nextRooms;
      });

      try {
        const serverRoom = await saveLatestScheduleToServer(updatedRoom);
        const syncedRoom: MonitorRoom = {
          ...updatedRoom,
          ...serverRoom,
          fixed: true,
          rows: Array.isArray(serverRoom.rows) ? serverRoom.rows : updatedRoom.rows,
          flightsInput: serverRoom.flightsInput || updatedRoom.flightsInput,
          startDateTime: serverRoom.startDateTime || updatedRoom.startDateTime,
          endDateTime: serverRoom.endDateTime || updatedRoom.endDateTime,
          lastFetchedAt: serverRoom.lastFetchedAt || updatedRoom.lastFetchedAt,
        };
        const syncedRooms = mergeLatestScheduleRoom(loadRooms(), syncedRoom);
        setRooms(syncedRooms);
        saveRooms(syncedRooms);
        setSelectedRoomId(syncedRoom.id);
        localStorage.setItem(LAST_FIXED_ROOM_KEY, syncedRoom.id);
      } catch (syncError) {
        console.warn("Schedule Flight 알림 비교 또는 서버 기준 저장 실패", syncError);
      }

      setLastKnownItemsByRoom((prev) => ({
        ...prev,
        [room.id]: nextItems,
      }));

      const newlyCompleted = nextItems
        .filter((item) => isFinalCompletedStatus(item.status))
        .map((item) => item.flight);

      setCompletedFlightsByRoom((prev) => ({
        ...prev,
        [room.id]: newlyCompleted,
      }));

      const nextSummary: WidgetSummaryResponse = {
        success: true,
        roomId: room.id,
        roomName: room.name,
        updatedAt: new Date().toISOString(),
        refreshIntervalMinutes,
        items: nextItems,
      };

      setSummary(nextSummary);

      const nextActiveItems = nextItems.filter(
        (item) => !isFinalCompletedStatus(item.status)
      );

      scheduleNext(updatedRoom, nextActiveItems);
    } catch (e: any) {
      setError(e.message || "요약 조회에 실패했습니다.");
      setSummary(null);
      scheduleNext(room, displayItemsForSelectedRoom);
    } finally {
      setLoading(false);
    }
  }

  function formatNextRefresh(date: Date | null) {
    if (!date) return "-";

    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#07152b",
        color: "white",
        padding: "16px 14px 28px",
        fontFamily:
          "Inter, Apple SD Gothic Neo, SF Pro Display, Segoe UI, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 560,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* 활주로 실시간 기상 (METAR) 위젯 */}
        {<WeatherBanner fetchWeather={fetchWeather} weather={weather} weatherLoading={weatherLoading} />}

        <section style={sectionStyle}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              marginBottom: 6,
              letterSpacing: -0.3,
            }}
          >
            AFOCS SKD
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <button
              onClick={() => {
                window.location.href = "/";
              }}
              style={homeButtonStyle}
            >
              초기화면으로
            </button>
            <button
              onClick={() => {
                window.location.href = backToFlightsHref;
              }}
              style={homeButtonStyle}
            >
              편명조회로
            </button>
          </div>

          <div style={{ color: "#b8c7db", fontSize: 13, lineHeight: 1.5 }}>
            기본 30분 자동조회입니다.
            <br />
            remark가 도착 또는 결항일 때만 자동조회에서 제외합니다. 출발, 착륙, 지연, 게이트 변경은 계속 조회합니다.
          </div>
        </section>

        <FixedRoomsSection activeItems={activeItems} completedItems={completedItems} fixedRooms={fixedRooms} lastKnownItemsByRoom={lastKnownItemsByRoom} orderedDisplayItems={orderedDisplayItems} selectedRoom={selectedRoom} selectedRoomId={selectedRoomId} serverSyncLoading={serverSyncLoading} setSelectedRoomId={setSelectedRoomId} />

        {<SelectedRoomSection activeItems={activeItems} activeItemsForSelectedRoom={activeItemsForSelectedRoom} backToFlightsHref={backToFlightsHref} canDragReorder={canDragReorder} completedItems={completedItems} currentIntervalMinutes={currentIntervalMinutes} displayItemsForSelectedRoom={displayItemsForSelectedRoom} draggingIndex={draggingIndex} endDrag={endDrag} error={error} fetchSummary={fetchSummary} formatNextRefresh={formatNextRefresh} handleCameraUpload={handleCameraUpload} handleSortModeChange={handleSortModeChange} handleUpdateAfocsSkd={handleUpdateAfocsSkd} loading={loading} nextRefreshAt={nextRefreshAt} onDragMove={onDragMove} orderedDisplayItems={orderedDisplayItems} selectedRoom={selectedRoom} setShowAllFlights={setShowAllFlights} showAllFlights={showAllFlights} sortMode={sortMode} startDrag={startDrag} summary={summary} visibleDisplayItems={visibleDisplayItems} />}

        {/* 모바일 일일 업무 보고 및 메모 작성 섹션 */}
        <DailyReportForm author={author} dailyLocalEditAtRef={dailyLocalEditAtRef} dailyStatus={dailyStatus} isDailySyncing={isDailySyncing} note={note} saveDailyReportToSupabase={saveDailyReportToSupabase} setAuthor={setAuthor} setDailyStatus={setDailyStatus} setNote={setNote} syncMessage={syncMessage} />
      </div>
    </div>
  );
}
