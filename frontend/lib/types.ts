export type ExtractedRow = {
  rowIndex: number;
  name: string;
  flightNo: string;
  parkingStand: string;
  rawText?: string;
};

export type FlightInfo = {
  flightId: string;
  airline?: string;
  flightType?: string;
  scheduleDateTime?: string;
  changedDateTime?: string;
  airportCode?: string;
  airportName?: string;
  gateNumber?: string;
  terminal?: string;
  status?: string;
};

export type OcrResponse = {
  message: string;
  rows: ExtractedRow[];
  flights: FlightInfo[];
  usedDemo?: boolean;
};
