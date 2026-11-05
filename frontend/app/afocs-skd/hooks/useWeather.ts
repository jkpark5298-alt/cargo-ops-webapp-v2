import { useState } from "react";
import { BACKEND_URL } from "../../lib/api-config";

/** 현재 날씨 조회 */
export function useWeather() {
  // Weather states & logic
  const [weather, setWeather] = useState<any>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  /** force=true 이면 서버 캐시를 건너뛰고 다시 조회(갱신 버튼) */
  const fetchWeather = async (force = false) => {
    setWeatherLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/weather/current${force ? "?refresh=true" : ""}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setWeather(json);
      else setWeather({ success: false, message: "날씨 정보를 불러오지 못했습니다. 잠시 후 갱신해 주세요." });
    } catch (err) {
      console.error("Mobile weather fetch error:", err);
      setWeather({ success: false, message: "날씨 정보를 불러오지 못했습니다. 서버 응답이 없거나 지연되고 있습니다." });
    } finally {
      setWeatherLoading(false);
    }
  };

  return {
    fetchWeather,
    weather,
    weatherLoading,
  };
}
