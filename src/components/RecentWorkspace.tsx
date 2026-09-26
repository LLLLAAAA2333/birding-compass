import { useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise,
  ArrowDown,
  ArrowRight,
  Binoculars,
  Bird,
  MapPin,
  NavigationArrow,
} from "@phosphor-icons/react";
import { BirdMap } from "./BirdMap";
import { AreaPicker } from "./AreaPicker";
import { BirdDetail } from "./BirdDetail";
import { SearchField } from "./SearchField";
import { rememberSearch } from "../lib/searchHistory";
import { withRegionNames, type Area } from "../lib/data";
import {
  RecentClient,
  distanceKm,
  filterHotspots,
  type RecentQuery,
} from "../lib/recentData";
import {
  fetchSpeciesCatalog,
  searchSpecies,
  type Species,
} from "../lib/taxonomy";
import { useBirdSummaries, useRecentQuery } from "../hooks/useRecentQuery";
import { compactDate, fetchedLabel, isStale } from "../lib/presentation";
import styles from "../App.module.css";
export type RecentMode = "national" | "city" | "target";
type Props = {
  client: RecentClient;
  mode: RecentMode;
  area: Area | null;
  areas: Area[];
  apiKey: string;
  days: number;
  radiusKm: number;
  revision: number;
  onDays: (days: number) => void;
  onRadius: (radius: number) => void;
  onArea: (id: string | null) => void;
  onAreas: (areas: Area[]) => void;
  onSettings: () => void;
  onRefresh: () => void;
};

export function RecentWorkspace(props: Props) {
  const {
    client,
    mode,
    area,
    areas,
    apiKey,
    days,
    radiusKm,
    revision,
    onDays,
    onRadius,
    onArea,
    onAreas,
    onSettings,
    onRefresh,
  } = props;
  const [text, setText] = useState("");
  const [placeDraft, setPlaceDraft] = useState("");
  const [province, setProvince] = useState("");
  const [sort, setSort] = useState<"recent" | "distance">("recent");
  const [limit, setLimit] = useState(mode === "national" ? 50 : 20);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [speciesText, setSpeciesText] = useState("");
  const [speciesSearch, setSpeciesSearch] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Species[]>([]);
  const [species, setSpecies] = useState<Species | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const query: RecentQuery | null =
    mode === "target"
      ? area && species
        ? {
            kind: "species",
            area,
            speciesCode: species.speciesCode,
            radiusKm,
            days,
          }
        : null
      : mode === "city"
        ? area
          ? { kind: "hotspots", area, radiusKm, days }
          : null
        : { kind: "hotspots", days };
  const state = useRecentQuery(client, query, Boolean(apiKey), revision);
  const hotspots = useMemo(
    () => withRegionNames(state.data?.hotspots ?? [], names),
    [state.data, names],
  );
  useEffect(() => {
    if (!state.data?.hotspots.length || !apiKey) return;
    const controller = new AbortController();
    void client
      .loadRegionNames(state.data.hotspots, controller.signal, setNames)
      .then(setNames)
      .catch(() => {});
    return () => controller.abort();
  }, [client, apiKey, state.data?.fetchedAt]);
  useEffect(() => {
    if (mode !== "target") return;
    const controller = new AbortController();
    setCatalogLoading(true);
    setCatalogError("");
    void fetchSpeciesCatalog(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setCatalog(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setCatalogError(
            error instanceof Error ? error.message : "鸟种目录加载失败",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false);
      });
    return () => controller.abort();
  }, [mode, catalogRetry]);
  const filtered = useMemo(
    () => filterHotspots(hotspots, { province, text, sort, area }),
    [hotspots, province, text, sort, area],
  );
  const visibleHotspots = filtered.slice(0, limit);
  const targetRecords = useMemo(
    () =>
      (state.data?.observations ?? [])
        .filter(
          (item) =>
            !text ||
            item.locationName
              .toLocaleLowerCase()
              .includes(text.toLocaleLowerCase()),
        )
        .sort((a, b) =>
          sort === "distance" && area
            ? distanceKm(area, a) - distanceKm(area, b)
            : b.observedAt.localeCompare(a.observedAt),
        ),
    [state.data, text, sort, area],
  );
  const visibleRecords = targetRecords.slice(0, limit);
  const ids =
    mode === "city"
      ? visibleHotspots.map((item) => item.id)
      : mode === "national" && selectedId
        ? [selectedId]
        : [];
  const { summaries, retry } = useBirdSummaries(
    client,
    ids,
    selectedId,
    days,
    Boolean(apiKey),
    revision,
  );
  const selectedHotspot =
    mode !== "target"
      ? visibleHotspots.find((item) => item.id === selectedId)
      : undefined;
  const selectedRecord =
    mode === "target"
      ? visibleRecords.find((item) => item.locationId === selectedId)
      : undefined;
  const hasSelection = Boolean(selectedHotspot || selectedRecord);
  const total = mode === "target" ? targetRecords.length : filtered.length;
  const count =
    mode === "target" ? visibleRecords.length : visibleHotspots.length;
  const points =
    mode === "target"
      ? visibleRecords.map((item) => ({
          id: item.locationId,
          name: item.locationName,
          latitude: item.latitude,
          longitude: item.longitude,
          count: null,
          description: `${item.commonName} · ${compactDate(item.observedAt)}`,
        }))
      : visibleHotspots.map((item) => ({
          id: item.id,
          name: item.name,
          latitude: item.latitude,
          longitude: item.longitude,
          count: summaries[item.id]?.data?.observations.length ?? null,
          description: `最近观测 ${compactDate(item.latestAt)}`,
        }));
  const provinces = [
    ...new Map(
      hotspots
        .filter((item) => item.provinceCode)
        .map((item) => [
          item.provinceCode!,
          item.province ?? item.provinceCode!,
        ]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], "zh-CN"));
  const matches = useMemo(
    () => searchSpecies(catalog, speciesText),
    [catalog, speciesText],
  );
  useEffect(() => {
    if (!speciesSearch || catalogLoading) return;
    const term = speciesSearch.toLocaleLowerCase();
    const exact = catalog.filter((item) =>
      [item.commonName, item.englishName, item.scientificName].some(
        (name) => name.toLocaleLowerCase() === term,
      ),
    );
    if (exact.length === 1) setSpecies(exact[0]);
    setSpeciesSearch(null);
  }, [catalog, catalogLoading, speciesSearch]);
  function resetList() {
    setLimit(mode === "national" ? 50 : 20);
    setSelectedId(null);
  }
  function select(id: string) {
    setSelectedId(id);
  }
  const title =
    mode === "national"
      ? "全国近期发现"
      : mode === "target"
        ? "循着鸟讯，找鸟"
        : area
          ? `${area.name}及周边`
          : "我的城市";
  return (
    <main
      className={`${styles.workspace} ${hasSelection ? styles.withDetail : ""}`}
      id="main-content"
    >
      <aside className={styles.sidebar}>
        <div className={styles.panelHeading}>
          <span className={styles.eyebrow}>
            {mode === "national"
              ? "从近期记录出发"
              : mode === "target"
                ? "寻找一个鸟种"
                : "熟悉身边的鸟点"}
          </span>
          <h1>{title}</h1>
          <p>
            {mode === "national"
              ? "看看最近有人记录了哪些地方。"
              : mode === "target"
                ? "选择想看的鸟，查看它最近出现的地点。"
                : "每个鸟点独立查询，了解近期公开鸟况。"}
          </p>
        </div>
        {mode !== "national" && (
          <AreaPicker
            areas={areas}
            areaId={area?.id ?? null}
            onSelect={onArea}
            onChange={onAreas}
          />
        )}
        <div className={styles.filters}>
          <div className={styles.filterLine}>
            <span>最近</span>
            <div className={styles.segmented} aria-label="记录时间范围">
              {[3, 7, 14, 30].map((value) => (
                <button
                  key={value}
                  aria-pressed={days === value}
                  onClick={() => onDays(value)}
                >
                  {value}天
                </button>
              ))}
            </div>
          </div>
          {mode !== "national" && (
            <div className={styles.filterLine}>
              <span>半径</span>
              <div className={styles.segmented} aria-label="地区中心查询半径">
                {[10, 25, 50].map((value) => (
                  <button
                    key={value}
                    aria-pressed={radiusKm === value}
                    onClick={() => onRadius(value)}
                  >
                    {value}km
                  </button>
                ))}
              </div>
            </div>
          )}
          {mode === "national" && (
            <label className={styles.selectLine}>
              省份
              <select
                aria-label="筛选省份"
                value={province}
                onChange={(event) => {
                  setProvince(event.target.value);
                  resetList();
                }}
              >
                <option value="">全部省份</option>
                {provinces.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {mode === "target" && (
            <div className={styles.speciesPicker}>
              <label htmlFor="species-search">想看什么鸟？</label>
              <SearchField
                name="鸟种"
                label="想看什么鸟？"
                inputId="species-search"
                scope="target:species"
                bird
                value={speciesText}
                placeholder={
                  catalogLoading ? "正在读取鸟种目录…" : "中文、英文名或学名"
                }
                onChange={(value) => {
                  setSpeciesText(value);
                  setSpecies(null);
                  setSpeciesSearch(null);
                  setText("");
                  setPlaceDraft("");
                  resetList();
                }}
                onSearch={setSpeciesSearch}
              />
              {catalogError && (
                <div className={styles.inlineError} role="alert">
                  {catalogError}
                  <button
                    className={styles.linkButton}
                    onClick={() => setCatalogRetry((value) => value + 1)}
                  >
                    重试目录
                  </button>
                </div>
              )}
              {species && (
                <p className={styles.targetBadge}>
                  <Binoculars /> {species.commonName}
                  <small>{species.englishName}</small>
                </p>
              )}
              {!species && speciesText && (
                <div className={styles.searchResults} aria-label="鸟种搜索结果">
                  {matches.map((item) => (
                    <button
                      key={item.speciesCode}
                      onClick={() => {
                        rememberSearch(
                          "target:species",
                          speciesText || item.commonName,
                        );
                        setSpecies(item);
                        setSpeciesText(item.commonName);
                        resetList();
                      }}
                    >
                      <strong>{item.commonName}</strong>
                      <small>
                        {item.englishName} · {item.scientificName}
                      </small>
                    </button>
                  ))}
                  {!matches.length && !catalogLoading && (
                    <p className={styles.muted}>
                      没有匹配鸟种，请试试其他名称。
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          {mode !== "target" || species ? (
            <SearchField
              name="鸟点"
              label="筛选鸟点"
              scope={`${mode}:places`}
              value={placeDraft}
              placeholder="筛选地点名称"
              onChange={(value) => {
                setPlaceDraft(value);
                if (!value.trim()) {
                  setText("");
                  resetList();
                }
              }}
              onSearch={(value) => {
                setText(value);
                resetList();
              }}
            />
          ) : null}
        </div>
        <div className={styles.listHead}>
          <strong>
            {mode === "target" ? "出现地点" : "近期鸟点"} <span>{total}</span>
          </strong>
          {mode !== "national" && area ? (
            <select
              aria-label="鸟点排序"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as "recent" | "distance");
                resetList();
              }}
            >
              <option value="recent">最近记录</option>
              <option value="distance">距地区中心</option>
            </select>
          ) : (
            <small>按最近记录</small>
          )}
        </div>
        <div className={styles.placeList}>
          {!apiKey && (
            <div className={styles.emptyState}>
              <Binoculars size={32} />
              <h2>连接你的鸟讯</h2>
              <p>保存 eBird Key，即可查看近期公开记录。</p>
              <button className={styles.primaryButton} onClick={onSettings}>
                配置 eBird <ArrowRight />
              </button>
            </div>
          )}
          {apiKey && !area && mode !== "national" && (
            <div className={styles.emptyState}>
              <MapPin size={30} />
              <h2>先选一个城市</h2>
              <p>在上方搜索并关注地区，从附近的鸟点开始。</p>
            </div>
          )}
          {apiKey && area && mode === "target" && !species && (
            <div className={styles.emptyState}>
              <Bird size={30} />
              <h2>想看哪一种鸟？</h2>
              <p>搜索并选择鸟种，地图会标出它的近期记录。</p>
            </div>
          )}
          {state.error && (
            <div className={styles.errorNotice} role="alert">
              {state.error}
              {state.data && <p>已保留上次成功的数据。</p>}
              <button className={styles.linkButton} onClick={onRefresh}>
                <ArrowClockwise /> 重试
              </button>
              {/Key/.test(state.error) && (
                <button className={styles.linkButton} onClick={onSettings}>
                  个人配置
                </button>
              )}
            </div>
          )}
          {isStale(state.data?.fetchedAt) && (
            <p className={styles.notice}>
              当前为超过一天的缓存，出发前请更新。
            </p>
          )}
          {state.loading &&
            !state.data &&
            Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className={styles.skeleton}
                aria-label="鸟点加载中"
              />
            ))}
          {mode !== "target" &&
            visibleHotspots.map((item) => {
              const detail = summaries[item.id];
              const records = detail?.data?.observations;
              return (
                <button
                  className={`${styles.placeRow} ${selectedId === item.id ? styles.selectedRow : ""}`}
                  key={item.id}
                  onClick={() => select(item.id)}
                  aria-pressed={selectedId === item.id}
                >
                  <MapPin
                    className={styles.rowIcon}
                    size={19}
                    weight={selectedId === item.id ? "fill" : "regular"}
                  />
                  <span className={styles.placeText}>
                    <strong>{item.name}</strong>
                    <small>
                      {[item.province ?? item.provinceCode, item.city]
                        .filter(Boolean)
                        .join(" · ") || "公共鸟点"}
                      {area && mode !== "national"
                        ? ` · 距中心 ${distanceKm(area, item).toFixed(1)} km`
                        : ""}
                    </small>
                    <span className={styles.observationTime}>
                      最近观测 {compactDate(item.latestAt)}
                    </span>
                    {records && (
                      <span className={styles.speciesPreview}>
                        {records
                          .slice(0, 3)
                          .map((record) => record.commonName)
                          .join(" · ") || "此时段暂无公开物种记录"}
                      </span>
                    )}
                  </span>
                  {mode === "city" ? (
                    <span className={styles.rowNumber}>
                      {records ? records.length : "—"}
                      <small>
                        {records
                          ? `近${days}天种数`
                          : detail?.error
                            ? "查询失败"
                            : detail?.loading
                              ? "加载中"
                              : "待加载"}
                      </small>
                    </span>
                  ) : (
                    <ArrowRight className={styles.rowArrow} />
                  )}
                </button>
              );
            })}
          {mode === "target" &&
            visibleRecords.map((item) => (
              <button
                key={item.locationId}
                className={`${styles.placeRow} ${selectedId === item.locationId ? styles.selectedRow : ""}`}
                onClick={() => select(item.locationId)}
                aria-pressed={selectedId === item.locationId}
              >
                <MapPin className={styles.rowIcon} size={19} />
                <span className={styles.placeText}>
                  <strong>{item.locationName}</strong>
                  <small>
                    {item.isHotspot ? "公共鸟点" : "观测地点"}
                    {area
                      ? ` · 距中心 ${distanceKm(area, item).toFixed(1)} km`
                      : ""}
                  </small>
                  <span className={styles.observationTime}>
                    {compactDate(item.observedAt)}
                    {item.count !== null ? ` · 记录 ${item.count} 只` : ""}
                  </span>
                </span>
                <ArrowRight className={styles.rowArrow} />
              </button>
            ))}
          {state.data && !state.loading && total === 0 && (
            <div className={styles.emptyState}>
              <Bird size={30} />
              <h2>
                {text || province ? "没有匹配的地点" : "此范围暂无公开记录"}
              </h2>
              <p>
                {text || province
                  ? "调整地点或省份筛选再看看。"
                  : "暂无记录并不代表没有鸟，可扩大时间或半径。"}
              </p>
              <div className={styles.inlineActions}>
                {days < 30 && (
                  <button
                    className={styles.linkButton}
                    onClick={() => onDays(30)}
                  >
                    扩大到 30 天
                  </button>
                )}
                {area && radiusKm < 50 && (
                  <button
                    className={styles.linkButton}
                    onClick={() => onRadius(50)}
                  >
                    扩大到 50km
                  </button>
                )}
              </div>
            </div>
          )}
          {count < total && (
            <button
              className={styles.loadMore}
              onClick={() =>
                setLimit((value) => value + (mode === "national" ? 50 : 20))
              }
            >
              加载更多 <ArrowDown />
            </button>
          )}
        </div>
        <footer className={styles.sidebarFooter}>
          <span>
            已显示 {count} / {total} 个地点 · 数据来自 eBird
          </span>
          <span>
            {state.loading
              ? "正在更新鸟讯…"
              : `数据更新 ${fetchedLabel(state.data?.fetchedAt)}`}
          </span>
          {state.data?.limited && (
            <span className={styles.inlineError}>
              已达接口返回上限，结果可能不完整。
            </span>
          )}
        </footer>
      </aside>
      <section className={styles.mapPanel} aria-label="鸟点地图">
        <BirdMap
          area={mode === "national" ? null : area}
          radiusKm={radiusKm}
          points={points}
          selectedId={selectedId}
          onSelect={select}
        />
        <div className={styles.mapHeading}>
          <NavigationArrow size={18} />
          <div>
            <strong>
              {mode === "national"
                ? "中国 · 近期鸟点"
                : (area?.name ?? "选择关注地区")}
            </strong>
            <small>
              {mode === "national"
                ? `近 ${days} 天有到访记录`
                : area
                  ? `距地区中心 ${radiusKm} km · 近 ${days} 天`
                  : "从左侧添加城市"}
            </small>
          </div>
        </div>
        <div className={styles.mapLegend}>
          <span className={styles.markerSample} />
          近期记录地点
          <span className={styles.selectedSample} />
          当前选中
        </div>
        <div className={styles.mapNote}>
          地图展示左侧已加载的 {count} 个地点
        </div>
      </section>
      {hasSelection && (
        <BirdDetail
          key={selectedId}
          hotspot={selectedHotspot}
          observation={selectedRecord}
          state={selectedId ? summaries[selectedId] : undefined}
          days={days}
          fetchedAt={state.data?.fetchedAt}
          onClose={() => setSelectedId(null)}
          onRetry={() => selectedId && retry(selectedId)}
        />
      )}
    </main>
  );
}
