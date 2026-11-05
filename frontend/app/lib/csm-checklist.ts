const DEFAULT_CSM_CHECKLIST_URL = "https://csm-checklist.vercel.app";
const CSM_MAX_FLIGHTS = 8;
/** URL 길이 제한을 넘지 않도록 CSM Report 내용은 이 글자 수까지만 전달한다. */
export const CSM_MAX_REPORT_CHARS = 1500;

export type CsmChecklistType = "A" | "B";

export type CsmFlightTransferItem = {
  flight: string;
  spot: string;
  /** 빨간색(인천 출발)=A, 파란색(인천 도착)=B */
  type: CsmChecklistType;
};

export function getCsmChecklistBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_CSM_CHECKLIST_URL ||
    DEFAULT_CSM_CHECKLIST_URL;
  return raw.replace(/\/+$/, "");
}

/** KJ797 / kj-797 → 797 */
export function stripAirlinePrefix(flight: string): string {
  const compact = String(flight || "").replace(/\s+/g, "").toUpperCase();
  const withoutPrefix = compact.replace(/^[A-Z]{1,3}/, "");
  const digits = withoutPrefix.replace(/\D/g, "");
  return digits || compact.replace(/\D/g, "");
}

/** 화면 편명 색과 동일: 인천 출발은 빨간색(TYPE A), 인천 도착은 파란색(TYPE B) */
export function csmTypeFromRoute(dep?: string, arr?: string): CsmChecklistType {
  const d = String(dep || "").trim().toUpperCase();
  const a = String(arr || "").trim().toUpperCase();
  if (d === "ICN" || d === "RKSI") return "A";
  if (a === "ICN" || a === "RKSI") return "B";
  return "A";
}

export function toCsmFlightTransferItems(
  items: Array<{
    flight?: string;
    gate?: string;
    departureCode?: string;
    arrivalCode?: string;
  }>,
): CsmFlightTransferItem[] {
  const seen = new Set<string>();
  const result: CsmFlightTransferItem[] = [];

  for (const item of items) {
    const flight = stripAirlinePrefix(item.flight || "");
    const spot = String(item.gate || "")
      .trim()
      .toUpperCase()
      .replace(/^-$/, "");
    if (!flight && !spot) continue;

    const key = `${flight}|${spot}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      flight,
      spot,
      type: csmTypeFromRoute(item.departureCode, item.arrivalCode),
    });
  }

  return result;
}

function encodeBase64UrlJson(payload: unknown): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export type CsmReportTransfer = {
  /** 홈 화면 일일 보고의 "주요 사항" 메모 → CSM "CSM Report 내용" */
  text: string;
  /** 메모의 업무일자(YYYY-MM-DD) */
  workDate?: string;
};

/** 줄바꿈을 통일하고 앞뒤 공백을 정리한 뒤 최대 글자 수로 자른다. */
export function normalizeCsmReportText(text: string): { text: string; truncated: boolean } {
  const cleaned = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (cleaned.length <= CSM_MAX_REPORT_CHARS) return { text: cleaned, truncated: false };
  return { text: cleaned.slice(0, CSM_MAX_REPORT_CHARS), truncated: true };
}

export function buildCsmChecklistImportUrl(
  items: CsmFlightTransferItem[],
  options?: { baseUrl?: string; report?: CsmReportTransfer },
): { url: string; count: number; truncated: boolean; reportSent: boolean; reportTruncated: boolean } {
  const limited = items.slice(0, CSM_MAX_FLIGHTS);
  const truncated = items.length > CSM_MAX_FLIGHTS;
  const report = options?.report ? normalizeCsmReportText(options.report.text) : null;
  const reportSent = Boolean(report && report.text);
  const encoded = encodeBase64UrlJson({
    flights: limited,
    ...(reportSent && report
      ? { reportText: report.text, reportDate: options?.report?.workDate || "" }
      : {}),
  });
  const baseUrl = (options?.baseUrl || getCsmChecklistBaseUrl()).replace(/\/+$/, "");
  const params = new URLSearchParams({
    scheduleImport: encoded,
  });
  return {
    url: `${baseUrl}/?${params.toString()}`,
    count: limited.length,
    truncated,
    reportSent,
    reportTruncated: Boolean(report?.truncated),
  };
}

export function openCsmChecklistWithFlights(
  items: Array<{
    flight?: string;
    gate?: string;
    departureCode?: string;
    arrivalCode?: string;
  }>,
  report?: CsmReportTransfer,
): { opened: boolean; count: number; message: string } {
  const mapped = toCsmFlightTransferItems(items);
  if (mapped.length === 0) {
    return {
      opened: false,
      count: 0,
      message: "전달할 편명/SPOT(주기장) 정보가 없습니다.",
    };
  }

  const { url, count, truncated, reportSent, reportTruncated } = buildCsmChecklistImportUrl(mapped, { report });
  const openedWindow = window.open(url, "_blank");
  if (!openedWindow) {
    return {
      opened: false,
      count: 0,
      message:
        "CSM CHECK LIST 창이 차단되었습니다. 팝업을 허용한 뒤 다시 전달해 주세요.",
    };
  }
  openedWindow.opener = null;

  const base = truncated
    ? `CSM CHECK LIST로 편명·SPOT ${count}건을 전달했습니다. (최대 ${CSM_MAX_FLIGHTS}건만 전달)`
    : `CSM CHECK LIST로 편명·SPOT ${count}건을 전달했습니다.`;
  const reportNote = reportSent
    ? reportTruncated
      ? ` CSM Report 내용(주요 사항)은 ${CSM_MAX_REPORT_CHARS}자까지만 전달했습니다.`
      : " CSM Report 내용(주요 사항)도 함께 전달했습니다."
    : "";

  return {
    opened: true,
    count,
    message: base + reportNote,
  };
}
