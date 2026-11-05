import { useEffect, useMemo, useState } from "react";
import {
  getScheduleFlightOrderStorageKey,
  loadScheduleFlightOrder,
  normalizeSummaryFlightKey,
  saveScheduleFlightOrder,
} from "../../../lib/schedule-order";
import { isFinalCompletedFlightStatus } from "../../../lib/flight-status";
import { sortFlightItemsByMode } from "../helpers";
import { FlightSortMode, FlightViewMode } from "../types";

export type UseFlightOrderStateParams = {
  baseItems: import("../types").FlightRouteItem[];
  room: import("../../../lib/flight-types").MonitorRoom | null;
  setPendingDeleteFlight: React.Dispatch<React.SetStateAction<string>>;
};

/** 목록 정렬(수동 드래그/예정/AFOCS)과 보기 모드 */
export function useFlightOrderState({
  baseItems,
  room,
  setPendingDeleteFlight,
}: UseFlightOrderStateParams) {
  const orderStorageKey = getScheduleFlightOrderStorageKey(room);
  const [manualOrder, setManualOrder] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<FlightSortMode>("manual");
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [startY, setStartY] = useState<number>(0);
  const [viewMode, setViewMode] = useState<FlightViewMode>("active");

  useEffect(() => {
    setManualOrder(loadScheduleFlightOrder(orderStorageKey));
    setPendingDeleteFlight("");
  }, [orderStorageKey]);

  const items = useMemo(
    () => sortFlightItemsByMode(baseItems, sortMode, manualOrder),
    [baseItems, sortMode, manualOrder],
  );

  const completedItems = useMemo(
    () => items.filter((item) => isFinalCompletedFlightStatus(item.status)),
    [items],
  );
  const activeItems = useMemo(
    () => items.filter((item) => !isFinalCompletedFlightStatus(item.status)),
    [items],
  );
  const visibleItems =
    viewMode === "completed" ? completedItems : viewMode === "all" ? items : activeItems;
  const canDragReorder = sortMode === "manual";

  const handleSortModeChange = (mode: "schedule" | "afocs") => {
    setSortMode((prev) => (prev === mode ? "manual" : mode));
    setDraggingIndex(null);
  };

  const startDrag = (e: React.PointerEvent<HTMLDivElement>, index: number) => {
    if (!canDragReorder || e.button !== 0) return;
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
      if (nextIndex < visibleItems.length) {
        const nextOrder = [...visibleItems.map((item) => normalizeSummaryFlightKey(item.flight))];
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
        const nextOrder = [...visibleItems.map((item) => normalizeSummaryFlightKey(item.flight))];
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
    items,
    onDragMove,
    setViewMode,
    sortMode,
    startDrag,
    viewMode,
    visibleItems,
  };
}
