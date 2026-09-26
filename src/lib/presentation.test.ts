import { beforeEach, describe, expect, it, vi } from "vitest";
import { openMap } from "./presentation";

const desktop = vi.hoisted(() => ({ invoke: vi.fn(), openUrl: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: desktop.invoke,
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: desktop.openUrl }));

describe("map opening on desktop", () => {
  beforeEach(() => {
    desktop.invoke.mockReset();
    desktop.openUrl.mockReset();
  });

  it("uses the native Maps app when available", async () => {
    desktop.invoke.mockResolvedValue(undefined);
    await openMap("天鹅湖", 31.816, 117.226);
    expect(desktop.invoke).toHaveBeenCalledWith("open_apple_maps", {
      url: expect.stringContaining("maps.apple.com"),
    });
    expect(desktop.openUrl).not.toHaveBeenCalled();
  });

  it("opens a browser map when the native Maps app is unavailable", async () => {
    desktop.invoke.mockRejectedValue(new Error("unsupported platform"));
    await openMap("天鹅湖", 31.816, 117.226);
    expect(desktop.openUrl).toHaveBeenCalledOnce();
    const url = new URL(desktop.openUrl.mock.calls[0][0]);
    expect(url.origin).toBe("https://www.openstreetmap.org");
    expect(url.searchParams.get("mlat")).toBe("31.816");
    expect(url.searchParams.get("mlon")).toBe("117.226");
  });
});
