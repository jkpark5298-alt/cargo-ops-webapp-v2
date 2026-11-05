import { type FlightRow } from "../../lib/flight-types";

export type FlightLookupCacheValue = {
  rows: FlightRow[];
  fetchedAt: string;
  savedAt: number;
};

export type ParsedRegistrationAfocsExcelRow = {
  flight: string;
  date: string;
  departureCode: string;
  arrivalCode: string;
  registrationNo: string;
  afocsSkd: string;
  time: string;
};
