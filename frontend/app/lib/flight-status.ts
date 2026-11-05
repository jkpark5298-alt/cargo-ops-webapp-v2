export type FlightStatusRow = {
  status?: string;
  statusInferred?: boolean;
  remark?: string;
  delay?: boolean;
  canceled?: boolean;
  gateChanged?: boolean;
  departureCode?: string;
  arrivalCode?: string;
  sourceType?: string;
  formattedEstimatedTime?: string;
  formattedScheduleTime?: string;
  estimatedDateTime?: string;
  scheduleDateTime?: string;
};

export function parseFlightStatusTime(row: FlightStatusRow): Date | null {
  const raw =
    row.formattedEstimatedTime ||
    row.formattedScheduleTime ||
    row.estimatedDateTime ||
    row.scheduleDateTime;

  if (!raw) return null;

  const normalized = String(raw)
    .trim()
    .replace(/\./g, "-")
    .replace(/\//g, "-")
    .replace("T", " ");

  const direct = new Date(normalized);
  if (!Number.isNaN(direct.getTime())) return direct;

  const spaced = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (spaced) {
    const [, y, m, d, hh, mm, ss] = spaced;
    return new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss || "0"),
    );
  }

  const compact = normalized.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?$/);
  if (compact) {
    const [, y, m, d, hh, mm, ss] = compact;
    return new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss || "0"),
    );
  }

  return null;
}

function getDirectionKind(row: FlightStatusRow): "departure" | "arrival" | null {
  const source = String(row.sourceType || "").toLowerCase();
  if (source === "departure") return "departure";
  if (source === "arrival") return "arrival";

  const dep = String(row.departureCode || "").toUpperCase();
  const arr = String(row.arrivalCode || "").toUpperCase();
  if (dep === "ICN") return "departure";
  if (arr === "ICN") return "arrival";
  return null;
}

function getElapsedStatus(row: FlightStatusRow, delayed: boolean): string | null {
  const dt = parseFlightStatusTime(row);
  if (!dt || dt.getTime() > Date.now()) return null;

  const kind = getDirectionKind(row);
  if (kind === "departure") return delayed ? "출발(지연)" : "출발";
  // 도착 예정 시각이 지났지만 인천 API 가 아직 도착을 알리지 않은 상태 → 도착 확정이 아니라 '도착 지연'
  if (kind === "arrival") return "도착 지연";
  return null;
}

export function getComputedFlightStatus(row?: FlightStatusRow | null): string {
  if (!row) return "-";

  // 시각이 지나 추정해 붙인 status 는 API 값이 아니므로 판단에서 제외한다.
  const apiStatus = row.statusInferred ? "" : row.status || "";
  const remarkStatus = `${apiStatus} ${row.remark || ""}`.trim().toUpperCase();

  if (row.canceled || remarkStatus.includes("CANCEL")) return "결항";
  if (row.gateChanged) return "게이트 변경";

  const delayed =
    Boolean(row.delay) ||
    remarkStatus.includes("DELAY") ||
    remarkStatus.includes("지연");

  if (delayed) {
    if (remarkStatus.includes("ARRIV") || remarkStatus.includes("도착") || apiStatus === "도착") {
      return "도착(지연)";
    }
    if (remarkStatus.includes("DEPAR") || remarkStatus.includes("출발") || apiStatus === "출발") {
      return "출발(지연)";
    }
    return getElapsedStatus(row, true) || "지연";
  }

  if (
    apiStatus === "출발" ||
    remarkStatus.includes("DEPART") ||
    remarkStatus.includes("DEP") ||
    remarkStatus.includes("출발")
  ) {
    return "출발";
  }

  if (
    apiStatus === "도착" ||
    remarkStatus.includes("ARRIV") ||
    remarkStatus.includes("ARR") ||
    remarkStatus.includes("도착")
  ) {
    return "도착";
  }

  return getElapsedStatus(row, false) || "-";
}

export function isFinalCompletedFlightStatus(status: string) {
  if (!status || status === "-") return false;
  // 도착 예정 시각이 지났지만 도착이 확인되지 않은 편은 아직 진행 중으로 본다.
  if (status === "도착 지연") return false;
  const s = status.toLowerCase();
  return (
    s.includes("도착") ||
    s.includes("출발") ||
    s.includes("결항") ||
    s === "arrival" ||
    s === "departure" ||
    s === "cancel" ||
    s === "cancelled"
  );
}

/** 편명 색: 인천 출발=빨강, 인천 도착=파랑, 그 외=회백색 */
export function getFlightNoColor(dep?: string, arr?: string): string {
  const d = String(dep || "").trim().toUpperCase();
  const a = String(arr || "").trim().toUpperCase();
  if (d === "ICN" || d === "RKSI") {
    return "#ef4444"; // 빨간색 (인천출발)
  }
  if (a === "ICN" || a === "RKSI") {
    return "#3b82f6"; // 파란색 (인천도착)
  }
  return "#e2e8f0"; // 기본 색상 (회백색)
}
