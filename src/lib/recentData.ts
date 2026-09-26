import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
  fetchRegionNames,
  normalizeHotspots,
  readRegionNames,
  withRegionNames,
  type Area,
  type Hotspot,
} from "./data";
import {
  buildRecentUrl,
  normalizeObservations,
  type Observation,
} from "./ebird";
import {
  readRecentCache,
  writeRecentCache,
  RECENT_MAX_AGE,
  type CachedRecord,
} from "./recentCache";
import { RequestQueue, abortError } from "./requestQueue";

export type RecentQuery =
  | { kind: "hotspots"; days: number; area?: Area; radiusKm?: number }
  | { kind: "nearby"; days: number; area: Area; radiusKm: number }
  | { kind: "location"; locationId: string; days: number }
  | {
      kind: "species";
      speciesCode: string;
      area: Area;
      radiusKm: number;
      days: number;
    };
export type RecentResult = {
  hotspots: Hotspot[];
  observations: Observation[];
  fetchedAt: string;
  days: number;
  limited: boolean;
  source: "cache" | "live";
};
export type LoadOptions = {
  signal?: AbortSignal;
  force?: boolean;
  priority?: boolean;
  onCached?: (result: RecentResult) => void;
};

export function buildQueryUrl(query: RecentQuery): string {
  if (![3, 7, 14, 30].includes(query.days)) throw new Error("查询时间范围无效");
  let url: URL;
  if (query.kind === "location") {
    if (!/^L\d+$/.test(query.locationId)) throw new Error("鸟点编号无效");
    url = new URL(
      `https://api.ebird.org/v2/data/obs/${query.locationId}/recent`,
    );
    url.searchParams.set("cat", "species");
  } else if (query.kind === "species" || query.kind === "nearby") {
    if (query.kind === "species" && !/^[a-z0-9]+$/.test(query.speciesCode)) throw new Error("鸟种编号无效");
    url = new URL(
      buildRecentUrl(
        query.area.latitude,
        query.area.longitude,
        query.days,
        query.radiusKm,
      ),
    );
    if (query.kind === "species") url.pathname += `/${query.speciesCode}`;
    url.searchParams.set("cat", "species");
  } else {
    url = new URL(
      `https://api.ebird.org/v2/ref/hotspot/${query.area ? "geo" : "CN"}`,
    );
    url.searchParams.set("fmt", "json");
    if (query.area) {
      const nearby = new URL(
        buildRecentUrl(
          query.area.latitude,
          query.area.longitude,
          query.days,
          query.radiusKm ?? 50,
        ),
      );
      for (const key of ["lat", "lng", "dist"])
        url.searchParams.set(key, nearby.searchParams.get(key)!);
    }
  }
  url.searchParams.set("back", String(query.days));
  if (query.kind !== "hotspots") {
    url.searchParams.set("includeProvisional", "false");
    url.searchParams.set("sppLocale", "zh_SIM");
    url.searchParams.set("maxResults", "10000");
  }
  return url.toString();
}
export async function requestEbird(
  url: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<unknown> {
  if (signal.aborted) throw abortError();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 20000);
  try {
    const response = await (isTauri() ? tauriFetch : globalThis.fetch)(
      isTauri() ? url : url.replace("https://api.ebird.org", "/api/ebird"),
      {
        headers: apiKey ? { "X-eBirdApiToken": apiKey } : {},
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      const message =
        response.status === 401 || response.status === 403
          ? "API Key 无效或尚未获得权限，请检查个人配置"
          : response.status === 429
            ? "eBird 请求过于频繁，已暂停后续查询。请稍后手动刷新"
            : `eBird 请求失败（${response.status}）`;
      throw Object.assign(new Error(message), { status: response.status });
    }
    const payload: unknown = await response.json();
    if (signal.aborted) throw abortError();
    return payload;
  } catch (error) {
    if (signal.aborted) throw abortError();
    if (controller.signal.aborted) throw new Error("连接 eBird 超时，请重试");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
function normalize(
  query: RecentQuery,
  record: CachedRecord,
  source: RecentResult["source"],
): RecentResult {
  const { payload, fetchedAt } = record;
  if (!Array.isArray(payload)) throw new Error("eBird 返回的数据格式无法识别");
  let observations: Observation[] = [];
  let hotspots: Hotspot[] = [];
  if (query.kind === "hotspots")
    hotspots = withRegionNames(normalizeHotspots(payload), readRegionNames());
  else {
    const seen = new Set<string>();
    observations = normalizeObservations(payload).filter((item) => {
      if (query.kind === "location" && item.locationId !== query.locationId)
        return false;
      if (query.kind === "species" && item.speciesCode !== query.speciesCode)
        return false;
      const key = `${item.locationId}:${item.speciesCode}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  if (
    payload.length &&
    !(query.kind === "hotspots" ? hotspots.length : observations.length)
  )
    throw new Error("eBird 未返回可用记录，请重试");
  return {
    hotspots,
    observations,
    fetchedAt,
    days: query.days,
    limited: query.kind !== "hotspots" && payload.length >= 10000,
    source,
  };
}
export class RecentClient {
  private queue = new RequestQueue(3);
  constructor(private readonly apiKey: string) {}
  resume() {
    this.queue.resume();
  }
  loadRegionNames(
    hotspots: Hotspot[],
    signal?: AbortSignal,
    onNames?: (names: Record<string, string>) => void,
  ) {
    return fetchRegionNames(
      hotspots,
      (url, requestSignal) =>
        this.queue.run(
          url,
          (transportSignal) => requestEbird(url, this.apiKey, transportSignal),
          requestSignal,
        ),
      signal,
      onNames,
    );
  }
  async load(
    query: RecentQuery,
    options: LoadOptions = {},
  ): Promise<RecentResult> {
    const { signal, force, onCached, priority } = options;
    if (signal?.aborted) throw abortError();
    const url = buildQueryUrl(query);
    const cached = await readRecentCache(url);
    if (signal?.aborted) throw abortError();
    if (cached) {
      let result: RecentResult | null = null;
      try {
        result = normalize(query, cached, "cache");
      } catch {
        /* Invalid old cache is refreshed. */
      }
      if (result) {
        onCached?.(result);
        if (
          !force &&
          Date.now() - Date.parse(cached.fetchedAt) < RECENT_MAX_AGE
        )
          return result;
      }
    }
    return this.queue.run(
      url,
      async (transportSignal) => {
        const payload = await requestEbird(url, this.apiKey, transportSignal);
        if (transportSignal.aborted) throw abortError();
        const record = { payload, fetchedAt: new Date().toISOString() };
        const result = normalize(query, record, "live");
        await writeRecentCache(url, record);
        return result;
      },
      signal,
      priority,
    );
  }
}
export function distanceKm(
  area: Pick<Area, "latitude" | "longitude">,
  point: Pick<Area, "latitude" | "longitude">,
): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((point.latitude - area.latitude) * rad) / 2) ** 2 +
    Math.cos(area.latitude * rad) *
      Math.cos(point.latitude * rad) *
      Math.sin(((point.longitude - area.longitude) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}
export function filterHotspots(
  hotspots: Hotspot[],
  options: {
    province: string;
    text: string;
    sort: "recent" | "distance";
    area?: Area | null;
  },
): Hotspot[] {
  const term = options.text.trim().toLocaleLowerCase();
  return hotspots
    .filter(
      (item) =>
        (!options.province || item.provinceCode === options.province) &&
        (!term ||
          [item.name, item.province, item.city, item.provinceCode].some(
            (value) => value?.toLocaleLowerCase().includes(term),
          )),
    )
    .sort((a, b) =>
      options.sort === "distance" && options.area
        ? distanceKm(options.area, a) - distanceKm(options.area, b) ||
          a.name.localeCompare(b.name)
        : (b.latestAt ?? "").localeCompare(a.latestAt ?? "") ||
          a.name.localeCompare(b.name, "zh-CN"),
    );
}
