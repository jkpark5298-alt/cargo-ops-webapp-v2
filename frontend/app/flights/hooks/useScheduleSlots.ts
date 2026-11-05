import { useState } from "react";
import {
  clearAllScheduleSlotsOnServer,
  deleteScheduleSlotOnServer,
  linkScheduleSlotOnServer,
  loadScheduleSlotsFromServer,
  saveScheduleSlotToServer,
  type ScheduleSlotKey,
  type ScheduleSlotsState,
  slotsToRooms,
  swapScheduleSlotsOnServer,
} from "../lib/schedule-slots";
import { type FlightRow, type MonitorRoom } from "../../lib/flight-types";
import {
  isActiveScheduleRoom,
  normalizeScheduleRoomRows,
  saveLatestScheduleToServer,
  saveRooms,
} from "../../lib/schedule-store";
import {
  clearFlightAlertBaselineAndHistory,
  getDefaultEndDateTime,
  getDefaultStartDateTime,
  loadRegistrationQueryRange,
  patchScheduleRowsWithRegistrationFields,
} from "../lib/helpers";

export type UseScheduleSlotsParams = {
  flightMode: import("../lib/schedule-slots").FlightMode;
  resetLookupView: () => void;
  setEndDateTime: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string>>;
  setExpandedDetailKeys: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setFixed: React.Dispatch<React.SetStateAction<boolean>>;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setLastFetchedAt: React.Dispatch<React.SetStateAction<string>>;
  setQueryMode: React.Dispatch<React.SetStateAction<"manual" | "kj-all">>;
  setRegistrationEndDateTime: React.Dispatch<React.SetStateAction<string>>;
  setRegistrationStartDateTime: React.Dispatch<React.SetStateAction<string>>;
  setRooms: React.Dispatch<React.SetStateAction<import("../../lib/flight-types").MonitorRoom[]>>;
  setRows: React.Dispatch<React.SetStateAction<import("../../lib/flight-types").FlightRow[]>>;
  setSelectedRoomId: React.Dispatch<React.SetStateAction<string>>;
  setSelectedScheduleKeys: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setSelectedScheduleOrder: React.Dispatch<React.SetStateAction<string[]>>;
  setStartDateTime: React.Dispatch<React.SetStateAction<string>>;
};

/** Schedule Flight 카드(active/archive 슬롯) 선택·삭제·복원·초기화면 연동 */
export function useScheduleSlots({
  flightMode,
  resetLookupView,
  setEndDateTime,
  setError,
  setExpandedDetailKeys,
  setFixed,
  setInput,
  setLastFetchedAt,
  setQueryMode,
  setRegistrationEndDateTime,
  setRegistrationStartDateTime,
  setRooms,
  setRows,
  setSelectedRoomId,
  setSelectedScheduleKeys,
  setSelectedScheduleOrder,
  setStartDateTime,
}: UseScheduleSlotsParams) {
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlotsState>({
    active: null,
    archive: null,
    linkedSlot: "active",
  });
  const [selectedSlotKey, setSelectedSlotKey] = useState<ScheduleSlotKey | null>(null);

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

  return {
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
  };
}
