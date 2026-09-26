import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  clearSearchHistory,
  deleteSearch,
  readSearchHistory,
  rememberSearch,
} from "./searchHistory";
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
  clearSearchHistory("cities");
});
afterEach(() => vi.unstubAllGlobals());

it("keeps ten newest nonempty searches and moves duplicates to the front", () => {
  for (let i = 0; i < 12; i++) rememberSearch("national:places", `地点${i}`);
  rememberSearch("national:places", "  地点5  ");
  expect(rememberSearch("national:places", "  ")).toHaveLength(10);
  expect(readSearchHistory("national:places").slice(0, 3)).toEqual([
    "地点5",
    "地点11",
    "地点10",
  ]);
  rememberSearch("target:species", "Little  Egret");
  expect(rememberSearch("target:species", "little egret")).toEqual([
    "little egret",
  ]);
});

it("deletes only the chosen scope and persists a complete clear", () => {
  rememberSearch("city:places", "湿地");
  rememberSearch("national:places", "湿地");
  expect(deleteSearch("city:places", "湿地")).toEqual([]);
  expect(readSearchHistory("national:places")).toEqual(["湿地"]);
  clearSearchHistory("national:places");
  expect(readSearchHistory("national:places")).toEqual([]);
});

it("rejects corrupt stored values and bounds oversized terms", () => {
  localStorage.setItem("bird:search-history:v1:cities", "broken-json");
  expect(readSearchHistory("cities")).toEqual([]);
  localStorage.setItem(
    "bird:search-history:v1:cities",
    JSON.stringify([null, {}, 1, " 合肥 ", "", "合肥", "南".repeat(100)]),
  );
  expect(readSearchHistory("cities")).toEqual(["合肥", "南".repeat(80)]);
});

it("remains usable in the current session when local storage is unavailable", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("quota");
    },
  });
  expect(rememberSearch("cities", "合肥")).toEqual(["合肥"]);
  expect(readSearchHistory("cities")).toEqual(["合肥"]);
  expect(clearSearchHistory("cities")).toEqual([]);
});
