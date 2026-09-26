// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecentWorkspace } from "./RecentWorkspace";
import {
  RecentClient,
  type RecentQuery,
  type RecentResult,
} from "../lib/recentData";
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../lib/recentData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/recentData")>()),
  RecentClient: class {
    load = load;
    resume() {}
    async loadRegionNames() {
      return {};
    }
  },
}));
vi.mock("./BirdMap", () => ({ BirdMap: () => <div>测试地图</div> }));
vi.mock("../lib/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/data")>()),
  fetchRegionNames: async () => ({}),
}));
vi.mock("../lib/taxonomy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/taxonomy")>()),
  fetchSpeciesCatalog: async () => [
    {
      speciesCode: "litgre1",
      commonName: "小白鹭",
      englishName: "Little Egret",
      scientificName: "Egretta garzetta",
    },
  ],
}));
beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const area = { id: "city", name: "合肥", latitude: 31, longitude: 117 };
const props = {
  client: new RecentClient("test-only"),
  mode: "national" as const,
  area,
  areas: [area],
  apiKey: "test-only",
  days: 7,
  radiusKm: 50,
  revision: 0,
  onDays: vi.fn(),
  onRadius: vi.fn(),
  onArea: vi.fn(),
  onAreas: vi.fn(),
  onSettings: vi.fn(),
  onRefresh: vi.fn(),
};
const result: RecentResult = {
  hotspots: [],
  observations: [],
  days: 7,
  fetchedAt: new Date().toISOString(),
  limited: false,
  source: "live",
};
const hotspot = (i: number) => ({
  id: `L${i}`,
  name: `鸟点${i}`,
  latitude: 31,
  longitude: 117,
  allTimeSpeciesCount: 999,
  latestAt: "2026-09-26",
  provinceCode: i > 50 ? "CN-AH" : "CN-JS",
  cityCode: null,
  province: i > 50 ? "安徽" : "江苏",
  city: null,
});
it("can filter a province outside the initial 50 and fetch selected hotspot species", async () => {
  load.mockImplementation(async (query: RecentQuery) =>
    query.kind === "hotspots"
      ? {
          ...result,
          hotspots: Array.from({ length: 60 }, (_, i) => hotspot(i + 1)),
        }
      : result,
  );
  render(<RecentWorkspace {...props} />);
  await waitFor(() =>
    expect(
      screen.getByText("已显示 50 / 60 个地点 · 数据来自 eBird"),
    ).toBeTruthy(),
  );
  fireEvent.change(screen.getByRole("combobox", { name: "筛选省份" }), {
    target: { value: "CN-AH" },
  });
  await waitFor(() =>
    expect(
      screen.getByText("已显示 10 / 10 个地点 · 数据来自 eBird"),
    ).toBeTruthy(),
  );
  fireEvent.click(screen.getByRole("button", { name: /鸟点51/ }));
  await waitFor(() =>
    expect(
      load.mock.calls.some(
        ([query]) => query.kind === "location" && query.locationId === "L51",
      ),
    ).toBe(true),
  );
  expect(screen.getByText(/历史累计 999 种/)).toBeTruthy();
});
it("keeps target species selected when changing the time window", async () => {
  load.mockResolvedValue(result);
  const { rerender } = render(<RecentWorkspace {...props} mode="target" />);
  fireEvent.change(screen.getByRole("textbox", { name: "想看什么鸟？" }), {
    target: { value: "Little" },
  });
  fireEvent.click(await screen.findByRole("button", { name: /小白鹭/ }));
  await waitFor(() =>
    expect(
      load.mock.calls.some(
        ([query]) => query.kind === "species" && query.days === 7,
      ),
    ).toBe(true),
  );
  rerender(<RecentWorkspace {...props} mode="target" days={14} />);
  await waitFor(() =>
    expect(
      load.mock.calls.some(
        ([query]) =>
          query.kind === "species" &&
          query.days === 14 &&
          query.speciesCode === "litgre1",
      ),
    ).toBe(true),
  );
});
it("shows failed hotspot detail as unavailable instead of zero species", async () => {
  load.mockImplementation(async (query: RecentQuery) => {
    if (query.kind === "location") throw new Error("连接失败");
    return { ...result, hotspots: [hotspot(1)] };
  });
  render(<RecentWorkspace {...props} mode="city" />);
  await screen.findByText("查询失败");
  const row = screen.getByRole("button", { name: /鸟点1/ });
  expect(row.textContent).toContain("—");
  expect(row.textContent).not.toContain("0近7天种数");
  fireEvent.click(row);
  expect(await screen.findByText("连接失败")).toBeTruthy();
  expect(screen.getByRole("button", { name: /重试该鸟点/ })).toBeTruthy();
});

it.each(["national", "city"] as const)(
  "submits and reuses persistent place searches in %s",
  async (mode) => {
    load.mockImplementation(async (query: RecentQuery) =>
      query.kind === "hotspots"
        ? { ...result, hotspots: [hotspot(1), hotspot(2)] }
        : result,
    );
    const first = render(<RecentWorkspace {...props} mode={mode} />);
    await screen.findByText("已显示 2 / 2 个地点 · 数据来自 eBird");
    fireEvent.change(screen.getByRole("textbox", { name: "筛选鸟点" }), {
      target: { value: "鸟点2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索鸟点" }));
    expect(
      screen.getByText("已显示 1 / 1 个地点 · 数据来自 eBird"),
    ).toBeTruthy();
    first.unmount();
    render(<RecentWorkspace {...props} mode={mode} />);
    await screen.findByText("已显示 2 / 2 个地点 · 数据来自 eBird");
    fireEvent.click(screen.getByRole("button", { name: "鸟点搜索历史" }));
    fireEvent.click(screen.getByRole("button", { name: "再次搜索：鸟点2" }));
    expect(
      screen.getByText("已显示 1 / 1 个地点 · 数据来自 eBird"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "鸟点搜索历史" }));
    fireEvent.click(
      screen.getByRole("button", { name: "删除搜索记录：鸟点2" }),
    );
    expect(
      screen.queryByRole("button", { name: "再次搜索：鸟点2" }),
    ).toBeNull();
    expect(
      screen.getByText("已显示 1 / 1 个地点 · 数据来自 eBird"),
    ).toBeTruthy();
  },
);

it("searches an exact bird name from the button and restores it from history", async () => {
  load.mockResolvedValue(result);
  const first = render(<RecentWorkspace {...props} mode="target" />);
  fireEvent.change(screen.getByRole("textbox", { name: "想看什么鸟？" }), {
    target: { value: "Little Egret" },
  });
  await screen.findByRole("button", { name: /小白鹭/ });
  fireEvent.click(screen.getByRole("button", { name: "搜索鸟种" }));
  await waitFor(() =>
    expect(
      load.mock.calls.some(
        ([query]) =>
          query.kind === "species" && query.speciesCode === "litgre1",
      ),
    ).toBe(true),
  );
  first.unmount();
  load.mockClear();
  render(<RecentWorkspace {...props} mode="target" />);
  fireEvent.click(screen.getByRole("button", { name: "鸟种搜索历史" }));
  fireEvent.click(
    screen.getByRole("button", { name: "再次搜索：Little Egret" }),
  );
  await waitFor(() =>
    expect(
      load.mock.calls.some(
        ([query]) =>
          query.kind === "species" && query.speciesCode === "litgre1",
      ),
    ).toBe(true),
  );
});
