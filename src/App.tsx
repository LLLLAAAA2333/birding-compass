import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { BirdMap } from "./components/BirdMap";
import { CITIES, fetchRecent, readSnapshot, type City, type Snapshot } from "./lib/data";
import { groupByLocation, type BirdPlace, type Observation } from "./lib/ebird";
import styles from "./App.module.css";

type CityId = City["id"];
type Snapshots = Record<CityId, Snapshot | null>;
type Errors = Record<CityId, string | null>;

const emptyErrors: Errors = { hefei: null, nanjing: null };

function cachedSnapshots(days: number, radiusKm: number): Snapshots {
  return {
    hefei: readSnapshot(CITIES[0], days, radiusKm),
    nanjing: readSnapshot(CITIES[1], days, radiusKm),
  };
}

function compactDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (!match) return value;
  const year = Number(match[1]) === new Date().getFullYear() ? "" : `${match[1]}年`;
  return `${year}${Number(match[2])}月${Number(match[3])}日${match[4] ? ` ${match[4]}:${match[5]}` : ""}`;
}

function updatedLabel(snapshot: Snapshot | null): string {
  if (!snapshot) return "尚无本地记录";
  const when = new Date(snapshot.fetchedAt);
  const formatted = new Intl.DateTimeFormat("zh-CN", {
    year: when.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(when);
  const stale = Date.now() - when.getTime() > 6 * 60 * 60 * 1000;
  return `${stale ? "缓存于" : "更新于"} ${formatted}`;
}

async function openExternal(url: string) {
  if (isTauri()) await openUrl(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

function PlaceRow({ place, selected, onClick }: { place: BirdPlace; selected: boolean; onClick: () => void }) {
  return (
    <button className={`${styles.placeRow} ${selected ? styles.placeRowSelected : ""}`} onClick={onClick} type="button">
      <span className={styles.placeIndex} aria-hidden="true">✦</span>
      <span className={styles.placeText}>
        <span className={styles.placeName}>{place.name}</span>
        <span className={styles.placeSpecies}>
          {place.observations.slice(0, 3).map((item) => item.commonName).join(" · ")}
          {place.observations.length > 3 ? ` 等 ${place.observations.length} 种` : ""}
        </span>
        <span className={styles.placeTime}>最近记录 {compactDate(place.latestAt)}</span>
      </span>
      <span className={styles.placeCount}>{place.observations.length.toString().padStart(2, "0")}</span>
    </button>
  );
}

function SpeciesRow({ observation }: { observation: Observation }) {
  return (
    <div className={styles.speciesRow}>
      <span>
        <strong>{observation.commonName}</strong>
        <small>{observation.scientificName}</small>
      </span>
      <span className={styles.speciesMeta}>
        {compactDate(observation.observedAt)}
        {observation.count !== null ? ` · ${observation.count} 只` : ""}
        {observation.checklistUrl && (
          <button type="button" className={styles.sourceLink} onClick={() => void openExternal(observation.checklistUrl!)} aria-label={`打开${observation.commonName}的原始清单`}>
            ↗
          </button>
        )}
      </span>
    </div>
  );
}

function App() {
  const [cityId, setCityId] = useState<CityId>("hefei");
  const [days, setDays] = useState(7);
  const [radiusKm, setRadiusKm] = useState(50);
  const [snapshots, setSnapshots] = useState<Snapshots>(() => cachedSnapshots(7, 50));
  const [errors, setErrors] = useState<Errors>(emptyErrors);
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const requestId = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);

  const city = CITIES.find((item) => item.id === cityId)!;
  const snapshot = snapshots[cityId];
  const places = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    const observations = snapshot?.observations.filter((item) =>
      !text || item.locationName.toLocaleLowerCase().includes(text) ||
      item.commonName.toLocaleLowerCase().includes(text) ||
      item.scientificName.toLocaleLowerCase().includes(text),
    ) ?? [];
    return groupByLocation(observations);
  }, [snapshot, query]);
  const selectedPlace = places.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    requestId.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
    setSnapshots(cachedSnapshots(days, radiusKm));
    setErrors(emptyErrors);
    setLoading(false);
    setSelectedId(null);
  }, [days, radiusKm]);

  useEffect(() => { setSelectedId(null); }, [cityId, query]);
  useEffect(() => () => { requestId.current += 1; activeRequest.current?.abort(); }, []);

  const refresh = useCallback(async (key = apiKey) => {
    if (!key) { setShowKeyDialog(true); return; }
    const id = ++requestId.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setErrors(emptyErrors);
    const results = await Promise.allSettled(CITIES.map((item) => fetchRecent(item, days, radiusKm, key, controller.signal)));
    if (id !== requestId.current) return;
    activeRequest.current = null;
    const nextErrors: Errors = { hefei: null, nanjing: null };
    const updates: Partial<Snapshots> = {};
    results.forEach((result, index) => {
      const cityKey = CITIES[index].id;
      if (result.status === "fulfilled") updates[cityKey] = result.value;
      else nextErrors[cityKey] = result.reason instanceof Error ? result.reason.message : "无法更新鸟讯";
    });
    setSnapshots((previous) => {
      return { ...previous, ...updates };
    });
    setErrors(nextErrors);
    setLoading(false);
  }, [apiKey, days, radiusKm]);

  useEffect(() => {
    if (apiKey) void refresh();
  }, [apiKey, refresh]);

  function submitKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = keyDraft.trim();
    if (!key) return;
    setApiKey(key);
    setKeyDraft("");
    setShowKeyDialog(false);
  }

  function closeKeyDialog() {
    setKeyDraft("");
    setShowKeyDialog(false);
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") { closeKeyDialog(); return; }
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")];
    if (controls.length === 0) return;
    if (event.shiftKey && document.activeElement === controls[0]) {
      event.preventDefault();
      controls[controls.length - 1].focus();
    } else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) {
      event.preventDefault();
      controls[0].focus();
    }
  }

  return (
    <div className={styles.app}>
      <header className={styles.masthead}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">✳</span>
          <span className={styles.brandName}>bird<span>.</span></span>
          <span className={styles.brandDivider} />
          <span className={styles.brandDescription}>个人观鸟地图册</span>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.headerEdition}>FIELD NOTES / 01</span>
          <button className={styles.textButton} type="button" onClick={() => setShowKeyDialog(true)}>{apiKey ? "更换 API Key" : "设置 API Key"}</button>
          <button className={styles.refreshButton} type="button" onClick={() => void refresh()} disabled={loading}>
            <span aria-hidden="true">↻</span>{loading ? "更新中…" : "更新两城鸟讯"}
          </button>
        </div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <div className={styles.intro}>
            <p className={styles.eyebrow}>THE RECENT SIGHTINGS · 近期鸟讯</p>
            <h1>最近，<br /><em>哪里有鸟？</em></h1>
            <p className={styles.introNote}>先看看周围的记录，再决定今天往哪里走。</p>
          </div>

          <div className={styles.cityTabs} role="tablist" aria-label="选择城市">
            {CITIES.map((item) => {
              const citySnapshot = snapshots[item.id];
              return (
                <button key={item.id} type="button" role="tab" aria-selected={cityId === item.id}
                  className={`${styles.cityTab} ${cityId === item.id ? styles.cityTabActive : ""}`}
                  onClick={() => { setCityId(item.id); setQuery(""); }}>
                  <span>{item.name}</span><small>{citySnapshot ? `${citySnapshot.observations.length} 种` : "待更新"}</small>
                </button>
              );
            })}
          </div>

          <div className={styles.filters}>
            <div className={styles.filterLine}>
              <span>最近</span>
              <div className={styles.segmented} aria-label="记录时间范围">
                {[3, 7, 14, 30].map((value) => <button key={value} type="button" aria-pressed={days === value}
                  className={days === value ? styles.segmentActive : ""} onClick={() => setDays(value)}>{value}天</button>)}
              </div>
            </div>
            <div className={styles.filterLine}>
              <span>范围</span>
              <div className={styles.segmented} aria-label="城市中心查询半径">
                {[10, 25, 50].map((value) => <button key={value} type="button" aria-pressed={radiusKm === value}
                  className={radiusKm === value ? styles.segmentActive : ""} onClick={() => setRadiusKm(value)}>{value}km</button>)}
              </div>
            </div>
            <label className={styles.searchBox}>
              <span aria-hidden="true">⌕</span>
              <input aria-label="搜索鸟种或地点" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索鸟种或地点" />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="清除搜索">×</button>}
            </label>
          </div>

          <div className={styles.listHead}>
            <span>观测地点 <b>{places.length.toString().padStart(2, "0")}</b></span>
            <small>{snapshot ? updatedLabel(snapshot) : "尚未连接 eBird"}</small>
          </div>

          <div className={styles.placeList}>
            {errors[cityId] && <div className={styles.errorNotice} role="alert">{errors[cityId]}{snapshot && <span> · 已保留上次记录</span>}</div>}
            {snapshot && Date.now() - Date.parse(snapshot.fetchedAt) > 24 * 60 * 60 * 1000 && <div className={styles.staleNotice}>这是超过一天的缓存；出发前请重新更新。</div>}
            {places.length > 0 ? places.map((place) => <PlaceRow key={place.id} place={place} selected={selectedId === place.id} onClick={() => setSelectedId(place.id)} />) : (
              <div className={styles.emptyState}>
                <span className={styles.emptySymbol} aria-hidden="true">✳</span>
                <h2>{!snapshot ? "从这里开始" : query ? "没有找到匹配记录" : "此范围暂无记录"}</h2>
                <p>{!snapshot ? "输入你的 eBird API Key，获取合肥与南京的近期鸟讯。" : query ? "换一个鸟名或地点试试。" : "可扩大时间或距离范围，再更新一次。"}</p>
                {!snapshot && <button type="button" onClick={() => setShowKeyDialog(true)}>连接 eBird <span>↗</span></button>}
              </div>
            )}
          </div>

          <footer className={styles.sidebarFooter}>
            <button type="button" className={styles.sourceAttribution} onClick={() => void openExternal("https://ebird.org")}>数据来源 eBird.org ↗</button>
            <span>每种鸟在所选范围内的最近一条公开记录；不是全部观测清单。地点和时间仅供出行参考。</span>
          </footer>
        </aside>

        <main className={styles.mapPanel}>
          <BirdMap city={city} radiusKm={radiusKm} places={places} selectedId={selectedId} onSelect={setSelectedId} />
          <div className={styles.mapTopLeft}>
            <span className={styles.mapLabel}>MAP / {city.name.toUpperCase()}</span>
            <strong>{city.name}及周边</strong>
            <small>市中心半径 {radiusKm} 公里 · 最近 {days} 天</small>
          </div>
          <div className={styles.mapTopRight}><span className={styles.liveDot} />{loading ? "正在获取记录" : snapshot ? `${snapshot.observations.length} 种鸟 · ${groupByLocation(snapshot.observations).length} 个地点` : "等待鸟讯"}</div>
          {selectedPlace && <section className={styles.detailPanel} aria-label={`${selectedPlace.name}地点详情`}>
            <div className={styles.detailHeading}>
              <div><span className={styles.detailEyebrow}>SELECTED LOCATION · 地点详情</span><h2>{selectedPlace.name}</h2><p>最近记录 {compactDate(selectedPlace.latestAt)} · {selectedPlace.observations.length} 种鸟</p></div>
              <button className={styles.closeDetail} type="button" aria-label="关闭地点详情" onClick={() => setSelectedId(null)}>×</button>
            </div>
            <div className={styles.speciesList}>{selectedPlace.observations.map((item) => <SpeciesRow key={`${item.speciesCode}-${item.locationId}`} observation={item} />)}</div>
          </section>}
          <div className={styles.mapScaleNote}>◉ 图钉代表有近期公开记录的地点</div>
        </main>
      </div>

      {showKeyDialog && <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) closeKeyDialog(); }}>
        <section className={styles.keyDialog} role="dialog" aria-modal="true" aria-labelledby="key-dialog-title" onKeyDown={handleDialogKeyDown}>
          <button type="button" className={styles.dialogClose} aria-label="关闭" onClick={closeKeyDialog}>×</button>
          <span className={styles.dialogKicker}>CONNECT TO EBIRD</span>
          <h2 id="key-dialog-title">接入你的鸟讯</h2>
          <p>填入个人 eBird API Key 后，软件会从官方接口更新合肥和南京的近期公开记录。密钥只在本次运行期间保留在内存中，关闭软件后需要重新输入。</p>
          <form onSubmit={submitKey}>
            <label htmlFor="api-key">eBird API Key</label>
            <input id="api-key" type="password" autoComplete="off" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} placeholder="粘贴 API Key" autoFocus />
            <button type="submit" disabled={!keyDraft.trim()}>保存并更新两城 <span>↗</span></button>
          </form>
          <small>仅使用 eBird 官方数据；中国观鸟记录中心暂未接入。</small>
        </section>
      </div>}
    </div>
  );
}

export default App;
