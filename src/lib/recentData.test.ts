import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeHotspots } from "./data";
import {
  RecentClient,
  buildQueryUrl,
  filterHotspots,
  type RecentQuery,
} from "./recentData";
import { RequestQueue } from "./requestQueue";
import { readRecentCache, writeRecentCache } from "./recentCache";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));
const bird = {
  speciesCode: "litgre1",
  comName: "小白鹭",
  sciName: "Egretta garzetta",
  locId: "L1",
  locName: "湿地",
  obsDt: "2026-09-26 08:00",
  lat: 31,
  lng: 117,
  subId: "S123",
};
const location = (id: string): RecentQuery => ({
  kind: "location",
  locationId: id,
  days: 7,
});
beforeEach(() => {
  vi.unstubAllGlobals();
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("scoped recent observations", () => {
  it("requests each hotspot independently and counts a species once per location", async () => {
    const request = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify([
            { ...bird, locId: url.includes("/L2/") ? "L2" : "L1" },
            { ...bird, locId: url.includes("/L2/") ? "L2" : "L1" },
          ]),
        ),
    );
    vi.stubGlobal("fetch", request);
    const client = new RecentClient("key");
    const a = await client.load(location("L1"), { force: true });
    const b = await client.load(location("L2"), { force: true });
    expect(a.observations).toHaveLength(1);
    expect(b.observations).toHaveLength(1);
    expect(a.observations[0].locationId).toBe("L1");
    expect(b.observations[0].locationId).toBe("L2");
    const url = new URL(request.mock.calls[0][0], "http://localhost");
    expect(url.searchParams.get("cat")).toBe("species");
    expect(url.searchParams.get("includeProvisional")).toBe("false");
  });
  it("does not cache canceled requests, even when transport ignores cancellation", async () => {
    let finish!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const controller = new AbortController();
    const query = location("L998");
    const pending = new RecentClient("key").load(query, {
      signal: controller.signal,
      force: true,
    });
    const rejection = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    controller.abort();
    finish(new Response(JSON.stringify([{ ...bird, locId: "L998" }])));
    await rejection;
    expect(await readRecentCache(buildQueryUrl(query))).toBeNull();
  });
  it("uses fresh cache, refreshes explicitly and preserves last success on failure", async () => {
    const query = location("L777");
    const old = {
      payload: [{ ...bird, locId: "L777" }],
      fetchedAt: new Date().toISOString(),
    };
    await writeRecentCache(buildQueryUrl(query), old);
    const request = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", request);
    const client = new RecentClient("key");
    expect((await client.load(query)).observations).toHaveLength(1);
    expect(request).not.toHaveBeenCalled();
    const onCached = vi.fn();
    await expect(client.load(query, { force: true, onCached })).rejects.toThrow(
      "503",
    );
    expect(onCached).toHaveBeenCalledOnce();
    expect((await readRecentCache(buildQueryUrl(query)))?.fetchedAt).toBe(
      old.fetchedAt,
    );
  });
  it("continues without IndexedDB and rejects malformed payloads instead of displaying zero", async () => {
    vi.stubGlobal("indexedDB", undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([bird]))),
    );
    expect(
      (await new RecentClient("key").load(location("L1"), { force: true }))
        .observations,
    ).toHaveLength(1);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "bad" }))),
    );
    await expect(
      new RecentClient("key").load(location("L1"), { force: true }),
    ).rejects.toThrow();
  });
  it("queries one target species and keeps only its newest record at each location", async () => {
    const query: RecentQuery = {
      kind: "species",
      speciesCode: "litgre1",
      area: { id: "city", name: "合肥", latitude: 31, longitude: 117 },
      radiusKm: 25,
      days: 3,
    };
    const url = buildQueryUrl(query);
    expect(url).toContain("/geo/recent/litgre1?");
    expect(url).toContain("dist=25");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              bird,
              { ...bird, obsDt: "2026-09-25" },
              { ...bird, locId: "L2" },
            ]),
          ),
      ),
    );
    expect(
      (await new RecentClient("key").load(query, { force: true })).observations,
    ).toHaveLength(2);
    expect(() => buildQueryUrl({ ...query, radiusKm: 51 })).toThrow();
  });
  it("filters the complete hotspot inventory before limiting and ignores historic count when sorting", async () => {
    const payload = Array.from({ length: 110 }, (_, i) => ({
      locId: `L${i + 1}`,
      locName: `鸟点${i}`,
      lat: 31,
      lng: 117,
      numSpeciesAllTime: 500 - i,
      latestObsDt: "2026-09-26",
      subnational1Code: i === 109 ? "CN-AH" : "CN-JS",
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload))),
    );
    const result = await new RecentClient("key").load(
      { kind: "hotspots", days: 7 },
      { force: true },
    );
    expect(result.hotspots).toHaveLength(110);
    expect(
      filterHotspots(result.hotspots, {
        province: "CN-AH",
        text: "",
        sort: "recent",
      })[0].id,
    ).toBe("L110");
    expect(result.hotspots[0]).toHaveProperty("allTimeSpeciesCount");
    expect(result.hotspots[0]).not.toHaveProperty("speciesCount");
  });
});

describe("request queue", () => {
  it("shares the concurrency limit between regional names and observations, including rate limits", async () => {
    const finish: ((response: Response) => void)[] = [];
    const request = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish.push(resolve);
        }),
    );
    vi.stubGlobal("fetch", request);
    const client = new RecentClient("key");
    const jobs = [601, 602, 603].map((id) =>
      client.load(location(`L${id}`), { force: true }),
    );
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    const names = client.loadRegionNames(
      normalizeHotspots([
        {
          locId: "L1",
          locName: "湿地",
          lat: 31,
          lng: 117,
          numSpeciesAllTime: 10,
          subnational1Code: "CN-AH",
        },
      ]),
    );
    const rejected = expect(names).rejects.toMatchObject({ status: 429 });
    expect(request).toHaveBeenCalledTimes(3);
    finish.shift()!(new Response("[]"));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(4));
    // The three current transports are two locations and the first region lookup.
    finish.pop()!(new Response("", { status: 429 }));
    await rejected;
    await expect(
      client.load(location("L604"), { force: true }),
    ).rejects.toMatchObject({ status: 429 });
    expect(request).toHaveBeenCalledTimes(4);
    finish.splice(0).forEach((resolve) => resolve(new Response("[]")));
    await Promise.all(jobs);
  });
  it("caps concurrent requests at three and prioritizes a selected location", async () => {
    const queue = new RequestQueue(3);
    const started: number[] = [];
    const finish: (() => void)[] = [];
    const work = (i: number) => () =>
      new Promise<number>((resolve) => {
        started.push(i);
        finish.push(() => resolve(i));
      });
    const jobs = [0, 1, 2, 3].map((i) => queue.run(String(i), work(i)));
    const selected = queue.run("4", work(4), undefined, true);
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2]));
    finish.shift()!();
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 4]));
    while (finish.length) finish.shift()!();
    await vi.waitFor(() => expect(started).toContain(3));
    finish.shift()!();
    await Promise.all([...jobs, selected]);
  });
  it("merges identical queries but canceling one consumer does not cancel the other", async () => {
    const queue = new RequestQueue(3);
    let finish!: (value: number) => void;
    const work = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const a = queue.run("same", work, controller.signal);
    const b = queue.run("same", work);
    const rejected = expect(a).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    finish(42);
    await rejected;
    expect(await b).toBe(42);
    expect(work).toHaveBeenCalledOnce();
  });
  it("halts pending jobs after a rate limit and resumes only when requested", async () => {
    const queue = new RequestQueue(1);
    const rateLimit = Object.assign(new Error("限流"), { status: 429 });
    const pending = vi.fn(async () => 2);
    const a = queue.run("a", async () => {
      throw rateLimit;
    });
    const b = queue.run("b", pending);
    await expect(a).rejects.toMatchObject({ status: 429 });
    await expect(b).rejects.toMatchObject({ status: 429 });
    expect(pending).not.toHaveBeenCalled();
    queue.resume();
    expect(await queue.run("b", pending)).toBe(2);
  });
});
