import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const CACHE_KEY = "bird:taxonomy:zh-sim:v1";
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const URL = "https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=json&locale=zh_SIM&cat=species";

export type ChineseNames = Record<string, string>;

function cachedNames(): { names: ChineseNames; savedAt: number } | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
    if (!value || typeof value !== "object" || !("names" in value) || !("savedAt" in value)) return null;
    if (!value.names || typeof value.names !== "object" || Array.isArray(value.names) || typeof value.savedAt !== "number") return null;
    const names = Object.fromEntries(Object.entries(value.names)
      .filter(([scientific, name]) => scientific.length < 160 && typeof name === "string" && name.length < 100)) as ChineseNames;
    return { names, savedAt: value.savedAt };
  } catch { return null; }
}

export function readChineseNames(): ChineseNames { return cachedNames()?.names ?? {}; }

export async function fetchChineseNames(signal?: AbortSignal): Promise<ChineseNames> {
  const cached = cachedNames();
  if (cached && Date.now() - cached.savedAt < MAX_AGE) return cached.names;
  const requestUrl = isTauri() ? URL : URL.replace("https://api.ebird.org", "/api/ebird");
  try {
    const response = await (isTauri() ? tauriFetch : globalThis.fetch)(requestUrl, { signal });
    if (!response.ok) throw new Error(`鸟种名称请求失败（${response.status}）`);
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new Error("鸟种名称格式无法识别");
    const names: ChineseNames = {};
    for (const item of payload) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      if (typeof row.sciName !== "string" || typeof row.comName !== "string") continue;
      if (row.sciName && row.comName && /[\u3400-\u9fff]/.test(row.comName)) names[row.sciName] = row.comName;
    }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ names, savedAt: Date.now() })); } catch { /* Use names for this session. */ }
    return names;
  } catch (error) {
    if (signal?.aborted) throw error;
    return cached?.names ?? {};
  }
}

export type Species = { speciesCode: string; commonName: string; englishName: string; scientificName: string };
const CATALOG_KEY = 'bird:taxonomy:catalog:v1';
export function mergeTaxonomy(chinese: unknown, english: unknown): Species[] {
  const rows = (value: unknown) => Array.isArray(value) ? value.filter((item): item is Record<string, string> => item && typeof item === 'object' && typeof item.speciesCode === 'string' && /^[a-z0-9]+$/.test(item.speciesCode) && typeof item.comName === 'string' && typeof item.sciName === 'string' && (!item.category || item.category === 'species')) : [];
  const translations = new Map(rows(chinese).map(item => [item.speciesCode, item.comName]));
  return rows(english).map(item => ({ speciesCode: item.speciesCode, commonName: translations.get(item.speciesCode) || item.comName, englishName: item.comName, scientificName: item.sciName }));
}
export function searchSpecies(catalog: Species[], text: string): Species[] {
  const term = text.trim().toLocaleLowerCase();
  if (!term) return [];
  return catalog.filter(item => [item.commonName, item.englishName, item.scientificName].some(name => name.toLocaleLowerCase().includes(term))).slice(0, 30);
}
function readCatalog(): { species: Species[]; savedAt: number } | null {
  try {
    const value = JSON.parse(localStorage.getItem(CATALOG_KEY) ?? 'null');
    if (!value || !Array.isArray(value.species) || typeof value.savedAt !== 'number') return null;
    return { savedAt: value.savedAt, species: value.species.filter((s: Species) => s && typeof s.speciesCode === 'string' && /^[a-z0-9]+$/.test(s.speciesCode) && ['commonName', 'englishName', 'scientificName'].every(key => typeof s[key as keyof Species] === 'string')) };
  } catch { return null; }
}
export async function fetchSpeciesCatalog(signal?: AbortSignal): Promise<Species[]> {
  const cached = readCatalog();
  if (cached?.species.length && Date.now() - cached.savedAt < MAX_AGE) return cached.species;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 20000);
  try {
    const read = async (locale: string) => {
      const url = `https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=json&locale=${locale}&cat=species`;
      const response = await (isTauri() ? tauriFetch : globalThis.fetch)(isTauri() ? url : url.replace('https://api.ebird.org', '/api/ebird'), { signal: controller.signal });
      if (!response.ok) throw new Error(`鸟种目录请求失败（${response.status}）`);
      return response.json();
    };
    const [chinese, english] = await Promise.all([read('zh_SIM'), read('en')]);
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    const species = mergeTaxonomy(chinese, english);
    if (!species.length) throw new Error('鸟种目录暂无可用数据');
    try { localStorage.setItem(CATALOG_KEY, JSON.stringify({ species, savedAt: Date.now() })); } catch { /* Use live catalog. */ }
    return species;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    if (cached?.species.length) return cached.species;
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
