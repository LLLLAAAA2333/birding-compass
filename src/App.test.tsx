// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import App from "./App";
const { clients } = vi.hoisted(() => ({ clients: [] as object[] }));
vi.mock("./lib/recentData", () => ({
  RecentClient: class {
    constructor() {
      clients.push(this);
    }
  },
}));
vi.mock("./lib/settings", () => ({ readApiKey: async () => "test-key" }));
vi.mock("./components/RecentWorkspace", () => ({
  RecentWorkspace: ({ client, mode }: { client: object; mode: string }) => (
    <main>
      {mode}
      <span data-testid="client">{clients.indexOf(client)}</span>
    </main>
  ),
}));
vi.mock("./components/SettingsPage", () => ({
  SettingsPage: ({ onClose }: { onClose: () => void }) => (
    <button onClick={onClose}>返回鸟讯</button>
  ),
}));
vi.mock("./components/HistoryView", () => ({
  HistoryView: () => <main>历史导入保留</main>,
}));
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    clear: () => values.clear(),
  });
  clients.length = 0;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("keeps the same client and rate-limit state across navigation and settings", async () => {
  render(<App />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "更新鸟讯" })).toBeTruthy(),
  );
  const client = screen.getByTestId("client").textContent;
  const count = clients.length;
  fireEvent.click(screen.getByRole("button", { name: "我的城市" }));
  fireEvent.click(screen.getByRole("button", { name: "个人配置" }));
  fireEvent.click(screen.getByRole("button", { name: "返回鸟讯" }));
  expect(screen.getByTestId("client").textContent).toBe(client);
  expect(clients).toHaveLength(count);
});
it("opens national discovery by default and never persists history as the startup view", async () => {
  render(<App />);
  await screen.findByText("national");
  fireEvent.click(screen.getByRole("button", { name: "历史分析" }));
  expect(screen.getByText("历史导入保留")).toBeTruthy();
  expect(JSON.parse(localStorage.getItem("bird:view:v1")!).view).toBe(
    "national",
  );
});
it("restores an existing followed city without rewriting its stored data", async () => {
  const saved = JSON.stringify([
    { id: "city", name: "合肥", latitude: 31, longitude: 117 },
  ]);
  localStorage.setItem("bird:followed-areas:v1", saved);
  localStorage.setItem(
    "bird:view:v1",
    JSON.stringify({ view: "city", areaId: "city", days: 14, radiusKm: 25 }),
  );
  render(<App />);
  expect(await screen.findByText("city")).toBeTruthy();
  expect(localStorage.getItem("bird:followed-areas:v1")).toBe(saved);
});
