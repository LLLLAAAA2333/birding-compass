import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { buildRecentUrl, normalizeObservations, type Observation } from "./ebird";

export type City = { id: "hefei" | "nanjing"; name: string; latitude: number; longitude: number };

export const CITIES: City[] = [
  { id: "hefei", name: "合肥", latitude: 31.8206, longitude: 117.2272 },
  { id: "nanjing", name: "南京", latitude: 32.0603, longitude: 118.7969 },
];

export type Snapshot = { observations: Observation[]; fetchedAt: string };

function cacheKey(city: City, days: number, radiusKm: number): string {
  return `bird:recent:v2:${city.id}:${city.latitude}:${city.longitude}:${days}:${radiusKm}`;
}

export function readSnapshot(city: City, days: number, radiusKm: number): Snapshot | null {
  try {
    const raw = localStorage.getItem(cacheKey(city, days, radiusKm));
    if (!raw) return null;
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== "object" || !("payload" in saved) || !("fetchedAt" in saved)) return null;
    if (typeof saved.fetchedAt !== "string" || Number.isNaN(Date.parse(saved.fetchedAt))) return null;
    return { observations: normalizeObservations(saved.payload), fetchedAt: saved.fetchedAt };
  } catch {
    return null;
  }
}

export async function fetchRecent(city: City, days: number, radiusKm: number, apiKey: string, signal?: AbortSignal): Promise<Snapshot> {
  if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
  const url = buildRecentUrl(city.latitude, city.longitude, days, radiusKm);
  const requestUrl = isTauri() ? url : url.replace("https://api.ebird.org", "/api/ebird");
  const request = isTauri() ? tauriFetch : globalThis.fetch;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 15000);
  let payload: unknown;
  try {
    const response = await request(requestUrl, {
      headers: { "X-eBirdApiToken": apiKey },
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error("API Key 无效或尚未获得权限");
      if (response.status === 429) throw new Error("eBird 请求过于频繁，请稍后再试");
      throw new Error(`eBird 请求失败（${response.status}）`);
    }
    payload = await response.json();
    if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    if (controller.signal.aborted) throw new Error("连接 eBird 超时，请检查网络后重试");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
  const snapshot = { observations: normalizeObservations(payload), fetchedAt: new Date().toISOString() };
  try {
    localStorage.setItem(cacheKey(city, days, radiusKm), JSON.stringify({ payload, fetchedAt: snapshot.fetchedAt }));
  } catch {
    // Storage may be unavailable or full; current data remains usable.
  }
  return snapshot;
}
