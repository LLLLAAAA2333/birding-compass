// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePlanningQuery } from './usePlanningQuery';
import type { BirdReportClient, ReportPage } from '../lib/birdreport';
import type { RecentClient } from '../lib/recentData';
import type { PlanningRecord } from '../lib/planning';
afterEach(cleanup);
const row = { id: 'birdreport:1:1', source: 'birdreport', sourceRecordId: '1:1', reportId: '1', sourceTaxonId: '1', commonName: '白鹭', scientificName: '', englishName: '', observedAt: '2026-09-26', locationName: '湿地', position: null, coordinateNote: '', count: 1, quality: 'unflagged', originalUrl: '', fetchedAt: '2026-09-26T08:00:00Z' } as PlanningRecord;
const page: ReportPage = { records: [row], reportIds: ['1'], total: 1, page: 1, skipped: 0, warnings: [], fetchedAt: row.fetchedAt };
const query = { area: { id: 'hf', name: '合肥', latitude: 31, longitude: 117 }, keyword: '合肥', days: 7, radiusKm: 50 };
it('retains report records after a failed same-range refresh and replaces them on confirmed empty success', async () => {
  const reports = { loadPage: vi.fn().mockResolvedValueOnce(page).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...page, records: [], reportIds: [], total: 0 }), resume: vi.fn() };
  const { result } = renderHook(() => usePlanningQuery({} as RecentClient, '', reports as unknown as BirdReportClient));
  act(() => result.current.search(query));
  await waitFor(() => expect(result.current.birdreport.records).toHaveLength(1));
  act(() => result.current.search(query, true));
  await waitFor(() => expect(result.current.birdreport.error).toBe('offline'));
  expect(result.current.birdreport.records).toEqual([row]);
  act(() => result.current.search(query, true));
  await waitFor(() => expect(result.current.birdreport.total).toBe(0));
  expect(result.current.birdreport.records).toEqual([]);
});
it('ignores late results from a superseded region query', async () => {
  let finish!: (page: ReportPage) => void;
  const reports = { loadPage: vi.fn().mockReturnValueOnce(new Promise<ReportPage>(resolve => { finish = resolve; })).mockResolvedValueOnce({ ...page, records: [], reportIds: [], total: 0 }), resume: vi.fn() };
  const { result } = renderHook(() => usePlanningQuery({} as RecentClient, '', reports as unknown as BirdReportClient));
  act(() => result.current.search(query));
  act(() => result.current.search({ ...query, keyword: '南京' }));
  await waitFor(() => expect(result.current.birdreport.total).toBe(0));
  await act(async () => finish(page));
  expect(result.current.query?.keyword).toBe('南京');
  expect(result.current.birdreport.records).toEqual([]);
});
