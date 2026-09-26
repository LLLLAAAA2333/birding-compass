import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeHotspots, withRegionNames } from "./data";
import { RecentClient, buildQueryUrl } from "./recentData";
import { readRecentCache } from "./recentCache";
const bird = {
  speciesCode: "eurbla",
  comName: "乌鸫",
  sciName: "Turdus merula",
  locId: "L123",
  locName: "天鹅湖",
  obsDt: "2026-09-24 07:30",
  lat: 31.816,
  lng: 117.226,
};
const query = { kind: "location" as const, locationId: "L123", days: 7 };
afterEach(() => vi.unstubAllGlobals());
describe("recent data and region names", () => {
  it("keeps API keys out of cached data and query URLs", async () => {
    const request = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify([bird])),
    );
    vi.stubGlobal("fetch", request);
    const result = await new RecentClient("test-secret-key").load(query, {
      force: true,
    });
    expect(result.observations[0].commonName).toBe("乌鸫");
    expect(String(request.mock.calls[0][0])).not.toContain("test-secret-key");
    expect(
      JSON.stringify(await readRecentCache(buildQueryUrl(query))),
    ).not.toContain("test-secret-key");
    expect(request.mock.calls[0][1]?.headers).toEqual({
      "X-eBirdApiToken": "test-secret-key",
    });
  });
  it("gives a useful message for a rejected key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 403 })),
    );
    await expect(
      new RecentClient("wrong").load(query, { force: true }),
    ).rejects.toThrow("API Key 无效");
  });
  it("does not send a request canceled before it starts", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const controller = new AbortController();
    controller.abort();
    await expect(
      new RecentClient("key").load(query, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(request).not.toHaveBeenCalled();
  });
  it("propagates cancellation to the active network request", async () => {
    const request = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", request);
    const controller = new AbortController();
    const pending = new RecentClient("key").load(query, {
      signal: controller.signal,
      force: true,
    });
    const rejection = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    controller.abort();
    await rejection;
    expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("resolves province and city without storing credentials", async () => {
    const saved = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    });
    const hotspots = normalizeHotspots([
      {
        locId: "L1",
        locName: "湿地",
        lat: 31,
        lng: 117,
        numSpeciesAllTime: 120,
        subnational1Code: "CN-AH",
        subnational2Code: "CN-AH-01",
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.includes("subnational1/CN")
                ? [{ code: "CN-AH", name: "安徽" }]
                : [{ code: "CN-AH-01", name: "合肥" }],
            ),
          ),
      ),
    );
    const names = await new RecentClient("test-secret-key").loadRegionNames(
      hotspots,
    );
    expect(withRegionNames(hotspots, names)[0]).toMatchObject({
      province: "安徽",
      city: "合肥",
    });
    expect([...saved.values()].join("")).not.toContain("test-secret-key");
  });
  it("ignores invalid hotspot counts and coordinates", () => {
    expect(
      normalizeHotspots([
        {
          locId: "L1",
          locName: "地点",
          lat: 31,
          lng: 117,
          numSpeciesAllTime: -2,
        },
      ]),
    ).toEqual([]);
    expect(
      normalizeHotspots([
        {
          locId: "L1",
          locName: "地点",
          lat: 91,
          lng: 117,
          numSpeciesAllTime: 2,
        },
      ]),
    ).toEqual([]);
  });
  it("persists the whole national inventory instead of truncating to the first 100", async () => {
    const payload = Array.from({ length: 101 }, (_, i) => ({
      locId: `L${i + 1}`,
      locName: `地点${i}`,
      lat: 31,
      lng: 117,
      numSpeciesAllTime: i,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload))),
    );
    const countryQuery = { kind: "hotspots" as const, days: 14 };
    await new RecentClient("key").load(countryQuery, { force: true });
    expect(
      (await readRecentCache(buildQueryUrl(countryQuery)))?.payload,
    ).toHaveLength(101);
  });
});
