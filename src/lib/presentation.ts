import { invoke, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { appleMapsUrl } from "./appleMaps";
export function compactDate(value?: string | null): string {
  if (!value) return "暂无观测日期";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!match) return value;
  return `${Number(match[1]) === new Date().getFullYear() ? "" : `${match[1]}年`}${Number(match[2])}月${Number(match[3])}日${match[4] ? ` ${match[4]}:${match[5]}` : ""}`;
}
export function fetchedLabel(value?: string): string {
  return value
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "尚未更新";
}
export const isStale = (value?: string) =>
  Boolean(value && Date.now() - Date.parse(value) > 24 * 60 * 60 * 1000);
export async function openExternal(url: string) {
  if (isTauri()) await openUrl(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}
export async function openMap(
  name: string,
  latitude: number,
  longitude: number,
) {
  const url = appleMapsUrl(name, latitude, longitude);
  if (isTauri()) {
    try {
      await invoke("open_apple_maps", { url });
      return;
    } catch {
      /* Fall back to the standard URL opener. */
    }
  }
  const map = new URL("https://www.openstreetmap.org/");
  map.searchParams.set("mlat", String(latitude));
  map.searchParams.set("mlon", String(longitude));
  map.hash = `map=15/${latitude}/${longitude}`;
  await openExternal(map.toString());
}
