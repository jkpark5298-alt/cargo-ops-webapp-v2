export type AfocsSkdFlightRow = {
  formattedEstimatedTime?: string;
  estimatedDateTime?: string;
  formattedScheduleTime?: string;
  scheduleDateTime?: string;
};

export function getRowScheduleDateTimeSource(row?: AfocsSkdFlightRow | null): string {
  if (!row) return "";
  return (
    row.formattedEstimatedTime ||
    row.estimatedDateTime ||
    row.formattedScheduleTime ||
    row.scheduleDateTime ||
    ""
  );
}

function normalizeAfocsDateTimeInput(value: string): string {
  return value
    .trim()
    .replace(/[\u00A0\u202F\u2007\u2009\u200A\uFEFF]/g, " ")
    .replace(/[．｡]/g, ".")
    .replace(/\s+/g, " ");
}

export function parseAfocsDateTime(value?: string | null): Date | null {
  if (!value || value === "-") return null;

  const trimmed = normalizeAfocsDateTimeInput(value);

  // ko-KR display: "07. 31. 12:49"
  const koMatch = trimmed.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{1,2}):(\d{2})$/);
  if (koMatch) {
    const [, month, day, hour, minute] = koMatch;
    const now = new Date();
    return new Date(
      now.getFullYear(),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      0,
    );
  }

  // Some Intl locales include year: "2026. 07. 31. 12:49"
  const koYearMatch = trimmed.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{1,2}):(\d{2})$/);
  if (koYearMatch) {
    const [, year, month, day, hour, minute] = koYearMatch;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      0,
    );
  }

  // Compact UI parts: "07.31 12:49"
  const compactPartsMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (compactPartsMatch) {
    const [, month, day, hour, minute] = compactPartsMatch;
    const now = new Date();
    return new Date(
      now.getFullYear(),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      0,
    );
  }

  const raw = trimmed.replace(/\./g, "-").replace(/\//g, "-").replace("T", " ");

  const fullMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (fullMatch) {
    const [, year, month, day, hour, minute, second] = fullMatch;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second || "0"),
    );
  }

  const monthDayMatch = raw.match(/^(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (monthDayMatch) {
    const [, month, day, hour, minute] = monthDayMatch;
    const now = new Date();
    return new Date(now.getFullYear(), Number(month) - 1, Number(day), Number(hour), Number(minute), 0);
  }

  // Last resort: pull digits from mixed/Intl output (YYYY? MM DD HH mm)
  const yearLoose = trimmed.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{2})/);
  if (yearLoose) {
    return new Date(
      Number(yearLoose[1]),
      Number(yearLoose[2]) - 1,
      Number(yearLoose[3]),
      Number(yearLoose[4]),
      Number(yearLoose[5]),
      0,
    );
  }

  const monthDayLoose = trimmed.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{2})/);
  if (monthDayLoose) {
    const now = new Date();
    return new Date(
      now.getFullYear(),
      Number(monthDayLoose[1]) - 1,
      Number(monthDayLoose[2]),
      Number(monthDayLoose[3]),
      Number(monthDayLoose[4]),
      0,
    );
  }

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  return null;
}

function parseTimeOnly(value: string): { hours: number; minutes: number } | null {
  const trimmed = value.trim();
  const colonMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    return { hours: Number(colonMatch[1]), minutes: Number(colonMatch[2]) };
  }

  const compactMatch = trimmed.match(/^(\d{3,4})$/);
  if (compactMatch) {
    const digits = compactMatch[1].padStart(4, "0");
    return {
      hours: Number(digits.slice(0, 2)),
      minutes: Number(digits.slice(2, 4)),
    };
  }

  return null;
}

function hasDatePart(value: string): boolean {
  const trimmed = value.trim();
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) return false;
  if (/^\d{3,4}$/.test(trimmed)) return false;
  return parseAfocsDateTime(trimmed) !== null;
}

export function formatAfocsSkdDateTime(date: Date): string {
  // Intl 출력은 환경마다 달라 파싱 round-trip이 깨질 수 있어 고정 포맷 사용
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}. ${day}. ${hour}:${minute}`;
}

export function isCompleteAfocsSkdInput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (hasDatePart(trimmed)) return true;
  return parseTimeOnly(trimmed) !== null;
}

export function normalizeAfocsSkdValue(value: string, row?: AfocsSkdFlightRow | null): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (hasDatePart(trimmed)) {
    const parsed = parseAfocsDateTime(trimmed);
    return parsed ? formatAfocsSkdDateTime(parsed) : trimmed;
  }

  const timeOnly = parseTimeOnly(trimmed);
  if (!timeOnly) return trimmed;

  const scheduleDt = parseAfocsDateTime(getRowScheduleDateTimeSource(row));
  if (scheduleDt) {
    const merged = new Date(scheduleDt);
    merged.setHours(timeOnly.hours, timeOnly.minutes, 0, 0);
    return formatAfocsSkdDateTime(merged);
  }

  const hours = String(timeOnly.hours).padStart(2, "0");
  const minutes = String(timeOnly.minutes).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function resolveAfocsSkdForDisplay(value: string, row?: AfocsSkdFlightRow | null): string {
  if (!value.trim()) return "";
  if (!isCompleteAfocsSkdInput(value)) return value.trim();
  return normalizeAfocsSkdValue(value, row);
}

export function prepareAfocsSkdForSave(value: string, row?: AfocsSkdFlightRow | null): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!isCompleteAfocsSkdInput(trimmed)) return trimmed;
  return normalizeAfocsSkdValue(trimmed, row);
}

export function parseAfocsSkdSortValue(value?: string): number {
  if (!value || value === "-") return Number.MAX_SAFE_INTEGER;

  const parsed = parseAfocsDateTime(value.trim());
  if (parsed) return parsed.getTime();

  const timeOnly = parseTimeOnly(value);
  if (timeOnly) {
    const now = new Date();
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      timeOnly.hours,
      timeOnly.minutes,
      0,
    ).getTime();
  }

  return Number.MAX_SAFE_INTEGER;
}

/** UI에 보이는 MM.DD / HH:mm 파츠를 우선해 AFOCS 정렬키 계산 */
export function parseAfocsSkdSortValueFromParts(
  date?: string,
  time?: string,
  fallbackValue?: string,
): number {
  const dateValue = String(date || "").trim();
  const timeValue = String(time || "").trim();

  if (dateValue && timeValue) {
    const fromParts = parseAfocsDateTime(`${dateValue} ${timeValue}`);
    if (fromParts) return fromParts.getTime();
  }

  if (timeValue && !dateValue) {
    return parseAfocsSkdSortValue(timeValue);
  }

  return parseAfocsSkdSortValue(fallbackValue);
}

export function formatExcelAfocsSkdValue(val: unknown, row?: AfocsSkdFlightRow | null): string {
  if (!val && val !== 0) return "";

  if (val instanceof Date) {
    return formatAfocsSkdDateTime(val);
  }

  if (typeof val === "number") {
    // 하루 미만이면 엑셀 시간 소수, 이상이면 날짜 시리얼로 처리
    if (val > 0 && val < 1) {
      const totalMinutes = Math.round(val * 24 * 60);
      const hours = String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0");
      const minutes = String(totalMinutes % 60).padStart(2, "0");
      return prepareAfocsSkdForSave(`${hours}:${minutes}`, row);
    }
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const parsed = new Date(excelEpoch.getTime() + val * 24 * 60 * 60 * 1000);
    if (!Number.isNaN(parsed.getTime())) {
      return formatAfocsSkdDateTime(parsed);
    }
  }

  const str = String(val).trim();
  if (!str) return "";
  return prepareAfocsSkdForSave(str, row);
}

function formatExcelDateOnly(val: unknown): string {
  if (!val && val !== 0) return "";

  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, "0");
    const day = String(val.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (typeof val === "number" && val >= 1) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const parsed = new Date(excelEpoch.getTime() + val * 24 * 60 * 60 * 1000);
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getUTCFullYear();
      const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
      const day = String(parsed.getUTCDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  }

  const raw = String(val).trim().replace(/\./g, "-").replace(/\//g, "-");
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function formatExcelTimeOnly(val: unknown): string {
  if (!val && val !== 0) return "";

  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return `${String(val.getHours()).padStart(2, "0")}:${String(val.getMinutes()).padStart(2, "0")}`;
  }

  if (typeof val === "number") {
    if (val > 0 && val < 1) {
      const totalMinutes = Math.round(val * 24 * 60);
      return `${String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
    }
    // 날짜 시리얼에 시간이 포함된 경우
    if (val >= 1) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const parsed = new Date(excelEpoch.getTime() + val * 24 * 60 * 60 * 1000);
      if (!Number.isNaN(parsed.getTime())) {
        return `${String(parsed.getUTCHours()).padStart(2, "0")}:${String(parsed.getUTCMinutes()).padStart(2, "0")}`;
      }
    }
  }

  const str = String(val).trim();
  const colon = str.match(/^(\d{1,2}):(\d{2})/);
  if (colon) {
    return `${colon[1].padStart(2, "0")}:${colon[2]}`;
  }
  const compact = str.match(/^(\d{3,4})$/);
  if (compact) {
    const digits = compact[1].padStart(4, "0");
    return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
  }
  return "";
}

/** 엑셀 일자 + ETD/ETA(또는 시간) 컬럼을 AFOCS SKD 문자열로 합칩니다. */
export function formatExcelAfocsSkdFromDateAndTime(
  dateVal: unknown,
  timeVal: unknown,
  row?: AfocsSkdFlightRow | null,
): string {
  // 시간 칸에 이미 완전한 일시가 있으면 그대로 사용
  if (timeVal instanceof Date) {
    return formatAfocsSkdDateTime(timeVal);
  }
  if (typeof timeVal === "string" && /[-\/.]/.test(timeVal) && /\d:\d{2}/.test(timeVal)) {
    return prepareAfocsSkdForSave(timeVal, row);
  }

  const datePart = formatExcelDateOnly(dateVal);
  const timePart = formatExcelTimeOnly(timeVal);

  if (datePart && timePart) {
    return prepareAfocsSkdForSave(`${datePart} ${timePart}`, row);
  }
  if (timePart) {
    return prepareAfocsSkdForSave(timePart, row);
  }
  if (datePart) {
    return prepareAfocsSkdForSave(datePart, row);
  }
  return formatExcelAfocsSkdValue(timeVal, row);
}

export function getAfocsSkdPlaceholderFromRow(row?: AfocsSkdFlightRow | null): string {
  const source = getRowScheduleDateTimeSource(row);
  const parsed = parseAfocsDateTime(source);
  return parsed ? formatAfocsSkdDateTime(parsed) : "날짜·시간 입력";
}

export type AfocsSkdParts = {
  date: string;
  time: string;
};

function parseScheduleSourceDateTime(value?: string | null): Date | null {
  if (!value) return null;

  const parsed = parseAfocsDateTime(value);
  if (parsed) return parsed;

  const compactMatch = String(value)
    .trim()
    .match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (compactMatch) {
    const [, year, month, day, hour, minute] = compactMatch;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      0,
    );
  }

  return null;
}

function toCompactDateValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}.${day}`;
}

function toCompactTimeValue(date: Date): string {
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function parseCompactDatePart(value: string, row?: AfocsSkdFlightRow | null): Date | null {
  const trimmed = value.trim();
  const compactMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (compactMatch) {
    const reference =
      parseScheduleSourceDateTime(getRowScheduleDateTimeSource(row)) || new Date();
    return new Date(
      reference.getFullYear(),
      Number(compactMatch[1]) - 1,
      Number(compactMatch[2]),
      0,
      0,
      0,
    );
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return new Date(year, month - 1, day, 0, 0, 0);
    }
  }

  return null;
}

export function formatCompactScheduleDateTime(value?: string | null): string {
  const parsed = parseScheduleSourceDateTime(value);
  if (!parsed) return "-";
  return `${toCompactDateValue(parsed)} ${toCompactTimeValue(parsed)}`;
}

export function splitAfocsSkdParts(value: string, row?: AfocsSkdFlightRow | null): AfocsSkdParts {
  const parsed =
    (value.trim() ? parseAfocsDateTime(value) : null) ||
    parseScheduleSourceDateTime(getRowScheduleDateTimeSource(row));

  if (!parsed) {
    return { date: "", time: "" };
  }

  return {
    date: toCompactDateValue(parsed),
    time: toCompactTimeValue(parsed),
  };
}

/** 저장된 AFOCS SKD만 분리 (API 스케줄 fallback 없음) */
export function splitAfocsSkdPartsStoredOnly(value: string): AfocsSkdParts {
  const parsed = value.trim() ? parseAfocsDateTime(value) : null;
  if (!parsed) {
    return { date: "", time: "" };
  }

  return {
    date: toCompactDateValue(parsed),
    time: toCompactTimeValue(parsed),
  };
}

/** API 변경일시 표시용 — 스케줄 기준 MM.DD / HH:mm */
export function splitScheduleCompactParts(row?: AfocsSkdFlightRow | null): AfocsSkdParts {
  return splitAfocsSkdParts("", row);
}

export function getRowFlightKeyForAfocs(row: { flightId?: string; flightNo?: string }) {
  return String(row.flightId || row.flightNo || "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function preserveAfocsSkdOnRows<
  T extends { flightId?: string; flightNo?: string; afocsSkd?: string },
>(incomingRows: T[], previousRows?: T[] | null): T[] {
  if (!previousRows?.length) return incomingRows;

  const prevMap = new Map<string, T>();
  previousRows.forEach((row) => {
    const key = getRowFlightKeyForAfocs(row);
    if (key) prevMap.set(key, row);
  });

  return incomingRows.map((row) => {
    const key = getRowFlightKeyForAfocs(row);
    const prev = key ? prevMap.get(key) : undefined;
    const prevAfocs = String(prev?.afocsSkd || "").trim();
    if (!prev || !prevAfocs) return row;
    return { ...row, afocsSkd: prev.afocsSkd };
  });
}

/** previous에만 값이 있고 incoming이 비어 있을 때만 AFOCS를 채웁니다(로컬이 서버 값을 덮지 않게). */
export function fillEmptyAfocsSkdOnRows<
  T extends { flightId?: string; flightNo?: string; afocsSkd?: string },
>(incomingRows: T[], previousRows?: T[] | null): T[] {
  if (!previousRows?.length) return incomingRows;

  const prevMap = new Map<string, T>();
  previousRows.forEach((row) => {
    const key = getRowFlightKeyForAfocs(row);
    if (key) prevMap.set(key, row);
  });

  return incomingRows.map((row) => {
    const incomingAfocs = String(row.afocsSkd || "").trim();
    if (incomingAfocs) return row;

    const key = getRowFlightKeyForAfocs(row);
    const prev = key ? prevMap.get(key) : undefined;
    const prevAfocs = String(prev?.afocsSkd || "").trim();
    if (!prev || !prevAfocs) return row;
    return { ...row, afocsSkd: prev.afocsSkd };
  });
}

/** AFOCS가 비어 있으면 변경(스케줄) 시각으로 채웁니다. */
export function seedEmptyAfocsSkdFromSchedule<
  T extends {
    flightId?: string;
    flightNo?: string;
    afocsSkd?: string;
    formattedEstimatedTime?: string;
    estimatedDateTime?: string;
    formattedScheduleTime?: string;
    scheduleDateTime?: string;
  },
>(rows: T[]): T[] {
  return rows.map((row) => {
    if (String(row.afocsSkd || "").trim()) return row;
    const parts = splitScheduleCompactParts(row);
    if (!parts.date || !parts.time) return row;
    const seeded = combineAfocsSkdParts(parts.date, parts.time, row);
    if (!seeded) return row;
    return { ...row, afocsSkd: seeded };
  });
}

/** merged에 base에 없던(또는 다른) AFOCS가 있으면 true — 서버 재저장 여부 판단용 */
export function hasAfocsSkdUpdates<
  T extends { flightId?: string; flightNo?: string; afocsSkd?: string },
>(baseRows: T[] | null | undefined, mergedRows: T[] | null | undefined): boolean {
  const baseMap = new Map<string, string>();
  (baseRows || []).forEach((row) => {
    const key = getRowFlightKeyForAfocs(row);
    const afocs = String(row.afocsSkd || "").trim();
    if (key && afocs) baseMap.set(key, afocs);
  });

  for (const row of mergedRows || []) {
    const key = getRowFlightKeyForAfocs(row);
    const afocs = String(row.afocsSkd || "").trim();
    if (!key || !afocs) continue;
    if (baseMap.get(key) !== afocs) return true;
  }
  return false;
}

export function mergeRowPreservingAfocsSkd<T extends { afocsSkd?: string }>(
  existing: T,
  incoming: T,
): T {
  const prevAfocs = String(existing.afocsSkd || "").trim();
  const merged = { ...existing, ...incoming };
  if (prevAfocs) {
    merged.afocsSkd = existing.afocsSkd;
  }
  return merged;
}

export function combineAfocsSkdParts(
  date: string,
  time: string,
  row?: AfocsSkdFlightRow | null,
): string {
  const dateValue = date.trim();
  const timeValue = time.trim();

  if (!dateValue && !timeValue) return "";

  const datePart = parseCompactDatePart(dateValue, row);
  const timePart = parseTimeOnly(timeValue);

  if (datePart && timePart) {
    const merged = new Date(datePart);
    merged.setHours(timePart.hours, timePart.minutes, 0, 0);
    return formatAfocsSkdDateTime(merged);
  }

  if (timePart && !dateValue) {
    return prepareAfocsSkdForSave(timeValue, row);
  }

  if (datePart && !timeValue) {
    const fallbackTime = splitScheduleCompactParts(row).time || "00:00";
    return combineAfocsSkdParts(dateValue, fallbackTime, row);
  }

  if (dateValue.includes("-") && timeValue) {
    const [year, month, day] = dateValue.split("-").map(Number);
    const [hour, minute] = timeValue.split(":").map(Number);
    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      Number.isFinite(day) &&
      Number.isFinite(hour) &&
      Number.isFinite(minute)
    ) {
      return formatAfocsSkdDateTime(new Date(year, month - 1, day, hour, minute, 0));
    }
  }

  return "";
}
