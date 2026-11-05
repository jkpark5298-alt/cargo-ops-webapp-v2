/** 화면 전반(홈 / 편명조회 / AFOCS SKD)에서 공유하는 편·스케줄 타입. */

export type FlightRow = {
  airline?: string;
  flightId?: string;
  flightNo?: string;
  departureCode?: string;
  departureName?: string;
  arrivalCode?: string;
  arrivalName?: string;
  scheduleDateTime?: string;
  estimatedDateTime?: string;
  formattedScheduleTime?: string;
  formattedEstimatedTime?: string;
  gatenumber?: string;
  terminalid?: string;
  masterflightid?: string;
  codeshare?: string;
  typeOfFlight?: string;
  remark?: string;
  status?: string;
  delay?: boolean;
  canceled?: boolean;
  gateChanged?: boolean;
  sourceType?: string;
  fid?: string;
  afocsSkd?: string;
  hlnbr?: string;
  registrationNo?: string;
  aircraftRegNo?: string;
  /** 매뉴얼(또는 엑셀)로 등록번호를 바꾼 편 — 편명 뒤에 * 표시 */
  registrationNoEdited?: boolean;
  flightNoEdited?: boolean;
};

export type MonitorRoom = {
  id: string;
  name: string;
  flightsInput: string;
  startDateTime: string;
  endDateTime: string;
  fixed: boolean;
  lastFetchedAt: string;
  rows: FlightRow[];
};

export type AircraftRegistrationRecord = {
  date: string;
  flight: string;
  departureCode: string;
  arrivalCode: string;
  registrationNo: string;
  updatedAt: string;
};
