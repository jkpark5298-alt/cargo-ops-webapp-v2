import { type FlightRow, type MonitorRoom } from "../../lib/flight-types";
import { normalizeFlightsInput } from "../../lib/flight-keys";
import { applyRegistrationToRows } from "../../lib/aircraft-registration";
import {
  mergeLatestScheduleRoom,
  normalizeScheduleRoomRows,
  saveRooms,
} from "../../lib/schedule-store";
import { BACKEND_URL } from "../../lib/api-config";
import {
  applyHlMappingToRows,
  getActiveRefreshFlights,
  getFlightLookupCacheKey,
  getSelectionKey,
  isFinalCompletedRow,
  loadFlightLookupCache,
  mergeManualRegistrationFields,
  mergeRowsKeepFinal,
  saveFlightLookupCache,
  saveRegistrationQueryRange,
} from "../lib/helpers";

export type UseFlightLookupParams = {
  aircraftRegistrationRecords: import("../../lib/flight-types").AircraftRegistrationRecord[];
  aircraftRegistrationRecordsRef: React.MutableRefObject<import("../../lib/flight-types").AircraftRegistrationRecord[]>;
  applyAllRegistrationSources: (targetRows: import("../../lib/flight-types").FlightRow[], records?: import("../../lib/flight-types").AircraftRegistrationRecord[]) => import("../../lib/flight-types").FlightRow[];
  endDateTime: string;
  ensureAircraftRegistrationRecordsFromServer: () => Promise<import("../../lib/flight-types").AircraftRegistrationRecord[]>;
  fixed: boolean;
  flightMode: import("../lib/schedule-slots").FlightMode;
  getMissingInputFlights: (inputText: string, targetRows: import("../../lib/flight-types").FlightRow[]) => string[];
  hlNumberMap: Record<string, string>;
  input: string;
  mergeFlightsInput: (baseInput: string, addInput: string) => string;
  mergeScheduleRowsByFlight: (baseRows: import("../../lib/flight-types").FlightRow[], addRows: import("../../lib/flight-types").FlightRow[]) => import("../../lib/flight-types").FlightRow[];
  registrationEndDateTime: string;
  registrationStartDateTime: string;
  rooms: import("../../lib/flight-types").MonitorRoom[];
  selectedRoom: import("../../lib/flight-types").MonitorRoom | null;
  selectedRoomId: string;
  setEndDateTime: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string>>;
  setExpandedDetailKeys: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setFixed: React.Dispatch<React.SetStateAction<boolean>>;
  setHlInlineDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setHlMappingStatus: React.Dispatch<React.SetStateAction<string>>;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setLastFetchedAt: React.Dispatch<React.SetStateAction<string>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setQueryMode: React.Dispatch<React.SetStateAction<"manual" | "kj-all">>;
  setRooms: React.Dispatch<React.SetStateAction<import("../../lib/flight-types").MonitorRoom[]>>;
  setRows: React.Dispatch<React.SetStateAction<import("../../lib/flight-types").FlightRow[]>>;
  setSelectedRoomId: React.Dispatch<React.SetStateAction<string>>;
  setSelectedScheduleKeys: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setSelectedScheduleOrder: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedSlotKey: React.Dispatch<React.SetStateAction<import("../lib/schedule-slots").ScheduleSlotKey | null>>;
  setStartDateTime: React.Dispatch<React.SetStateAction<string>>;
  startDateTime: string;
};

/** 편명 조회·KJ 전체 조회·등록 전용 조회와 Schedule Flight 방 새로고침 */
export function useFlightLookup({
  aircraftRegistrationRecords,
  aircraftRegistrationRecordsRef,
  applyAllRegistrationSources,
  endDateTime,
  ensureAircraftRegistrationRecordsFromServer,
  fixed,
  flightMode,
  getMissingInputFlights,
  hlNumberMap,
  input,
  mergeFlightsInput,
  mergeScheduleRowsByFlight,
  registrationEndDateTime,
  registrationStartDateTime,
  rooms,
  selectedRoom,
  selectedRoomId,
  setEndDateTime,
  setError,
  setExpandedDetailKeys,
  setFixed,
  setHlInlineDrafts,
  setHlMappingStatus,
  setInput,
  setLastFetchedAt,
  setLoading,
  setQueryMode,
  setRooms,
  setRows,
  setSelectedRoomId,
  setSelectedScheduleKeys,
  setSelectedScheduleOrder,
  setSelectedSlotKey,
  setStartDateTime,
  startDateTime,
}: UseFlightLookupParams) {
  const refreshRoomData = async (
    room: MonitorRoom,
    showLoading = true,
    rangeOverride?: { start: string; end: string },
  ) => {
    if (showLoading) {
      setLoading(true);
    }

    setError("");

    try {
      const activeFlights = getActiveRefreshFlights(room);
      const excludedCount = (room.rows || []).filter(isFinalCompletedRow).length;
      let nextRows: FlightRow[];
      const queryStart = rangeOverride?.start || room.startDateTime;
      const queryEnd = rangeOverride?.end || room.endDateTime;

      if (activeFlights.length === 0) {
        nextRows = room.rows || [];
        if (excludedCount > 0) {
          setError("모든 Schedule Flight가 API remark 기준으로 도착 또는 결항 확정되어 재조회 대상에서 제외되었습니다. 화면에는 기존 결과를 유지합니다.");
        }
      } else {
        const res = await fetch(`${BACKEND_URL}/flights/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            flights: activeFlights,
            start: queryStart,
            end: queryEnd,
          }),
        });

        const json = await res.json();

        if (!res.ok || json.success === false) {
          throw new Error(json.message || json.detail || `서버 오류 (${res.status})`);
        }

        nextRows = mergeRowsKeepFinal(room.rows || [], json.data || []);
        nextRows = mergeManualRegistrationFields(room.rows || [], nextRows);
        nextRows = applyRegistrationToRows(
          applyHlMappingToRows(nextRows, hlNumberMap),
          aircraftRegistrationRecordsRef.current.length > 0
            ? aircraftRegistrationRecordsRef.current
            : aircraftRegistrationRecords,
        );
      }

      const fetchedAt = new Date().toLocaleString("ko-KR");
      // 등록번호/AFOCS 전용 기간 조회 시에도 Schedule Flight 카드의 저장 기간은 유지합니다.
      const updatedRoom: MonitorRoom = normalizeScheduleRoomRows({
        ...room,
        rows: nextRows,
        lastFetchedAt: fetchedAt,
      });

      setRooms((prevRooms) => {
        const nextRooms = prevRooms.map((prevRoom) =>
          prevRoom.id === updatedRoom.id ? updatedRoom : prevRoom
        );
        saveRooms(nextRooms);
        return nextRooms;
      });

      if (selectedRoomId === updatedRoom.id) {
        setInput(updatedRoom.flightsInput);
        if (!rangeOverride) {
          setStartDateTime(updatedRoom.startDateTime);
          setEndDateTime(updatedRoom.endDateTime);
        }
        setFixed(updatedRoom.fixed);
        setRows(updatedRoom.rows);
        setLastFetchedAt(fetchedAt);
        setExpandedDetailKeys({});
      }
    } catch (e: any) {
      setError(e.message || "조회 실패");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const persistRoom = (
    roomId: string,
    nextRows: FlightRow[],
    fetchedAt: string,
    nextFixed: boolean = fixed,
    nextInput: string = input,
    nextStartDateTime: string = startDateTime,
    nextEndDateTime: string = endDateTime
  ) => {
    const nextRooms = rooms.map((room) =>
      room.id === roomId
        ? {
            ...room,
            flightsInput: nextInput,
            startDateTime: nextStartDateTime,
            endDateTime: nextEndDateTime,
            fixed: nextFixed,
            lastFetchedAt: fetchedAt,
            rows: nextRows,
          }
        : room
    );
    setRooms(nextRooms);
    saveRooms(nextRooms);
  };

  const fetchFlights = async (flightArg?: string) => {
    const finalInput = (flightArg ?? input).trim();

    if (!finalInput) {
      setError("편명을 입력하세요.");
      return;
    }

    const flights = normalizeFlightsInput(finalInput);

    if (flights.length === 0) {
      setError("편명을 입력하세요.");
      return;
    }

    const keepScheduleContext = Boolean(selectedRoom?.fixed);
    const previousScheduleRows = keepScheduleContext ? selectedRoom?.rows || [] : [];
    const normalizedInput = flights.join(", ");
    const cacheKey = getFlightLookupCacheKey("manual", normalizedInput, startDateTime, endDateTime);
    const cachedLookup = loadFlightLookupCache(cacheKey);

    setQueryMode("manual");
    setInput(normalizedInput);
    if (!keepScheduleContext) {
      setSelectedRoomId("");
      setFixed(false);
    }
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});
    setError("");
    setHlInlineDrafts({});

    const registrationPromise = ensureAircraftRegistrationRecordsFromServer();

    if (cachedLookup) {
      const cachedRows = applyAllRegistrationSources(cachedLookup.rows || []);
      setRows(cachedRows);
      setLastFetchedAt(`${cachedLookup.fetchedAt} · 캐시`);
      setError("최근 조회 결과를 먼저 표시했습니다. 최신 정보로 갱신 중입니다.");

      const initialKeys: Record<string, boolean> = {};
      const initialOrder: string[] = [];
      cachedRows.forEach((row, idx) => {
        if (!isFinalCompletedRow(row)) {
          const key = getSelectionKey(row, idx);
          initialKeys[key] = true;
          initialOrder.push(key);
        }
      });
      setSelectedScheduleKeys(initialKeys);
      setSelectedScheduleOrder(initialOrder);
    } else {
      setRows([]);
      setLastFetchedAt("");
    }

    setLoading(true);

    try {
      const [res, registrationRecords] = await Promise.all([
        fetch(`${BACKEND_URL}/flights/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            flights,
            start: startDateTime,
            end: endDateTime,
          }),
        }),
        registrationPromise,
      ]);

      const json = await res.json();

      if (!res.ok || json.success === false) {
        throw new Error(json.message || json.detail || `서버 오류 (${res.status})`);
      }

      const nextRows = applyAllRegistrationSources(json.data || [], registrationRecords);
      const fetchedAt = new Date().toLocaleString("ko-KR");
      saveFlightLookupCache(cacheKey, nextRows, fetchedAt);

      setRows(nextRows);
      setLastFetchedAt(json.cached ? `${fetchedAt} · 서버 캐시` : fetchedAt);
      setExpandedDetailKeys({});

      const initialKeys: Record<string, boolean> = {};
      const initialOrder: string[] = [];
      nextRows.forEach((row, idx) => {
        if (!isFinalCompletedRow(row)) {
          const key = getSelectionKey(row, idx);
          initialKeys[key] = true;
          initialOrder.push(key);
        }
      });
      setSelectedScheduleKeys(initialKeys);
      setSelectedScheduleOrder(initialOrder);

      if (keepScheduleContext && selectedRoom) {
        const mergedInput = mergeFlightsInput(selectedRoom.flightsInput, normalizedInput);
        const mergedRows = mergeScheduleRowsByFlight(previousScheduleRows, nextRows);
        const updatedRoom: MonitorRoom = {
          ...selectedRoom,
          flightsInput: mergedInput,
          rows: mergedRows,
          lastFetchedAt: fetchedAt,
        };

        const nextRooms = mergeLatestScheduleRoom(rooms, updatedRoom);
        setRooms(nextRooms);
        saveRooms(nextRooms);
        setSelectedRoomId(updatedRoom.id);
        setFixed(true);
        const missingFlights = getMissingInputFlights(flights.join(", "), nextRows);
        setError(
          missingFlights.length > 0
            ? `추가 편명 조회 완료. 조회 결과가 없는 편명은 저장 대상에서 제외됩니다: ${missingFlights.join(", ")}`
            : "추가 편명 조회 완료. 결과 행의 +를 선택한 뒤 ‘선택한 Schedule Flight 저장’을 누르면 기존 정보에 병합됩니다.",
        );
        return;
      }

      if (selectedRoomId) {
        persistRoom(
          selectedRoomId,
          nextRows,
          fetchedAt,
          fixed,
          normalizedInput,
          startDateTime,
          endDateTime
        );
      }
    } catch (e: any) {
      setError(e.message || "조회 실패");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllKjFlights = async () => {
    const cacheKey = getFlightLookupCacheKey("kj-all", "KJ_ALL", startDateTime, endDateTime);
    const cachedLookup = loadFlightLookupCache(cacheKey);

    setQueryMode("kj-all");
    setSelectedRoomId("");
    setFixed(false);
    setExpandedDetailKeys({});
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setError("");
    setHlInlineDrafts({});

    const registrationPromise = ensureAircraftRegistrationRecordsFromServer();

    if (cachedLookup) {
      const cachedRows = applyAllRegistrationSources(cachedLookup.rows || []);
      setRows(cachedRows);
      setLastFetchedAt(`${cachedLookup.fetchedAt} · 캐시`);
      setError("최근 KJ 전체 조회 결과를 먼저 표시했습니다. 최신 정보로 갱신 중입니다.");

      const initialKeys: Record<string, boolean> = {};
      const initialOrder: string[] = [];
      cachedRows.forEach((row, idx) => {
        if (!isFinalCompletedRow(row)) {
          const key = getSelectionKey(row, idx);
          initialKeys[key] = true;
          initialOrder.push(key);
        }
      });
      setSelectedScheduleKeys(initialKeys);
      setSelectedScheduleOrder(initialOrder);
    } else {
      setRows([]);
      setLastFetchedAt("");
    }

    setLoading(true);

    try {
      const [res, registrationRecords] = await Promise.all([
        fetch(`${BACKEND_URL}/flights/kj-all`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            start: startDateTime,
            end: endDateTime,
          }),
        }),
        registrationPromise,
      ]);

      const json = await res.json();

      if (!res.ok || json.success === false) {
        throw new Error(
          json.message ||
            json.detail ||
            (res.status === 404
              ? "KJ 전체 조회 API가 아직 백엔드에 반영되지 않았습니다. Render 백엔드 배포를 확인하세요."
              : `서버 오류 (${res.status})`)
        );
      }

      const nextRows = applyAllRegistrationSources(json.data || [], registrationRecords);
      const fetchedAt = new Date().toLocaleString("ko-KR");
      saveFlightLookupCache(cacheKey, nextRows, fetchedAt);

      setRows(nextRows);
      setLastFetchedAt(json.cached ? `${fetchedAt} · 서버 캐시` : fetchedAt);
      setExpandedDetailKeys({});

      const initialKeys: Record<string, boolean> = {};
      const initialOrder: string[] = [];
      nextRows.forEach((row, idx) => {
        if (!isFinalCompletedRow(row)) {
          const key = getSelectionKey(row, idx);
          initialKeys[key] = true;
          initialOrder.push(key);
        }
      });
      setSelectedScheduleKeys(initialKeys);
      setSelectedScheduleOrder(initialOrder);
      if (nextRows.length === 0) {
        setError(json.message || "조회 결과가 없습니다. 기간을 넓히거나 인천 화물기 API 상태를 확인하세요.");
      }
    } catch (e: any) {
      setError(e.message || "KJ 전체 조회 실패");
    } finally {
      setLoading(false);
    }
  };

  const fetchRegistrationFlights = async () => {
    if (!registrationStartDateTime || !registrationEndDateTime) {
      setError("등록번호/AFOCS 조회 기간을 먼저 설정하세요.");
      return;
    }

    const flights = normalizeFlightsInput(input);
    if (flights.length === 0) {
      setError("편명을 입력하세요. 예: 247,972 또는 KJ247,KJ972");
      return;
    }

    saveRegistrationQueryRange(registrationStartDateTime, registrationEndDateTime);
    const normalizedInput = flights.join(", ");
    const cacheKey = getFlightLookupCacheKey(
      "manual",
      `REG|${normalizedInput}`,
      registrationStartDateTime,
      registrationEndDateTime,
    );

    setQueryMode("manual");
    setInput(normalizedInput);
    setFixed(false);
    setSelectedRoomId("");
    setSelectedSlotKey(null);
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});
    setError("");
    setHlInlineDrafts({});
    setLoading(true);

    try {
      const [res, registrationRecords] = await Promise.all([
        fetch(`${BACKEND_URL}/flights/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flights,
            start: registrationStartDateTime,
            end: registrationEndDateTime,
          }),
        }),
        ensureAircraftRegistrationRecordsFromServer(),
      ]);
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.message || json.detail || `서버 오류 (${res.status})`);
      }

      const nextRows = applyAllRegistrationSources(json.data || [], registrationRecords);
      const fetchedAt = new Date().toLocaleString("ko-KR");
      saveFlightLookupCache(cacheKey, nextRows, fetchedAt);
      setRows(nextRows);
      setLastFetchedAt(json.cached ? `${fetchedAt} · 서버 캐시` : fetchedAt);
      setHlMappingStatus(
        `등록 전용 기간(${registrationStartDateTime.replace("T", " ")} ~ ${registrationEndDateTime.replace("T", " ")}) 편명 조회 ${nextRows.length}건`,
      );
      if (nextRows.length === 0) {
        setError("조회 결과가 없습니다. 기간 또는 편명을 확인해 주세요.");
      }
    } catch (e: any) {
      setError(e.message || "등록 조회 실패");
    } finally {
      setLoading(false);
    }
  };

  const fetchRegistrationKjAll = async () => {
    if (!registrationStartDateTime || !registrationEndDateTime) {
      setError("등록번호/AFOCS 조회 기간을 먼저 설정하세요.");
      return;
    }

    saveRegistrationQueryRange(registrationStartDateTime, registrationEndDateTime);
    const cacheKey = getFlightLookupCacheKey(
      "kj-all",
      "REG_KJ_ALL",
      registrationStartDateTime,
      registrationEndDateTime,
    );

    setQueryMode("kj-all");
    setFixed(false);
    setSelectedRoomId("");
    setSelectedSlotKey(null);
    setSelectedScheduleKeys({});
    setSelectedScheduleOrder([]);
    setExpandedDetailKeys({});
    setError("");
    setHlInlineDrafts({});
    setLoading(true);

    try {
      const [res, registrationRecords] = await Promise.all([
        fetch(`${BACKEND_URL}/flights/kj-all`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start: registrationStartDateTime,
            end: registrationEndDateTime,
          }),
        }),
        ensureAircraftRegistrationRecordsFromServer(),
      ]);
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.message || json.detail || `서버 오류 (${res.status})`);
      }

      const nextRows = applyAllRegistrationSources(json.data || [], registrationRecords);
      const fetchedAt = new Date().toLocaleString("ko-KR");
      saveFlightLookupCache(cacheKey, nextRows, fetchedAt);
      setRows(nextRows);
      setLastFetchedAt(json.cached ? `${fetchedAt} · 서버 캐시` : fetchedAt);
      setHlMappingStatus(
        `등록 전용 기간(${registrationStartDateTime.replace("T", " ")} ~ ${registrationEndDateTime.replace("T", " ")}) KJ 전체 ${nextRows.length}건`,
      );
      if (nextRows.length === 0) {
        setError(json.message || "조회 결과가 없습니다. 기간을 확인해 주세요.");
      }
    } catch (e: any) {
      setError(e.message || "등록 KJ 전체 조회 실패");
    } finally {
      setLoading(false);
    }
  };

  const refreshSelectedRoom = async () => {
    if (!selectedRoom) {
      setError("다시 조회할 Monitor를 먼저 선택하세요.");
      return;
    }

    if (flightMode === "registration") {
      if (!registrationStartDateTime || !registrationEndDateTime) {
        setError("등록번호/AFOCS 조회 기간을 먼저 설정하세요.");
        return;
      }
      saveRegistrationQueryRange(registrationStartDateTime, registrationEndDateTime);
      await refreshRoomData(selectedRoom, true, {
        start: registrationStartDateTime,
        end: registrationEndDateTime,
      });
      setHlMappingStatus(
        `등록 전용 기간(${registrationStartDateTime.replace("T", " ")} ~ ${registrationEndDateTime.replace("T", " ")})으로 조회했습니다. Schedule Flight 카드 저장 기간은 유지됩니다.`,
      );
      return;
    }

    await refreshRoomData(selectedRoom);
  };

  return {
    fetchAllKjFlights,
    fetchFlights,
    fetchRegistrationFlights,
    fetchRegistrationKjAll,
    refreshSelectedRoom,
  };
}
