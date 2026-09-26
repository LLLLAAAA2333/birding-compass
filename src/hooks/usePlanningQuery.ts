import { useEffect, useRef, useState } from 'react';
import type { Area } from '../lib/data';
import type { RecentClient } from '../lib/recentData';
import { birdReportClient, dateRange, type BirdReportClient, type ReportPage } from '../lib/birdreport';
import { fromEbird, mergePlanningRecords, type PlanningRecord } from '../lib/planning';

export type PlanningQuery = { area: Area; days: number; radiusKm: number; keyword: string };
type SourceState = { records: PlanningRecord[]; loading: boolean; error: string; fetchedAt?: string };
type ReportState = SourceState & { total?: number; reportIds: string[]; completedPage: number; skipped: number; warnings: string[] };
const emptySource = (): SourceState => ({ records: [], loading: false, error: '' });
const emptyReports = (): ReportState => ({ ...emptySource(), reportIds: [], completedPage: 0, skipped: 0, warnings: [] });
export function usePlanningQuery(client: RecentClient, apiKey: string, reports: BirdReportClient = birdReportClient) {
  const [query, setQuery] = useState<(PlanningQuery & { startTime: string; endTime: string }) | null>(null);
  const [ebird, setEbird] = useState<SourceState>(emptySource);
  const [birdreport, setBirdreport] = useState<ReportState>(emptyReports);
  const active = useRef<AbortController | null>(null);
  const moreBusy = useRef(false);
  useEffect(() => () => active.current?.abort(), []);

  function loadReports(q: NonNullable<typeof query>, page: number, controller: AbortController, base: ReportState, force = false, fallback?: ReportState) {
    moreBusy.current = true;
    setBirdreport({ ...(fallback ?? base), loading: true, error: '' });
    const update = (result: ReportPage, finished: boolean) => {
      if (controller.signal.aborted) return;
      // Keep the previous complete range visible until a refresh has a valid
      // replacement page. Failed refreshes must not erase usable map points.
      if (!finished && fallback?.records.length) return;
      setBirdreport({ records: mergePlanningRecords(base.records, result.records), total: result.total, reportIds: [...new Set([...base.reportIds, ...result.reportIds])], completedPage: finished ? page : base.completedPage, skipped: base.skipped + result.skipped, warnings: [...new Set([...base.warnings, ...result.warnings])], fetchedAt: result.fetchedAt, loading: !finished, error: '' });
    };
    void (async () => {
      try {
        if (force) reports.resume();
        const result = await reports.loadPage({ keyword: q.keyword, startTime: q.startTime, endTime: q.endTime }, page, { signal: controller.signal, force, onProgress: result => update(result, false) });
        update(result, true);
      } catch (error) {
        if (!controller.signal.aborted) setBirdreport(previous => ({ ...previous, loading: false, error: error instanceof Error ? error.message : '记录中心查询失败' }));
      } finally { if (active.current === controller) moreBusy.current = false; }
    })();
  }
  function search(next: PlanningQuery, force = false) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const q = { ...next, ...dateRange(next.days) };
    setQuery(q);
    const same = JSON.stringify(q) === JSON.stringify(query);
    const base = same ? ebird : emptySource();
    setEbird({ ...base, loading: Boolean(apiKey), error: apiKey ? '' : '未配置 eBird API Key，可先浏览记录中心。' });
    if (apiKey) {
      const update = (records: PlanningRecord[], fetchedAt: string, loading: boolean) => {
        if (!controller.signal.aborted) setEbird({ records, fetchedAt, loading, error: '' });
      };
      if (force) client.resume();
      void client.load({ kind: 'nearby', area: next.area, days: next.days, radiusKm: next.radiusKm }, { signal: controller.signal, force, onCached: data => update(fromEbird(data.observations, data.fetchedAt), data.fetchedAt, true) })
        .then(data => update(fromEbird(data.observations, data.fetchedAt), data.fetchedAt, false))
        .catch(error => { if (!controller.signal.aborted) setEbird(previous => ({ ...previous, loading: false, error: error instanceof Error ? error.message : 'eBird 查询失败' })); });
    }
    loadReports(q, 1, controller, emptyReports(), force, same ? birdreport : undefined);
  }
  function loadMore() {
    if (!query || !active.current || active.current.signal.aborted || moreBusy.current || birdreport.completedPage >= 20) return;
    loadReports(query, birdreport.completedPage + 1, active.current, birdreport);
  }
  return { query, ebird, birdreport, search, loadMore };
}
