import { useState } from "react";
import { BACKEND_URL, apiAuthHeaders } from "../../lib/api-config";
import { BackendScheduleCheckResult } from "../types";
import { buildAutoPushSummary, urlBase64ToUint8Array, type AutoPushSummary } from "../helpers";

export type UsePwaPushParams = {
  fetchIncheonApiUsage: () => Promise<void>;
  handleLoadServerFlightAlertHistory: (showStatus?: boolean) => Promise<void>;
  syncFlightAlertHistoryFromCheck: (result: import("../types").BackendScheduleCheckResult, sourceLabel: string) => Promise<void>;
  syncLatestScheduleFromServer: (showNotice?: boolean) => Promise<void>;
};

/** PWA 알림 권한·푸시 구독·자동 푸시 설정 */
export function usePwaPush({
  fetchIncheonApiUsage,
  handleLoadServerFlightAlertHistory,
  syncFlightAlertHistoryFromCheck,
  syncLatestScheduleFromServer,
}: UsePwaPushParams) {
  const [pwaPermissionLabel, setPwaPermissionLabel] = useState("확인 전");
  const [pwaStatusMessage, setPwaStatusMessage] = useState("");
  const [pwaLoading, setPwaLoading] = useState(false);
  const [pwaTestLoading, setPwaTestLoading] = useState(false);
  const [pwaCheckLoading, setPwaCheckLoading] = useState(false);
  const [autoPushEnabled, setAutoPushEnabled] = useState(false);
  const [autoPushLoading, setAutoPushLoading] = useState(false);
  const [autoPushStatusMessage, setAutoPushStatusMessage] = useState("");
  const [autoPushSummary, setAutoPushSummary] = useState<AutoPushSummary | null>(null);

  const fetchAutoPushStatus = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/flights/auto-push/status`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || json.success === false) return;

      setAutoPushEnabled(Boolean(json.enabled));
      const summary = buildAutoPushSummary(json);
      setAutoPushSummary(summary);
      setAutoPushStatusMessage(summary.message);
    } catch {
      // 자동 확인 상태 조회 실패 시 화면만 조용히 유지합니다.
    }
  };

  const savePushSubscription = async (subscription: PushSubscription) => {
    const saveRes = await fetch(`${BACKEND_URL}/flights/push-subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...apiAuthHeaders(),
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
      void fetchAutoPushStatus();

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
          ...apiAuthHeaders(),
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
      const removedText = json.removed ? ` · 만료된 기기 ${json.removed}대 정리` : "";
      setPwaStatusMessage(`테스트 알림을 발송했습니다. 성공 ${json.sent ?? 0}건 / 실패 ${json.failed ?? 0}건${removedText}`);
      await fetchAutoPushStatus();
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
          ...apiAuthHeaders(),
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

  return {
    autoPushEnabled,
    autoPushLoading,
    autoPushStatusMessage,
    autoPushSummary,
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
  };
}
