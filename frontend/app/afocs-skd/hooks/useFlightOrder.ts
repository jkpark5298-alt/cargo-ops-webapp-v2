import { useEffect, useMemo, useState } from "react";
import {
  getScheduleFlightOrderStorageKey,
  loadScheduleFlightOrder,
  normalizeSummaryFlightKey,
  saveScheduleFlightOrder,
} from "../../lib/schedule-order";
import { isFinalCompletedStatus, sortWidgetItemsByMode } from "../helpers";

export type UseFlightOrderParams = {
  displayItemsForSelectedRoom: { excludeReason: string | undefined; flight: string; status: string; departureCode: string; arrivalCode: string; displayTime: string; gate: string; registrationNo?: string | undefined; afocsSkd?: string | undefined; }[];
  selectedRoom: import("../../lib/flight-types").MonitorRoom | null;
  showAllFlights: boolean;
};

/** 편 목록 정렬(수동 드래그/예정/AFOCS)과 완료·진행 분류 */
export function useFlightOrder({
  displayItemsForSelectedRoom,
  selectedRoom,
  showAllFlights,
}: UseFlightOrderParams) {
  const [manualOrder, setManualOrder] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<"manual" | "schedule" | "afocs">("manual");
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [startY, setStartY] = useState<number>(0);

  const orderStorageKey = useMemo(
    () => getScheduleFlightOrderStorageKey(selectedRoom),
    [selectedRoom]
  );

  useEffect(() => {
    setManualOrder(loadScheduleFlightOrder(orderStorageKey));
  }, [orderStorageKey]);

  const orderedDisplayItems = useMemo(
    () => sortWidgetItemsByMode(displayItemsForSelectedRoom, sortMode, manualOrder),
    [displayItemsForSelectedRoom, sortMode, manualOrder],
  );
  const canDragReorder = sortMode === "manual";

  const handleSortModeChange = (mode: "schedule" | "afocs") => {
    setSortMode((prev) => (prev === mode ? "manual" : mode));
    setDraggingIndex(null);
  };

  // 완료 / 진행중 편수 계산
  const completedItems = useMemo(
    () => orderedDisplayItems.filter((item) => isFinalCompletedStatus(item.status)),
    [orderedDisplayItems]
  );
  const activeItems = useMemo(
    () => orderedDisplayItems.filter((item) => !isFinalCompletedStatus(item.status)),
    [orderedDisplayItems]
  );

  // 화면에 표시할 항목: showAllFlights=false 이면 진행중만 표시
  const visibleDisplayItems = useMemo(
    () => showAllFlights ? orderedDisplayItems : activeItems,
    [showAllFlights, orderedDisplayItems, activeItems]
  );

  const startDrag = (e: React.PointerEvent<HTMLDivElement>, index: number) => {
    if (!canDragReorder || e.button !== 0) return; // Only left-click/touch
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingIndex(index);
    setStartY(e.clientY);
  };

  const onDragMove = (e: React.PointerEvent<HTMLDivElement>, index: number) => {
    if (!canDragReorder || draggingIndex === null || draggingIndex !== index) return;
    const deltaY = e.clientY - startY;
    const threshold = 40; // Swap items if dragged past 40px

    if (deltaY > threshold) {
      const nextIndex = draggingIndex + 1;
      if (nextIndex < orderedDisplayItems.length) {
        const nextOrder = [...orderedDisplayItems.map((item) => normalizeSummaryFlightKey(item.flight))];
        const [moved] = nextOrder.splice(draggingIndex, 1);
        nextOrder.splice(nextIndex, 0, moved);
        setManualOrder(nextOrder);
        saveScheduleFlightOrder(orderStorageKey, nextOrder);
        setDraggingIndex(nextIndex);
        setStartY(e.clientY);
      }
    } else if (deltaY < -threshold) {
      const prevIndex = draggingIndex - 1;
      if (prevIndex >= 0) {
        const nextOrder = [...orderedDisplayItems.map((item) => normalizeSummaryFlightKey(item.flight))];
        const [moved] = nextOrder.splice(draggingIndex, 1);
        nextOrder.splice(prevIndex, 0, moved);
        setManualOrder(nextOrder);
        saveScheduleFlightOrder(orderStorageKey, nextOrder);
        setDraggingIndex(prevIndex);
        setStartY(e.clientY);
      }
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDraggingIndex(null);
  };

  return {
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
  };
}
