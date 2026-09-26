import { isTauri } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import gcoord from 'gcoord';
import { BirdReportError, decodeBirdReportResponse, prepareBirdReportRequest, reportUrl, validReportId, type BirdReportEnvelope } from './birdreportProtocol';
import { readRecentCache, writeRecentCache } from './recentCache';
import { RequestQueue, abortError } from './requestQueue';
import { mergePlanningRecords, type PlanningRecord } from './planning';

export const REPORT_PAGE_SIZE = 5;
type Endpoint = 'front/activity/search' | 'front/activity/get' | 'front/activity/taxon';
type Options = { signal?: AbortSignal; force?: boolean };
export type ReportQuery = { keyword: string; startTime: string; endTime: string };
export type ReportPage = { records: PlanningRecord[]; total: number; reportIds: string[]; page: number; skipped: number; fetchedAt: string; warnings: string[] };
const text = (value: unknown, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
export function validObservationDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(value)) return false;
  const day = value.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day && (!value.slice(11) || Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60);
}
export function dateRange(days: number, now = new Date()): { startTime: string; endTime: string } {
  if (![3, 7, 14, 30].includes(days)) throw new Error('查询范围须为 3、7、14 或 30 天');
  const endTime = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const startTime = new Date(Date.parse(`${endTime}T00:00:00Z`) - (days - 1) * 86400000).toISOString().slice(0, 10);
  return { startTime, endTime };
}
export function normalizeBirdReport(report: unknown, taxa: unknown, fetchedAt: string): PlanningRecord[] {
  const row = object(report);
  if (!row || !validReportId(row.reportId) || !validObservationDate(row.startTime) || !Array.isArray(taxa)) return [];
  const locationName = text(row.address) || text(row.pointName);
  if (!locationName) return [];
  let position: PlanningRecord['position'] = null;
  const parts = text(row.location).split(',');
  if (parts.length === 2 && parts.every(part => part.trim() && Number.isFinite(Number(part)))) {
    const [lng, lat] = parts.map(Number);
    if (Math.abs(lng) <= 180 && Math.abs(lat) <= 90 && (lng !== 0 || lat !== 0)) {
      const [longitude, latitude] = gcoord.transform([lng, lat], gcoord.BD09, gcoord.WGS84);
      position = { latitude, longitude };
    }
  }
  const reportId = row.reportId;
  const records: PlanningRecord[] = [];
  for (const item of taxa) {
    const bird = object(item);
    if (!bird || !/^\d+$/.test(String(bird.taxon_id)) || !text(bird.taxon_name)) continue;
    const sourceTaxonId = String(bird.taxon_id);
    const sourceRecordId = `${reportId}:${sourceTaxonId}`;
    const count = typeof bird.taxon_count === 'number' ? bird.taxon_count : NaN;
    records.push({ id: `birdreport:${sourceRecordId}`, source: 'birdreport', sourceRecordId, reportId, sourceTaxonId, commonName: text(bird.taxon_name), scientificName: text(bird.latinname), englishName: text(bird.englishname), observedAt: row.startTime, locationName, position, coordinateNote: position ? '官网百度坐标 BD-09 转 WGS84（近似）' : '原报告未提供可用坐标', count: Number.isFinite(count) && count >= 0 ? count : null, quality: bird.outside_type === 1 ? 'flagged' : bird.outside_type === 0 ? 'unflagged' : 'unknown', originalUrl: reportUrl(reportId), fetchedAt });
  }
  return mergePlanningRecords(records);
}

// Cache only birding fields; reporter names, user IDs, notes and media are omitted.
const retainedFields = new Set(['reportId', 'serialId', 'startTime', 'endTime', 'pointId', 'pointName', 'address', 'location', 'taxonCount', 'taxon_id', 'taxon_name', 'latinname', 'englishname', 'taxon_count', 'outside_type']);
function retainedData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(retainedData);
  const row = object(value);
  return row ? Object.fromEntries(Object.entries(row).filter(([key]) => retainedFields.has(key))) : value;
}
function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export class BirdReportClient {
  private queue = new RequestQueue(1);
  private nextRequestAt = 0;
  private pause: { error: BirdReportError; until: number } | null = null;
  constructor(private readonly fetcher: typeof fetch = (input, init) => (isTauri() ? tauriFetch : globalThis.fetch)(input, init), private readonly intervalMs = 2000) {}
  resume() {
    if (this.pause && Date.now() < this.pause.until) throw this.pause.error;
    this.pause = null;
    this.queue.resume();
  }
  async request(path: Endpoint, params: Record<string, string | number>, options: Options = {}): Promise<{ envelope: BirdReportEnvelope; fetchedAt: string }> {
    if (!['front/activity/search', 'front/activity/get', 'front/activity/taxon'].includes(path)) throw new Error('不支持的记录中心查询');
    if (options.signal?.aborted) throw abortError();
    const key = `birdreport:v1:${path}:${JSON.stringify(Object.fromEntries(Object.entries(params).sort()))}`;
    const cached = await readRecentCache(key);
    const maxAge = path.endsWith('/search') ? 30 * 60000 : 6 * 3600000;
    if (!options.force && cached && Date.now() - Date.parse(cached.fetchedAt) < maxAge && Array.isArray(cached.payload) && object(cached.payload[0])?.code === 0)
      return { envelope: cached.payload[0] as BirdReportEnvelope, fetchedAt: cached.fetchedAt };
    // A new user query can resume after the cooldown; no timer retries requests.
    this.resume();
    return this.queue.run(key, async signal => {
      if (this.pause) throw this.pause.error;
      await delay(Math.max(0, this.nextRequestAt - Date.now()), signal);
      this.nextRequestAt = Date.now() + this.intervalMs;
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(abort, 20000);
      try {
        const prepared = await prepareBirdReportRequest(params);
        if (signal.aborted) throw abortError();
        const response = await this.fetcher(isTauri() ? `https://api.birdreport.cn/${path}` : `/api/birdreport/${path}`, { method: 'POST', ...prepared, headers: { ...prepared.headers, ...(isTauri() ? { Origin: 'https://www.birdreport.cn', Referer: 'https://www.birdreport.cn/' } : {}) }, signal: controller.signal });
        if (!response.ok) {
          const halt = [401, 403, 429].includes(response.status);
          const reason = response.status === 429 ? '记录中心请求过于频繁' : '记录中心拒绝了本次请求';
          throw new BirdReportError(halt ? `${reason}（HTTP ${response.status}）。本机暂停请求十分钟，请稍后手动重试；这不代表官网持续不可用。` : `记录中心请求失败（HTTP ${response.status}）`, response.status, halt);
        }
        const raw = await response.text();
        if (raw.length > 2_000_000) throw new Error('记录中心响应过大，请缩小查询范围');
        let payload: unknown;
        try { payload = JSON.parse(raw); } catch { throw new Error('记录中心未返回可识别的数据'); }
        const decoded = await decodeBirdReportResponse(payload);
        if (signal.aborted) throw abortError();
        const envelope = { ...decoded, data: retainedData(decoded.data) };
        const fetchedAt = new Date().toISOString();
        await writeRecentCache(key, { payload: [envelope], fetchedAt });
        return { envelope, fetchedAt };
      } catch (error) {
        if (signal.aborted) throw abortError();
        if (error instanceof BirdReportError && error.halt) this.pause = { error, until: Date.now() + 10 * 60000 };
        if (controller.signal.aborted) throw new Error('连接记录中心超时，请稍后重试');
        throw error;
      } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
    }, options.signal);
  }
  async loadPage(query: ReportQuery, page = 1, options: Options & { onProgress?: (value: ReportPage) => void } = {}): Promise<ReportPage> {
    const keyword = query.keyword.trim();
    if (keyword.length < 2 || keyword.length > 80) throw new Error('记录中心地点关键词需为 2–80 个字');
    if (!validObservationDate(query.startTime) || !validObservationDate(query.endTime) || query.startTime > query.endTime || Date.parse(query.endTime) - Date.parse(query.startTime) > 29 * 86400000) throw new Error('记录中心每次查询最多 30 天');
    if (!Number.isInteger(page) || page < 1 || page > 20) throw new Error('单次最多加载 100 份报告，请缩小范围');
    const { envelope, fetchedAt } = await this.request('front/activity/search', { pointName: keyword, startTime: query.startTime, endTime: query.endTime, page, limit: REPORT_PAGE_SIZE, sortBy: 'startTime', orderBy: 'desc' }, options);
    if (!Array.isArray(envelope.data) && envelope.count !== 0) throw new Error('记录中心报告列表格式已变化');
    const reports = Array.isArray(envelope.data) ? envelope.data : [];
    if (reports.length > REPORT_PAGE_SIZE) throw new Error('记录中心未遵守分页范围，已停止加载');
    const result: ReportPage = { records: [], total: envelope.count ?? reports.length, reportIds: [], page, skipped: 0, fetchedAt, warnings: [] };
    options.onProgress?.({ ...result });
    for (const report of reports) {
      if (options.signal?.aborted) throw abortError();
      const row = object(report);
      if (!row || !validReportId(row.reportId)) { result.skipped++; continue; }
      const id = row.reportId;
      result.reportIds.push(id);
      try {
        const detail = await this.request('front/activity/get', { reportId: id }, options);
        if (detail.envelope.errorCode !== 2 || !detail.envelope.success) { result.skipped++; continue; }
        const info = object(detail.envelope.data);
        if (!info || info.reportId !== id) throw new Error('报告编号不匹配');
        const taxa = await this.request('front/activity/taxon', { reportId: id, page: 1, limit: 1500 }, options);
        if (!Array.isArray(taxa.envelope.data)) throw new Error('记录中心鸟种响应格式已变化');
        const records = normalizeBirdReport(info, taxa.envelope.data, detail.fetchedAt < taxa.fetchedAt ? detail.fetchedAt : taxa.fetchedAt)
          .filter(record => record.observedAt.slice(0, 10) >= query.startTime && record.observedAt.slice(0, 10) <= query.endTime);
        if (!records.length && taxa.envelope.data.length > 0) throw new Error('报告字段无法识别或日期不在查询范围');
        if (Array.isArray(taxa.envelope.data) && taxa.envelope.count !== undefined && taxa.envelope.count > taxa.envelope.data.length) result.warnings.push('部分报告鸟种未返回完整');
        result.records = mergePlanningRecords(result.records, records);
        options.onProgress?.({ ...result, reportIds: [...result.reportIds], warnings: [...result.warnings] });
      } catch (error) {
        if (options.signal?.aborted || error instanceof BirdReportError && error.halt) throw error;
        result.skipped++;
        result.warnings.push(error instanceof Error ? error.message : '部分报告读取失败');
        // Preserve progress in the UI, then stop instead of fanning out failures.
        throw error;
      }
    }
    return result;
  }
}
export const birdReportClient = new BirdReportClient();
