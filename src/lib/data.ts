export type Area = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};
export type Hotspot = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  allTimeSpeciesCount: number;
  latestAt: string | null;
  provinceCode: string | null;
  cityCode: string | null;
  province: string | null;
  city: string | null;
};

const REGION_CACHE_KEY = "bird:regions:CN:v1";
type RegionNames = Record<string, string>;

export function readRegionNames(): RegionNames {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(REGION_CACHE_KEY) ?? "{}",
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([code, name]) =>
          /^CN-[A-Z0-9-]+$/.test(code) &&
          typeof name === "string" &&
          name.length < 100,
      ),
    );
  } catch {
    return {};
  }
}

function nameFor(code: string | null, names: RegionNames): string | null {
  return code ? (names[code] ?? null) : null;
}

export function withRegionNames(
  hotspots: Hotspot[],
  names: RegionNames,
): Hotspot[] {
  return hotspots.map((hotspot) => ({
    ...hotspot,
    province: nameFor(hotspot.provinceCode, names) ?? hotspot.province,
    city: nameFor(hotspot.cityCode, names) ?? hotspot.city,
  }));
}

export async function fetchRegionNames(
  hotspots: Hotspot[],
  request: (url: string, signal: AbortSignal) => Promise<unknown>,
  signal?: AbortSignal,
  onNames?: (names: RegionNames) => void,
): Promise<RegionNames> {
  const names = readRegionNames();
  const missing = new Set(
    hotspots
      .flatMap(({ provinceCode, cityCode }) => [provinceCode, cityCode])
      .filter((code): code is string => Boolean(code && !names[code])),
  );
  if (missing.size === 0) return names;
  const provinceCodes = [
    ...new Set(
      [...missing].map((code) => code.split("-").slice(0, 2).join("-")),
    ),
  ];
  const paths = [
    ...([...missing].some((code) => code.split("-").length === 2)
      ? ["/v2/ref/region/list/subnational1/CN"]
      : []),
    ...provinceCodes.map(
      (code) => `/v2/ref/region/list/subnational2/${encodeURIComponent(code)}`,
    ),
  ];
  for (let offset = 0; offset < paths.length; offset += 3) {
    if (signal?.aborted)
      throw new DOMException("Request cancelled", "AbortError");
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), 12000);
    let results: PromiseSettledResult<unknown[]>[];
    try {
      results = await Promise.allSettled(
        paths.slice(offset, offset + 3).map(async (path) => {
          const payload = await request(
            `https://api.ebird.org${path}`,
            controller.signal,
          );
          if (!Array.isArray(payload))
            throw new Error("eBird 地区名称格式无法识别");
          return payload;
        }),
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
    const limited = results.find(
      (result) => result.status === "rejected" && result.reason?.status === 429,
    );
    if (limited?.status === "rejected") throw limited.reason;
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const item of result.value) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const row = item as Record<string, unknown>;
        if (
          typeof row.code === "string" &&
          /^CN-[A-Z0-9-]+$/.test(row.code) &&
          typeof row.name === "string" &&
          row.name.trim()
        )
          names[row.code] = row.name.trim();
      }
    }
    if (signal?.aborted)
      throw new DOMException("Request cancelled", "AbortError");
    try {
      localStorage.setItem(REGION_CACHE_KEY, JSON.stringify(names));
    } catch {
      /* Keep live names. */
    }
    onNames?.(names);
  }
  if (signal?.aborted)
    throw new DOMException("Request cancelled", "AbortError");
  return names;
}

export function normalizeHotspots(payload: unknown): Hotspot[] {
  if (!Array.isArray(payload))
    throw new Error("eBird 热门鸟点数据格式无法识别");
  const hotspots: Hotspot[] = [];
  for (const item of payload) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.locId !== "string" || !/^L\d+$/.test(row.locId)) continue;
    if (typeof row.locName !== "string" || !row.locName.trim()) continue;
    if (
      typeof row.lat !== "number" ||
      !Number.isFinite(row.lat) ||
      row.lat < -90 ||
      row.lat > 90
    )
      continue;
    if (
      typeof row.lng !== "number" ||
      !Number.isFinite(row.lng) ||
      row.lng < -180 ||
      row.lng > 180
    )
      continue;
    if (
      typeof row.numSpeciesAllTime !== "number" ||
      !Number.isInteger(row.numSpeciesAllTime) ||
      row.numSpeciesAllTime < 0
    )
      continue;
    hotspots.push({
      id: row.locId,
      name: row.locName.trim(),
      latitude: row.lat,
      longitude: row.lng,
      allTimeSpeciesCount: row.numSpeciesAllTime,
      latestAt:
        typeof row.latestObsDt === "string" && row.latestObsDt.trim()
          ? row.latestObsDt
          : null,
      provinceCode:
        typeof row.subnational1Code === "string" &&
        /^CN-[A-Z0-9]+$/.test(row.subnational1Code)
          ? row.subnational1Code
          : null,
      cityCode:
        typeof row.subnational2Code === "string" &&
        /^CN-[A-Z0-9-]+$/.test(row.subnational2Code)
          ? row.subnational2Code
          : null,
      province:
        typeof row.province === "string" && row.province.trim()
          ? row.province.trim()
          : null,
      city:
        typeof row.city === "string" && row.city.trim()
          ? row.city.trim()
          : null,
    });
  }
  return hotspots.sort(
    (a, b) =>
      (b.latestAt ?? "").localeCompare(a.latestAt ?? "") ||
      a.name.localeCompare(b.name),
  );
}
