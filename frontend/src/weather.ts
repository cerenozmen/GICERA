import Geolocation from "@react-native-community/geolocation";
import { PermissionsAndroid, Platform } from "react-native";

export interface SkinWeather {
  uvIndex: number;
  humidity: number;
}

/** Rough location (city level is enough for UV and humidity). Null without permission or a fix. */
async function position(): Promise<{ latitude: number; longitude: number } | null> {
  if (Platform.OS === "android") {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION, {
      title: "Konum izni",
      message: "Bulunduğun yerin UV endeksini ve nem oranını göstermek için yaklaşık konumunu kullanıyoruz.",
      buttonPositive: "İzin ver",
      buttonNegative: "Şimdi değil",
    });
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) return null;
  }
  return new Promise((resolve) => {
    Geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 30 * 60 * 1000 }
    );
  });
}

/** Current UV index and humidity from Open-Meteo (free, no API key). Null when unavailable. */
export async function loadSkinWeather(): Promise<SkinWeather | null> {
  const where = await position();
  if (!where) return null;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${where.latitude.toFixed(2)}&longitude=${where.longitude.toFixed(2)}&current=uv_index,relative_humidity_2m`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as { current?: { uv_index?: number; relative_humidity_2m?: number } };
    const uv = data.current?.uv_index;
    const humidity = data.current?.relative_humidity_2m;
    if (typeof uv !== "number" || typeof humidity !== "number") return null;
    return { uvIndex: Math.round(uv), humidity: Math.round(humidity) };
  } catch {
    return null;
  }
}

/** WHO UV scale. */
export function uvLevel(uv: number): string {
  if (uv <= 2) return "Düşük";
  if (uv <= 5) return "Orta";
  if (uv <= 7) return "Yüksek";
  if (uv <= 10) return "Çok yüksek";
  return "Aşırı";
}

export function uvAdvice(uv: number): string {
  return uv >= 3 ? "Güneş koruyucu kullan" : "Hafif koruma yeterli";
}

export function humidityAdvice(humidity: number): string {
  if (humidity < 30) return "Kuru hava";
  if (humidity < 45) return "Hafif kuru hava";
  if (humidity <= 65) return "Dengeli hava";
  return "Nemli hava";
}
