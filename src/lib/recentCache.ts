export type CachedRecord = { payload: unknown; fetchedAt: string };
export const RECENT_MAX_AGE = 30 * 60 * 1000;
const DB_NAME = "bird-recent-v1";
const STORE = "responses";
const MAX_ENTRIES = 500;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("本地缓存不可用"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: "key" });
      store.createIndex("fetchedAt", "fetchedAt");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("本地缓存暂不可用"));
  });
}
export async function readRecentCache(
  key: string,
): Promise<CachedRecord | null> {
  let db: IDBDatabase | undefined;
  try {
    db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db!.transaction(STORE).objectStore(STORE).get(key);
      request.onsuccess = () => {
        const value = request.result;
        resolve(
          value &&
            Array.isArray(value.payload) &&
            typeof value.fetchedAt === "string" &&
            Number.isFinite(Date.parse(value.fetchedAt))
            ? value
            : null,
        );
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  } finally {
    db?.close();
  }
}
export async function writeRecentCache(
  key: string,
  value: CachedRecord,
): Promise<void> {
  let db: IDBDatabase | undefined;
  try {
    db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db!.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      store.put({ key, ...value });
      const count = store.count();
      count.onsuccess = () => {
        let excess = count.result - MAX_ENTRIES;
        if (excess <= 0) return;
        const cursor = store.index("fetchedAt").openCursor();
        cursor.onsuccess = () => {
          if (cursor.result && excess-- > 0) {
            cursor.result.delete();
            cursor.result.continue();
          }
        };
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch {
    /* Live results remain usable when persistence is unavailable. */
  } finally {
    db?.close();
  }
}
