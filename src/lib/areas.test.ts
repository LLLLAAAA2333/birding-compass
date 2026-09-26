import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeAreaResults, readFollowedAreas, searchAreas, writeFollowedAreas } from "./areas";

afterEach(() => vi.unstubAllGlobals());

describe("area search and follows", () => {
  it("accepts named places with valid coordinates and stable ids", () => {
    expect(normalizeAreaResults({ results: [
      { id: 123, name: "合肥", admin1: "安徽", country: "中国", latitude: 31.82, longitude: 117.23 },
      { id: 456, name: "坏坐标", latitude: 200, longitude: 117 },
    ] })).toEqual([{ id: "geonames:123", name: "合肥", description: "安徽 · 中国", latitude: 31.82, longitude: 117.23 }]);
  });

  it("searches only on explicit submit and encodes the query", async () => {
    const request = vi.fn(async (_url: RequestInfo | URL) => new Response(JSON.stringify({ results: [{ id: 123, name: "合肥", admin1: "安徽", country: "中国", latitude: 31.82, longitude: 117.23 }] }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    expect((await searchAreas(" 合肥 ")).map((item) => item.name)).toEqual(["合肥"]);
    expect(String(request.mock.calls[0][0])).toContain("name=%E5%90%88%E8%82%A5");
  });

  it("persists followed areas and discards malformed saved entries", () => {
    const saved = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => { saved.set(key, value); },
    });
    const area = { id: "geonames:123", name: "合肥", latitude: 31.82, longitude: 117.23 };
    writeFollowedAreas([area]);
    expect(readFollowedAreas()).toEqual([area]);
    saved.set("bird:followed-areas:v1", JSON.stringify([area, { ...area, latitude: 200 }]));
    expect(readFollowedAreas()).toEqual([area]);
  });
});
