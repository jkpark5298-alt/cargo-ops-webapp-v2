"use client";

import type { CSSProperties } from "react";
import type { FlightAlertHistoryItem } from "../lib/flight-alerts";

type FlightAlertHistoryCardProps = {
  historyItems: FlightAlertHistoryItem[];
  serverLoading?: boolean;
  serverStatus?: string;
  summaryCount?: number;
  detailsVisible?: boolean;
  onDeleteItem: (item: FlightAlertHistoryItem) => void;
  onClear: () => void;
  onLoadServerHistory: () => void | Promise<void>;
};

export function FlightAlertHistoryCard({
  historyItems,
  serverLoading = false,
  serverStatus = "",
  summaryCount,
  detailsVisible = false,
  onDeleteItem,
  onClear,
  onLoadServerHistory,
}: FlightAlertHistoryCardProps) {
  const visibleCount = summaryCount ?? historyItems.length;
  const newChangeCount = historyItems.length;
  const hasHistoryItems = historyItems.length > 0;
  const hasRecentChanges = visibleCount > 0 || newChangeCount > 0;
  const latestItem = historyItems[0];

  return (
    <section style={flightAlertHistoryCardStyle}>
      <div style={flightAlertTopStyle}>
        <div>
          <div style={cardLabelStyle}>출도착 알림 이력</div>
          <h2 style={flightAlertTitleStyle}>
            {hasRecentChanges ? `신규 변경 ${newChangeCount}건 / 미확인 ${visibleCount}건` : "미확인 없음"}
          </h2>
        </div>
        <div style={hasRecentChanges ? activeBadgeStyle : idleBadgeStyle}>
          {hasRecentChanges ? "확인 필요" : "정상"}
        </div>
      </div>

      <div style={serverActionRowStyle}>
        <button
          type="button"
          onClick={onLoadServerHistory}
          disabled={serverLoading}
          style={serverButtonStyle}
        >
          {serverLoading ? "확인 중..." : "최근 알림 확인"}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={serverLoading || !hasHistoryItems}
          style={hasHistoryItems ? dangerButtonStyle : disabledServerButtonStyle}
        >
          전체 삭제
        </button>
      </div>

      {hasRecentChanges && !detailsVisible ? (
        <div style={compactSummaryStyle}>
          <div style={compactSummaryTitleStyle}>
            {latestItem ? formatAlertTitle(latestItem.title, latestItem.description) : `미확인 ${visibleCount}건`}
          </div>
          <div style={compactSummaryDescStyle}>
            {latestItem
              ? renderAlertDescription(latestItem.description, latestItem.checkedAt)
              : "최근 알림 확인을 눌러 세부 내용을 확인하세요."}
          </div>
          <div style={compactSummaryMetaStyle}>눌러서 세부 목록 확인</div>
        </div>
      ) : null}

      {hasHistoryItems && detailsVisible ? (
        <div style={flightAlertListStyle}>
          {historyItems.slice(0, 5).map((item, index) => (
            <div key={`${item.key}-${item.checkedAt}-${index}`} style={flightAlertHistoryItemStyle}>
              <div style={flightAlertHistoryItemHeaderStyle}>
                <div>
                  <div style={flightAlertItemTitleStyle}>{formatAlertTitle(item.title, item.description)}</div>
                  <div style={flightAlertItemDescStyle}>{renderAlertDescription(item.description, item.checkedAt)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteItem(item)}
                  style={deleteItemButtonStyle}
                  aria-label={`${item.title} 알림 삭제`}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {serverStatus ? <div style={serverStatusStyle}>{compactServerStatus(serverStatus)}</div> : null}

      {!hasRecentChanges ? (
        <div style={flightAlertMetaStyle}>새 변경 알림이 없습니다.</div>
      ) : null}
    </section>
  );
}

const flightAlertHistoryCardStyle: CSSProperties = {
  background: "linear-gradient(145deg, #0b1120, #111827)",
  border: "1px solid #1e3a8a",
  borderRadius: 18,
  padding: 14,
  boxShadow: "0 12px 30px rgba(0,0,0,0.20)",
};

const flightAlertTopStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 7,
  alignItems: "flex-start",
  marginBottom: 8,
};

const cardLabelStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 1.5,
  textTransform: "uppercase",
};

const flightAlertTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#f8fafc",
  fontSize: 20,
  lineHeight: 1.15,
  fontWeight: 950,
};

const activeBadgeStyle: CSSProperties = {
  padding: "5px 9px",
  borderRadius: 999,
  background: "#b45309",
  color: "#fffbeb",
  fontSize: 12,
  fontWeight: 950,
  whiteSpace: "nowrap",
};

const idleBadgeStyle: CSSProperties = {
  ...activeBadgeStyle,
  background: "#14532d",
  color: "#dcfce7",
};

const flightAlertMetaStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.5,
  marginTop: 8,
};

const compactSummaryStyle: CSSProperties = {
  border: "1px solid rgba(250, 204, 21, 0.28)",
  background: "rgba(250, 204, 21, 0.08)",
  borderRadius: 14,
  padding: "8px 10px",
  marginBottom: 8,
};

const compactSummaryTitleStyle: CSSProperties = {
  color: "#fef3c7",
  fontSize: 14,
  fontWeight: 950,
  lineHeight: 1.3,
};

const compactSummaryDescStyle: CSSProperties = {
  color: "#fde68a",
  fontSize: 13,
  lineHeight: 1.45,
  fontWeight: 850,
  marginTop: 4,
  whiteSpace: "pre-line",
};

const compactSummaryMetaStyle: CSSProperties = {
  color: "#93c5fd",
  fontSize: 11,
  lineHeight: 1.4,
  fontWeight: 800,
  marginTop: 4,
};

const flightAlertListStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  marginBottom: 8,
};

const flightAlertHistoryItemStyle: CSSProperties = {
  border: "1px solid rgba(59, 130, 246, 0.22)",
  background: "rgba(30, 64, 175, 0.16)",
  borderRadius: 14,
  padding: "8px 10px",
};

const flightAlertHistoryItemHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
};

const flightAlertItemTitleStyle: CSSProperties = {
  color: "#fef3c7",
  fontSize: 14,
  fontWeight: 950,
  marginBottom: 4,
};

const flightAlertItemDescStyle: CSSProperties = {
  color: "#fde68a",
  fontSize: 13,
  lineHeight: 1.45,
  fontWeight: 800,
  whiteSpace: "pre-line",
};

const alertHighlightLineStyle: CSSProperties = {
  color: "#fca5a5",
  fontWeight: 950,
};

const serverActionRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 7,
  marginBottom: 8,
};

const serverButtonStyle: CSSProperties = {
  minHeight: 40,
  border: "1px solid rgba(59, 130, 246, 0.45)",
  borderRadius: 11,
  color: "#dbeafe",
  background: "#1d4ed8",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const disabledServerButtonStyle: CSSProperties = {
  ...serverButtonStyle,
  opacity: 0.5,
  cursor: "not-allowed",
};

const dangerButtonStyle: CSSProperties = {
  ...serverButtonStyle,
  border: "1px solid rgba(248, 113, 113, 0.48)",
  background: "rgba(127, 29, 29, 0.72)",
  color: "#fecaca",
};

const serverStatusStyle: CSSProperties = {
  color: "#93c5fd",
  fontSize: 11,
  fontWeight: 800,
  lineHeight: 1.35,
  marginTop: 8,
};

const deleteItemButtonStyle: CSSProperties = {
  border: "1px solid rgba(248, 113, 113, 0.42)",
  borderRadius: 999,
  padding: "4px 8px",
  background: "rgba(127, 29, 29, 0.38)",
  color: "#fecaca",
  fontSize: 11,
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};


function formatAlertTitle(value?: string, description?: string) {
  const raw = (value || "출도착 변경").trim();
  const combined = `${raw} ${description || ""}`;
  const flight = combined.match(/\b[A-Z]{2}\d{2,4}\b/)?.[0];
  const route = extractAlertRoute(combined);

  if (!flight) {
    return raw
      .replace("Schedule Flight 변경 감지", "Schedule 변경")
      .replace("서버에 저장된 알림 이력", "서버 알림");
  }

  return route ? `${flight} 운항 정보 변경 : ${route}` : `${flight} 운항 정보 변경`;
}

type AlertDescriptionLine = {
  text: string;
  highlight?: boolean;
};

function renderAlertDescription(value?: string, checkedAt?: string) {
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

function formatAlertDescription(value?: string, checkedAt?: string) {
  return buildAlertDescriptionLines(value, checkedAt)
    .map((line) => line.text)
    .join("\n");
}

function getStatusTimeLabel(statusChange: string) {
  const after = statusChange.split("→").pop()?.trim() || "";

  if (after.includes("출발")) return "출발 시간";
  if (after.includes("도착")) return "도착 시간";
  if (after.includes("착륙")) return "착륙 시간";

  return "시간";
}

function buildAlertDescriptionLines(value?: string, checkedAt?: string): AlertDescriptionLine[] {
  const raw = (value || "운항 정보 변경").trim();
  const route = extractAlertRoute(raw);
  const timeChange = extractAlertTimeChange(raw, checkedAt);
  const statusChange = extractAlertStatusChange(raw);
  const gateChange = extractAlertLabeledChange(raw, "게이트");
  const terminalChange = extractAlertLabeledChange(raw, "터미널");
  const statusTimeText =
    extractAlertDateTimeByLabel(raw, "출발 시간") ||
    extractAlertDateTimeByLabel(raw, "도착 시간") ||
    extractAlertDateTimeByLabel(raw, "착륙 시간") ||
    extractAlertDateTimeByLabel(raw, "시간");
  const expectedText =
    extractAlertDateTimeByLabel(raw, "예정") ||
    extractAlertDateTimeByLabel(raw, "스케줄") ||
    timeChange?.expectedText ||
    "";
  const occurredText = formatHistoryFullTime(checkedAt);

  const lines: AlertDescriptionLine[] = [];

  if (statusChange) {
    const statusTimeLabel = getStatusTimeLabel(statusChange);
    const timePart = statusTimeText ? ` / ${statusTimeLabel} ${statusTimeText}` : "";

    lines.push({
      text: `상태: ${statusChange}${timePart}`,
      highlight: true,
    });
    lines.push({
      text: buildAlertMetaLine(expectedText, occurredText),
    });
  } else if (timeChange) {
    lines.push({
      text: `운항시각 ${timeChange.shortChangeText}`,
      highlight: true,
    });
    lines.push({
      text: buildAlertMetaLine(expectedText, occurredText),
    });
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
      .filter((part) => !part.includes("Schedule Lite"))
      .map((part) =>
        part
          .replace("API 즉시 확인", "API 확인")
          .replace("수동 변경 확인", "수동 확인")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean);

    lines.push(...Array.from(new Set(cleanedParts)).slice(0, 2).map((text) => ({ text })));
    lines.push({ text: buildAlertMetaLine(expectedText, occurredText) });
  }

  const uniqueLines = lines.filter((line) => Boolean(line.text.trim()));
  return uniqueLines.length > 0 ? uniqueLines : [{ text: "운항 정보 변경" }];
}

function buildAlertMetaLine(expectedText: string, occurredText: string) {
  const metaParts: string[] = [];

  if (expectedText) {
    metaParts.push(`예정 ${expectedText}`);
  }

  if (occurredText !== "-") {
    metaParts.push(`발생: ${occurredText}`);
  }

  return metaParts.length > 0 ? `(${metaParts.join(", ")})` : "";
}

function extractAlertStatusChange(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const match = normalized.match(/상태\s*:?\s*(.+?)\s*→\s*(.+?)(?=\s*\/?\s*(?:시간|출발\s*시간|도착\s*시간|예정|스케줄|발생|API|서버)\b|$)/);
  if (!match) return "";

  const before = match[1]
    .replace(/[:：]/g, "")
    .replace(/\b(?:시간|예정|스케줄|발생)\b.*$/g, "")
    .trim() || "-";

  const after = match[2]
    .replace(/[:：]/g, "")
    .replace(/\b(?:시간|예정|스케줄|발생)\b.*$/g, "")
    .trim() || "-";

  return `${before} → ${after}`;
}

function extractAlertDateTimeByLabel(value: string, label: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `${escapedLabel}\\s*[:：]?\\s+('?\\d{2,4}[/-]\\d{1,2}[/-]\\d{1,2}\\s+(?:\\d{1,2}[: ]\\d{2}|\\d{3,4})|\\d{1,2}/\\d{1,2}\\s+(?:\\d{1,2}[: ]\\d{2}|\\d{3,4})|\\d{1,2}[: ]\\d{2}|\\d{3,4})`
  );
  const match = normalized.match(pattern);
  if (!match) return "";
  return normalizeAlertDateTime(match[1]);
}

function normalizeAlertDateTime(value: string) {
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


function extractAlertLine(value: string, label: string) {
  const parts = splitAlertParts(value);
  const found = parts.find((part) => part.trim().startsWith(`${label} `));
  return found ? found.replace(/\s+/g, " ").trim() : "";
}

function splitAlertParts(value: string) {
  return value
    .split(/\n+| · /)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^Schedule_/.test(line))
    .filter((line) => !line.includes("Schedule Lite 저장 알림"))
    .filter((line) => !line.includes("푸시 자동 확인"))
    .filter((line) => !line.includes("앱 자동 확인"))
    .filter((line) => !line.includes("서버 알림"));
}

function extractAlertRoute(value: string) {
  return value
    .match(/[A-Z]{3}\s*→\s*[A-Z]{3}/)?.[0]
    ?.replace(/\s+/g, " ")
    .trim() || "";
}

function extractAlertLabeledChange(value: string, label: string) {
  const normalized = value.replace(/\s+/g, " ");
  const match = normalized.match(new RegExp(`${label}\\s+([^·\\n]+?\\s*→\\s*[^·\\n]+)`));
  return match?.[1]?.trim() || "";
}

type ParsedAlertTime = {
  year?: string;
  month?: string;
  day?: string;
  time: string;
};

function parseAlertTime(value: string): ParsedAlertTime | null {
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

function normalizeClockTime(value: string) {
  const [hour, minute] = value.split(":");
  return `${hour.padStart(2, "0")}:${minute}`;
}

function getAlertDatePartsFromCheckedAt(value?: string) {
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

function extractAlertTimeChange(value: string, checkedAt?: string) {
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

  return {
    shortChangeText: `${before.time} → ${after.time}`,
    expectedText,
  };
}

function compactServerStatus(value: string) {
  return value
    .replace("서버 미처리 이력", "서버 이력")
    .replace("출도착 알림 이력에 자동 표시", "자동 표시")
    .replace("출도착 알림 이력에 자동 반영했습니다.", "자동 반영")
    ;
}

function compactRoomName(value?: string) {
  return (value || "서버 알림")
    .replace("서버에 저장된 알림 이력", "서버 알림")
    .replace(/^Schedule_.*/, "서버 알림")
    .slice(0, 18);
}


function formatHistoryFullTime(value?: string) {
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


function formatHistoryTime(value?: string, withKst = false) {
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

