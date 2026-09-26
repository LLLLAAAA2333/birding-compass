// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AreaPicker } from "./AreaPicker";
const { searchAreas } = vi.hoisted(() => ({
  searchAreas: vi.fn(async (_term: string, _signal?: AbortSignal) => []),
}));
vi.mock("../lib/areas", async (original) => ({
  ...(await original<typeof import("../lib/areas")>()),
  searchAreas,
}));
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("replays the saved city term instead of the draft, and deletion leaves followed cities alone", async () => {
  const onChange = vi.fn();
  render(
    <AreaPicker
      areas={[{ id: "hefei", name: "合肥", latitude: 31, longitude: 117 }]}
      areaId="hefei"
      onSelect={() => {}}
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "添加城市" }));
  fireEvent.change(screen.getByRole("textbox", { name: "搜索地区" }), {
    target: { value: "南京" },
  });
  fireEvent.click(screen.getByRole("button", { name: "搜索地区" }));
  await screen.findByText("没有找到该地区，请试试完整城市名。");
  fireEvent.change(screen.getByRole("textbox", { name: "搜索地区" }), {
    target: { value: "北京" },
  });
  fireEvent.click(screen.getByRole("button", { name: "地区搜索历史" }));
  fireEvent.click(screen.getByRole("button", { name: "再次搜索：南京" }));
  await waitFor(() => expect(searchAreas).toHaveBeenCalledTimes(2));
  expect(searchAreas.mock.calls[1][0]).toBe("南京");
  fireEvent.click(screen.getByRole("button", { name: "地区搜索历史" }));
  fireEvent.click(screen.getByRole("button", { name: "删除搜索记录：南京" }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("option", { name: "合肥" })).toBeTruthy();
});
