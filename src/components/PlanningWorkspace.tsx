import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowClockwise, ArrowUpRight, Bird, MapPin, NavigationArrow, X } from '@phosphor-icons/react';
import { AreaPicker } from './AreaPicker';
import { BirdMap } from './BirdMap';
import { SearchField } from './SearchField';
import type { Area } from '../lib/data';
import type { RecentClient } from '../lib/recentData';
import { usePlanningQuery } from '../hooks/usePlanningQuery';
import { SOURCE_LABELS, filterPlanningRecords, mergePlanningRecords, planningPlaces, type BirdSource } from '../lib/planning';
import { compactDate, fetchedLabel, isStale, openMap, openExternal } from '../lib/presentation';
import app from '../App.module.css';
import styles from './PlanningWorkspace.module.css';

type Props = { client: RecentClient; apiKey: string; area: Area | null; areas: Area[]; days: number; radiusKm: number; onDays: (days: number) => void; onRadius: (radius: number) => void; onArea: (id: string | null) => void; onAreas: (areas: Area[]) => void; onSettings: () => void };
export function PlanningWorkspace({ client, apiKey, area, areas, days, radiusKm, onDays, onRadius, onArea, onAreas, onSettings }: Props) {
  const [keyword, setKeyword] = useState(area?.name ?? '');
  const [draft, setDraft] = useState('');
  const [text, setText] = useState('');
  const [source, setSource] = useState<BirdSource | 'all'>('all');
  const [includeFlagged, setIncludeFlagged] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const detailRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const { query, ebird, birdreport, search, loadMore } = usePlanningQuery(client, apiKey);
  const records = useMemo(() => mergePlanningRecords(ebird.records, birdreport.records), [ebird.records, birdreport.records]);
  const filtered = useMemo(() => filterPlanningRecords(records, { text, source, includeFlagged }), [records, text, source, includeFlagged]);
  const places = useMemo(() => planningPlaces(filtered), [filtered]);
  const selected = places.find(place => place.id === selectedId);
  const points = places.filter(place => place.position).map(place => ({ id: place.id, name: place.name, latitude: place.position!.latitude, longitude: place.position!.longitude, source: place.source, count: new Set(place.records.map(record => record.sourceTaxonId)).size, description: SOURCE_LABELS[place.source] })).sort((a, b) => Number(b.source === 'birdreport') - Number(a.source === 'birdreport'));
  const busy = ebird.loading || birdreport.loading;
  const changed = query && (query.keyword !== keyword.trim() || query.days !== days || query.radiusKm !== radiusKm);
  function select(id: string) {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedId(id);
  }
  function close() {
    setSelectedId(null);
    triggerRef.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (!selected) return;
    closeRef.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setSelectedId(null); triggerRef.current?.focus({ preventScroll: true }); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [selectedId, Boolean(selected)]);
  function submit(force = false) {
    if (!area) return;
    if (keyword.trim().length < 2) { setError('请填写至少两个字的记录中心地点关键词'); return; }
    setError(''); setSelectedId(null);
    search({ area, days, radiusKm, keyword: keyword.trim() }, force);
  }
  async function open(action: () => Promise<void>) {
    try { setError(''); await action(); } catch { setError('无法打开外部链接，请稍后重试。'); }
  }
  const quality = { accepted: 'eBird 已接受', unflagged: '未标红 · 不等于人工审核', flagged: '标红记录 · 待核实', unknown: '审核状态未知' };
  return <main id="main-content" className={`${styles.workspace} ${selected ? styles.withDetail : ''}`}>
    <aside className={styles.sidebar}>
      <div className={app.panelHeading}><span className={app.eyebrow}>两份鸟讯，一张出行地图</span><h1>双源鸟讯</h1><p>一起查找近期鸟况，每条记录保留原始出处。</p></div>
      <div className={styles.controls}>
        <AreaPicker areas={areas} areaId={area?.id ?? null} onSelect={onArea} onChange={onAreas} />
        <div className={styles.range}><label>近<select aria-label="双源查询天数" value={days} onChange={e => onDays(Number(e.target.value))}>{[3,7,14,30].map(d => <option key={d} value={d}>{d} 天</option>)}</select></label><label>eBird 半径<select aria-label="双源查询半径" value={radiusKm} onChange={e => onRadius(Number(e.target.value))}>{[10,25,50].map(r => <option key={r} value={r}>{r} km</option>)}</select></label></div>
        <form onSubmit={e => { e.preventDefault(); submit(); }}>
          <label className={styles.keyword}>记录中心地点关键词<input value={keyword} maxLength={80} onChange={e => setKeyword(e.target.value)} placeholder="城市、区县或公园，例如合肥" /></label>
          <div className={styles.actions}><button className={app.primaryButton} disabled={!area || busy || keyword.trim().length < 2} type="submit"><Bird size={18} />{busy ? '正在查询…' : '查询两边鸟讯'}</button>{query && <button className={app.iconButton} type="button" disabled={busy} aria-label="刷新双源鸟讯" title="重新获取当前范围" onClick={() => submit(true)}><ArrowClockwise /></button>}</div>
        </form>
        {changed && <p className={styles.hint}>条件已更改，点击查询后更新结果。</p>}
        {error && <p role="alert" className={app.inlineError}>{error}</p>}
        <details className={styles.scope}><summary>查询范围与更新方式</summary><p>eBird 返回地区中心附近每个鸟种的最近公开摘要；记录中心按地点文字匹配，每批读取 5 份报告，最多 100 份。两者都不能代表全部观测。</p><p>记录中心串行查询，至少间隔 2 秒；列表缓存 30 分钟，报告缓存 6 小时。仅在点击查询、刷新或继续加载时请求。</p></details>
      </div>
      {query && <>
        <div className={styles.sourceStatus} aria-label="数据来源状态">
          <p className={styles.rangeNote}>{query.area.name} · {query.startTime} 至 {query.endTime}<br />eBird {query.radiusKm} km · 记录中心“{query.keyword}”</p>
          <div><strong><i className={styles.ebirdDot} />eBird</strong><span>{ebird.loading ? '更新中' : `${ebird.records.length} 条摘要`}</span></div>
          {ebird.error && <p role="status">{ebird.error}{!apiKey && <button className={app.linkButton} onClick={onSettings}>配置 Key</button>}</p>}
          {ebird.fetchedAt && <small>获取于 {fetchedLabel(ebird.fetchedAt)}</small>}
          <div><strong><i className={styles.reportDot} />记录中心</strong><span>{birdreport.loading ? '逐份读取中' : `${birdreport.records.length} 条鸟种记录`}</span></div>
          {birdreport.total !== undefined && <small>已检查 {birdreport.reportIds.length} / {birdreport.total} 份匹配报告{birdreport.skipped > 0 ? ` · ${birdreport.skipped} 份未公开或无法读取` : ''}</small>}
          {birdreport.fetchedAt && <small>列表获取于 {fetchedLabel(birdreport.fetchedAt)} · 报告可能来自缓存</small>}
          {birdreport.error && <p role="alert">{birdreport.error}</p>}
          {birdreport.warnings.map(w => <p key={w}>{w}</p>)}
        </div>
        <div className={styles.resultsFilters}>
          <SearchField name="鸟种或地点" label="搜索已加载鸟讯" scope="planning:records" value={draft} onChange={value => { setDraft(value); if (!value) setText(''); }} onSearch={setText} placeholder="搜索鸟名、学名或地点" />
          <div className={styles.range}><select aria-label="鸟讯来源" value={source} onChange={e => setSource(e.target.value as BirdSource | 'all')}><option value="all">两个来源</option><option value="ebird">eBird</option><option value="birdreport">记录中心</option></select><label className={styles.check}><input type="checkbox" checked={includeFlagged} onChange={e => setIncludeFlagged(e.target.checked)} />包括标红记录</label></div>
          <small>{filtered.length} 条已加载记录 · {places.length} 个来源地点 · {points.length} 个地图标记</small>
        </div>
      </>}
      <div className={styles.list}>
        {!query && <div className={app.emptyState}><MapPin size={28} /><h3>从一个城市出发</h3><p>选好地点与日期，一次查询两边的鸟讯。</p></div>}
        {query && !filtered.length && <div className={app.emptyState}><h3>{busy ? '正在整理公开鸟讯' : '当前没有可显示的记录'}</h3><p>{busy ? '报告逐份加载，已读取的地点会先显示。' : '可清空筛选、扩大日期范围或查看来源状态。'}</p></div>}
        {places.map(place => <button key={place.id} className={`${styles.place} ${place.id === selectedId ? styles.selected : ''}`} onClick={() => select(place.id)} aria-pressed={place.id === selectedId}>
          <span className={place.source === 'ebird' ? styles.ebirdLabel : styles.reportLabel}>{SOURCE_LABELS[place.source]}</span><strong>{place.name}</strong><small>{compactDate(place.records[0].observedAt)} · {new Set(place.records.map(row => row.sourceTaxonId)).size} 种{!place.position ? ' · 无坐标' : ''}</small><p>{[...new Set(place.records.map(row => row.commonName))].slice(0, 6).join('、')}</p>
        </button>)}
        {query && !birdreport.loading && !birdreport.error && birdreport.total !== undefined && birdreport.completedPage * 5 < birdreport.total && birdreport.completedPage < 20 && <button className={`${app.linkButton} ${styles.more}`} onClick={loadMore}>继续加载记录中心（5 份报告）</button>}
        {birdreport.completedPage >= 20 && <p className={styles.hint}>已达到 100 份报告上限，请缩小地点或日期范围。</p>}
        {query && <p className={styles.footnote}>鸟种保留各自名录；跨来源记录可能是同一次观测，未相加为观测次数或出现概率。搜索仅筛选已加载记录。</p>}
      </div>
    </aside>
    <section className={styles.mapPanel} aria-label="双源鸟讯地图"><BirdMap area={query?.area ?? area} radiusKm={query?.radiusKm ?? radiusKm} points={points} selectedId={selectedId} onSelect={select} /><div className={styles.legend}><span><i className={styles.ebirdDot} />eBird</span><span><i className={styles.reportDot} />记录中心</span><small>无坐标的记录仅列出，不标点</small></div></section>
    {selected && <aside className={styles.detail} aria-label={`${selected.name}鸟讯详情`} ref={detailRef}>
      <div className={app.detailHeader}><span className={selected.source === 'ebird' ? styles.ebirdLabel : styles.reportLabel}>{SOURCE_LABELS[selected.source]}</span><button ref={closeRef} className={app.iconButton} aria-label="关闭双源详情" onClick={close}><X /></button></div>
      <h2>{selected.name}</h2><p className={styles.hint}>{selected.records[0].coordinateNote}</p>
      <div className={styles.detailRecords}>{selected.records.map(row => <article className={styles.record} key={row.id}><strong>{row.commonName}</strong><em>{row.scientificName}</em><p>{compactDate(row.observedAt)} · {row.count === null ? '数量未提供' : `${row.count} 只`}</p><small>{SOURCE_LABELS[row.source]} · {quality[row.quality]}</small><small>获取于 {fetchedLabel(row.fetchedAt)}{isStale(row.fetchedAt) ? ' · 出发前请更新' : ''}</small>{row.originalUrl && <button className={app.linkButton} onClick={() => void open(() => openExternal(row.originalUrl))}>查看原始报告 <ArrowUpRight /></button>}</article>)}</div>
      {selected.position && <div className={styles.detailActions}><button className={app.primaryButton} onClick={() => void open(() => openMap(selected.name, selected.position!.latitude, selected.position!.longitude))}><NavigationArrow />在地图中打开</button></div>}
    </aside>}
  </main>;
}
