import { invoke, isTauri } from "@tauri-apps/api/core";

const API_KEY_STORAGE_KEY = "bird:ebird-api-key";

function legacyDesktopKey(): string | null {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function clearLegacyDesktopKey(): void {
  if (legacyDesktopKey() === null) return;
  try {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    throw new Error("无法清除旧版保存在站点数据中的 API Key");
  }
}

export async function readApiKey(): Promise<string> {
  if (isTauri()) {
    const saved = (await invoke<string | null>("load_api_key"))?.trim() ?? "";
    const legacy = legacyDesktopKey();
    if (legacy === null) return saved;
    const oldKey = legacy.trim();
    if (!saved && oldKey) await invoke("save_api_key", { key: oldKey });
    clearLegacyDesktopKey();
    return saved || oldKey;
  }
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export async function saveApiKey(value: string): Promise<string> {
  const key = value.trim();
  if (!key) throw new Error("API Key 不能为空");
  if (isTauri()) {
    await invoke("save_api_key", { key });
    clearLegacyDesktopKey();
  } else localStorage.setItem(API_KEY_STORAGE_KEY, key);
  return key;
}

export async function clearApiKey(): Promise<void> {
  if (isTauri()) {
    clearLegacyDesktopKey();
    await invoke("clear_api_key");
  } else localStorage.removeItem(API_KEY_STORAGE_KEY);
}
