import Papa from "papaparse";
import { DailySpeciesAccumulator, type DailySpeciesSummary } from "./dailySpecies";

const DB_NAME = "bird-daily-species-v1";
const STORE_NAME = "summaries";
const LAST_DATE_KEY = "bird:daily:last-date:v1";

export function lastImportedDate(): string | null {
  try {
    const date = localStorage.getItem(LAST_DATE_KEY);
    return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  } catch { return null; }
}

export function importEbdDay(
  file: File,
  date: string,
  onProgress: (rows: number) => void,
  signal?: AbortSignal,
): Promise<DailySpeciesSummary> {
  if (!/\.(txt|tsv)$/i.test(file.name)) return Promise.reject(new Error("请先解压 EBD，选择其中的 .txt 或 .tsv 文件"));
  if (signal?.aborted) return Promise.reject(new DOMException("Import cancelled", "AbortError"));

  return new Promise((resolve, reject) => {
    let counter: DailySpeciesAccumulator | null = null;
    let rowsSeen = 0;
    let finished = false;
    let currentParser: Papa.Parser | null = null;
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const fail = (error: unknown) => {
      if (finished) return;
      finished = true;
      currentParser?.abort();
      cleanup();
      reject(error);
    };
    const abort = () => fail(new DOMException("Import cancelled", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });

    Papa.parse<string[]>(file, {
      delimiter: "\t",
      chunkSize: 1024 * 1024,
      skipEmptyLines: true,
      chunk: (result, parser) => {
        currentParser = parser;
        if (finished) { parser.abort(); return; }
        try {
          const malformed = result.errors[0];
          if (malformed) throw new Error(`EBD 文件解析失败：${malformed.message}`);
          let rows = result.data;
          if (!counter) {
            if (rows.length === 0) throw new Error("EBD 文件为空");
            counter = new DailySpeciesAccumulator(date, rows[0]);
            rows = rows.slice(1);
          }
          counter.addRows(rows);
          rowsSeen += rows.length;
          onProgress(rowsSeen);
        } catch (error) { fail(error); }
      },
      complete: () => {
        if (finished) return;
        cleanup();
        const summary = counter?.finish(file.name, file.size);
        if (!summary) { fail(new Error("EBD 文件为空")); return; }
        if (summary.species.length === 0) { fail(new Error("文件中没有这一天的中国已审核物种记录，请检查日期和文件范围")); return; }
        finished = true;
        resolve(summary);
      },
      error: (error) => fail(error),
    });
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "date" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地数据存储"));
  });
}

export async function readDailySummary(date: string): Promise<DailySpeciesSummary | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(date);
      request.onsuccess = () => {
        const value: unknown = request.result;
        if (!value || typeof value !== "object" || !("date" in value) || value.date !== date || !("species" in value) || !Array.isArray(value.species)) resolve(null);
        else resolve(value as DailySpeciesSummary);
      };
      request.onerror = () => reject(request.error ?? new Error("读取本地榜单失败"));
    });
  } finally { db.close(); }
}

export async function saveDailySummary(summary: DailySpeciesSummary): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(summary);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("保存本地榜单失败"));
      transaction.onabort = () => reject(transaction.error ?? new Error("保存本地榜单失败"));
    });
    try { localStorage.setItem(LAST_DATE_KEY, summary.date); } catch { /* The imported summary remains available. */ }
  } finally { db.close(); }
}
