import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { Area } from "./data";

export type AreaResult = Area & { description: string };
const FOLLOWED_KEY = "bird:followed-areas:v1";
const SEARCH_URL = "https://geocoding-api.open-meteo.com/v1/search";

function validArea(value: unknown): value is Area {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const area = value as Record<string, unknown>;
  return typeof area.id === "string" && area.id.length > 0 &&
    typeof area.name === "string" && area.name.trim().length > 0 &&
    typeof area.latitude === "number" && Number.isFinite(area.latitude) && area.latitude >= -90 && area.latitude <= 90 &&
    typeof area.longitude === "number" && Number.isFinite(area.longitude) && area.longitude >= -180 && area.longitude <= 180;
}

export function readFollowedAreas(): Area[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(FOLLOWED_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter(validArea) : [];
  } catch { return []; }
}

export function writeFollowedAreas(areas: Area[]): void {
  try { localStorage.setItem(FOLLOWED_KEY, JSON.stringify(areas.filter(validArea))); }
  catch { /* Following still works for this session. */ }
}

export function normalizeAreaResults(payload: unknown): AreaResult[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("地区搜索结果无法识别");
  const entries = (payload as Record<string, unknown>).results;
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) throw new Error("地区搜索结果无法识别");
  const results: AreaResult[] = [];
  for (const item of entries) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const latitude = row.latitude;
    const longitude = row.longitude;
    if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) continue;
    if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) continue;
    if (typeof row.id !== "number" || !Number.isInteger(row.id)) continue;
    if (typeof row.name !== "string" || !row.name.trim()) continue;
    const description = [row.admin2, row.admin1, row.country].filter((part): part is string => typeof part === "string" && Boolean(part.trim()))
      .filter((part, index, array) => array.indexOf(part) === index).join(" · ");
    results.push({ id: `geonames:${row.id}`, name: row.name.trim(), description, latitude, longitude });
  }
  return results;
}

export async function searchAreas(query: string, signal?: AbortSignal): Promise<AreaResult[]> {
  const text = query.trim();
  if (text.length < 2) return [];
  if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
  const url = new URL(SEARCH_URL);
  url.searchParams.set("name", text);
  url.searchParams.set("count", "6");
  url.searchParams.set("language", "zh");
  url.searchParams.set("countryCode", "CN");
  const requestUrl = isTauri() ? url.toString() : url.toString().replace("https://geocoding-api.open-meteo.com", "/api/geocode");
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await (isTauri() ? tauriFetch : globalThis.fetch)(requestUrl, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`地区搜索失败（${response.status}）`);
    const payload: unknown = await response.json();
    if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    return normalizeAreaResults(payload);
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    if (controller.signal.aborted) throw new Error("地区搜索超时，请稍后再试");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}
