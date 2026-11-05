import { type MonitorRoom } from "../../lib/flight-types";
import { type FlightAlertHistoryItem } from "../../lib/flight-alerts";

export type ScheduleSummaryCardProps = {
  latestRoom: MonitorRoom | null;
  syncCheckedAt: string;
  apiSyncStatus: string;
  apiSyncLoading: boolean;
  flightDeleting?: boolean;
  onOpenScheduleFlight: () => void;
  onRefreshLatestSchedule: () => void;
  flightAlertHistory?: FlightAlertHistoryItem[];
  onDeleteAlertHistoryItem?: (item: FlightAlertHistoryItem) => void;
  onUpdateAfocsSkd?: (flight: string, date: string, time: string) => void;
  onDeleteFlight?: (flight: string) => void;
};

export type FlightSortMode = "manual" | "schedule" | "afocs";

export type FlightViewMode = "active" | "completed" | "all";

export type FlightRouteItem = {
  flight: string;
  registrationNo: string;
  route: string;
  direction: string;
  status: string;
  time: string;
  displayTime: string;
  afocsSkd: string;
  afocsSkdDate: string;
  afocsSkdTime: string;
  changeTimeDate: string;
  changeTimeTime: string;
  gate: string;
  hasResult: boolean;
  departureCode: string;
  arrivalCode: string;
};
