import { isActiveScheduleRoom, loadRooms } from "../lib/schedule-store";
import { type FlightRow, type MonitorRoom } from "../lib/flight-types";
import { getFlightNo } from "../lib/flight-keys";
import { getRouteDisplay } from "../lib/flight-alerts";
import {
  IfdEntry,
  ImageFileMetadata,
  ImageSlotKey,
  IncheonApiUsage,
  SavedImage,
  WeatherInfo,
} from "./types";
import { DAILY_WORK_DATE_STORAGE_KEY } from "./constants";

export function getLocalLatestScheduleRoom() {
  return loadRooms().find((room) => room.fixed && isActiveScheduleRoom(room)) || null;
}

export function getCurrentSyncLabel() {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export function getImageBySlot(images: SavedImage[], slotKey: ImageSlotKey) {
  return images.find((image) => image.type === slotKey) || null;
}

export function upsertImageBySlot(
  images: SavedImage[],
  nextImage: SavedImage,
): SavedImage[] {
  return [nextImage, ...images].slice(0, 20);
}

export function getImagesBySlot(images: SavedImage[], slotKey: ImageSlotKey) {
  return images.filter((image) => image.type === slotKey);
}

export function removeImageBySlot(images: SavedImage[], slotKey: ImageSlotKey) {
  return images.filter((image) => image.type !== slotKey);
}

export function formatDateForTitle(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const weekdays = [
    "일요일",
    "월요일",
    "화요일",
    "수요일",
    "목요일",
    "금요일",
    "토요일",
  ];
  return `${yyyy}.${mm}.${dd} ${weekdays[date.getDay()]}`;
}

export function formatHeaderUsageRate(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

export function formatHeaderApiUsageText(usage?: IncheonApiUsage | null) {
  if (!usage) return "API 사용율 : - (총 -건, 출발 -건, 도착 -건)";

  const total = Number(usage.total || 0);
  const departure = Number(usage.departure || 0);
  const arrival = Number(usage.arrival || 0);
  const totalRate = Number(usage.totalRate || 0);

  return `API 사용율 : ${formatHeaderUsageRate(totalRate)} (총 ${total.toLocaleString()}건, 출발 ${departure.toLocaleString()}건, 도착 ${arrival.toLocaleString()}건)`;
}

export function getTodayDateInputValue() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function getInitialDailyWorkDate() {
  if (typeof window === "undefined") return getTodayDateInputValue();

  try {
    const saved = window.localStorage.getItem(DAILY_WORK_DATE_STORAGE_KEY);
    return saved || getTodayDateInputValue();
  } catch {
    return getTodayDateInputValue();
  }
}

export function saveDailyWorkDate(value: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(DAILY_WORK_DATE_STORAGE_KEY, value);
  } catch {
    // 날짜 저장 실패는 화면 동작을 막지 않습니다.
  }
}

export function formatDailyStatusLabel(status: "normal" | "issue") {
  return status === "normal" ? "정상" : "비정상";
}

export function getWorkDateMismatchMessage(workDate: string, today = getTodayDateInputValue()) {
  if (!workDate || workDate === today) return "";
  return `선택 업무일자는 ${formatDateInputForTitle(workDate)} 이고, 시스템 날짜는 ${formatDateInputForTitle(today)} 입니다. Notion에는 선택 업무일자로 저장됩니다.`;
}

export function formatDateInputForTitle(value: string) {
  const [yyyy, mm, dd] = value.split("-").map((part) => Number(part));
  if (!yyyy || !mm || !dd) return formatDateForTitle(new Date());

  return formatDateForTitle(new Date(yyyy, mm - 1, dd));
}

export function getDailyWorkDateIso(value: string) {
  if (!value) return new Date().toISOString();

  return `${value}T00:00:00+09:00`;
}

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export function getLatestScheduleRoom(rooms: MonitorRoom[]) {
  const scheduleRooms = rooms.filter((room) => room.fixed);
  return scheduleRooms[0] || null;
}

export function getRouteByFlight(room: MonitorRoom | null, flightInput: string) {
  if (!room || !flightInput.trim()) return "";

  const targetFlight = flightInput.replace(/\s+/g, "").toUpperCase();
  const matchedRow = room.rows?.find((row) => {
    const rowFlight = getFlightNo(row).replace(/\s+/g, "").toUpperCase();
    return rowFlight === targetFlight || rowFlight.includes(targetFlight);
  });

  return getRouteDisplay(matchedRow);
}

export function getHlnbrByFlight(room: MonitorRoom | null, flightInput: string) {
  if (!room || !flightInput.trim()) return "";

  const targetFlight = flightInput.replace(/\s+/g, "").toUpperCase();
  const matchedRow = room.rows?.find((row) => {
    const rowFlight = getFlightNo(row).replace(/\s+/g, "").toUpperCase();
    return rowFlight === targetFlight || rowFlight.includes(targetFlight);
  });

  const rowWithMaybeHlnbr = matchedRow as FlightRow & {
    fid?: string;
    aircraftRegNo?: string;
    registrationNo?: string;
    hlnbr?: string;
  };

  return (
    rowWithMaybeHlnbr?.hlnbr ||
    rowWithMaybeHlnbr?.registrationNo ||
    rowWithMaybeHlnbr?.aircraftRegNo ||
    rowWithMaybeHlnbr?.fid ||
    ""
  );
}

export function getCurrentTimeText() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function getWeatherSummary(weather: WeatherInfo) {
  // 불러오지 못한 상태에서는 기록(Notion 등)에 가짜 날씨가 들어가지 않게 합니다.
  if (weather.success === false || !weather.temperature) return "날씨 정보 없음";
  return `${weather.condition || "-"} ${weather.temperature || "-"}℃ / 습도 ${weather.humidity || "-"}% / 미세먼지 ${weather.pm10Grade || "-"}`;
}

export async function readImageFileMetadata(file: File): Promise<ImageFileMetadata> {
  try {
    const buffer = await file.arrayBuffer();
    const exif = readExifMetadata(buffer);
    const capturedAt = exif.capturedAt || formatFileLastModified(file);

    return {
      capturedAt,
      locationText: exif.locationText,
    };
  } catch {
    return {
      capturedAt: formatFileLastModified(file),
    };
  }
}

export function formatFileLastModified(file: File) {
  if (!file.lastModified) return undefined;
  const date = new Date(file.lastModified);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${date.toLocaleString("ko-KR")} · 파일 기준`;
}

export function readExifMetadata(buffer: ArrayBuffer): ImageFileMetadata {
  const view = new DataView(buffer);
  const metadata: ImageFileMetadata = {};

  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return metadata;

  let offset = 2;

  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;

    const marker = view.getUint8(offset + 1);
    const length = view.getUint16(offset + 2, false);
    const segmentStart = offset + 4;

    if (marker === 0xe1 && segmentStart + 6 <= view.byteLength) {
      const exifHeader = readAscii(view, segmentStart, 6);

      if (exifHeader === "Exif\u0000\u0000") {
        return parseExifTiff(view, segmentStart + 6);
      }
    }

    if (length < 2) break;
    offset += 2 + length;
  }

  return metadata;
}

export function parseExifTiff(view: DataView, tiffStart: number): ImageFileMetadata {
  const metadata: ImageFileMetadata = {};
  const endian = readAscii(view, tiffStart, 2);
  const littleEndian = endian === "II";

  if (endian !== "II" && endian !== "MM") return metadata;
  if (tiffStart + 8 > view.byteLength) return metadata;

  const firstIfdOffset = getUint32Safe(view, tiffStart + 4, littleEndian);
  const zerothIfd = readIfdEntries(view, tiffStart, tiffStart + firstIfdOffset, littleEndian);
  const exifIfdOffset = getEntryNumber(zerothIfd.get(0x8769), view, tiffStart, littleEndian);
  const gpsIfdOffset = getEntryNumber(zerothIfd.get(0x8825), view, tiffStart, littleEndian);
  const fallbackDate = getEntryString(zerothIfd.get(0x0132), view, tiffStart, littleEndian);

  if (exifIfdOffset) {
    const exifIfd = readIfdEntries(view, tiffStart, tiffStart + exifIfdOffset, littleEndian);
    const dateOriginal =
      getEntryString(exifIfd.get(0x9003), view, tiffStart, littleEndian) ||
      getEntryString(exifIfd.get(0x9004), view, tiffStart, littleEndian);
    metadata.capturedAt = formatExifDate(dateOriginal || fallbackDate);
  } else {
    metadata.capturedAt = formatExifDate(fallbackDate);
  }

  if (gpsIfdOffset) {
    const gpsIfd = readIfdEntries(view, tiffStart, tiffStart + gpsIfdOffset, littleEndian);
    const latitude = readGpsCoordinate(gpsIfd.get(0x0002), view, tiffStart, littleEndian);
    const longitude = readGpsCoordinate(gpsIfd.get(0x0004), view, tiffStart, littleEndian);
    const latRef = getEntryString(gpsIfd.get(0x0001), view, tiffStart, littleEndian);
    const lonRef = getEntryString(gpsIfd.get(0x0003), view, tiffStart, littleEndian);

    if (latitude !== undefined && longitude !== undefined) {
      const lat = latRef === "S" ? -latitude : latitude;
      const lon = lonRef === "W" ? -longitude : longitude;
      metadata.locationText = `위도 ${lat.toFixed(6)}, 경도 ${lon.toFixed(6)}`;
    }
  }

  return metadata;
}

export function readIfdEntries(view: DataView, tiffStart: number, ifdOffset: number, littleEndian: boolean) {
  const entries = new Map<number, IfdEntry>();
  if (ifdOffset <= 0 || ifdOffset + 2 > view.byteLength) return entries;

  const count = getUint16Safe(view, ifdOffset, littleEndian);

  for (let index = 0; index < count; index += 1) {
    const entryOffset = ifdOffset + 2 + index * 12;
    if (entryOffset + 12 > view.byteLength) break;

    const tag = getUint16Safe(view, entryOffset, littleEndian);
    const type = getUint16Safe(view, entryOffset + 2, littleEndian);
    const entryCount = getUint32Safe(view, entryOffset + 4, littleEndian);
    const valueOffset = getUint32Safe(view, entryOffset + 8, littleEndian);

    entries.set(tag, {
      type,
      count: entryCount,
      valueOffset,
      valueFieldOffset: entryOffset + 8,
    });
  }

  return entries;
}

export function getEntryNumber(entry: IfdEntry | undefined, view: DataView, tiffStart: number, littleEndian: boolean) {
  if (!entry) return undefined;
  if (entry.type === 3 && entry.count === 1) return getUint16Safe(view, entry.valueFieldOffset, littleEndian);
  if (entry.type === 4 && entry.count === 1) return entry.valueOffset;
  return entry.valueOffset;
}

export function getEntryString(entry: IfdEntry | undefined, view: DataView, tiffStart: number, littleEndian: boolean) {
  if (!entry || entry.type !== 2) return undefined;

  const length = Math.max(0, entry.count - 1);
  const start = entry.count <= 4 ? entry.valueFieldOffset : tiffStart + entry.valueOffset;

  if (start < 0 || start + length > view.byteLength) return undefined;
  return readAscii(view, start, length).trim().replace(/\u0000/g, "");
}

export function readGpsCoordinate(entry: IfdEntry | undefined, view: DataView, tiffStart: number, littleEndian: boolean) {
  if (!entry || entry.type !== 5 || entry.count < 3) return undefined;

  const start = tiffStart + entry.valueOffset;
  if (start < 0 || start + 24 > view.byteLength) return undefined;

  const degrees = readRational(view, start, littleEndian);
  const minutes = readRational(view, start + 8, littleEndian);
  const seconds = readRational(view, start + 16, littleEndian);

  if (degrees === undefined || minutes === undefined || seconds === undefined) return undefined;
  return degrees + minutes / 60 + seconds / 3600;
}

export function readRational(view: DataView, offset: number, littleEndian: boolean) {
  const numerator = getUint32Safe(view, offset, littleEndian);
  const denominator = getUint32Safe(view, offset + 4, littleEndian);
  if (!denominator) return undefined;
  return numerator / denominator;
}

export function formatExifDate(value?: string) {
  if (!value) return undefined;
  const match = value.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return value;

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );

  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR");
}

export function readAscii(view: DataView, offset: number, length: number) {
  let text = "";
  for (let index = 0; index < length && offset + index < view.byteLength; index += 1) {
    text += String.fromCharCode(view.getUint8(offset + index));
  }
  return text;
}

export function getUint16Safe(view: DataView, offset: number, littleEndian: boolean) {
  if (offset < 0 || offset + 2 > view.byteLength) return 0;
  return view.getUint16(offset, littleEndian);
}

export function getUint32Safe(view: DataView, offset: number, littleEndian: boolean) {
  if (offset < 0 || offset + 4 > view.byteLength) return 0;
  return view.getUint32(offset, littleEndian);
}

/** 같은 내용을 연속 저장했는지 비교하기 위한 서명 */
export function makeSaveSignature(payload: unknown) {
  return JSON.stringify(payload);
}

/** 직전에 같은 내용을 10분 안에 저장했으면 true (중복 저장 방지) */
export function isRecentSameSave(
  previous: { signature: string; savedAt: number } | null,
  signature: string,
) {
  if (!previous) return false;
  const elapsedMs = Date.now() - previous.savedAt;
  return previous.signature === signature && elapsedMs < 10 * 60 * 1000;
}
