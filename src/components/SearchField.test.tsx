// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SearchField } from "./SearchField";
import { readSearchHistory, rememberSearch } from "../lib/searchHistory";
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function Harness({
  onSearch = () => {},
}: {
  onSearch?: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <SearchField
      name="鸟点"
      label="筛选鸟点"
      placeholder="地点名称"
      scope="national:places"
      value={value}
      onChange={setValue}
      onSearch={onSearch}
    />
  );
}

it("records form submissions, not typing, and does not search when clearing history", () => {
  const search = vi.fn();
  render(<Harness onSearch={search} />);
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "  湿地  " } });
  expect(readSearchHistory("national:places")).toEqual([]);
  fireEvent.submit(screen.getByRole("search"));
  expect(search).toHaveBeenCalledWith("湿地");
  expect(readSearchHistory("national:places")).toEqual(["湿地"]);
  fireEvent.click(screen.getByRole("button", { name: "鸟点搜索历史" }));
  fireEvent.click(screen.getByRole("button", { name: "清空历史" }));
  expect(readSearchHistory("national:places")).toEqual([]);
  expect((input as HTMLInputElement).value).toBe("湿地");
  expect(search).toHaveBeenCalledTimes(1);
});

it("keeps Chinese input composition from submitting and closes history with Escape", () => {
  render(<Harness />);
  const input = screen.getByRole("textbox");
  expect(
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229, isComposing: true }),
  ).toBe(false);
  const toggle = screen.getByRole("button", { name: "鸟点搜索历史" });
  fireEvent.click(toggle);
  fireEvent.keyDown(toggle, { key: "Escape" });
  expect(screen.queryByRole("region", { name: "鸟点搜索历史记录" })).toBeNull();
  expect(document.activeElement).toBe(toggle);
});

it("does not submit empty input and restores the input when clearing a query", () => {
  const search = vi.fn();
  render(<Harness onSearch={search} />);
  fireEvent.submit(screen.getByRole("search"));
  expect(search).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "湿地" } });
  fireEvent.click(screen.getByRole("button", { name: "清空鸟点搜索" }));
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
  expect(document.activeElement).toBe(screen.getByRole("textbox"));
});

it("dismisses history on outside clicks without deleting it", () => {
  rememberSearch("national:places", "湿地");
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "鸟点搜索历史" }));
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("button", { name: "再次搜索：湿地" })).toBeNull();
  expect(readSearchHistory("national:places")).toEqual(["湿地"]);
});
