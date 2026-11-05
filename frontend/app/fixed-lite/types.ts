export type ImageSlotKey = "daily-schedule" | "aircraft-check" | "inspection-result" | "issue";

export type SavedImage = {
  id: string;
  type: ImageSlotKey;
  label: string;
  savedAt: string;
  capturedAt?: string;
  locationText?: string;
  memo?: string;
  dataUrl: string;
};

export type WidgetSummaryItem = {
  flight: string;
  status: string;
  departureCode: string;
  arrivalCode: string;
  displayTime: string;
  gate: string;
  registrationNo?: string;
  excludeReason?: string;
  afocsSkd?: string;
};

export type WidgetSummaryResponse = {
  success: boolean;
  roomId: string;
  roomName: string;
  updatedAt: string;
  refreshIntervalMinutes: number;
  items: WidgetSummaryItem[];
};
