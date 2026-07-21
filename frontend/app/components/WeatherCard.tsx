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
  windDirectionText?: string;
  windGust?: string;
  visibility?: string;
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
  const hasPrecipitation =
    Boolean(weather.condition) &&
    (weather.condition!.includes("비") ||
      weather.condition!.includes("눈") ||
      weather.condition!.includes("소나기") ||
      weather.condition!.includes("이슬비"));

  return (
    <section style={weatherCardStyle}>
      <div style={metarHeaderRowStyle}>
        <span style={metarTitleStyle}>✈️ 활주로 실시간 기상 (METAR)</span>
        <button onClick={onRefresh} disabled={weatherLoading} style={metarRefreshButtonStyle}>
          {weatherLoading ? "조회중" : "🔄 갱신"}
        </button>
      </div>

      <div style={metarMainRowStyle}>
        <div style={metarSummaryStyle}>
          <div style={metarIconStyle}>{weather.icon || "☀️"}</div>
          <div style={metarTempStyle}>{weather.temperature || "-"}°C</div>
          <div style={metarConditionStyle}>{weather.condition || "-"}</div>
        </div>

        <div style={metarGridStyle}>
          <div style={metarMetricBoxStyle}>
            <div style={metarMetricLabelStyle}>💨 풍향 / 풍속</div>
            <div style={metarMetricValueStyle}>
              {weather.windDirectionText || "-"} {weather.windSpeed ? `${weather.windSpeed}m/s` : "-"}
              {weather.windGust ? (
                <span style={metarGustStyle}>⚠️ 돌풍 {weather.windGust}m/s</span>
              ) : null}
            </div>
          </div>

          <div style={metarMetricBoxStyle}>
            <div style={metarMetricLabelStyle}>👁️ 활주로 시정</div>
            <div style={metarMetricValueStyle}>{weather.visibility || "-"}</div>
          </div>

          <div style={metarMetricBoxStyle}>
            <div style={metarMetricLabelStyle}>💧 상대 습도</div>
            <div style={metarMetricValueStyle}>{weather.humidity ? `${weather.humidity}%` : "-"}</div>
          </div>

          <div style={metarMetricBoxStyle}>
            <div style={metarMetricLabelStyle}>☔ 강수 상태</div>
            <div style={metarMetricValueStyle}>{hasPrecipitation ? "강수 감지" : "강수 없음"}</div>
          </div>
        </div>
      </div>

      <div style={metarFootnoteStyle}>
        인천공항(RKSI) {weather.baseTime || "-"} 기준 ·{" "}
        {weather.source === "metar" ? "실시간 METAR" : "KMA 초단기실황"}
      </div>

      <div style={weatherUtilityRowStyle}>
        <button onClick={onOpenNaver} style={weatherSubButtonStyle}>
          네이버 날씨
        </button>
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
        {weather.location || "인천시 중구 운서동"} · 체감 {weather.feelsLike || "-"}°
        {weather.source === "fallback" ? ` · ${weather.message || "예시값 표시 중"}` : ""}
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

const metarHeaderRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 12,
  borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
  paddingBottom: 8,
};

const metarTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  color: "#93c5fd",
  letterSpacing: -0.3,
};

const metarRefreshButtonStyle: CSSProperties = {
  background: "rgba(59, 130, 246, 0.2)",
  border: "1px solid rgba(59, 130, 246, 0.4)",
  color: "#60a5fa",
  borderRadius: 8,
  padding: "4px 8px",
  fontSize: 12,
  fontWeight: "bold",
  cursor: "pointer",
};

const metarMainRowStyle: CSSProperties = {
  display: "flex",
  gap: 16,
  alignItems: "center",
};

const metarSummaryStyle: CSSProperties = {
  textAlign: "center",
  minWidth: 90,
};

const metarIconStyle: CSSProperties = {
  fontSize: 44,
  lineHeight: 1,
};

const metarTempStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  marginTop: 6,
  letterSpacing: -0.5,
  color: "#f8fafc",
};

const metarConditionStyle: CSSProperties = {
  fontSize: 12,
  color: "#94a3b8",
  marginTop: 2,
  fontWeight: 800,
};

const metarGridStyle: CSSProperties = {
  flex: 1,
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  fontSize: 12,
};

const metarMetricBoxStyle: CSSProperties = {
  background: "rgba(255, 255, 255, 0.03)",
  borderRadius: 10,
  padding: 8,
};

const metarMetricLabelStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 10,
  marginBottom: 2,
};

const metarMetricValueStyle: CSSProperties = {
  fontWeight: 800,
  fontSize: 13,
  color: "white",
};

const metarGustStyle: CSSProperties = {
  color: "#f87171",
  display: "block",
  fontSize: 10,
  marginTop: 2,
};

const metarFootnoteStyle: CSSProperties = {
  fontSize: 10,
  color: "#64748b",
  textAlign: "right",
  marginTop: 10,
  fontVariantNumeric: "tabular-nums",
};

const weatherUtilityRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: 12,
};

const weatherSubButtonStyle: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 12,
  padding: "9px 11px",
  color: "#e5edf7",
  background: "#1e293b",
  fontWeight: 950,
  cursor: "pointer",
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
