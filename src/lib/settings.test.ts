import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearApiKey, readApiKey, saveApiKey } from "./settings";

const tauri = vi.hoisted(() => ({ enabled: false, invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => tauri.enabled,
  invoke: tauri.invoke,
}));

describe("saved eBird API Key", () => {
  const saved = new Map<string, string>();

  beforeEach(() => {
    saved.clear();
    tauri.enabled = false;
    tauri.invoke.mockReset();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => { saved.set(key, value); },
      removeItem: (key: string) => { saved.delete(key); },
    });
  });

  it("survives a new browser read and can be removed", async () => {
    expect(await readApiKey()).toBe("");
    expect(await saveApiKey("  my-ebird-key  ")).toBe("my-ebird-key");
    expect(await readApiKey()).toBe("my-ebird-key");
    await clearApiKey();
    expect(await readApiKey()).toBe("");
  });

  it("rejects an empty key without erasing the saved one", async () => {
    await saveApiKey("existing-key");
    await expect(saveApiKey("  ")).rejects.toThrow("API Key 不能为空");
    expect(await readApiKey()).toBe("existing-key");
  });

  it("uses the desktop credential commands without writing localStorage", async () => {
    tauri.enabled = true;
    tauri.invoke.mockImplementation(async (command: string) => command === "load_api_key" ? "desktop-key" : undefined);
    expect(await readApiKey()).toBe("desktop-key");
    expect(await saveApiKey("  replacement-key  ")).toBe("replacement-key");
    await clearApiKey();
    expect(tauri.invoke.mock.calls).toEqual([
      ["load_api_key"],
      ["save_api_key", { key: "replacement-key" }],
      ["clear_api_key"],
    ]);
    expect(saved.size).toBe(0);
  });

  it("does not fall back to plain storage when the desktop credential store fails", async () => {
    tauri.enabled = true;
    tauri.invoke.mockRejectedValue(new Error("Keychain unavailable"));
    await expect(saveApiKey("private-key")).rejects.toThrow("Keychain unavailable");
    expect(saved.size).toBe(0);
  });

  it("moves a legacy desktop key to Keychain before removing its plain copy", async () => {
    tauri.enabled = true;
    saved.set("bird:ebird-api-key", "old-desktop-key");
    tauri.invoke.mockResolvedValue(undefined);
    expect(await readApiKey()).toBe("old-desktop-key");
    expect(tauri.invoke.mock.calls).toEqual([
      ["load_api_key"],
      ["save_api_key", { key: "old-desktop-key" }],
    ]);
    expect(saved.size).toBe(0);
  });

  it("clears a legacy plain copy when the Keychain already has a key", async () => {
    tauri.enabled = true;
    saved.set("bird:ebird-api-key", "old-desktop-key");
    tauri.invoke.mockResolvedValue("current-key");
    expect(await readApiKey()).toBe("current-key");
    expect(tauri.invoke.mock.calls).toEqual([["load_api_key"]]);
    expect(saved.size).toBe(0);
  });

  it("keeps the legacy key if migration to Keychain fails", async () => {
    tauri.enabled = true;
    saved.set("bird:ebird-api-key", "old-desktop-key");
    tauri.invoke.mockImplementation(async (command: string) => {
      if (command === "load_api_key") return null;
      throw new Error("Keychain unavailable");
    });
    await expect(readApiKey()).rejects.toThrow("Keychain unavailable");
    expect(saved.get("bird:ebird-api-key")).toBe("old-desktop-key");
  });
});
