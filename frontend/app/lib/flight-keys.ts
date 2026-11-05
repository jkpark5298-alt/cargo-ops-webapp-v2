/**
 * 편명·등록번호 정규화 — 모든 화면이 이 한 곳의 규칙을 사용합니다.
 * (예: "247" → "KJ247", "kj 0247" → "KJ247", "7612" → "HL7612")
 */
import type { FlightRow } from "./flight-types";

/** 편명 비교용 키. 공백·특수문자를 없애고 접두어가 없으면 KJ를 붙이며 앞자리 0을 제거합니다. */
export function normalizeFlightKey(value: string) {
  let normalized = String(value || "").replace(/\s+/g, "").toUpperCase();
  normalized = normalized.replace(/[^A-Z0-9]/g, "");

  const match = normalized.match(/^([A-Z]{2,3})?0*([1-9]\d*)$/);
  if (match) {
    const prefix = match[1] || "KJ";
    const num = match[2];
    return `${prefix}${num}`;
  }

  const allZerosMatch = normalized.match(/^([A-Z]{2,3})?0+$/);
  if (allZerosMatch) {
    const prefix = allZerosMatch[1] || "KJ";
    return `${prefix}0`;
  }

  return normalized;
}

/** 입력창의 편명 목록 문자열을 배열로 바꿉니다. 3~4자리 숫자는 KJ를 붙입니다. */
export function normalizeFlightsInput(rawInput: string) {
  return rawInput
    .split(/[\s,\n,]+/)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
    .map((value) => {
      if (/^\d{3,4}$/.test(value)) {
        return `KJ${value}`;
      }
      return value;
    });
}

/** 행의 편명(flightId 우선). 없으면 빈 문자열. */
export function getFlightNo(row?: FlightRow | null) {
  if (!row) return "";
  return String(row.flightId || row.flightNo || "").trim();
}

/** 등록번호 문자열 정규화. 3~5자리 숫자만 있으면 HL을 붙입니다. (유효성 검사는 하지 않음) */
export function normalizeHlNumber(value: string) {
  let normalized = String(value || "").replace(/\s+/g, "").toUpperCase();
  normalized = normalized.replace(/[^A-Z0-9]/g, "");

  if (/^\d{3,5}$/.test(normalized)) {
    return `HL${normalized}`;
  }

  return normalized;
}

/** 유효한 등록번호(HL + 숫자 3~5자리)면 정규화한 값, 아니면 빈 문자열. */
export function confirmedRegistrationNo(value: string) {
  const normalized = normalizeHlNumber(String(value || ""));
  return /^HL\d{3,5}$/i.test(normalized) ? normalized : "";
}

/** 화면 표시용 등록번호 포맷. 유효하지 않으면 빈 문자열. */
export function formatAircraftRegistrationNo(value: string) {
  return confirmedRegistrationNo(value);
}

/** 행에 들어 있는 등록번호(hlnbr → registrationNo → aircraftRegNo → fid 순). 없으면 빈 문자열. */
export function getRegistrationNo(row?: FlightRow | null) {
  if (!row) return "";

  // fid는 항공편 고유번호라 숫자만 있는 값은 등록번호로 보지 않고, HL로 시작할 때만 인정합니다.
  const candidates = [
    row.hlnbr,
    row.registrationNo,
    row.aircraftRegNo,
    /^HL\d{3,5}$/i.test(row.fid || "") ? row.fid : "",
  ];
  for (const candidate of candidates) {
    const confirmed = confirmedRegistrationNo(String(candidate || ""));
    if (confirmed) return confirmed;
  }

  return "";
}
