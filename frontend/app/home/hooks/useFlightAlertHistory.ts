import { type MonitorRoom } from "../../lib/flight-types";
import { useEffect, useState } from "react";
import {
  buildFlightAlertSnapshot,
  clearFlightAlertHistory,
  clearFlightAlertSnapshot,
  type FlightAlertHistoryItem,
  type FlightAlertSnapshot,
  getCurrentTimeLabel,
  loadFlightAlertHistory,
  mergeFlightAlertHistoryItems,
  saveFlightAlertHistory,
  saveFlightAlertSnapshot,
} from "../../lib/flight-alerts";
import { BACKEND_URL } from "../../lib/api-config";
import { BackendScheduleChange, BackendScheduleCheckResult } from "../types";

export type UseFlightAlertHistoryParams = {
  latestRoom: MonitorRoom | null;
};

/** 비행 알림 스냅샷·이력(로컬/서버) 상태와 처리 */
export function useFlightAlertHistory({
  latestRoom,
}: UseFlightAlertHistoryParams) {
  const [, setAlertCheckedAt] = useState("");
  const [flightAlertSnapshot, setFlightAlertSnapshot] =
    useState<FlightAlertSnapshot | null>(null);
  const [flightAlertHistory, setFlightAlertHistory] =
    useState<FlightAlertHistoryItem[]>([]);
  const [flightAlertDetailsVisible, setFlightAlertDetailsVisible] = useState(false);
  const [serverFlightAlertChangeCount, setServerFlightAlertChangeCount] = useState(0);
  const [serverFlightAlertLoading, setServerFlightAlertLoading] = useState(false);
  const [serverFlightAlertStatus, setServerFlightAlertStatus] = useState("");

  useEffect(() => {
    if (!latestRoom) return;
    if (flightAlertSnapshot?.roomId === latestRoom.id) return;

    const nextSnapshot = buildFlightAlertSnapshot(latestRoom);
    if (!nextSnapshot) return;

    setFlightAlertSnapshot(nextSnapshot);
    saveFlightAlertSnapshot(nextSnapshot);
    setAlertCheckedAt(nextSnapshot.savedAt);
  }, [latestRoom?.id, flightAlertSnapshot?.roomId]);

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

  return {
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
  };
}
