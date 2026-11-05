import { type FlightAlertHistoryItem } from "../../lib/flight-alerts";

export type FlightAlertHistoryCardProps = {
  historyItems: FlightAlertHistoryItem[];
  serverLoading?: boolean;
  serverStatus?: string;
  summaryCount?: number;
  detailsVisible?: boolean;
  onDeleteItem: (item: FlightAlertHistoryItem) => void;
  onClear: () => void;
  onLoadServerHistory: () => void | Promise<void>;
};

export type AlertDescriptionLine = {
  text: string;
  highlight?: boolean;
};

export type ParsedAlertTime = {
  year?: string;
  month?: string;
  day?: string;
  time: string;
};
