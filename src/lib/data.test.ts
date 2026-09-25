import { afterEach, describe, expect, it, vi } from "vitest";
import { CITIES, fetchRecent, readSnapshot } from "./data";

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

afterEach(() => vi.unstubAllGlobals());

describe("recent sightings cache", () => {
  it("keeps the API Key out of the cached data", async () => {
    const saved = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => { saved.set(key, value); },
    });
    const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify([bird]), { status: 200 }));
    vi.stubGlobal("fetch", request);

    const snapshot = await fetchRecent(CITIES[0], 7, 50, "test-secret-key");
    expect(snapshot.observations[0].commonName).toBe("乌鸫");
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0]).toContain("/api/ebird/v2/data/obs/geo/recent?");
    expect([...saved.values()].join("")).not.toContain("test-secret-key");
    expect(readSnapshot(CITIES[0], 7, 50)?.observations).toHaveLength(1);
    expect(readSnapshot({ ...CITIES[0], latitude: CITIES[0].latitude + 0.01 }, 7, 50)).toBeNull();
  });

  it("gives a useful message for a rejected key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })));
    await expect(fetchRecent(CITIES[1], 7, 50, "wrong-key")).rejects.toThrow("API Key 无效");
  });

  it("does not send or cache a request cancelled before it starts", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const controller = new AbortController();
    controller.abort();
    await expect(fetchRecent(CITIES[0], 7, 50, "test-key", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(request).not.toHaveBeenCalled();
  });

  it("propagates cancellation to an active network request", async () => {
    const request = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", request);
    const controller = new AbortController();
    const pending = fetchRecent(CITIES[0], 7, 50, "test-key", controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(request).toHaveBeenCalledOnce();
  });
});
