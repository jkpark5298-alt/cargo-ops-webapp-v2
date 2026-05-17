"use client";

import type { CSSProperties } from "react";

type HourlyWeather = {
  time?: string;
  condition?: string;
  temperature?: string;
  icon?: string;
};

type WeatherInfo = {
  location?: string;
  temperature?: string;
  feelsLike?: string;
  humidity?: string;
  windSpeed?: string;
  condition?: string;
  icon?: string;
  pm10Grade?: string;
  pm25Grade?: string;
  hourly?: HourlyWeather[];
  baseTime?: string;
  source?: string;
  message?: string;
};

type WeatherCardProps = {
  weather: WeatherInfo;
  weatherLoading: boolean;
  onRefresh: () => void;
  onOpenNaver: () => void;
};

export function WeatherCard({
  weather,
  weatherLoading,
  onRefresh,
  onOpenNaver,
}: WeatherCardProps) {
  const hourly = weather.hourly || [];

  return (
    <section style={weatherCardStyle}>
      <div style={weatherTopRowStyle}>
        <div>
          <div style={weatherLabelStyle}>운서동 날씨</div>
          <div style={weatherLocationStyle}>{weather.location || "인천시 중구 운서동"} 기준</div>
        </div>
        <div style={weatherButtonGroupStyle}>
          <button onClick={onRefresh} style={weatherButtonStyle}>
            {weatherLoading ? "조회 중" : "날씨 새로고침"}
          </button>
          <button onClick={onOpenNaver} style={weatherSubButtonStyle}>
            네이버 날씨
          </button>
        </div>
      </div>

      <div style={weatherMainRowStyle}>
        <div style={weatherTempStyle}>{weather.temperature || "-"}°</div>
        <div style={weatherConditionBoxStyle}>
          <div style={weatherIconStyle}>{weather.icon || "☀️"}</div>
          <div style={weatherConditionStyle}>{weather.condition || "-"}</div>
        </div>
      </div>

      <div style={weatherMetaStyle}>
        체감 {weather.feelsLike || "-"}° · 습도 {weather.humidity || "-"}% · 풍속 {weather.windSpeed || "-"}m/s
      </div>

      <div style={weatherGridStyle}>
        <WeatherMetric label="미세먼지" value={weather.pm10Grade || "-"} tone={getAirTone(weather.pm10Grade)} />
        <WeatherMetric label="초미세먼지" value={weather.pm25Grade || "-"} tone={getAirTone(weather.pm25Grade)} />
      </div>

      <div style={hourlyBlockStyle}>
        <div style={hourlyTitleStyle}>시간별 날씨</div>
        <div style={hourlyRowsStyle}>
          {hourly.length > 0 ? (
            hourly.map((item, idx) => (
              <div key={`${item.time || "hour"}-${idx}`} style={hourlyRowStyle}>
                <span style={hourlyTimeStyle}>{item.time || "-"}</span>
                <span style={hourlyConditionStyle}>
                  <span style={hourlyIconStyle}>{item.icon || "☀️"}</span>
                  {item.condition || "-"}
                </span>
                <strong style={hourlyTempStyle}>{item.temperature || "-"}°</strong>
              </div>
            ))
          ) : (
            <div style={hourlyEmptyStyle}>시간별 예보를 불러오면 여기에 표시됩니다.</div>
          )}
        </div>
      </div>

      <div style={weatherNoteStyle}>
        날씨 기준 {weather.baseTime || "-"}
        {weather.source === "fallback" ? ` · ${weather.message || "예시값 표시 중"}` : " · 백엔드 날씨 API"}
      </div>
    </section>
  );
}

function WeatherMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "normal" | "bad";
}) {
  const color = tone === "good" ? "#86efac" : tone === "bad" ? "#fca5a5" : "#fde68a";

  return (
    <div style={weatherMetricStyle}>
      <span style={weatherMetricLabelStyle}>{label}</span>
      <strong style={{ ...weatherMetricValueStyle, color }}>{value}</strong>
    </div>
  );
}

function getAirTone(value?: string): "good" | "normal" | "bad" {
  if (!value) return "normal";
  if (value.includes("좋음")) return "good";
  if (value.includes("나쁨") || value.includes("매우")) return "bad";
  return "normal";
}

const weatherCardStyle: CSSProperties = {
  marginTop: 18,
  border: "1px solid rgba(147, 197, 253, 0.26)",
  borderRadius: 22,
  padding: 18,
  background: "linear-gradient(145deg, rgba(15, 23, 42, 0.92), rgba(30, 41, 59, 0.9))",
};

const weatherTopRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
};

const weatherLabelStyle: CSSProperties = {
  color: "#dbeafe",
  fontSize: 15,
  fontWeight: 950,
};

const weatherLocationStyle: CSSProperties = {
  color: "#94a3b8",
  marginTop: 4,
  fontSize: 12,
};

const weatherButtonGroupStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const weatherButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 12,
  padding: "9px 11px",
  color: "#0f172a",
  background: "#bfdbfe",
  fontWeight: 950,
  cursor: "pointer",
};

const weatherSubButtonStyle: CSSProperties = {
  ...weatherButtonStyle,
  color: "#e5edf7",
  background: "#1e293b",
  border: "1px solid rgba(148, 163, 184, 0.28)",
};

const weatherMainRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginTop: 18,
};

const weatherTempStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 48,
  fontWeight: 950,
  lineHeight: 1,
};

const weatherConditionBoxStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const weatherIconStyle: CSSProperties = {
  fontSize: 28,
};

const weatherConditionStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 18,
  fontWeight: 950,
};

const weatherMetaStyle: CSSProperties = {
  color: "#cbd5e1",
  fontSize: 14,
  marginTop: 14,
};

const weatherGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  marginTop: 14,
};

const weatherMetricStyle: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 14,
  padding: "10px 12px",
  background: "rgba(15, 23, 42, 0.72)",
};

const weatherMetricLabelStyle: CSSProperties = {
  display: "block",
  color: "#94a3b8",
  fontSize: 12,
  marginBottom: 4,
};

const weatherMetricValueStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
};

const hourlyBlockStyle: CSSProperties = {
  marginTop: 14,
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 16,
  padding: 12,
  background: "rgba(15, 23, 42, 0.48)",
};

const hourlyTitleStyle: CSSProperties = {
  color: "#dbeafe",
  fontSize: 13,
  fontWeight: 950,
  marginBottom: 8,
};

const hourlyRowsStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const hourlyRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "52px 1fr 52px",
  alignItems: "center",
  gap: 8,
  minHeight: 34,
  borderRadius: 10,
  padding: "7px 9px",
  background: "rgba(2, 6, 23, 0.34)",
};

const hourlyTimeStyle: CSSProperties = {
  color: "#93c5fd",
  fontSize: 13,
  fontWeight: 950,
};

const hourlyConditionStyle: CSSProperties = {
  color: "#e5edf7",
  fontSize: 13,
  fontWeight: 850,
  display: "flex",
  alignItems: "center",
  gap: 7,
};

const hourlyIconStyle: CSSProperties = {
  fontSize: 16,
};

const hourlyTempStyle: CSSProperties = {
  color: "#f8fafc",
  textAlign: "right",
  fontSize: 14,
};

const hourlyEmptyStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
  lineHeight: 1.5,
};

const weatherNoteStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.5,
  marginTop: 12,
};
