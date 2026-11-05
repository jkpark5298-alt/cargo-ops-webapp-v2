"use client";

export type WeatherBannerProps = {
  fetchWeather: (force?: boolean) => Promise<void>;
  weather: any;
  weatherLoading: boolean;
};

/** 현재 날씨 배너 */
export function WeatherBanner({
  fetchWeather,
  weather,
  weatherLoading,
}: WeatherBannerProps) {
  return (
    <>
      {weather && weather.success === false && (
        <div
          role="status"
          style={{
            background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
            border: "1px solid rgba(147, 197, 253, 0.25)",
            borderRadius: 18,
            padding: 16,
            color: "#94a3b8",
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span>✈️ {weather.message || "날씨 정보를 불러오지 못했습니다."}</span>
          <button
            onClick={() => void fetchWeather(true)}
            disabled={weatherLoading}
            style={{
              background: "rgba(59, 130, 246, 0.2)",
              border: "1px solid rgba(59, 130, 246, 0.4)",
              color: "#60a5fa",
              borderRadius: 8,
              padding: "4px 8px",
              fontSize: 12,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            {weatherLoading ? "조회중" : "🔄 갱신"}
          </button>
        </div>
      )}
      {weather && weather.success !== false && (
          <div
            style={{
              background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
              border: "1px solid rgba(147, 197, 253, 0.25)",
              borderRadius: 18,
              padding: 16,
              boxShadow: "0 8px 30px rgba(0, 0, 0, 0.4)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
                borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                paddingBottom: 8,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 900, color: "#93c5fd", letterSpacing: -0.3 }}>
                ✈️ 활주로 실시간 기상 (METAR)
              </span>
              <button
                onClick={() => void fetchWeather(true)}
                disabled={weatherLoading}
                style={{
                  background: "rgba(59, 130, 246, 0.2)",
                  border: "1px solid rgba(59, 130, 246, 0.4)",
                  color: "#60a5fa",
                  borderRadius: 8,
                  padding: "4px 8px",
                  fontSize: 12,
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                {weatherLoading ? "조회중" : "🔄 갱신"}
              </button>
            </div>

            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{ textAlign: "center", minWidth: 90 }}>
                <div style={{ fontSize: 44, lineHeight: 1 }}>{weather.icon || "☀️"}</div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6, letterSpacing: -0.5 }}>
                  {weather.temperature || "-"}°C
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2, fontWeight: 800 }}>
                  {weather.condition || "-"}
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  fontSize: 12,
                }}
              >
                <div style={{ background: "rgba(255, 255, 255, 0.03)", borderRadius: 10, padding: 8 }}>
                  <div style={{ color: "#94a3b8", fontSize: 10, marginBottom: 2 }}>💨 풍향 / 풍속</div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "white" }}>
                    {weather.windDirectionText || "-"} {weather.windSpeed ? `${weather.windSpeed}m/s` : "-"}
                    {weather.windGust ? (
                      <span style={{ color: "#f87171", display: "block", fontSize: 10, marginTop: 2 }}>
                        ⚠️ 돌풍 {weather.windGust}m/s
                      </span>
                    ) : null}
                  </div>
                </div>

                <div style={{ background: "rgba(255, 255, 255, 0.03)", borderRadius: 10, padding: 8 }}>
                  <div style={{ color: "#94a3b8", fontSize: 10, marginBottom: 2 }}>👁️ 활주로 시정</div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "white" }}>
                    {weather.visibility || "-"}
                  </div>
                </div>

                <div style={{ background: "rgba(255, 255, 255, 0.03)", borderRadius: 10, padding: 8 }}>
                  <div style={{ color: "#94a3b8", fontSize: 10, marginBottom: 2 }}>💧 상대 습도</div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "white" }}>
                    {weather.humidity ? `${weather.humidity}%` : "-"}
                  </div>
                </div>

                <div style={{ background: "rgba(255, 255, 255, 0.03)", borderRadius: 10, padding: 8 }}>
                  <div style={{ color: "#94a3b8", fontSize: 10, marginBottom: 2 }}>☔ 강수 상태</div>
                  <div style={{ fontWeight: 800, fontSize: 12, color: "white" }}>
                    {weather.condition && (weather.condition.includes("비") || weather.condition.includes("눈") || weather.condition.includes("소나기") || weather.condition.includes("이슬비")) 
                      ? "강수 감지" 
                      : "강수 없음"}
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                fontSize: 10,
                color: "#64748b",
                textAlign: "right",
                marginTop: 10,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              인천공항(RKSI) {weather.baseTime || "-"} 기준 · {weather.source === "metar" ? "실시간 METAR" : "KMA 초단기실황"}
              {weather.stale ? " · ⚠️ 관측 시각이 3시간 이상 지났습니다" : ""}
            </div>
          </div>
        )}
    </>
  );
}
