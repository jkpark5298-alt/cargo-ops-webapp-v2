import { alertHighlightLineStyle } from "./styles";
import { AlertDescriptionLine, ParsedAlertTime } from "./types";

export function formatAlertTitle(value?: string, description?: string) {
  const raw = (value || "출도착 변경").trim();
  const combined = `${raw} ${description || ""}`;
  const flight = combined.match(/\b[A-Z]{2}\d{2,4}\b/)?.[0];
  const route = extractAlertRoute(combined);

  if (!flight) {
    return raw
      .replace("Schedule Flight 변경 감지", "Schedule 변경")
      .replace("서버에 저장된 알림 이력", "서버 알림");
  }

  // 모바일에서 제목이 길어지지 않도록 편명 + 노선만 표시합니다.
  return route ? `${flight} ${route}` : `${flight} 운항 정보 변경`;
}

export function renderAlertDescription(value?: string, checkedAt?: string) {
  const lines = buildAlertDescriptionLines(value, checkedAt);

  return (
    <>
      {lines.map((line, index) => (
        <div
          key={`${line.text}-${index}`}
          style={line.highlight ? alertHighlightLineStyle : undefined}
        >
          {line.text}
        </div>
      ))}
    </>
  );
}

export function buildAlertDescriptionLines(value?: string, checkedAt?: string): AlertDescriptionLine[] {
  const raw = sanitizeLegacyAlertText(value || "운항 정보 변경");
  const route = extractAlertRoute(raw);
  const timeChange = extractAlertTimeChange(raw, checkedAt);
  const statusChange = extractAlertStatusChange(raw);
  const gateChange = extractAlertLabeledChange(raw, "게이트");
  const terminalChange = extractAlertLabeledChange(raw, "터미널");
  const statusTimeText = extractStatusDateTime(raw);
  const expectedText = extractExpectedDateTime(raw) || timeChange?.expectedText || "";
  const occurredText = formatHistoryClockTime(checkedAt, true);

  const lines: AlertDescriptionLine[] = [];

  if (statusChange) {
    const timePart = statusTimeText ? `, 시간 ${statusTimeText}` : "";

    lines.push({
      text: `${statusChange}${timePart}`,
      highlight: true,
    });
    lines.push({ text: buildAlertMetaLine(expectedText, occurredText) });
  } else if (timeChange) {
    lines.push({
      text: `운항시각 ${timeChange.fullChangeText}`,
      highlight: true,
    });
    lines.push({ text: buildAlertMetaLine(expectedText, occurredText) });
  } else if (gateChange) {
    lines.push({ text: `게이트 ${gateChange}`, highlight: true });
    lines.push({ text: buildAlertMetaLine(expectedText, occurredText) });
  } else if (terminalChange) {
    lines.push({ text: `터미널 ${terminalChange}`, highlight: true });
    lines.push({ text: buildAlertMetaLine(expectedText, occurredText) });
  } else {
    const cleanedParts = splitAlertParts(raw)
      .filter((part) => !route || part.replace(/\s+/g, "") !== route.replace(/\s+/g, ""))
      .filter((part) => !/^발생\b/.test(part))
      .filter((part) => !/^스케줄\b/.test(part))
      .filter((part) => !/^예정\b/.test(part))
      .filter((part) => !/^시간\b/.test(part))
      .filter((part) => !/^API\s*확인/.test(part))
      .filter((part) => !part.includes("서버 알림"))
      .filter((part) => !part.includes("자동 확인"))
      .filter((part) => !part.includes("AFOCS SKD"))
      .map((part) =>
        part
          .replace("API 즉시 확인", "API 확인")
          .replace("수동 변경 확인", "수동 확인")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean);

    lines.push(...Array.from(new Set(cleanedParts)).slice(0, 1).map((text) => ({ text })));
    lines.push({ text: buildAlertMetaLine(expectedText, occurredText) });
  }

  const uniqueLines = lines.filter((line) => Boolean(line.text.trim()));
  return uniqueLines.length > 0 ? uniqueLines : [{ text: "운항 정보 변경" }];
}

export function sanitizeLegacyAlertText(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s*·\s*/g, " · ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

export function buildAlertMetaLine(expectedText: string, occurredText: string) {
  const metaParts: string[] = [];
  const expectedClock = formatAlertClockOnly(expectedText);

  if (expectedClock) {
    metaParts.push(`예정 ${expectedClock}`);
  }

  if (occurredText !== "-") {
    metaParts.push(`발생 ${occurredText}`);
  }

  return metaParts.length > 0 ? `(${metaParts.join(" · ")})` : "";
}

export function extractAlertStatusChange(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const match = normalized.match(/상태\s*:?\s*(.+?)\s*→\s*(.+?)(?=\s*\/?\s*(?:출발\s*시간|도착\s*시간|착륙\s*시간|시간|예정|스케줄|발생|API|서버)(?=\s|$)|$)/);
  if (!match) return "";

  const before = cleanStatusToken(match[1]) || "-";
  const after = cleanStatusToken(match[2]) || "-";

  return `${before} → ${after}`;
}

export function cleanStatusToken(value: string) {
  return value
    .replace(/[:：]/g, "")
    .replace(/\b(?:시간|예정|스케줄|발생)\b.*$/g, "")
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractStatusDateTime(value: string) {
  const labels = ["출발 시간", "도착 시간", "착륙 시간", "시간"];

  for (const label of labels) {
    const found = extractAlertDateTimeByLabel(value, label);
    if (found) return found;
  }

  return "";
}

export function extractExpectedDateTime(value: string) {
  return extractAlertDateTimeByLabel(value, "예정") || extractAlertDateTimeByLabel(value, "스케줄") || "";
}

export function extractAlertDateTimeByLabel(value: string, label: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `${escapedLabel}\\s*[:：]?\\s+('?\\d{2,4}[/-]\\d{1,2}[/-]\\d{1,2}\\s+(?:\\d{1,2}[: ]\\d{2}|\\d{3,4})|\\d{1,2}/\\d{1,2}\\s+(?:\\d{1,2}[: ]\\d{2}|\\d{3,4})|\\d{1,2}[: ]\\d{2}|\\d{3,4})`
  );
  const match = normalized.match(pattern);
  if (!match) return "";
  return normalizeAlertDateTime(match[1]);
}

export function normalizeAlertDateTime(value: string) {
  const raw = value.trim().replace(/^'/, "").replace(/\s+/g, " ");

  const fullCompactMatch = raw.match(/^(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{3,4})$/);
  if (fullCompactMatch) {
    let [, year, month, day, hhmm] = fullCompactMatch;
    if (year.length === 4) year = year.slice(2);
    hhmm = hhmm.padStart(4, "0");
    return `'${year.padStart(2, "0")}/${month.padStart(2, "0")}/${day.padStart(2, "0")} ${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`;
  }

  const fullMatch = raw.match(/^(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2})[: ](\d{2})$/);
  if (fullMatch) {
    let [, year, month, day, hour, minute] = fullMatch;
    if (year.length === 4) year = year.slice(2);
    return `'${year.padStart(2, "0")}/${month.padStart(2, "0")}/${day.padStart(2, "0")} ${hour.padStart(2, "0")}:${minute}`;
  }

  const shortDateCompactMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{3,4})$/);
  if (shortDateCompactMatch) {
    const [, month, day, hhmmRaw] = shortDateCompactMatch;
    const hhmm = hhmmRaw.padStart(4, "0");
    const year = new Date().getFullYear().toString().slice(2);
    return `'${year}/${month.padStart(2, "0")}/${day.padStart(2, "0")} ${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`;
  }

  const shortDateMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2})[: ](\d{2})$/);
  if (shortDateMatch) {
    const [, month, day, hour, minute] = shortDateMatch;
    const year = new Date().getFullYear().toString().slice(2);
    return `'${year}/${month.padStart(2, "0")}/${day.padStart(2, "0")} ${hour.padStart(2, "0")}:${minute}`;
  }

  const compactTimeMatch = raw.match(/^(\d{3,4})$/);
  if (compactTimeMatch) {
    const hhmm = compactTimeMatch[1].padStart(4, "0");
    return `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`;
  }

  const timeMatch = raw.match(/^(\d{1,2})[: ](\d{2})$/);
  if (timeMatch) {
    const [, hour, minute] = timeMatch;
    return `${hour.padStart(2, "0")}:${minute}`;
  }

  return value.trim();
}

export function formatAlertClockOnly(value?: string) {
  const raw = String(value || "").trim();
  const match = raw.match(/(\d{1,2}):(\d{2})(?:\s*KST)?$/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;

  const compact = raw.match(/\b(\d{3,4})\b$/);
  if (compact) {
    const hhmm = compact[1].padStart(4, "0");
    return `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`;
  }

  return raw.replace(/^'\d{2}\/\d{2}\/\d{2}\s+/, "");
}

export function splitAlertParts(value: string) {
  return value
    .split(/\n+| · /)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^Schedule_/.test(line))
    .filter((line) => !line.includes("AFOCS SKD 저장 알림"))
    .filter((line) => !line.includes("푸시 자동 확인"))
    .filter((line) => !line.includes("앱 자동 확인"))
    .filter((line) => !line.includes("서버 알림"));
}

export function extractAlertRoute(value: string) {
  return value
    .match(/[A-Z]{3}\s*→\s*[A-Z]{3}/)?.[0]
    ?.replace(/\s+/g, " ")
    .trim() || "";
}

export function extractAlertLabeledChange(value: string, label: string) {
  const normalized = value.replace(/\s+/g, " ");
  const match = normalized.match(new RegExp(`${label}\s+([^·\n]+?\s*→\s*[^·\n]+)`));
  return match?.[1]?.trim() || "";
}

export function parseAlertTime(value: string): ParsedAlertTime | null {
  const raw = value.trim().replace(/^'/, "");
  const fullMatch = raw.match(/^(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}:\d{2})$/);
  if (fullMatch) {
    let [, year, month, day, time] = fullMatch;
    if (year.length === 4) year = year.slice(2);
    return {
      year: year.padStart(2, "0"),
      month: month.padStart(2, "0"),
      day: day.padStart(2, "0"),
      time: normalizeClockTime(time),
    };
  }

  const timeMatch = raw.match(/^(\d{1,2}:\d{2})$/);
  if (timeMatch) {
    return { time: normalizeClockTime(timeMatch[1]) };
  }

  return null;
}

export function normalizeClockTime(value: string) {
  const [hour, minute] = value.split(":");
  return `${hour.padStart(2, "0")}:${minute}`;
}

export function getAlertDatePartsFromCheckedAt(value?: string) {
  const formatted = formatHistoryTime(value, false);
  const match = formatted.match(/^(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);

  if (!match) return null;

  const [, month, day] = match;
  const currentYear = new Date().getFullYear().toString().slice(2);

  return {
    year: currentYear,
    month,
    day,
  };
}

export function extractAlertTimeChange(value: string, checkedAt?: string) {
  const normalized = value
    .replace(/\s+/g, " ")
    .replace(/←/g, "→")
    .trim();

  const match =
    normalized.match(/운항(?:시각)?\s*'?((?:\d{2,4}[/-]\d{1,2}[/-]\d{1,2}\s+)?\d{1,2}:\d{2})\s*→\s*'?((?:\d{2,4}[/-]\d{1,2}[/-]\d{1,2}\s+)?\d{1,2}:\d{2})/) ||
    normalized.match(/'?((?:\d{2,4}[/-]\d{1,2}[/-]\d{1,2}\s+)?\d{1,2}:\d{2})\s*→\s*'?((?:\d{2,4}[/-]\d{1,2}[/-]\d{1,2}\s+)?\d{1,2}:\d{2})/);

  if (!match) return null;

  const before = parseAlertTime(match[1]);
  const after = parseAlertTime(match[2]);

  if (!before || !after) return null;

  const fallbackDate = getAlertDatePartsFromCheckedAt(checkedAt);
  const year = after.year || before.year || fallbackDate?.year || new Date().getFullYear().toString().slice(2);
  const month = after.month || before.month || fallbackDate?.month || "";
  const day = after.day || before.day || fallbackDate?.day || "";

  const expectedText =
    month && day
      ? `'${year}/${month}/${day} ${after.time}`
      : after.time;

  const datePrefix = month && day ? `'${year}/${month}/${day} ` : "";

  return {
    shortChangeText: `${before.time} → ${after.time}`,
    fullChangeText: `${datePrefix}${before.time} → ${after.time}`,
    expectedText,
  };
}

export function formatHistoryClockTime(value?: string, withKst = false) {
  const formatted = formatHistoryFullTime(value);
  if (formatted === "-") return "-";
  const match = formatted.match(/(\d{2}):(\d{2})\s*KST$/);
  if (!match) return formatted.replace(/^'\d{2}\/\d{2}\/\d{2}\s+/, "");
  return `${match[1]}:${match[2]}${withKst ? " KST" : ""}`;
}

export function compactServerStatus(value: string) {
  return value
    .replace("서버 미처리 이력", "서버 이력")
    .replace("출도착 알림 이력에 자동 표시", "자동 표시")
    .replace("출도착 알림 이력에 자동 반영했습니다.", "자동 반영")
    ;
}

export function formatHistoryFullTime(value?: string) {
  if (!value) return "-";

  const raw = String(value).trim();
  const currentYear = new Date().getFullYear().toString().slice(2);

  const koreanMatch = raw.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2})/);
  if (koreanMatch) {
    const [, year, month, day, ampm, rawHour, minute] = koreanMatch;
    let hour = Number(rawHour);
    if (ampm === "오후" && hour < 12) hour += 12;
    if (ampm === "오전" && hour === 12) hour = 0;

    return `'${year.slice(2)}/${month.padStart(2, "0")}/${day.padStart(2, "0")} ${String(hour).padStart(2, "0")}:${minute} KST`;
  }

  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      const formatter = new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
        if (part.type !== "literal") acc[part.type] = part.value;
        return acc;
      }, {});

      return `'${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute} KST`;
    }
  }

  const normalized = raw.replace("T", " ").replace("Z", "").trim();
  const match = normalized.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s+(\d{1,2}):(\d{2})/);

  if (match) {
    const [, year, month, day, hour, minute] = match;
    return `'${year.slice(2)}/${month.padStart(2, "0")}/${day.padStart(2, "0")} ${hour.padStart(2, "0")}:${minute} KST`;
  }

  const shortMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (shortMatch) {
    const [, month, day, hour, minute] = shortMatch;
    return `'${currentYear}/${month.padStart(2, "0")}/${day.padStart(2, "0")} ${hour.padStart(2, "0")}:${minute} KST`;
  }

  return `${raw} KST`;
}

export function formatHistoryTime(value?: string, withKst = false) {
  if (!value) return "-";

  const raw = String(value).trim();
  const suffix = withKst ? " KST" : "";

  const koreanMatch = raw.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2})/);
  if (koreanMatch) {
    const [, , month, day, ampm, rawHour, minute] = koreanMatch;
    let hour = Number(rawHour);
    if (ampm === "오후" && hour < 12) hour += 12;
    if (ampm === "오전" && hour === 12) hour = 0;

    return `${month.padStart(2, "0")}/${day.padStart(2, "0")} ${String(hour).padStart(2, "0")}:${minute}${suffix}`;
  }

  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      const formatter = new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
        if (part.type !== "literal") acc[part.type] = part.value;
        return acc;
      }, {});

      return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}${suffix}`;
    }
  }

  const normalized = raw.replace("T", " ").replace("Z", "").trim();
  const match = normalized.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s+(\d{1,2}):(\d{2})/);

  if (match) {
    const [, , month, day, hour, minute] = match;
    return `${month.padStart(2, "0")}/${day.padStart(2, "0")} ${hour.padStart(2, "0")}:${minute}${suffix}`;
  }

  const shortMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (shortMatch) {
    const [, month, day, hour, minute] = shortMatch;
    return `${month.padStart(2, "0")}/${day.padStart(2, "0")} ${hour.padStart(2, "0")}:${minute}${suffix}`;
  }

  return `${raw}${suffix}`;
}
