import { formatScheduleCardName, saveScheduleSlotToServer } from "../lib/schedule-slots";
import { mergeRowPreservingAfocsSkd } from "../../lib/afocs-skd";
import { type FlightRow, type MonitorRoom } from "../../lib/flight-types";
import { normalizeFlightKey, normalizeFlightsInput } from "../../lib/flight-keys";
import {
  buildScheduleRowsForFlights,
  isActiveScheduleRoom,
  mergeLatestScheduleRoom,
  normalizeScheduleRoomRows,
  removeEmptyScheduleRooms,
  removeFlightFromScheduleRoom,
  removeFlightFromScheduleOnServer,
  saveLatestScheduleToServer,
  saveRooms,
} from "../../lib/schedule-store";
import {
  applyInlineHlDraftsToRows,
  clearFlightAlertBaselineAndHistory,
  getFlightDisplay,
  getSelectionKey,
  isFinalCompletedRow,
} from "../lib/helpers";
import { LAST_FIXED_ROOM_KEY } from "../lib/constants";

export type UseScheduleSelectionParams = {
  applyAllRegistrationSources: (targetRows: import("../../lib/flight-types").FlightRow[], records?: import("../../lib/flight-types").AircraftRegistrationRecord[]) => import("../../lib/flight-types").FlightRow[];
  applyScheduleSlotsState: (slots: import("../lib/schedule-slots").ScheduleSlotsState, preferredSlot?: import("../lib/schedule-slots").ScheduleSlotKey | null | undefined) => void;
  endDateTime: string;
  flightMode: import("../lib/schedule-slots").FlightMode;
  hlInlineDrafts: Record<string, string>;
  input: string;
  persistRegistrationDraftsForRows: (targetRows: import("../../lib/flight-types").FlightRow[]) => Promise<void>;
  rooms: import("../../lib/flight-types").MonitorRoom[];
  rows: import("../../lib/flight-types").FlightRow[];
  scheduleSlots: import("../lib/schedule-slots").ScheduleSlotsState;
  selectedRoom: import("../../lib/flight-types").MonitorRoom | null;
  selectedScheduleRows: import("../../lib/flight-types").FlightRow[];
  selectedSlotKey: import("../lib/schedule-slots").ScheduleSlotKey | null;
  setError: React.Dispatch<React.SetStateAction<string>>;
  setExpandedDetailKeys: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setFixed: React.Dispatch<React.SetStateAction<boolean>>;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setLastFetchedAt: React.Dispatch<React.SetStateAction<string>>;
  setRooms: React.Dispatch<React.SetStateAction<import("../../lib/flight-types").MonitorRoom[]>>;
  setRows: React.Dispatch<React.SetStateAction<import("../../lib/flight-types").FlightRow[]>>;
  setSelectedRoomId: React.Dispatch<React.SetStateAction<string>>;
  setSelectedScheduleKeys: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setSelectedScheduleOrder: React.Dispatch<React.SetStateAction<string[]>>;
  startDateTime: string;
};

/** 조회 결과 선택·삭제와 Schedule Flight 저장 */
export function useScheduleSelection({
  applyAllRegistrationSources,
  applyScheduleSlotsState,
  endDateTime,
  flightMode,
  hlInlineDrafts,
  input,
  persistRegistrationDraftsForRows,
  rooms,
  rows,
  scheduleSlots,
  selectedRoom,
  selectedScheduleRows,
  selectedSlotKey,
  setError,
  setExpandedDetailKeys,
  setFixed,
  setInput,
  setLastFetchedAt,
  setRooms,
  setRows,
  setSelectedRoomId,
  setSelectedScheduleKeys,
  setSelectedScheduleOrder,
  startDateTime,
}: UseScheduleSelectionParams) {
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
        // 삭제 기록을 서버에 남겨, 오래된 화면·다른 기기의 저장으로 되살아나지 않게 한다.
        for (const flight of targetFlights) {
          await removeFlightFromScheduleOnServer(flight);
        }
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
        explicitEdit: !shouldRotate,
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

  return {
    getMissingInputFlights,
    handleDeleteSelectedFlightsFromSchedule,
    handleSaveSelectedSchedule,
    handleToggleScheduleSelection,
    mergeFlightsInput,
    mergeScheduleRowsByFlight,
  };
}
