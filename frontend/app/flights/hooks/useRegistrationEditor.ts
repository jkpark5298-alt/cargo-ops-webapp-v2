import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { prepareAfocsSkdForSave } from "../../lib/afocs-skd";
import {
  type AircraftRegistrationRecord,
  type FlightRow,
  type MonitorRoom,
} from "../../lib/flight-types";
import { normalizeFlightKey, normalizeHlNumber } from "../../lib/flight-keys";
import {
  applyRegistrationToRows,
  fetchAircraftRegistrationRecordsFromServer,
  getAircraftRegistrationDateFromRow,
  loadAircraftRegistrationRecords,
  excludeUnchangedRegistrationRecords,
  mergeAircraftRegistrationRecords,
  saveAircraftRegistrationRecords,
  saveAircraftRegistrationRecordsToServer,
} from "../../lib/aircraft-registration";
import {
  normalizeScheduleRoomRows,
  saveLatestScheduleToServer,
  saveRooms,
} from "../../lib/schedule-store";
import {
  applyHlMappingToRows,
  applyInlineHlDraftsToRows,
  buildExcelUploadReport,
  findBestExcelRowForScheduleRow,
  formatExcelUploadReport,
  getEditableHlValue,
  getFlightKeyFromRow,
  getRegistrationNo,
  mergeManualRegistrationFields,
  parseAircraftRegistrationRows,
  parseHlMappingText,
  parseRegistrationAfocsExcelRows,
  saveHlMappingText,
  serializeHlMapping,
  sheetToRegistrationAfocsRows,
  uniqueHlByFlightFromExcel,
} from "../lib/helpers";

export type UseRegistrationEditorParams = {
  flightMode: import("../lib/schedule-slots").FlightMode;
  rooms: import("../../lib/flight-types").MonitorRoom[];
  rows: import("../../lib/flight-types").FlightRow[];
  scheduleSlots: import("../lib/schedule-slots").ScheduleSlotsState;
  selectedRoom: import("../../lib/flight-types").MonitorRoom | null;
  setRooms: React.Dispatch<React.SetStateAction<import("../../lib/flight-types").MonitorRoom[]>>;
  setRows: React.Dispatch<React.SetStateAction<import("../../lib/flight-types").FlightRow[]>>;
  syncRegistrationFieldsToScheduleSlots: (sourceRows: import("../../lib/flight-types").FlightRow[]) => Promise<number>;
};

/** 등록번호/AFOCS 입력·저장·엑셀 업로드 (③ 등록번호 / AFOCS 탭) */
export function useRegistrationEditor({
  flightMode,
  rooms,
  rows,
  scheduleSlots,
  selectedRoom,
  setRooms,
  setRows,
  syncRegistrationFieldsToScheduleSlots,
}: UseRegistrationEditorParams) {
  const registrationExcelInputRef = useRef<HTMLInputElement | null>(null);
  const [hlMappingText, setHlMappingText] = useState("");
  const [hlMappingStatus, setHlMappingStatus] = useState("");
  const [hlInlineDrafts, setHlInlineDrafts] = useState<Record<string, string>>({});
  const [afocsSkdInlineDrafts, setAfocsSkdInlineDrafts] = useState<Record<string, string>>({});
  const [aircraftRegistrationRecords, setAircraftRegistrationRecords] = useState<AircraftRegistrationRecord[]>([]);
  const aircraftRegistrationRecordsRef = useRef<AircraftRegistrationRecord[]>([]);

  const hlNumberMap = useMemo(() => parseHlMappingText(hlMappingText), [hlMappingText]);

  useEffect(() => {
    aircraftRegistrationRecordsRef.current = aircraftRegistrationRecords;
  }, [aircraftRegistrationRecords]);

  const applyAllRegistrationSources = (
    targetRows: FlightRow[],
    records: AircraftRegistrationRecord[] = aircraftRegistrationRecordsRef.current,
  ) => {
    const latestRecords = records.length > 0 ? records : loadAircraftRegistrationRecords();
    const manualRows: FlightRow[] = [];
    (["active", "archive"] as const).forEach((slotKey) => {
      const slotRows = scheduleSlots[slotKey]?.room?.rows;
      if (Array.isArray(slotRows)) manualRows.push(...slotRows);
    });
    rooms.forEach((room) => {
      if (Array.isArray(room.rows)) manualRows.push(...room.rows);
    });
    const withManual = mergeManualRegistrationFields(manualRows, targetRows);
    const withDrafts = applyInlineHlDraftsToRows(withManual, hlInlineDrafts);
    return applyRegistrationToRows(applyHlMappingToRows(withDrafts, hlNumberMap), latestRecords);
  };

  const ensureAircraftRegistrationRecordsFromServer = async () => {
    const seed =
      aircraftRegistrationRecordsRef.current.length > 0
        ? aircraftRegistrationRecordsRef.current
        : loadAircraftRegistrationRecords();

    try {
      // 서버 기록과 브라우저 기록을 합친 결과(서버가 비어 있으면 브라우저 기록이 서버로 복구됨)
      const finalRecords = await fetchAircraftRegistrationRecordsFromServer();
      aircraftRegistrationRecordsRef.current = finalRecords;
      setAircraftRegistrationRecords(finalRecords);
      return finalRecords;
    } catch {
      return seed;
    }
  };

  const persistRegistrationDraftsForRows = async (targetRows: FlightRow[]) => {
    const nextMap: Record<string, string> = { ...hlNumberMap };
    const changedRecords = targetRows
      .map((row) => {
        const flight = getFlightKeyFromRow(row);
        if (!flight || flight === "-") return null;

        const rawValue = Object.prototype.hasOwnProperty.call(hlInlineDrafts, flight)
          ? hlInlineDrafts[flight]
          : getEditableHlValue(row, hlNumberMap, {});

        const registrationNo = normalizeHlNumber(rawValue || "");
        if (!/^HL\d{3,5}$/i.test(registrationNo)) return null;

        nextMap[flight] = registrationNo;
        return {
          date: getAircraftRegistrationDateFromRow(row),
          flight,
          departureCode: row.departureCode || "",
          arrivalCode: row.arrivalCode || "",
          registrationNo,
          updatedAt: new Date().toISOString(),
        } satisfies AircraftRegistrationRecord;
      })
      .filter((record): record is AircraftRegistrationRecord => Boolean(record));

    const normalizedText = serializeHlMapping(nextMap);
    setHlMappingText(normalizedText);
    saveHlMappingText(normalizedText);

    const latestRecords = loadAircraftRegistrationRecords();
    const incomingRecords = excludeUnchangedRegistrationRecords(changedRecords, latestRecords);
    if (incomingRecords.length === 0) {
      setHlInlineDrafts({});
      return;
    }

    let nextAircraftRegistrationRecords = mergeAircraftRegistrationRecords(
      latestRecords,
      incomingRecords,
    );

    try {
      nextAircraftRegistrationRecords = await saveAircraftRegistrationRecordsToServer(
        incomingRecords,
        "merge",
      );
    } catch {
      saveAircraftRegistrationRecords(nextAircraftRegistrationRecords);
    }

    setAircraftRegistrationRecords(nextAircraftRegistrationRecords);
    saveAircraftRegistrationRecords(nextAircraftRegistrationRecords);
    setHlInlineDrafts({});
  };

  const handleHlInlineDraftChange = (flight: string, value: string) => {
    const key = normalizeFlightKey(flight);
    if (!key) return;

    setHlInlineDrafts((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleAfocsSkdInlineDraftChange = (flight: string, value: string) => {
    const key = normalizeFlightKey(flight);
    if (!key) return;

    setAfocsSkdInlineDrafts((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSaveInlineAfocsSkd = async () => {
    if (flightMode === "registration") {
      if (rows.length === 0) {
        setHlMappingStatus("먼저 등록 전용 기간으로 조회한 뒤 AFOCS SKD를 입력하세요.");
        return;
      }

      const updatedRows = rows.map((row) => {
        const flightKey = getFlightKeyFromRow(row);
        if (Object.prototype.hasOwnProperty.call(afocsSkdInlineDrafts, flightKey)) {
          return {
            ...row,
            afocsSkd: prepareAfocsSkdForSave(afocsSkdInlineDrafts[flightKey], row),
          };
        }
        return row;
      });

      setRows(updatedRows);
      setAfocsSkdInlineDrafts({});

      try {
        const synced = await syncRegistrationFieldsToScheduleSlots(updatedRows);
        setHlMappingStatus(
          synced > 0
            ? `AFOCS SKD 저장 완료 · Schedule Flight 카드 ${synced}장에 동일 편명 반영`
            : "AFOCS SKD 저장 완료 · 반영할 Schedule Flight 카드가 없어 등록 조회 결과에만 유지됩니다.",
        );
      } catch (syncError) {
        setHlMappingStatus(
          syncError instanceof Error
            ? `AFOCS SKD 로컬 저장 완료 · 카드 반영 실패: ${syncError.message}`
            : "AFOCS SKD 로컬 저장 완료 · 카드 반영 실패",
        );
      }
      return;
    }

    if (!selectedRoom || !selectedRoom.fixed) {
      setHlMappingStatus("수정할 Schedule Flight 방이 선택되지 않았습니다.");
      return;
    }

    const updatedRows = (selectedRoom.rows || []).map((row) => {
      const flightKey = getFlightKeyFromRow(row);
      if (Object.prototype.hasOwnProperty.call(afocsSkdInlineDrafts, flightKey)) {
        return {
          ...row,
          afocsSkd: prepareAfocsSkdForSave(afocsSkdInlineDrafts[flightKey], row),
        };
      }
      return row;
    });

    const updatedRoom: MonitorRoom = {
      ...selectedRoom,
      rows: updatedRows,
      lastFetchedAt: new Date().toLocaleString("ko-KR"),
    };

    const nextRooms = rooms.map((room) =>
      room.id === selectedRoom.id ? updatedRoom : room
    );

    setRooms(nextRooms);
    saveRooms(nextRooms);
    setRows(updatedRows);
    setAfocsSkdInlineDrafts({});

    try {
      await saveLatestScheduleToServer(updatedRoom);
      setHlMappingStatus("AFOCS SKD 날짜·시간을 저장했습니다. AFOCS SKD에 실시간 반영됩니다.");
    } catch (syncError) {
      setHlMappingStatus(
        syncError instanceof Error
          ? `AFOCS SKD 로컬 저장 완료 · 서버 반영 실패: ${syncError.message}`
          : "AFOCS SKD 로컬 저장 완료 · 서버 반영 실패",
      );
    }
  };

  const handleCombinedRegistrationAfocsExcelUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (rows.length === 0) {
      setHlMappingStatus("먼저 등록 전용 기간으로 조회한 뒤 엑셀을 업로드하세요.");
      return;
    }

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
      if (!firstSheet) {
        setHlMappingStatus("엑셀 시트를 찾지 못했습니다.");
        return;
      }

      const rawRows = sheetToRegistrationAfocsRows(firstSheet);
      const parsedRecords = parseAircraftRegistrationRows(rawRows);
      const excelRows = parseRegistrationAfocsExcelRows(rawRows);
      const { unique: uniqueHlByFlight, conflicting: conflictingHlFlights } =
        uniqueHlByFlightFromExcel(excelRows);

      const hlCount = excelRows.filter((row) => row.registrationNo).length;
      const afocsCount = excelRows.filter((row) => row.afocsSkd).length;
      if (parsedRecords.length === 0 && hlCount === 0 && afocsCount === 0) {
        setHlMappingStatus(
          "엑셀에서 등록기호/AFOCS 데이터를 찾지 못했습니다. 제목 행 아래 헤더에 편명·등록기호·일자·ETD/ETA가 있는지 확인해 주세요.",
        );
        return;
      }

      // 엑셀 업로드는 기존(매뉴얼 포함) 값을 덮어씁니다. 이후 표에서 직접 수정·저장한 값이 다시 우선합니다.
      const uploadedAt = new Date().toISOString();
      const rowRecords: AircraftRegistrationRecord[] = [];
      let matchedHl = 0;
      let matchedAfocs = 0;
      const matchedPairs: { excel: (typeof excelRows)[number]; row: FlightRow }[] = [];
      let nextRows = rows.map((row) => {
        const matchedExcel = findBestExcelRowForScheduleRow(excelRows, row);
        if (matchedExcel) matchedPairs.push({ excel: matchedExcel, row });
        let next = row;
        if (matchedExcel?.registrationNo) {
          matchedHl += 1;
          const changed = matchedExcel.registrationNo !== normalizeHlNumber(getRegistrationNo(row));
          next = {
            ...next,
            hlnbr: matchedExcel.registrationNo,
            registrationNo: matchedExcel.registrationNo,
            aircraftRegNo: matchedExcel.registrationNo,
            registrationNoEdited: Boolean(row.registrationNoEdited || changed),
          };
          // 일자 열이 없거나 노선 표기가 달라도 서버에 저장되도록 행 기준 키로도 기록합니다.
          rowRecords.push({
            date: getAircraftRegistrationDateFromRow(row),
            flight: getFlightKeyFromRow(row),
            departureCode: row.departureCode || "",
            arrivalCode: row.arrivalCode || "",
            registrationNo: matchedExcel.registrationNo,
            updatedAt: uploadedAt,
          });
        }
        if (matchedExcel?.afocsSkd) {
          matchedAfocs += 1;
          next = { ...next, afocsSkd: matchedExcel.afocsSkd };
        }
        return next;
      });

      const uploadRecords = [...parsedRecords, ...rowRecords];
      const latestRecords = loadAircraftRegistrationRecords();
      let nextRecords =
        uploadRecords.length > 0
          ? mergeAircraftRegistrationRecords(latestRecords, uploadRecords)
          : latestRecords;
      nextRows = applyRegistrationToRows(nextRows, nextRecords);

      // 건수만으로는 일부 편이 빠져도 알아채기 어려우므로, 미반영 편과 노선이 다른 편을 함께 알려줍니다.
      const reportText = formatExcelUploadReport(buildExcelUploadReport(excelRows, rows, matchedPairs));

      if (matchedHl === 0 && matchedAfocs === 0) {
        setHlMappingStatus(
          `엑셀에서 등록기호 ${hlCount}건 · AFOCS ${afocsCount}건을 읽었지만, 현재 조회 목록과 일치하는 편명이 없습니다.${reportText}`,
        );
        return;
      }

      setRows(nextRows);
      setHlInlineDrafts({});
      setAfocsSkdInlineDrafts({});

      let serverMessage = "";
      if (uploadRecords.length > 0) {
        try {
          nextRecords = await saveAircraftRegistrationRecordsToServer(uploadRecords, "merge");
          saveAircraftRegistrationRecords(nextRecords);
          serverMessage = " · 등록기호 서버 저장";
        } catch (serverError) {
          saveAircraftRegistrationRecords(nextRecords);
          serverMessage =
            serverError instanceof Error
              ? ` · 등록기호 서버 저장 실패: ${serverError.message}`
              : " · 등록기호 서버 저장 실패";
        }
      } else {
        saveAircraftRegistrationRecords(nextRecords);
      }
      setAircraftRegistrationRecords(nextRecords);

      const nextMap = { ...hlNumberMap, ...uniqueHlByFlight };
      conflictingHlFlights.forEach((flight) => {
        delete nextMap[flight];
      });
      const normalizedText = serializeHlMapping(nextMap);
      setHlMappingText(normalizedText);
      saveHlMappingText(normalizedText);

      try {
        const synced = await syncRegistrationFieldsToScheduleSlots(nextRows);
        setHlMappingStatus(
          `엑셀 반영 · 등록기호 ${matchedHl}건 · AFOCS ${matchedAfocs}건${serverMessage}${
            synced > 0 ? ` · Schedule Flight 카드 ${synced}장 동기화` : ""
          }${reportText}`,
        );
      } catch (syncError) {
        setHlMappingStatus(
          syncError instanceof Error
            ? `엑셀 반영 · 등록기호 ${matchedHl}건 · AFOCS ${matchedAfocs}건${serverMessage} · 카드 동기화 실패: ${syncError.message}${reportText}`
            : `엑셀 반영 · 등록기호 ${matchedHl}건 · AFOCS ${matchedAfocs}건${serverMessage} · 카드 동기화 실패${reportText}`,
        );
      }
    } catch (error) {
      setHlMappingStatus(
        error instanceof Error
          ? `엑셀 업로드 실패: ${error.message}`
          : "엑셀 업로드 중 오류가 발생했습니다.",
      );
    }
  };

  const handleSaveInlineHlMapping = async () => {
    const nextMap: Record<string, string> = { ...hlNumberMap };
    let savedCount = 0;

    rows.forEach((row) => {
      const flight = getFlightKeyFromRow(row);
      if (!flight || flight === "-") return;

      const rawValue = Object.prototype.hasOwnProperty.call(hlInlineDrafts, flight)
        ? hlInlineDrafts[flight]
        : getEditableHlValue(row, hlNumberMap, {});

      const normalizedHl = normalizeHlNumber(rawValue || "");
      if (!/^HL\d{3,5}$/i.test(normalizedHl)) return;

      nextMap[flight] = normalizedHl;
      savedCount += 1;
    });

    if (savedCount === 0) {
      setHlMappingStatus("저장할 등록기호가 없습니다. 표의 등록기호 칸에 숫자만 입력해 주세요.");
      return;
    }

    const normalizedText = serializeHlMapping(nextMap);
    setHlMappingText(normalizedText);
    saveHlMappingText(normalizedText);

    const allRecords = rows
      .map((row) => {
        const flight = getFlightKeyFromRow(row);
        if (!flight || flight === "-") return null;

        const rawValue = Object.prototype.hasOwnProperty.call(hlInlineDrafts, flight)
          ? hlInlineDrafts[flight]
          : getEditableHlValue(row, nextMap, {});
        const registrationNo = normalizeHlNumber(rawValue || "");
        if (!/^HL\d{3,5}$/i.test(registrationNo)) return null;

        return {
          date: getAircraftRegistrationDateFromRow(row),
          flight,
          departureCode: row.departureCode || "",
          arrivalCode: row.arrivalCode || "",
          registrationNo,
          updatedAt: new Date().toISOString(),
        } satisfies AircraftRegistrationRecord;
      })
      .filter((record): record is AircraftRegistrationRecord => Boolean(record));

    // 고치지 않은 행은 다시 쓰지 않습니다. (다른 기기의 최신 수정값을 덮어쓰지 않기 위해)
    const latestRecords = loadAircraftRegistrationRecords();
    const incomingRecords = excludeUnchangedRegistrationRecords(allRecords, latestRecords);
    let nextAircraftRegistrationRecords = mergeAircraftRegistrationRecords(
      latestRecords,
      incomingRecords,
    );
    let serverRegistrationSyncMessage = "";

    if (incomingRecords.length > 0) {
      try {
        nextAircraftRegistrationRecords = await saveAircraftRegistrationRecordsToServer(incomingRecords, "merge");
        serverRegistrationSyncMessage = " · 서버 저장";
      } catch (serverError) {
        saveAircraftRegistrationRecords(nextAircraftRegistrationRecords);
        serverRegistrationSyncMessage =
          serverError instanceof Error
            ? ` · 서버 저장 실패: ${serverError.message}`
            : " · 서버 저장 실패";
      }
    } else {
      saveAircraftRegistrationRecords(nextAircraftRegistrationRecords);
    }

    setAircraftRegistrationRecords(nextAircraftRegistrationRecords);

    // 이번에 실제로 값이 바뀐 편명만 수동 수정으로 취급 (기존 값이 있어도 새 값으로 덮어씀)
    const changedByFlight = new Map<string, string>();
    rows.forEach((row) => {
      const flight = getFlightKeyFromRow(row);
      if (!flight || flight === "-") return;
      if (!Object.prototype.hasOwnProperty.call(hlInlineDrafts, flight)) return;
      const draftNo = normalizeHlNumber(hlInlineDrafts[flight] || "");
      if (!/^HL\d{3,5}$/i.test(draftNo)) return;
      if (draftNo !== normalizeHlNumber(getRegistrationNo(row))) changedByFlight.set(flight, draftNo);
    });
    const applyChangedOverrides = (targetRows: FlightRow[]) =>
      targetRows.map((row) => {
        const registrationNo = changedByFlight.get(getFlightKeyFromRow(row));
        return registrationNo
          ? {
              ...row,
              hlnbr: registrationNo,
              registrationNo,
              aircraftRegNo: registrationNo,
              registrationNoEdited: true,
            }
          : row;
      });

    const nextRows = applyChangedOverrides(
      applyRegistrationToRows(applyHlMappingToRows(rows, nextMap), nextAircraftRegistrationRecords),
    );
    const nextRooms = rooms.map((room) => ({
      ...room,
      rows: applyChangedOverrides(
        applyRegistrationToRows(applyHlMappingToRows(room.rows || [], nextMap), nextAircraftRegistrationRecords),
      ),
    }));

    setRows(nextRows);
    setRooms(nextRooms);
    saveRooms(nextRooms);
    setHlInlineDrafts({});

    if (flightMode === "registration") {
      try {
        const synced = await syncRegistrationFieldsToScheduleSlots(nextRows);
        setHlMappingStatus(
          `등록기호 ${savedCount}건 저장${serverRegistrationSyncMessage}${
            synced > 0 ? ` · Schedule Flight 카드 ${synced}장 반영` : ""
          }`,
        );
      } catch (error) {
        setHlMappingStatus(
          error instanceof Error
            ? `등록기호 ${savedCount}건 저장${serverRegistrationSyncMessage} · 카드 반영 실패: ${error.message}`
            : `등록기호 ${savedCount}건 저장${serverRegistrationSyncMessage} · 카드 반영 실패`,
        );
      }
      return;
    }

    const nextSelectedRoom = selectedRoom
      ? nextRooms.find((room) => room.id === selectedRoom.id) || null
      : null;

    if (nextSelectedRoom?.fixed) {
      try {
        await saveLatestScheduleToServer(normalizeScheduleRoomRows(nextSelectedRoom));
        setHlMappingStatus(`등록기호 ${savedCount}건 저장${serverRegistrationSyncMessage} · AFOCS SKD/초기화면 반영`);
      } catch (error) {
        setHlMappingStatus(
          error instanceof Error
            ? `등록기호 로컬 저장 완료 · 서버 반영 실패: ${error.message}`
            : "등록기호 로컬 저장 완료 · 서버 반영 실패",
        );
      }
      return;
    }

    setHlMappingStatus(`등록기호 ${savedCount}건 저장${serverRegistrationSyncMessage}`);
  };

  return {
    afocsSkdInlineDrafts,
    aircraftRegistrationRecords,
    aircraftRegistrationRecordsRef,
    applyAllRegistrationSources,
    ensureAircraftRegistrationRecordsFromServer,
    handleAfocsSkdInlineDraftChange,
    handleCombinedRegistrationAfocsExcelUpload,
    handleHlInlineDraftChange,
    handleSaveInlineAfocsSkd,
    handleSaveInlineHlMapping,
    hlInlineDrafts,
    hlMappingStatus,
    hlNumberMap,
    persistRegistrationDraftsForRows,
    registrationExcelInputRef,
    setAircraftRegistrationRecords,
    setHlInlineDrafts,
    setHlMappingStatus,
    setHlMappingText,
  };
}
