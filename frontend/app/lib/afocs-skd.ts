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

export function parseAfocsDateTime(value?: string | null): Date | null {
  if (!value || value === "-") return null;

  const trimmed = value.trim();
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

  const raw = trimmed.replace(/\./g, "-").replace(/\//g, "-").replace("T", " ");
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

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

  const monthDayMatch = raw.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (monthDayMatch) {
    const [, month, day, hour, minute] = monthDayMatch;
    const now = new Date();
    return new Date(now.getFullYear(), Number(month) - 1, Number(day), Number(hour), Number(minute), 0);
  }

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
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
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
  if (timeOnly) return timeOnly.hours * 60 + timeOnly.minutes;

  return Number.MAX_SAFE_INTEGER;
}

export function formatExcelAfocsSkdValue(val: unknown, row?: AfocsSkdFlightRow | null): string {
  if (!val) return "";

  if (val instanceof Date) {
    return formatAfocsSkdDateTime(val);
  }

  if (typeof val === "number") {
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

function toInputDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toInputTimeValue(date: Date): string {
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function splitAfocsSkdParts(value: string, row?: AfocsSkdFlightRow | null): AfocsSkdParts {
  const parsed =
    (value.trim() ? parseAfocsDateTime(value) : null) ||
    parseScheduleSourceDateTime(getRowScheduleDateTimeSource(row));

  if (!parsed) {
    return { date: "", time: "" };
  }

  return {
    date: toInputDateValue(parsed),
    time: toInputTimeValue(parsed),
  };
}

export function combineAfocsSkdParts(
  date: string,
  time: string,
  row?: AfocsSkdFlightRow | null,
): string {
  const dateValue = date.trim();
  const timeValue = time.trim();

  if (!dateValue && !timeValue) return "";

  if (dateValue && timeValue) {
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

  if (timeValue && !dateValue) {
    return prepareAfocsSkdForSave(timeValue, row);
  }

  if (dateValue && !timeValue) {
    const fallbackTime = splitAfocsSkdParts("", row).time || "00:00";
    return combineAfocsSkdParts(dateValue, fallbackTime, row);
  }

  return "";
}
