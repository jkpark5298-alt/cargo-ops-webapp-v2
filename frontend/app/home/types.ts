export type DailyNotionRecord = {
  pageId: string;
  url?: string;
  savedAt: string;
  workDate?: string;
};

export type IssueNotionRecord = DailyNotionRecord;

export type BackendScheduleChange = {
  flight?: string;
  route?: string;
  changes?: string[];
  title?: string;
  description?: string;
  message?: string;
  detail?: string;
  changeText?: string;
  previous?: string;
  current?: string;
  before?: string;
  after?: string;
  oldValue?: string;
  newValue?: string;
  oldTime?: string;
  newTime?: string;
  beforeTime?: string;
  afterTime?: string;
  gate?: string;
  oldGate?: string;
  newGate?: string;
  status?: string;
  oldStatus?: string;
  newStatus?: string;
};

export type BackendScheduleCheckResult = {
  changed?: number;
  sent?: number;
  failed?: number;
  checked?: number;
  changes?: BackendScheduleChange[];
};

export type IncheonApiUsage = {
  departure: number;
  arrival: number;
  total: number;
  departureRate: number;
  arrivalRate: number;
  totalRate: number;
  warning: boolean;
  lastCalledAt?: string;
};

export type ImageSlotKey =
  | "daily-schedule"
  | "aircraft-check"
  | "inspection-result"
  | "issue";

export type HourlyWeather = {
  time?: string;
  condition?: string;
  temperature?: string;
  icon?: string;
};

export type WeatherInfo = {
  success?: boolean;
  location?: string;
  temperature?: string;
  condition?: string;
  feelsLike?: string;
  humidity?: string;
  windSpeed?: string;
  pm10Grade?: string;
  pm25Grade?: string;
  hourly?: HourlyWeather[];
  baseTime?: string;
  icon?: string;
  source?: string;
  message?: string;
};

export type SavedImage = {
  id: string;
  type: ImageSlotKey;
  label: string;
  savedAt: string;
  dataUrl: string;
  capturedAt?: string;
  locationText?: string;
  memo?: string;
};

export type ImageFileMetadata = {
  capturedAt?: string;
  locationText?: string;
};

export type IfdEntry = {
  type: number;
  count: number;
  valueOffset: number;
  valueFieldOffset: number;
};
