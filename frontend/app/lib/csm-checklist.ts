const DEFAULT_CSM_CHECKLIST_URL = "https://csm-checklist-shift.vercel.app";
const CSM_MAX_FLIGHTS = 8;

export type CsmFlightTransferItem = {
  flight: string;
  spot: string;
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

export function toCsmFlightTransferItems(
  items: Array<{ flight?: string; gate?: string }>,
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
    result.push({ flight, spot });
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

export function buildCsmChecklistImportUrl(
  items: CsmFlightTransferItem[],
  options?: { baseUrl?: string },
): { url: string; count: number; truncated: boolean } {
  const limited = items.slice(0, CSM_MAX_FLIGHTS);
  const truncated = items.length > CSM_MAX_FLIGHTS;
  const encoded = encodeBase64UrlJson({ flights: limited });
  const baseUrl = (options?.baseUrl || getCsmChecklistBaseUrl()).replace(/\/+$/, "");
  const params = new URLSearchParams({
    scheduleImport: encoded,
  });
  return {
    url: `${baseUrl}/?${params.toString()}`,
    count: limited.length,
    truncated,
  };
}

export function openCsmChecklistWithFlights(
  items: Array<{ flight?: string; gate?: string }>,
): { opened: boolean; count: number; message: string } {
  const mapped = toCsmFlightTransferItems(items);
  if (mapped.length === 0) {
    return {
      opened: false,
      count: 0,
      message: "전달할 편명/SPOT(주기장) 정보가 없습니다.",
    };
  }

  const { url, count, truncated } = buildCsmChecklistImportUrl(mapped);
  window.open(url, "_blank", "noopener,noreferrer");

  return {
    opened: true,
    count,
    message: truncated
      ? `CSM CHECK LIST로 편명·SPOT ${count}건을 전달했습니다. (최대 ${CSM_MAX_FLIGHTS}건만 전달)`
      : `CSM CHECK LIST로 편명·SPOT ${count}건을 전달했습니다.`,
  };
}
