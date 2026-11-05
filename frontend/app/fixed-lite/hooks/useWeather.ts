import { useState } from "react";
import { BACKEND_URL } from "../../lib/api-config";

/** 현재 날씨 조회 */
export function useWeather() {
  // Weather states & logic
  const [weather, setWeather] = useState<any>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const fetchWeather = async () => {
    setWeatherLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/weather/current`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setWeather(json);
    } catch (err) {
      console.error("Mobile weather fetch error:", err);
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
